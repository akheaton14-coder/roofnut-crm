"use client";

import { useEffect, useState } from "react";
import { CrmShell } from "@/components/crm-shell";
import { useWorkspace } from "@/lib/use-workspace";

type GmailConnection = {
  id: string;
  email_address: string;
  status: string;
  connected_at: string;
};
type GmailMessage = { id:string;sender_email:string;sender_name:string|null;subject:string;snippet:string;received_at:string;job_id:string|null };

export default function IntegrationsPage() {
  const { supabase, organizationId, loading, userName } = useWorkspace();
  const [connections, setConnections] = useState<GmailConnection[]>([]);
  const [messages,setMessages]=useState<GmailMessage[]>([]);
  const [syncing,setSyncing]=useState(false);
  const [syncMessage,setSyncMessage]=useState("");

  function loadMessages() {
    if (!organizationId) return;
    supabase.from("gmail_messages").select("id,sender_email,sender_name,subject,snippet,received_at,job_id")
      .eq("organization_id",organizationId).order("received_at",{ascending:false}).limit(20)
      .then(({data})=>setMessages((data||[]) as GmailMessage[]));
  }
  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from("gmail_connections")
      .select("id,email_address,status,connected_at")
      .eq("organization_id", organizationId)
      .order("connected_at", { ascending: false })
      .then(({ data }) => setConnections((data || []) as GmailConnection[]));
    loadMessages();
    const autoSync=()=>{if(document.visibilityState==="visible"&&connections.length)syncInbox()};
    const timer=window.setInterval(autoSync,60000);
    window.addEventListener("focus",autoSync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return()=>{window.clearInterval(timer);window.removeEventListener("focus",autoSync)};
  }, [organizationId, supabase, connections.length]);
  async function syncInbox(){setSyncing(true);setSyncMessage("");try{const response=await fetch("/api/gmail/sync",{method:"POST"});const result=await response.json();if(!response.ok)throw new Error(result.error||"Inbox sync failed.");setSyncMessage(`${result.imported} new email${result.imported===1?"":"s"} · ${result.matched} attached to jobs${result.unmatched?` · ${result.unmatched} unmatched`:""} · ${result.scanned} checked`);loadMessages()}catch(error){setSyncMessage(error instanceof Error?error.message:"Inbox sync failed.")}finally{setSyncing(false)}}

  if (loading) return <main className="auth-loading"><span>R</span></main>;

  return (
    <CrmShell userName={userName}>
      <div className="content directory integrations-page">
        <div className="directory-head">
          <div>
            <p className="eyebrow">BUSINESS SETTINGS</p>
            <h1>Integrations</h1>
            <p>Connect the tools Roofnut uses every day.</p>
          </div>
        </div>

        <section className="panel integration-card">
          <div className="integration-logo gmail-logo">M</div>
          <div className="integration-copy">
            <div className="integration-title">
              <div>
                <h2>Gmail</h2>
                <p>Send from your real inbox and keep client replies attached to the job.</p>
              </div>
              <span className={connections.length ? "connection-status connected" : "connection-status"}>
                {connections.length ? "Connected" : "Not connected"}
              </span>
            </div>

            {connections.map((connection) => (
              <div className="connected-account" key={connection.id}>
                <div>
                  <b>{connection.email_address}</b>
                  <span>Connected {new Date(connection.connected_at).toLocaleDateString()} · Inbox checks automatically while Roofnut CRM is open</span>
                </div>
                <div className="connected-actions"><button className="sync-button" disabled={syncing} onClick={syncInbox}>{syncing?"Syncing…":"↻ Sync inbox"}</button><form action="/api/gmail/disconnect" method="post"><button type="submit">Disconnect</button></form></div>
              </div>
            ))}
            {syncMessage&&<div className="sync-result">{syncMessage}</div>}

            {!connections.length && (
              <div className="integration-actions">
                <a className="primary-button header-link" href="/api/gmail/connect">Connect Gmail →</a>
                <span>Roofnut will ask for permission to read, send, and organize job email.</span>
              </div>
            )}
          </div>
        </section>
        {!!connections.length&&<section className="panel gmail-inbox"><div className="panel-head"><div><h3>Recent Gmail</h3><p>Client emails attach to their latest job. Unmatched messages stay here for review.</p></div></div>{messages.map(message=><article key={message.id} className={message.job_id?"matched":""}><div className="gmail-message-icon">{message.job_id?"✓":"✉"}</div><div><b>{message.sender_name||message.sender_email}</b><span>{message.sender_email}</span><h4>{message.subject}</h4><p>{message.snippet}</p></div><div className="gmail-message-meta"><span>{new Date(message.received_at).toLocaleString()}</span><b>{message.job_id?"Attached to job":"Unmatched"}</b></div></article>)}{!messages.length&&<div className="empty">Click “Sync inbox” to bring in the last 30 days of Gmail.</div>}</section>}
      </div>
    </CrmShell>
  );
}
