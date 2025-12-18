import { NextResponse } from "next/server";
import { Resend } from "resend";
import { auth, currentUser } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  try {
    // ✅ Clerk (IMPORTANT: pas de await sur auth())
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    const userEmail = user?.emailAddresses?.[0]?.emailAddress ?? "email inconnu";

    const body = await req.json();
    const subject = String(body?.subject ?? "").trim();
    const message = String(body?.message ?? "").trim();
    const category = String(body?.category ?? "support");
    const priority = String(body?.priority ?? "normal");

    if (!subject || !message) {
      return NextResponse.json({ error: "Missing subject or message" }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing RESEND_API_KEY in Vercel env" }, { status: 500 });
    }

    const resend = new Resend(apiKey);

    // ✅ Tu peux mettre TON from direct maintenant que le domaine est vérifié
    const from = "Mindlink Support <contact@mind-link.fr>";
    const to = "contact@mind-link.fr";

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

    const result = await resend.emails.send({
      from,
      to,
      replyTo: userEmail,
      subject: `🎫 Ticket Mindlink — ${subject}`,
      html,
    });

    // ✅ Resend renvoie parfois { error } même sans throw
    if ((result as any)?.error) {
      return NextResponse.json(
        { error: (result as any).error?.message ?? "Resend error", details: (result as any).error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, id: (result as any)?.data?.id ?? null });
  } catch (err: any) {
    // ✅ On renvoie la vraie erreur au front
    console.error("SUPPORT API ERROR", err);
    return NextResponse.json(
      { error: err?.message ?? "Mail sending failed", details: String(err) },
      { status: 500 }
    );
  }
}