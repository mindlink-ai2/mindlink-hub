import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { resolveClientContextForUser } from "@/lib/client-onboarding-state";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    const email =
      user?.primaryEmailAddress?.emailAddress ||
      user?.emailAddresses?.[0]?.emailAddress ||
      null;

    const supabase = createServiceSupabase();
    const clientContext = await resolveClientContextForUser(supabase, userId, email);
    if (!clientContext) {
      return NextResponse.json({ messages: null });
    }

    const { data, error } = await supabase
      .from("client_messages")
      .select(
        "id, message_linkedin, relance_linkedin, message_email, status, updated_at"
      )
      .eq("org_id", clientContext.clientId)
      .maybeSingle();

    if (error) {
      console.error("[messages/get] fetch error:", error);
      return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
    }

    return NextResponse.json({ messages: data ?? null });
  } catch (err) {
    console.error("[messages/get] error:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
