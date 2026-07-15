"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type Job = {
  id?: string;
  name: string;
  address: string;
  stage: string;
  value: number;
  owner: string;
  next: string;
  tone: "gold" | "blue" | "green" | "red";
};

const stages = [
  { name: "New leads", count: 14, value: "$182k", color: "#9aa3ad" },
  { name: "Estimating", count: 9, value: "$146k", color: "#d6a43b" },
  { name: "Sold", count: 7, value: "$231k", color: "#526fdf" },
  { name: "Production", count: 11, value: "$318k", color: "#2aa584" },
];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function Home() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [activeNav, setActiveNav] = useState("Command center");
  const [query, setQuery] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showNewJob, setShowNewJob] = useState(false);
  const [organizationId, setOrganizationId] = useState("");
  const [liveJobs, setLiveJobs] = useState<Job[]>([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const [importName, setImportName] = useState("");
  const [importRows, setImportRows] = useState<string[][]>([]);
  const [allImportRows, setAllImportRows] = useState<string[][]>([]);
  const [imported, setImported] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [newJob, setNewJob] = useState({ firstName: "", lastName: "", email: "", phone: "", address: "", city: "", state: "NC", postalCode: "", title: "", stage: "new_lead", value: "", nextAction: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login");
      setUser(data.user);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) router.replace("/login");
    });
    return () => data.subscription.unsubscribe();
  }, [router, supabase]);

  useEffect(() => {
    if (!user) return;
    async function loadWorkspace() {
      const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", user!.id).maybeSingle();
      if (!membership?.organization_id) { setJobsLoaded(true); return; }
      setOrganizationId(membership.organization_id);
      const { data } = await supabase.from("jobs").select("id,title,stage,contract_value,next_action,clients(first_name,last_name),properties(address_1,city),profiles!jobs_owner_id_fkey(full_name)").eq("organization_id", membership.organization_id).order("updated_at", { ascending: false }).limit(20);
      const rows = (data || []) as unknown as Array<{id:string;title:string;stage:string;contract_value:number;next_action:string|null;clients:{first_name:string;last_name:string}|null;properties:{address_1:string;city:string}|null;profiles:{full_name:string}|null}>;
      setLiveJobs(rows.map((row) => ({ id: row.id, name: row.title, address: row.properties ? `${row.properties.address_1} · ${row.properties.city}` : `${row.clients?.first_name || ""} ${row.clients?.last_name || ""}`.trim(), stage: row.stage.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()), value: Number(row.contract_value), owner: row.profiles?.full_name || "Unassigned", next: row.next_action || "Add next action", tone: row.stage === "sold" ? "gold" : row.stage.includes("production") || row.stage === "scheduled" ? "green" : row.stage.includes("estimate") ? "red" : "blue" })));
      setJobsLoaded(true);
    }
    loadWorkspace();
  }, [supabase, user]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const filteredJobs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? liveJobs.filter((job) => `${job.name} ${job.address} ${job.stage} ${job.owner}`.toLowerCase().includes(needle)) : liveJobs;
  }, [liveJobs, query]);

  function readCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
      const parsed = lines.map((line) => line.match(/("[^"]*(?:""[^"]*)*"|[^,]*)(?:,|$)/g)?.map((cell) => cell.replace(/,$/, "").replace(/^"|"$/g, "").replaceAll('""', '"').trim()) || []);
      setAllImportRows(parsed);
      setImportRows(parsed.slice(0, 6));
    };
    reader.readAsText(file);
  }

  async function completeImport() {
    if (!organizationId || allImportRows.length < 2) return;
    setSaving(true); setErrorMessage("");
    const headers = allImportRows[0].map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ""));
    const pick = (row: string[], names: string[]) => { const index = headers.findIndex((header) => names.includes(header)); return index >= 0 ? row[index]?.trim() || "" : ""; };
    const { data: existing } = await supabase.from("clients").select("email").eq("organization_id", organizationId);
    const knownEmails = new Set((existing || []).map((client) => client.email?.toLowerCase()).filter(Boolean));
    const records = allImportRows.slice(1).map((row) => {
      const fullName = pick(row, ["name", "fullname", "contactname"]); const parts = fullName.split(/\s+/).filter(Boolean);
      const firstName = pick(row, ["firstname", "first", "contactfirstname"]) || parts[0] || "Unknown";
      const lastName = pick(row, ["lastname", "last", "contactlastname"]) || parts.slice(1).join(" ") || "Unknown";
      return { organization_id: organizationId, first_name: firstName, last_name: lastName, email: pick(row, ["email", "emailaddress", "contactemail"]) || null, phone: pick(row, ["phone", "phonenumber", "mobile", "contactphone"]) || null, company: pick(row, ["company", "companyname"]) || null, source: "csv_import" };
    }).filter((record) => !record.email || !knownEmails.has(record.email.toLowerCase()));
    const { error } = records.length ? await supabase.from("clients").insert(records) : { error: null };
    setSaving(false);
    if (error) { setErrorMessage(error.message); return; }
    setImported(records.length);
    setShowImport(false);
    setImportRows([]); setAllImportRows([]);
  }

  async function createJob() {
    if (!user || !organizationId || !newJob.firstName || !newJob.lastName || !newJob.title) return;
    setSaving(true); setErrorMessage("");
    const { data: client, error: clientError } = await supabase.from("clients").insert({ organization_id: organizationId, first_name: newJob.firstName, last_name: newJob.lastName, email: newJob.email || null, phone: newJob.phone || null }).select("id").single();
    if (clientError) { setErrorMessage(clientError.message); setSaving(false); return; }
    let propertyId: string | null = null;
    if (newJob.address && newJob.city && newJob.postalCode) {
      const { data: property, error } = await supabase.from("properties").insert({ organization_id: organizationId, client_id: client.id, address_1: newJob.address, city: newJob.city, state: newJob.state, postal_code: newJob.postalCode }).select("id").single();
      if (error) { setErrorMessage(error.message); setSaving(false); return; }
      propertyId = property.id;
    }
    const { data: created, error } = await supabase.from("jobs").insert({ organization_id: organizationId, client_id: client.id, property_id: propertyId, title: newJob.title, stage: newJob.stage, contract_value: Number(newJob.value) || 0, owner_id: user.id, next_action: newJob.nextAction || null }).select("id,title,stage,contract_value,next_action").single();
    setSaving(false);
    if (error) { setErrorMessage(error.message); return; }
    setLiveJobs((current) => [{ id: created.id, name: created.title, address: newJob.address ? `${newJob.address} · ${newJob.city}` : `${newJob.firstName} ${newJob.lastName}`, stage: created.stage.replaceAll("_", " ").replace(/\b\w/g, (c:string) => c.toUpperCase()), value: Number(created.contract_value), owner: user.user_metadata?.full_name || "You", next: created.next_action || "Add next action", tone: created.stage === "sold" ? "gold" : "blue" }, ...current]);
    setShowNewJob(false);
    setNewJob({ firstName: "", lastName: "", email: "", phone: "", address: "", city: "", state: "NC", postalCode: "", title: "", stage: "new_lead", value: "", nextAction: "" });
  }

  if (!authReady || !user) return <main className="auth-loading"><span>R</span><p>Opening your command center…</p></main>;

  const displayName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Roofnut Admin";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">R</span><span>ROOFNUT <b>CRM</b></span></div>
        <nav>
          <p className="nav-label">WORKSPACE</p>
          {["Command center", "Clients", "Jobs", "Calendar", "Tasks"].map((item, i) => (
            <button key={item} onClick={() => item === "Clients" ? router.push("/clients") : item === "Jobs" ? router.push("/jobs") : setActiveNav(item)} className={activeNav === item ? "active" : ""}>
              <span className="nav-icon">{["⌂", "◎", "▣", "□", "✓"][i]}</span>{item}{item === "Tasks" && <em>8</em>}
            </button>
          ))}
          <p className="nav-label">REVENUE</p>
          {["Pipeline", "Estimates", "Production", "Payments"].map((item, i) => (
            <button key={item} onClick={() => setActiveNav(item)} className={activeNav === item ? "active" : ""}>
              <span className="nav-icon">{["↗", "$", "◇", "◫"][i]}</span>{item}
            </button>
          ))}
        </nav>
        <div className="ai-card"><span className="spark">✦</span><div><b>Roofnut AI</b><p>Ask anything about your business</p></div><button aria-label="Open Roofnut AI">→</button></div>
        <div className="user-card"><span>{displayName.split(" ").map((part: string) => part[0]).join("").slice(0,2).toUpperCase()}</span><div><b>{displayName}</b><p>Administrator</p></div><button onClick={signOut} title="Sign out">↪</button></div>
      </aside>

      <section className="workspace">
        <header>
          <div className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clients, jobs, addresses..."/><kbd>⌘ K</kbd></div>
          <button className="icon-button" aria-label="Notifications">♢<i /></button>
          <button className="import-button" onClick={() => setShowImport(true)}>↑ Import clients</button>
          <button className="primary-button" onClick={() => setShowNewJob(true)}>＋ New job</button>
        </header>

        <div className="content">
          <div className="hero-row">
            <div><p className="eyebrow">TUESDAY, JULY 14</p><h1>Good morning, Kendall.</h1><p>Here’s what needs your attention today.</p></div>
            <div className="period">This month <span>⌄</span></div>
          </div>

          <div className="stat-grid">
            <article><div className="stat-top"><span className="stat-icon gold">↗</span><small>＋ 12.4%</small></div><p>Sales this month</p><h2>$418,250</h2><div className="progress"><i style={{width:"84%"}} /></div><footer><span>$500k goal</span><b>84%</b></footer></article>
            <article><div className="stat-top"><span className="stat-icon blue">▣</span><small>7 sold</small></div><p>Open pipeline</p><h2>$877,840</h2><footer><span>41 active opportunities</span><b>View pipeline →</b></footer></article>
            <article><div className="stat-top"><span className="stat-icon green">◇</span><small>11 active</small></div><p>In production</p><h2>$318,420</h2><footer><span>4 installs this week</span><b>View schedule →</b></footer></article>
            <article><div className="stat-top"><span className="stat-icon red">!</span><small className="urgent">Needs attention</small></div><p>Outstanding balance</p><h2>$76,980</h2><footer><span>6 unpaid invoices</span><b>Review →</b></footer></article>
          </div>

          <div className="main-grid">
            <section className="panel jobs-panel">
              <div className="panel-head"><div><h3>Jobs that need attention</h3><p>Prioritized by Roofnut AI</p></div><button>View all jobs →</button></div>
              <div className="job-list">
                {filteredJobs.map((job) => <article className="job-row" key={job.name}>
                  <span className={`job-badge ${job.tone}`}>{job.name.split(" ").slice(0,2).map(w=>w[0]).join("")}</span>
                  <div className="job-main"><h4>{job.name}</h4><p>{job.address}</p></div>
                  <span className={`stage ${job.tone}`}>{job.stage}</span>
                  <div className="job-value"><b>{money.format(job.value)}</b><p>{job.owner}</p></div>
                  <div className="job-next"><b>{job.next}</b><p>Next action</p></div>
                  <button onClick={() => job.id && router.push(`/jobs/${job.id}`)} aria-label={`Open ${job.name}`}>›</button>
                </article>)}
                {jobsLoaded && !filteredJobs.length && <div className="empty">{query ? `No jobs match “${query}”.` : "No live jobs yet. Create your first job to get started."}</div>}
              </div>
            </section>

            <aside className="panel ai-panel">
              <div className="ai-title"><span>✦</span><div><h3>Your AI rundown</h3><p>Updated 8:02 AM</p></div></div>
              <div className="brief"><span className="brief-num red-bg">1</span><div><b>3 estimates are going cold</b><p>No activity in 5+ days. Johnson is the highest value at $18,990.</p><button>Draft follow-ups →</button></div></div>
              <div className="brief"><span className="brief-num gold-bg">2</span><div><b>Smith needs a response</b><p>They emailed yesterday asking about their shingle delivery.</p><button>Open conversation →</button></div></div>
              <div className="brief"><span className="brief-num blue-bg">3</span><div><b>2 sold jobs aren’t invoiced</b><p>$49,600 is ready to invoice from approved estimates.</p><button>Create invoices →</button></div></div>
              <div className="ask-ai"><span>✦</span><input placeholder="Ask Roofnut AI to do something..."/><button>↑</button></div>
            </aside>
          </div>

          <section className="panel pipeline-panel">
            <div className="panel-head"><div><h3>Pipeline snapshot</h3><p>From lead to completed roof</p></div><button>Open full pipeline →</button></div>
            <div className="stage-grid">{stages.map(stage => <article key={stage.name}><div><span style={{background:stage.color}} /><b>{stage.name}</b></div><h3>{stage.count}</h3><p>{stage.value} total value</p></article>)}</div>
          </section>
        </div>
      </section>

      {showImport && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowImport(false)}>
        <section className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
          <button className="modal-close" onClick={() => setShowImport(false)}>×</button>
          <span className="modal-icon">↑</span><p className="eyebrow">DATA MIGRATION</p><h2 id="import-title">Bring your history with you.</h2><p>Upload a CSV export from JobNimbus or any spreadsheet. We’ll match columns, flag duplicates, and preserve every client as a searchable record.</p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={readCsv} hidden />
          {!importRows.length ? <button className="dropzone" onClick={() => fileRef.current?.click()}><span>＋</span><b>Choose a CSV file</b><small>Customers, contacts, addresses, phones, emails and job history</small></button> : <div className="preview"><div className="file-ready"><span>✓</span><div><b>{importName}</b><p>{Math.max(0, importRows.length - 1)} preview rows detected</p></div></div><div className="table-wrap"><table><tbody>{importRows.map((row,i)=><tr key={i}>{row.slice(0,4).map((cell,j)=><td key={j}>{cell || "—"}</td>)}</tr>)}</tbody></table></div></div>}
          <div className="import-notes"><span>✓ Automatic duplicate detection</span><span>✓ Preview before saving</span><span>✓ Nothing changes in JobNimbus</span></div>
          {errorMessage && <div className="login-message">{errorMessage}</div>}
          <div className="modal-actions"><button onClick={() => setShowImport(false)}>Cancel</button><button className="primary-button" disabled={!importRows.length || saving} onClick={completeImport}>{saving ? "Importing…" : "Import clients →"}</button></div>
        </section>
      </div>}

      {showNewJob && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowNewJob(false)}>
        <section className="modal job-modal" role="dialog" aria-modal="true" aria-labelledby="job-title">
          <button className="modal-close" onClick={() => setShowNewJob(false)}>×</button><span className="modal-icon">＋</span><p className="eyebrow">NEW OPPORTUNITY</p><h2 id="job-title">Create a new job.</h2><p>Add the homeowner and property now. You can build the estimate and production checklist next.</p>
          <div className="form-grid"><label>First name<input value={newJob.firstName} onChange={(e)=>setNewJob({...newJob,firstName:e.target.value})}/></label><label>Last name<input value={newJob.lastName} onChange={(e)=>setNewJob({...newJob,lastName:e.target.value})}/></label><label>Email<input type="email" value={newJob.email} onChange={(e)=>setNewJob({...newJob,email:e.target.value})}/></label><label>Phone<input value={newJob.phone} onChange={(e)=>setNewJob({...newJob,phone:e.target.value})}/></label><label className="wide">Job title<input value={newJob.title} onChange={(e)=>setNewJob({...newJob,title:e.target.value})} placeholder="Smith roof replacement"/></label><label className="wide">Property address<input value={newJob.address} onChange={(e)=>setNewJob({...newJob,address:e.target.value})}/></label><label>City<input value={newJob.city} onChange={(e)=>setNewJob({...newJob,city:e.target.value})}/></label><label>State<input value={newJob.state} onChange={(e)=>setNewJob({...newJob,state:e.target.value})}/></label><label>ZIP code<input value={newJob.postalCode} onChange={(e)=>setNewJob({...newJob,postalCode:e.target.value})}/></label><label>Contract value<input type="number" value={newJob.value} onChange={(e)=>setNewJob({...newJob,value:e.target.value})}/></label><label>Stage<select value={newJob.stage} onChange={(e)=>setNewJob({...newJob,stage:e.target.value})}><option value="new_lead">New lead</option><option value="inspection">Inspection</option><option value="estimating">Estimating</option><option value="estimate_sent">Estimate sent</option><option value="sold">Sold</option></select></label><label>Next action<input value={newJob.nextAction} onChange={(e)=>setNewJob({...newJob,nextAction:e.target.value})}/></label></div>
          {errorMessage && <div className="login-message">{errorMessage}</div>}
          <div className="modal-actions"><button onClick={()=>setShowNewJob(false)}>Cancel</button><button className="primary-button" disabled={saving || !newJob.firstName || !newJob.lastName || !newJob.title} onClick={createJob}>{saving ? "Saving…" : "Create job →"}</button></div>
        </section>
      </div>}

      {imported > 0 && <div className="toast"><span>✓</span><div><b>Client import ready</b><p>{imported} records passed the first review.</p></div><button onClick={()=>setImported(0)}>×</button></div>}
    </main>
  );
}
