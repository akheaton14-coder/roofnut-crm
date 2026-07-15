"use client";

import { DragEvent, useEffect, useState } from "react";
import { useParams,useRouter } from "next/navigation";
import { CrmShell } from "@/components/crm-shell";
import { useWorkspace } from "@/lib/use-workspace";

type PhaseId="leads"|"estimating"|"preproduction"|"production"|"closed";
type Stage={id:string;name:string;key:string;color:string;position:number;category:string;time_limit_days:number|null;phase:PhaseId};
const phases:{id:PhaseId;name:string;description:string}[]=[
  {id:"leads",name:"Leads",description:"New opportunities and inspections"},
  {id:"estimating",name:"Estimating",description:"Pricing, proposals and approvals"},
  {id:"preproduction",name:"Pre-Production",description:"Sold jobs preparing for installation"},
  {id:"production",name:"Production",description:"Active builds and completed work"},
  {id:"closed",name:"Closed / Lost",description:"Archived opportunities"},
];
const inferPhase=(key:string):PhaseId=>/lost|cancel/.test(key)?"closed":/in_production|completed/.test(key)?"production":/sold|pre_production|scheduled/.test(key)?"preproduction":/estimat/.test(key)?"estimating":"leads";

export default function WorkflowEditor(){
  const {id}=useParams<{id:string}>(),router=useRouter();
  const {supabase,organizationId,loading,userName}=useWorkspace();
  const [name,setName]=useState("Workflow"),[stages,setStages]=useState<Stage[]>([]),[open,setOpen]=useState<Record<PhaseId,boolean>>({leads:true,estimating:true,preproduction:true,production:true,closed:false});
  const [jobCounts,setJobCounts]=useState<Record<string,number>>({});
  const [needsMigration,setNeedsMigration]=useState(false);

  useEffect(()=>{if(!organizationId)return;(async()=>{
    const [{data:w},{data:base}]=await Promise.all([
      supabase.from("workflows").select("name").eq("id",id).single(),
      supabase.from("workflow_stages").select("id,name,key,color,position,category,time_limit_days").eq("workflow_id",id).order("position")
    ]);
    if(w)setName(w.name);
    const {data:phaseRows,error}=await supabase.from("workflow_stages").select("id,phase").eq("workflow_id",id);
    if(error)setNeedsMigration(true);
    const phaseMap=new Map((phaseRows||[]).map(row=>[row.id,row.phase as PhaseId]));
    setStages(((base||[]) as Omit<Stage,"phase">[]).map(stage=>({...stage,phase:phaseMap.get(stage.id)||inferPhase(stage.key)})));
    const {data:assigned}=await supabase.from("jobs").select("workflow_stage_id").eq("workflow_id",id);
    setJobCounts((assigned||[]).reduce<Record<string,number>>((counts,job)=>{if(job.workflow_stage_id)counts[job.workflow_stage_id]=(counts[job.workflow_stage_id]||0)+1;return counts},{}));
  })()},[id,organizationId,supabase]);

  async function update(stage:Stage,patch:Partial<Stage>){setStages(current=>current.map(s=>s.id===stage.id?{...s,...patch}:s));await supabase.from("workflow_stages").update(patch).eq("id",stage.id)}
  async function saveOrder(next:Stage[]){setStages(next);await Promise.all(next.map((stage,position)=>supabase.from("workflow_stages").update({position}).eq("id",stage.id)))}
  async function moveWithin(stage:Stage,direction:number){const group=stages.filter(s=>s.phase===stage.phase),index=group.findIndex(s=>s.id===stage.id),target=group[index+direction];if(!target)return;const next=[...stages],a=next.findIndex(s=>s.id===stage.id),b=next.findIndex(s=>s.id===target.id);[next[a],next[b]]=[next[b],next[a]];await saveOrder(next)}
  async function drop(event:DragEvent,phase:PhaseId){event.preventDefault();const stageId=event.dataTransfer.getData("stageId"),stage=stages.find(s=>s.id===stageId);if(!stage)return;const updated=stages.map(s=>s.id===stageId?{...s,phase}:s);setOpen(current=>({...current,[phase]:true}));await update({...stage,phase},{phase});await saveOrder(updated)}
  async function add(phase:PhaseId="leads"){const position=stages.length,key=`status_${Date.now()}`;const payload={organization_id:organizationId,workflow_id:id,key,name:"New Status",color:"#00c8ca",position,category:"active",time_limit_days:3,phase};let query=supabase.from("workflow_stages").insert(payload).select("id,name,key,color,position,category,time_limit_days,phase");const {data,error}=await query.single();if(error){setNeedsMigration(true);return}if(data){setStages(current=>[...current,data as Stage]);setOpen(current=>({...current,[phase]:true}))}}
  async function remove(stage:Stage){const count=jobCounts[stage.id]||0;if(count)return;if(!window.confirm(`Delete the “${stage.name}” status? This cannot be undone.`))return;const {error}=await supabase.from("workflow_stages").delete().eq("id",stage.id);if(!error)await saveOrder(stages.filter(item=>item.id!==stage.id))}

  if(loading)return <main className="auth-loading"><span>R</span></main>;
  return <CrmShell userName={userName}><div className="content workflow-editor">
    <div className="workflow-head"><button onClick={()=>router.push("/pipeline")}>← Back to board</button><div><p className="eyebrow">WORKFLOW SETTINGS</p><h1>{name}</h1><p><b>Stages</b> are the major sections. <b>Statuses</b> are the columns inside them. Pipeline cards are your jobs.</p></div><button className="primary-button" onClick={()=>add()}>＋ Add status</button></div>
    {needsMigration&&<div className="workflow-warning"><b>One-time database update needed</b><span>Run the newest workflow phases migration in Supabase to save statuses between stages.</span></div>}
    <div className="workflow-phases">{phases.map(phase=>{const items=stages.filter(stage=>stage.phase===phase.id);return <section className={`workflow-phase ${open[phase.id]?"open":""}`} key={phase.id} onDragOver={e=>e.preventDefault()} onDrop={e=>drop(e,phase.id)}>
      <button className="phase-heading" onClick={()=>setOpen(current=>({...current,[phase.id]:!current[phase.id]}))}><span className="phase-chevron">›</span><div><b>{phase.name}</b><small>{phase.description}</small></div><em>{items.length} status{items.length===1?"":"es"}</em></button>
      {open[phase.id]&&<div className="phase-statuses">{items.map((stage,index)=><article draggable onDragStart={e=>e.dataTransfer.setData("stageId",stage.id)} className="status-card" key={stage.id}>
        <span className="drag-handle">⠿</span><input className="status-color" type="color" value={stage.color} onChange={e=>update(stage,{color:e.target.value})}/><div className="status-name"><label>Status name · {jobCounts[stage.id]||0} job{jobCounts[stage.id]===1?"":"s"}</label><input value={stage.name} onChange={e=>setStages(c=>c.map(s=>s.id===stage.id?{...s,name:e.target.value}:s))} onBlur={e=>update(stage,{name:e.target.value})}/></div><div><label>Status type</label><select value={stage.category} onChange={e=>update(stage,{category:e.target.value})}><option value="open">Open</option><option value="active">Active</option><option value="won">Won</option><option value="complete">Complete</option><option value="lost">Lost</option></select></div><div className="time-target"><label>Time target</label><span><input type="number" min="0" value={stage.time_limit_days??""} onChange={e=>update(stage,{time_limit_days:e.target.value?Number(e.target.value):null})}/> days</span></div><div className="status-order"><button disabled={index===0} onClick={()=>moveWithin(stage,-1)}>↑</button><button disabled={index===items.length-1} onClick={()=>moveWithin(stage,1)}>↓</button></div><button className="delete-status" disabled={(jobCounts[stage.id]||0)>0} title={(jobCounts[stage.id]||0)>0?"Move all jobs out of this status before deleting":"Delete status"} onClick={()=>remove(stage)}>Delete</button>
      </article>)}<button className="add-status-inline" onClick={()=>add(phase.id)}>＋ Add a status to {phase.name}</button></div>}
    </section>})}</div>
    <div className="workflow-note">Drag statuses between stages or reorder them with the arrows. Existing job history remains attached to the status.</div>
  </div></CrmShell>
}
