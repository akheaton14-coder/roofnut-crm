"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { CrmShell } from "@/components/crm-shell";
import { useWorkspace } from "@/lib/use-workspace";

type JobDetail = { id:string; title:string; stage:string; contract_value:number; next_action:string|null; client_id:string; clients:{first_name:string;last_name:string;email:string|null;phone:string|null}|null; properties:{address_1:string;city:string;state:string;postal_code:string}|null };
type Activity = { id:string; kind:string; body:string; occurred_at:string };
type FileRow = { id:string; filename:string; storage_path:string; content_type:string|null; size_bytes:number; created_at:string; signedUrl?:string };

export default function JobPage() {
  const { id } = useParams<{ id:string }>();
  const { supabase, organizationId, loading, userName, user } = useWorkspace();
  const [job,setJob]=useState<JobDetail|null>(null); const [activities,setActivities]=useState<Activity[]>([]); const [files,setFiles]=useState<FileRow[]>([]);
  const [note,setNote]=useState(""); const [busy,setBusy]=useState(false); const documentRef=useRef<HTMLInputElement>(null); const photoRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{ if(!organizationId)return; (async()=>{
    const {data}=await supabase.from("jobs").select("id,title,stage,contract_value,next_action,client_id,clients(first_name,last_name,email,phone),properties(address_1,city,state,postal_code)").eq("id",id).single(); setJob(data as unknown as JobDetail);
    const [{data:a},{data:f}]=await Promise.all([supabase.from("activities").select("id,kind,body,occurred_at").eq("job_id",id).order("occurred_at",{ascending:false}),supabase.from("files").select("id,filename,storage_path,content_type,size_bytes,created_at").eq("job_id",id).order("created_at",{ascending:false})]);
    setActivities((a||[]) as Activity[]);
    const rows=(f||[]) as FileRow[]; const signed=await Promise.all(rows.map(async file=>{const {data:url}=await supabase.storage.from("job-files").createSignedUrl(file.storage_path,3600);return {...file,signedUrl:url?.signedUrl};})); setFiles(signed);
  })(); },[id,organizationId,supabase]);

  async function addNote(){if(!note.trim()||!job||!user)return;setBusy(true);const {data}=await supabase.from("activities").insert({organization_id:organizationId,job_id:job.id,actor_id:user.id,kind:"note",body:note.trim()}).select("id,kind,body,occurred_at").single();if(data)setActivities(c=>[data as Activity,...c]);setNote("");setBusy(false)}
  async function upload(e:ChangeEvent<HTMLInputElement>){const selected=Array.from(e.target.files||[]);if(!selected.length||!job||!user)return;setBusy(true);for(const file of selected){const path=`${organizationId}/${job.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"-")}`;const {error}=await supabase.storage.from("job-files").upload(path,file);if(!error){const {data}=await supabase.from("files").insert({organization_id:organizationId,client_id:job.client_id,job_id:job.id,storage_path:path,filename:file.name,content_type:file.type,size_bytes:file.size,uploaded_by:user.id}).select("id,filename,storage_path,content_type,size_bytes,created_at").single();if(data){const {data:url}=await supabase.storage.from("job-files").createSignedUrl(path,3600);setFiles(c=>[{...(data as FileRow),signedUrl:url?.signedUrl},...c]);}}}setBusy(false);e.target.value=""}
  function openFile(file:FileRow){if(file.signedUrl)window.open(file.signedUrl,"_blank","noopener,noreferrer")}

  if(loading||!job)return <main className="auth-loading"><span>R</span></main>;
  const photos=files.filter(f=>f.content_type?.startsWith("image/")); const documents=files.filter(f=>!f.content_type?.startsWith("image/"));
  return <CrmShell userName={userName}><div className="content job-detail"><div className="job-detail-head"><div><p className="eyebrow">JOB WORKSPACE</p><h1>{job.title}</h1><p>{job.clients?.first_name} {job.clients?.last_name} · {job.properties?.address_1}, {job.properties?.city}</p></div><span className="stage blue">{job.stage.replaceAll("_"," ")}</span></div><div className="detail-grid">
    <section className="panel"><div className="panel-head"><div><h3>Job overview</h3><p>The operational source of truth</p></div></div><div className="overview-grid"><div><small>Client</small><b>{job.clients?.first_name} {job.clients?.last_name}</b><p>{job.clients?.email}<br/>{job.clients?.phone}</p></div><div><small>Property</small><b>{job.properties?.address_1||"No property"}</b><p>{job.properties?.city}, {job.properties?.state} {job.properties?.postal_code}</p></div><div><small>Contract value</small><b>${Number(job.contract_value).toLocaleString()}</b><p>Current job value</p></div><div><small>Next action</small><b>{job.next_action||"Not set"}</b><p>Keep the job moving</p></div></div></section>
    <section className="panel"><div className="panel-head"><div><h3>Notes & timeline</h3><p>Every important job event</p></div></div><div className="note-compose"><textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Add a job note..."/><button disabled={busy||!note.trim()} onClick={addNote}>Add note</button></div><div className="timeline">{activities.map(a=><article key={a.id}><span>✎</span><div><b>{a.kind}</b><p>{a.body}</p><small>{new Date(a.occurred_at).toLocaleString()}</small></div></article>)}{!activities.length&&<div className="empty">No activity yet.</div>}</div></section>
    <section className="panel photos-panel"><div className="panel-head"><div><h3>Photo gallery</h3><p>Roof, damage, measurements, progress, and completion</p></div><button onClick={()=>photoRef.current?.click()}>＋ Add photos</button><input ref={photoRef} hidden type="file" accept="image/*" multiple onChange={upload}/></div>{photos.length?<div className="photo-grid">{photos.map(photo=><button key={photo.id} onClick={()=>openFile(photo)} title={photo.filename}><img src={photo.signedUrl} alt={photo.filename}/><span>{photo.filename}</span></button>)}</div>:<div className="empty">No photos yet. Add the first job photo.</div>}</section>
    <section className="panel files-panel"><div className="panel-head"><div><h3>Documents</h3><p>Contracts, estimates, permits, invoices, and other files</p></div><button onClick={()=>documentRef.current?.click()}>＋ Upload document</button><input ref={documentRef} hidden type="file" multiple onChange={upload}/></div>{documents.map(file=><button className="file-row" key={file.id} onClick={()=>openFile(file)}><span>▤</span><div><b>{file.filename}</b><p>{Math.max(1,Math.round(file.size_bytes/1024))} KB · {new Date(file.created_at).toLocaleDateString()}</p></div><em>Open ↗</em></button>)}{!documents.length&&<div className="empty">No documents yet.</div>}</section>
  </div></div></CrmShell>;
}
