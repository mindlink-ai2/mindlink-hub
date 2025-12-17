import { NextResponse } from "next/server";
import { Resend } from "resend";
import { auth, currentUser } from "@clerk/nextjs/server";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function POST(req: Request) {
  try {
    // 🔐 Sécurité : utilisateur connecté
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    const userEmail =
      user?.emailAddresses?.[0]?.emailAddress ?? "email inconnu";

    const { subject, message, category, priority } = await req.json();

    if (!subject || !message) {
      return NextResponse.json(
        { error: "Missing subject or message" },
        { status: 400 }
      );
    }

    await resend.emails.send({
      from: "Mindlink Support <onboarding@resend.dev>",
      to: "contact@mind-link.fr",
      replyTo: userEmail,
      subject: `🎫 Ticket Mindlink — ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6">
          <p><strong>De :</strong> ${userEmail}</p>
          <p><strong>Catégorie :</strong> ${category ?? "Support"}</p>
          <p><strong>Priorité :</strong> ${priority ?? "Normale"}</p>
          <hr />
          <p>${message.replace(/\n/g, "<br/>")}</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("SUPPORT SEND ERROR:", error);
    return NextResponse.json(
      { error: "Mail sending failed" },
      { status: 500 }
    );
  }
}