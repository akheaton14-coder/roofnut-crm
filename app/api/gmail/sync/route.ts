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

    const fetchedMessages: GmailMessage[] = [];
    for (let index = 0; index < newIds.length; index += 20) {
      const batch = newIds.slice(index, index + 20);
      const details = await Promise.all(batch.map(async (messageId) => {
        const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        return response.ok ? await response.json() as GmailMessage : null;
      }));
      fetchedMessages.push(...details.filter((message): message is GmailMessage => Boolean(message)));
    }

    let skippedOwn = 0;
    const incoming = fetchedMessages.flatMap((message) => {
      const sender = parseSender(header(message, "From"));
      if (sender.email === connection.email_address.toLowerCase()) {
        skippedOwn++;
        return [];
      }
      const clientId = clientByEmail.get(sender.email) || null;
      const jobId = clientId ? latestJobByClient.get(clientId) || null : null;
      const subject = header(message, "Subject") || "(No subject)";
      const receivedAt = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString();
      return [{
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
      }];
    });

    const matched = incoming.filter((message) => message.job_id).length;
    const unmatched = incoming.length - matched;
    if (incoming.length) {
      const { error } = await admin.from("gmail_messages").insert(incoming);
      if (error) throw new Error(`Inbox messages could not be saved: ${error.message}`);
      const activities = incoming.filter((message) => message.job_id).map((message) => ({
        organization_id: membership.organization_id,
        job_id: message.job_id!,
        actor_id: null,
        kind: "email received",
        body: `From: ${message.sender_name ? `${message.sender_name} <${message.sender_email}>` : message.sender_email}\nSubject: ${message.subject}\n\n${message.snippet}`,
        occurred_at: message.received_at,
      }));
      if (activities.length) await admin.from("activities").insert(activities);
    }

    return NextResponse.json({ ok: true, imported: incoming.length, matched, unmatched, skippedOwn, scanned: newIds.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Inbox sync failed." }, { status: 500 });
  }
}
