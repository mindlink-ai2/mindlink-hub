import { NextResponse } from "next/server";
import { Resend } from "resend";
import { auth, currentUser } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  try {
    // 🔐 Sécurité Clerk
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    const userEmail =
      user?.emailAddresses?.[0]?.emailAddress ?? "email inconnu";

    const body = await req.json();
    const { subject, message, category, priority } = body ?? {};

    if (!subject || !message) {
      return NextResponse.json(
        { error: "Missing subject or message" },
        { status: 400 }
      );
    }

    // ✅ INIT RESEND AVEC ENV
    const resend = new Resend(process.env.RESEND_API_KEY);

    const { error } = await resend.emails.send({
      from:
        process.env.SUPPORT_FROM_EMAIL ??
        "Mindlink Support <onboarding@resend.dev>",
      to: process.env.SUPPORT_TO_EMAIL ?? "contact@mind-link.fr",
      replyTo: userEmail,
      subject: `🎫 Ticket Mindlink — ${subject}`,
      html: `
        <div style="font-family: Arial; line-height: 1.6">
          <p><strong>Client :</strong> ${userEmail}</p>
          <p><strong>Catégorie :</strong> ${category}</p>
          <p><strong>Priorité :</strong> ${priority}</p>
          <hr />
          <p>${message.replace(/\n/g, "<br/>")}</p>
          <hr />
          <small>UserId: ${userId}</small>
        </div>
      `,
    });

    if (error) {
      console.error("RESEND ERROR", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("SUPPORT API ERROR", err);
    return NextResponse.json(
      { error: "Mail sending failed" },
      { status: 500 }
    );
  }
}