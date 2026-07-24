import { createAdminClient } from "@/lib/supabase/admin";
import { decryptGmailToken, encryptGmailToken } from "@/lib/gmail-crypto";

type GmailTokenRow = {
  connection_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  expires_at: string;
};

export async function getGmailAccessToken(userId: string, organizationId: string) {
  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("gmail_connections")
    .select("id,email_address")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "connected")
    .maybeSingle();

  if (!connection) throw new Error("Gmail is not connected.");

  const { data } = await admin
    .from("gmail_oauth_tokens")
    .select("connection_id,access_token_encrypted,refresh_token_encrypted,expires_at")
    .eq("connection_id", connection.id)
    .maybeSingle();
  const tokens = data as GmailTokenRow | null;
  if (!tokens) throw new Error("Gmail authorization is missing.");

  if (new Date(tokens.expires_at).getTime() > Date.now() + 60_000) {
    return { accessToken: decryptGmailToken(tokens.access_token_encrypted), from: connection.email_address };
  }
  if (!tokens.refresh_token_encrypted) throw new Error("Reconnect Gmail to refresh authorization.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_GMAIL_CLIENT_ID!,
      client_secret: process.env.GOOGLE_GMAIL_CLIENT_SECRET!,
      refresh_token: decryptGmailToken(tokens.refresh_token_encrypted),
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const refreshed = await response.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !refreshed.access_token) throw new Error(refreshed.error || "Google could not refresh Gmail.");

  await admin.from("gmail_oauth_tokens").update({
    access_token_encrypted: encryptGmailToken(refreshed.access_token),
    expires_at: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("connection_id", connection.id);

  return { accessToken: refreshed.access_token, from: connection.email_address };
}

export function createGmailMessage(to: string, from: string, subject: string, body: string, reply?: { messageId?: string; references?: string }) {
  const normalizedSubject = subject.replace(/[\r\n]+/g, " ").trim();
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${normalizedSubject}`,
    ...(reply?.messageId ? [`In-Reply-To: ${reply.messageId}`, `References: ${[reply.references, reply.messageId].filter(Boolean).join(" ")}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");
  return Buffer.from(message).toString("base64url");
}
