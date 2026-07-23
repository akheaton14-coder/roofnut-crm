import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptGmailToken, verifyGmailState } from "@/lib/gmail-crypto";

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
};

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const errorRedirect = (reason: string) =>
    NextResponse.redirect(new URL(`/settings/integrations?error=${encodeURIComponent(reason)}`, appUrl));

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) return errorRedirect("google_cancelled");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !verifyGmailState(state, user.id)) return errorRedirect("invalid_state");

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_GMAIL_CLIENT_ID!,
      client_secret: process.env.GOOGLE_GMAIL_CLIENT_SECRET!,
      redirect_uri: `${appUrl}/api/gmail/callback`,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const tokens = await tokenResponse.json() as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokens.access_token) return errorRedirect(tokens.error || "token_exchange_failed");

  const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    cache: "no-store",
  });
  if (!profileResponse.ok) return errorRedirect("profile_failed");
  const profile = await profileResponse.json() as { emailAddress: string; historyId?: string };

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership?.organization_id) return errorRedirect("workspace_missing");

  const { data: connection, error: connectionError } = await admin
    .from("gmail_connections")
    .upsert({
      organization_id: membership.organization_id,
      user_id: user.id,
      email_address: profile.emailAddress,
      history_id: profile.historyId || null,
      scopes: tokens.scope?.split(" ") || [],
      status: "connected",
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,email_address" })
    .select("id")
    .single();
  if (connectionError || !connection) return errorRedirect("connection_save_failed");

  const { data: existingToken } = await admin
    .from("gmail_oauth_tokens")
    .select("refresh_token_encrypted")
    .eq("connection_id", connection.id)
    .maybeSingle();

  const { error: tokenError } = await admin.from("gmail_oauth_tokens").upsert({
    connection_id: connection.id,
    user_id: user.id,
    access_token_encrypted: encryptGmailToken(tokens.access_token),
    refresh_token_encrypted: tokens.refresh_token
      ? encryptGmailToken(tokens.refresh_token)
      : existingToken?.refresh_token_encrypted,
    expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "connection_id" });
  if (tokenError) return errorRedirect("token_save_failed");

  return NextResponse.redirect(new URL("/settings/integrations?connected=gmail", appUrl));
}
