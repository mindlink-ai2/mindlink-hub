import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { auth, currentUser } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  try {
    // Sécurité : user connecté
    const { userId } = await auth();
        if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await currentUser();
    const userEmail =
      user?.emailAddresses?.[0]?.emailAddress ?? "email inconnu";

    const body = await req.json();
    const { subject, message, category, priority } = body;

    if (!subject || !message) {
      return NextResponse.json(
        { error: "Missing subject or message" },
        { status: 400 }
      );
    }

    // SMTP Infomaniak
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: false, // Infomaniak = false sur 587
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Mindlink Support" <${process.env.SMTP_USER}>`,
      to: "contact@mind-link.fr",
      replyTo: userEmail,
      subject: `🎫 Demande client Mindlink — ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5">
          <p><strong>De :</strong> ${userEmail}</p>
          <p><strong>Catégorie :</strong> ${category ?? "Support"}</p>
          <p><strong>Priorité :</strong> ${priority ?? "Normale"}</p>
          <hr />
          <p>${message.replace(/\n/g, "<br/>")}</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("SUPPORT MAIL ERROR", err);
    return NextResponse.json(
      { error: "Mail sending failed" },
      { status: 500 }
    );
  }
}