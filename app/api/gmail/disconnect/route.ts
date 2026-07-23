import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: connections } = await admin.from("gmail_connections").select("id").eq("user_id", user.id);
  const ids = (connections || []).map((connection) => connection.id);
  if (ids.length) {
    await admin.from("gmail_oauth_tokens").delete().in("connection_id", ids);
    await admin.from("gmail_connections").delete().in("id", ids);
  }
  return NextResponse.redirect(new URL("/settings/integrations?disconnected=gmail", process.env.NEXT_PUBLIC_APP_URL), 303);
}
