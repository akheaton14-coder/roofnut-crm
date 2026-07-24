import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });

    const { jobId } = await request.json() as { jobId?: string };
    if (!jobId) return NextResponse.json({ error: "Job is required." }, { status: 400 });

    const admin = createAdminClient();
    const { data: membership } = await admin.from("organization_members")
      .select("organization_id").eq("user_id", user.id).maybeSingle();
    if (!membership?.organization_id) return NextResponse.json({ error: "Workspace not found." }, { status: 403 });

    const { error } = await admin.from("gmail_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("organization_id", membership.organization_id)
      .eq("job_id", jobId)
      .is("read_at", null);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Email could not be marked read." }, { status: 500 });
  }
}

