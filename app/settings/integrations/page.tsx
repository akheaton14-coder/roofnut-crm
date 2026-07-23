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

export default function IntegrationsPage() {
  const { supabase, organizationId, loading, userName } = useWorkspace();
  const [connections, setConnections] = useState<GmailConnection[]>([]);

  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from("gmail_connections")
      .select("id,email_address,status,connected_at")
      .eq("organization_id", organizationId)
      .order("connected_at", { ascending: false })
      .then(({ data }) => setConnections((data || []) as GmailConnection[]));
  }, [organizationId, supabase]);

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
                  <span>Connected {new Date(connection.connected_at).toLocaleDateString()}</span>
                </div>
                <form action="/api/gmail/disconnect" method="post">
                  <button type="submit">Disconnect</button>
                </form>
              </div>
            ))}

            {!connections.length && (
              <div className="integration-actions">
                <a className="primary-button header-link" href="/api/gmail/connect">Connect Gmail →</a>
                <span>Roofnut will ask for permission to read, send, and organize job email.</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </CrmShell>
  );
}
