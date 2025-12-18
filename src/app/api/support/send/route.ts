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
    const userEmail = user?.emailAddresses?.[0]?.emailAddress ?? "email inconnu";

    // ✅ Body
    const body = await req.json();
    const subject = (body?.subject ?? "").toString().trim();
    const message = (body?.message ?? "").toString().trim();
    const category = (body?.category ?? "support").toString();
    const priority = (body?.priority ?? "normal").toString();

    if (!subject || !message) {
      return NextResponse.json(
        { error: "Missing subject or message" },
        { status: 400 }
      );
    }

    // ✅ Resend
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing RESEND_API_KEY" },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);

    // IMPORTANT :
    // - Tant que le domaine n'est pas vérifié, utilise onboarding@resend.dev
    // - Dès que le DNS est validé, mets SUPPORT_FROM_EMAIL=Mindlink Support <contact@mind-link.fr> dans Vercel
    const from =
      process.env.SUPPORT_FROM_EMAIL ?? "Mindlink Support <onboarding@resend.dev>";
    const to = process.env.SUPPORT_TO_EMAIL ?? "contact@mind-link.fr";

    const htmlMessage = message.replace(/\n/g, "<br/>");

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6">
        <p><strong>Client :</strong> ${userEmail}</p>
        <p><strong>Catégorie :</strong> ${category}</p>
        <p><strong>Priorité :</strong> ${priority}</p>
        <hr />
        <p>${htmlMessage}</p>
        <hr />
        <small>UserId: ${userId}</small>
      </div>
    `;

    const text = `Client: ${userEmail}
Catégorie: ${category}
Priorité: ${priority}

${message}

UserId: ${userId}`;

    const { data, error } = await resend.emails.send({
      from,
      to,
      replyTo: userEmail,
      subject: `🎫 Ticket Mindlink — ${subject}`,
      html,
      text,
    });

    if (error) {
      console.error("RESEND ERROR", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data?.id ?? null });
  } catch (err) {
    console.error("SUPPORT API ERROR", err);
    return NextResponse.json({ error: "Mail sending failed" }, { status: 500 });
  }
}