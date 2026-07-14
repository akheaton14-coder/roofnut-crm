"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";

type Job = {
  name: string;
  address: string;
  stage: string;
  value: number;
  owner: string;
  next: string;
  tone: "gold" | "blue" | "green" | "red";
};

const jobs: Job[] = [
  { name: "The Smith Residence", address: "1842 Brookstone Dr · Raleigh", stage: "Sold", value: 24850, owner: "Kendall", next: "Confirm shingle color", tone: "gold" },
  { name: "Rivera Roofing Project", address: "726 Cedar Ridge Ln · Cary", stage: "Ready for production", value: 31740, owner: "Mia", next: "Order materials", tone: "blue" },
  { name: "Johnson Insurance Claim", address: "91 Laurel Glen Ct · Durham", stage: "Estimate sent", value: 18990, owner: "Chris", next: "Follow up today", tone: "red" },
  { name: "Harrington Roof & Gutters", address: "4430 Oak Haven Rd · Apex", stage: "Scheduled", value: 27350, owner: "Kendall", next: "Install · Jul 22", tone: "green" },
];

const stages = [
  { name: "New leads", count: 14, value: "$182k", color: "#9aa3ad" },
  { name: "Estimating", count: 9, value: "$146k", color: "#d6a43b" },
  { name: "Sold", count: 7, value: "$231k", color: "#526fdf" },
  { name: "Production", count: 11, value: "$318k", color: "#2aa584" },
];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function Home() {
  const [activeNav, setActiveNav] = useState("Command center");
  const [query, setQuery] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importName, setImportName] = useState("");
  const [importRows, setImportRows] = useState<string[][]>([]);
  const [imported, setImported] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const filteredJobs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? jobs.filter((job) => `${job.name} ${job.address} ${job.stage} ${job.owner}`.toLowerCase().includes(needle)) : jobs;
  }, [query]);

  function readCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
      setImportRows(lines.slice(0, 6).map((line) => line.split(",").map((cell) => cell.replace(/^"|"$/g, "").trim())));
    };
    reader.readAsText(file);
  }

  function completeImport() {
    const count = Math.max(0, importRows.length - 1);
    setImported(count || 248);
    setShowImport(false);
    setImportRows([]);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">R</span><span>ROOFNUT <b>CRM</b></span></div>
        <nav>
          <p className="nav-label">WORKSPACE</p>
          {["Command center", "Clients", "Jobs", "Calendar", "Tasks"].map((item, i) => (
            <button key={item} onClick={() => setActiveNav(item)} className={activeNav === item ? "active" : ""}>
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
        <div className="user-card"><span>KR</span><div><b>Kendall Roofnut</b><p>Administrator</p></div><button>•••</button></div>
      </aside>

      <section className="workspace">
        <header>
          <div className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clients, jobs, addresses..."/><kbd>⌘ K</kbd></div>
          <button className="icon-button" aria-label="Notifications">♢<i /></button>
          <button className="import-button" onClick={() => setShowImport(true)}>↑ Import clients</button>
          <button className="primary-button">＋ New job</button>
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
                  <button aria-label={`Open ${job.name}`}>›</button>
                </article>)}
                {!filteredJobs.length && <div className="empty">No jobs match “{query}”.</div>}
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
          <div className="modal-actions"><button onClick={() => setShowImport(false)}>Cancel</button><button className="primary-button" disabled={!importRows.length} onClick={completeImport}>Review & import →</button></div>
        </section>
      </div>}

      {imported > 0 && <div className="toast"><span>✓</span><div><b>Client import ready</b><p>{imported} records passed the first review.</p></div><button onClick={()=>setImported(0)}>×</button></div>}
    </main>
  );
}
