
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

    // 📦 Body
    const body = await req.json();
    const subject = (body?.subject ?? "").trim();
    const message = (body?.message ?? "").trim();
    const category = body?.category ?? "support";
    const priority = body?.priority ?? "normal";

    if (!subject || !message) {
      return NextResponse.json(
        { error: "Missing subject or message" },
        { status: 400 }
      );
    }

    // ✉️ Resend
    const resend = new Resend(process.env.RESEND_API_KEY!);

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6">
        <p><strong>Client :</strong> ${userEmail}</p>
        <p><strong>Catégorie :</strong> ${category}</p>
        <p><strong>Priorité :</strong> ${priority}</p>
        <hr />
        <p>${message.replace(/\n/g, "<br/>")}</p>
        <hr />
        <small>UserId: ${userId}</small>
      </div>
    `;

    const { error } = await resend.emails.send({
      from: "Mindlink Support <contact@mind-link.fr>", // ✅ ICI
      to: "contact@mind-link.fr",
      replyTo: userEmail,
      subject: `🎫 Ticket Mindlink — ${subject}`,
      html,
    });

    if (error) {
      console.error("RESEND ERROR", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("SUPPORT API ERROR", err);
    return NextResponse.json(
      { error: "Mail sending failed" },
      { status: 500 }
    );
  }
}