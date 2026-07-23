import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGmailAccessToken } from "@/lib/gmail";

type GmailMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: { headers?: Array<{ name: string; value: string }> };
};

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function parseSender(value: string) {
  const match = value.match(/^(.*?)\s*<([^>]+)>$/);
  return {
    name: (match?.[1] || "").replace(/^["']|["']$/g, "").trim() || null,
    email: (match?.[2] || value).trim().toLowerCase(),
  };
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });

    const admin = createAdminClient();
    const { data: membership } = await admin.from("organization_members")
      .select("organization_id").eq("user_id", user.id).maybeSingle();
    if (!membership?.organization_id) return NextResponse.json({ error: "Workspace not found." }, { status: 403 });

    const { data: connection } = await admin.from("gmail_connections")
      .select("id,email_address").eq("organization_id", membership.organization_id)
      .eq("user_id", user.id).eq("status", "connected").maybeSingle();
    if (!connection) return NextResponse.json({ error: "Connect Gmail first." }, { status: 400 });

    const { accessToken } = await getGmailAccessToken(user.id, membership.organization_id);
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    // Gmail search is thread-aware and can hide replies in mixed sent/received
    // conversations. Read the newest individual messages without a search
    // expression, then filter our own sender after reading each header.
    listUrl.searchParams.set("maxResults", "100");
    const listResponse = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const list = await listResponse.json() as { messages?: Array<{ id: string }>; error?: { message?: string } };
    if (!listResponse.ok) throw new Error(list.error?.message || "Gmail inbox could not be read.");

    const { data: existing } = await admin.from("gmail_messages")
      .select("gmail_message_id").eq("connection_id", connection.id);
    const known = new Set((existing || []).map((row) => row.gmail_message_id));
    const newIds = (list.messages || []).map((item) => item.id).filter((messageId) => !known.has(messageId));

    const { data: clients } = await admin.from("clients")
      .select("id,email").eq("organization_id", membership.organization_id).not("email", "is", null);
    const clientByEmail = new Map((clients || []).map((client) => [client.email.toLowerCase(), client.id]));
    const clientIds = (clients || []).map((client) => client.id);
    const { data: jobs } = clientIds.length ? await admin.from("jobs")
      .select("id,client_id").eq("organization_id", membership.organization_id)
      .in("client_id", clientIds).order("updated_at", { ascending: false }) : { data: [] };
    const latestJobByClient = new Map<string, string>();
    for (const job of jobs || []) if (!latestJobByClient.has(job.client_id)) latestJobByClient.set(job.client_id, job.id);

    let matched = 0;
    let unmatched = 0;
    let skippedOwn = 0;
    for (const messageId of newIds) {
      const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!response.ok) continue;
      const message = await response.json() as GmailMessage;
      const sender = parseSender(header(message, "From"));
      if (sender.email === connection.email_address.toLowerCase()) {
        skippedOwn++;
        continue;
      }
      const clientId = clientByEmail.get(sender.email) || null;
      const jobId = clientId ? latestJobByClient.get(clientId) || null : null;
      const subject = header(message, "Subject") || "(No subject)";
      const receivedAt = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString();
      const { error } = await admin.from("gmail_messages").insert({
        organization_id: membership.organization_id,
        connection_id: connection.id,
        client_id: clientId,
        job_id: jobId,
        gmail_message_id: message.id,
        gmail_thread_id: message.threadId || null,
        sender_email: sender.email,
        sender_name: sender.name,
        subject,
        snippet: message.snippet || "",
        received_at: receivedAt,
      });
      if (error) continue;
      if (jobId) {
        matched++;
        await admin.from("activities").insert({
          organization_id: membership.organization_id,
          job_id: jobId,
          actor_id: null,
          kind: "email received",
          body: `From: ${sender.name ? `${sender.name} <${sender.email}>` : sender.email}\nSubject: ${subject}\n\n${message.snippet || ""}`,
          occurred_at: receivedAt,
        });
      } else {
        unmatched++;
      }
    }

    return NextResponse.json({ ok: true, imported: matched + unmatched, matched, unmatched, skippedOwn, scanned: newIds.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Inbox sync failed." }, { status: 500 });
  }
}
