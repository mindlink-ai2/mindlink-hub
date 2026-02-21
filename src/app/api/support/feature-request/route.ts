import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupportSupabase, getAuthenticatedSupportUser } from "@/lib/support-widget-server";
import { notifySupportTeamFeatureRequest } from "@/lib/support-email";

export const runtime = "nodejs";

const bodySchema = z.object({
  body: z.string().trim().min(6).max(4000),
});

type FeatureRequestRow = {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  body: string;
  status: "new" | "reviewed";
  created_at: string;
  updated_at: string;
};

export async function POST(request: Request) {
  try {
    const supportUser = await getAuthenticatedSupportUser();
    if (!supportUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const payload = await request.json().catch(() => ({}));
    const parsedBody = bodySchema.safeParse(payload);
    if (!parsedBody.success) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const supabase = createSupportSupabase();
    const { body } = parsedBody.data;

    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("support_feature_requests")
      .insert({
        user_id: supportUser.userId,
        user_email: supportUser.email,
        user_name: supportUser.displayName,
        body,
        status: "new",
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("id, user_id, user_email, user_name, body, status, created_at, updated_at")
      .single();

    if (error || !data) {
      console.error("SUPPORT_FEATURE_REQUEST_INSERT_ERROR:", error);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    const createdRequest = data as FeatureRequestRow;

    try {
      await notifySupportTeamFeatureRequest({
        request: {
          id: createdRequest.id,
          user_name: createdRequest.user_name,
          user_email: createdRequest.user_email,
          body: createdRequest.body,
          created_at: createdRequest.created_at,
        },
      });
    } catch (notifyError) {
      console.error("SUPPORT_FEATURE_REQUEST_NOTIFY_ERROR:", notifyError);
    }

    return NextResponse.json({
      success: true,
      request: createdRequest,
    });
  } catch (error) {
    console.error("SUPPORT_FEATURE_REQUEST_POST_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
