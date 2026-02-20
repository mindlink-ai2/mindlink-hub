import { NextResponse } from "next/server";
import {
  createSupportConversation,
  createSupportSupabase,
  getAuthenticatedSupportUser,
  listSupportConversations,
  refreshSupportConversationProfile,
} from "@/lib/support-widget-server";
import { notifySupportTeamTicketCreated } from "@/lib/support-email";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supportUser = await getAuthenticatedSupportUser();
    if (!supportUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = createSupportSupabase();
    await refreshSupportConversationProfile(supabase, supportUser);
    const conversations = await listSupportConversations(supabase, supportUser.userId);
    const unreadTotal = conversations.reduce(
      (accumulator, conversation) => accumulator + Number(conversation.unread_count ?? 0),
      0
    );

    return NextResponse.json({
      conversations,
      unreadTotal,
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

export async function POST() {
  try {
    const supportUser = await getAuthenticatedSupportUser();
    if (!supportUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const supabase = createSupportSupabase();
    const conversation = await createSupportConversation(supabase, supportUser);

    try {
      await notifySupportTeamTicketCreated({ conversation });
    } catch (notifyError) {
      console.error("SUPPORT_CONVERSATION_NEW_TICKET_NOTIFY_ERROR:", notifyError);
    }

    return NextResponse.json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error("SUPPORT_CONVERSATION_POST_ERROR:", error);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
