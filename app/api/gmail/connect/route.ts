import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createGmailState } from "@/lib/gmail-crypto";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL));

  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!clientId || !appUrl) {
    return NextResponse.redirect(new URL("/settings/integrations?error=missing_config", appUrl || "http://localhost:3000"));
  }

  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", `${appUrl}/api/gmail/callback`);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("prompt", "consent");
  authorizationUrl.searchParams.set("include_granted_scopes", "true");
  authorizationUrl.searchParams.set("scope", [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.modify",
  ].join(" "));
  authorizationUrl.searchParams.set("state", createGmailState(user.id));

  return NextResponse.redirect(authorizationUrl);
}
