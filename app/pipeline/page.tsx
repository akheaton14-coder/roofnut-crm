"use client";

import Link from "next/link";
import { DragEvent, useEffect, useMemo, useState } from "react";
import { CrmShell } from "@/components/crm-shell";
import { useWorkspace } from "@/lib/use-workspace";

type Stage = { id:string; name:string; color:string; position:number; time_limit_days:number|null; phase?:string };
type Job = { id:string; title:string; contract_value:number; next_action:string|null; workflow_stage_id:string|null; updated_at:string; clients:{first_name:string;last_name:string}|null; properties:{city:string}|null };
type Phase = { id:string; label:string; description:string; matches:(stage:Stage)=>boolean };

const phases:Phase[] = [
  { id:"leads", label:"Leads", description:"New opportunities and inspections", matches:s=>s.phase?s.phase==="leads":/lead|inspection/i.test(s.name) },
  { id:"estimating", label:"Estimating", description:"Pricing, proposals and approvals", matches:s=>s.phase?s.phase==="estimating":/estimat/i.test(s.name) },
  { id:"preproduction", label:"Pre-Production", description:"Sold jobs getting ready to build", matches:s=>s.phase?s.phase==="preproduction":/sold|pre.?production|scheduled/i.test(s.name) },
  { id:"production", label:"Production", description:"Active builds and completion", matches:s=>s.phase?s.phase==="production":/in production|completed|complete/i.test(s.name) },
  { id:"closed", label:"Closed / Lost", description:"Archived opportunities", matches:s=>s.phase?s.phase==="closed":/lost|cancel/i.test(s.name) },
];

export default function PipelinePage(){
  const {supabase,organizationId,loading,userName}=useWorkspace();
  const [stages,setStages]=useState<Stage[]>([]),[jobs,setJobs]=useState<Job[]>([]),[workflowId,setWorkflowId]=useState("");
  const [activePhase,setActivePhase]=useState("leads");

  useEffect(()=>{if(!organizationId)return;(async()=>{
    const {data:w}=await supabase.from("workflows").select("id").eq("organization_id",organizationId).eq("is_default",true).maybeSingle();
    if(!w)return;setWorkflowId(w.id);
    const [{data:s},{data:j}]=await Promise.all([
      supabase.from("workflow_stages").select("id,name,color,position,time_limit_days").eq("workflow_id",w.id).order("position"),
      supabase.from("jobs").select("id,title,contract_value,next_action,workflow_stage_id,updated_at,clients(first_name,last_name),properties(city)").eq("organization_id",organizationId).eq("workflow_id",w.id)
    ]);
    const {data:phaseRows}=await supabase.from("workflow_stages").select("id,phase").eq("workflow_id",w.id);
    const phaseMap=new Map((phaseRows||[]).map(row=>[row.id,row.phase as string]));
    setStages(((s||[]) as Stage[]).map(stage=>({...stage,phase:phaseMap.get(stage.id)})));setJobs((j||[]) as unknown as Job[]);
  })()},[organizationId,supabase]);

  async function drop(event:DragEvent,stageId:string){event.preventDefault();const jobId=event.dataTransfer.getData("jobId");if(!jobId)return;setJobs(current=>current.map(job=>job.id===jobId?{...job,workflow_stage_id:stageId}:job));await supabase.from("jobs").update({workflow_stage_id:stageId,updated_at:new Date().toISOString()}).eq("id",jobId)}

  const visibleStages=useMemo(()=>activePhase==="all"?stages:stages.filter(stage=>phases.find(p=>p.id===activePhase)?.matches(stage)),[activePhase,stages]);
  const ungrouped=stages.filter(stage=>!phases.some(phase=>phase.matches(stage)));
  const boardStages=activePhase==="other"?ungrouped:visibleStages;
  const total=jobs.reduce((sum,j)=>sum+Number(j.contract_value),0);
  const phaseSummary=(phase:Phase)=>{const ids=new Set(stages.filter(phase.matches).map(s=>s.id));const phaseJobs=jobs.filter(j=>j.workflow_stage_id&&ids.has(j.workflow_stage_id));return {count:phaseJobs.length,value:phaseJobs.reduce((sum,j)=>sum+Number(j.contract_value),0)}};

  if(loading)return <main className="auth-loading"><span>R</span></main>;
  return <CrmShell userName={userName}><div className="board-page">
    <div className="board-head"><div><p className="eyebrow">LIVE WORKFLOW</p><h1>Roofing Pipeline</h1><p>{jobs.length} jobs · ${total.toLocaleString()} total value</p></div><Link href={`/settings/workflows/${workflowId}`} className="board-settings">⚙ Edit workflow</Link></div>
    <div className="phase-switcher">
      <button className={activePhase==="all"?"active":""} onClick={()=>setActivePhase("all")}><span>All stages</span><b>{jobs.length}</b><small>Full workflow</small></button>
      {phases.map(phase=>{const summary=phaseSummary(phase);return <button key={phase.id} className={activePhase===phase.id?"active":""} onClick={()=>setActivePhase(phase.id)}><span>{phase.label}</span><b>{summary.count}</b><small>${summary.value.toLocaleString()}</small></button>})}
      {!!ungrouped.length&&<button className={activePhase==="other"?"active":""} onClick={()=>setActivePhase("other")}><span>Other</span><b>{ungrouped.length}</b><small>Custom statuses</small></button>}
    </div>
    <div className="phase-context"><div><b>{activePhase==="all"?"Entire workflow":activePhase==="other"?"Other statuses":phases.find(p=>p.id===activePhase)?.label}</b><span>{activePhase==="all"?"Drag across every status":activePhase==="other"?"Statuses outside the standard phases":phases.find(p=>p.id===activePhase)?.description}</span></div><span>{boardStages.length} status{boardStages.length===1?"":"es"}</span></div>
    <div className="kanban focused">{boardStages.map(stage=>{const cards=jobs.filter(job=>job.workflow_stage_id===stage.id);return <section className="kanban-column" key={stage.id} onDragOver={e=>e.preventDefault()} onDrop={e=>drop(e,stage.id)}><header style={{borderTopColor:stage.color}}><div><b>{stage.name}</b><span>{cards.length}</span></div><p>${cards.reduce((sum,j)=>sum+Number(j.contract_value),0).toLocaleString()}</p></header><div className="kanban-cards">{cards.map(job=>{const days=Math.floor((Date.now()-new Date(job.updated_at).getTime())/86400000);return <Link href={`/jobs/${job.id}`} draggable onDragStart={e=>e.dataTransfer.setData("jobId",job.id)} className="kanban-card" key={job.id}><div className="card-top"><b>{job.title}</b>{stage.time_limit_days&&days>stage.time_limit_days&&<span>Stuck {days}d</span>}</div><p>{job.clients?.first_name} {job.clients?.last_name} · {job.properties?.city}</p><footer><b>${Number(job.contract_value).toLocaleString()}</b><span>{job.next_action||"Add next action"}</span></footer></Link>})}<div className="drop-hint">Drop job here</div></div></section>})}</div>
  </div></CrmShell>
}
