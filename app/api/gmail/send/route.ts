import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createGmailMessage, getGmailAccessToken } from "@/lib/gmail";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });

    const payload = await request.json() as { jobId?: string; to?: string; subject?: string; body?: string; replyToMessageId?: string; gmailThreadId?: string };
    const jobId = payload.jobId?.trim();
    const to = payload.to?.trim();
    const subject = payload.subject?.trim();
    const body = payload.body?.trim();
    if (!jobId || !to || !subject || !body) {
      return NextResponse.json({ error: "Recipient, subject, and message are required." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: membership } = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership?.organization_id) return NextResponse.json({ error: "Workspace not found." }, { status: 403 });

    const { data: job } = await admin
      .from("jobs")
      .select("id,title")
      .eq("id", jobId)
      .eq("organization_id", membership.organization_id)
      .maybeSingle();
    if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

    const { accessToken, from } = await getGmailAccessToken(user.id, membership.organization_id);
    let replyHeaders: { messageId?: string; references?: string } | undefined;
    let threadId: string | undefined;
    if (payload.replyToMessageId) {
      const { data: original } = await admin.from("gmail_messages")
        .select("gmail_message_id,gmail_thread_id")
        .eq("organization_id", membership.organization_id)
        .eq("job_id", jobId)
        .eq("gmail_message_id", payload.replyToMessageId)
        .maybeSingle();
      if (!original) return NextResponse.json({ error: "The original email could not be found." }, { status: 404 });
      threadId = original.gmail_thread_id || payload.gmailThreadId;
      const originalResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${original.gmail_message_id}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (originalResponse.ok) {
        const originalMessage = await originalResponse.json() as { payload?: { headers?: Array<{name:string;value:string}> } };
        const headers = originalMessage.payload?.headers || [];
        replyHeaders = {
          messageId: headers.find(item => item.name.toLowerCase() === "message-id")?.value,
          references: headers.find(item => item.name.toLowerCase() === "references")?.value,
        };
      }
    }
    const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: createGmailMessage(to, from, subject, body, replyHeaders), ...(threadId ? { threadId } : {}) }),
      cache: "no-store",
    });
    const sent = await gmailResponse.json() as { id?: string; threadId?: string; error?: { message?: string } };
    if (!gmailResponse.ok || !sent.id) {
      return NextResponse.json({ error: sent.error?.message || "Gmail could not send the message." }, { status: 502 });
    }

    const { data: activity } = await admin.from("activities").insert({
      organization_id: membership.organization_id,
      job_id: jobId,
      actor_id: user.id,
      kind: "email sent",
      body: `To: ${to}\nSubject: ${subject}\n\n${body}`,
    }).select("id,kind,body,occurred_at").single();

    return NextResponse.json({ ok: true, activity, messageId: sent.id, threadId: sent.threadId });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "The email could not be sent.",
    }, { status: 500 });
  }
}
