import { NextResponse } from "next/server";
import {
  createSupportSupabase,
  getAuthenticatedSupportUser,
  getOrCreateSupportConversation,
} from "@/lib/support-widget-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supportUser = await getAuthenticatedSupportUser();
    if (!supportUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = createSupportSupabase();
    const conversation = await getOrCreateSupportConversation(supabase, supportUser);

    return NextResponse.json({
      conversation,
      user: {
        firstName: supportUser.firstName,
        email: supportUser.email,
      },
    });
  } catch (error) {
    console.error("SUPPORT_CONVERSATION_GET_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
