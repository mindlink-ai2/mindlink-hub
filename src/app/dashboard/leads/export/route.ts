import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1️⃣ Trouver le client lié à ce compte
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("clerk_user_id", userId)
    .single();

  if (clientError || !client) {
    return NextResponse.json(
      { error: "Client not found" },
      { status: 400 }
    );
  }

  // 2️⃣ Récupérer les leads du client
  const { data: leadsData, error: leadsError } = await supabase
    .from("leads")
    .select("*")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  const leads = leadsData ?? []; // ✅ plus jamais null

  if (leadsError) {
    return NextResponse.json(
      { error: "Failed to fetch leads" },
      { status: 500 }
    );
  }

  // 3️⃣ Construire le CSV
  const columns: Array<{ header: string; key: string }> = [
    { header: "ID", key: "id" },
    { header: "Nom complet", key: "Name" },
    { header: "Prénom", key: "FirstName" },
    { header: "Nom", key: "LastName" },
    { header: "Entreprise", key: "Company" },
    { header: "Localisation", key: "location" },
    { header: "URL LinkedIn", key: "LinkedInURL" },
    { header: "Email", key: "email" },
    { header: "Téléphone", key: "phone" },
    { header: "Créé le", key: "created_at" },
    { header: "Traite", key: "traite" },
    { header: "Message envoyé", key: "message_sent" },
    { header: "Message envoyé le", key: "message_sent_at" },
    { header: "Prochaine relance", key: "next_followup_at" },
    { header: "Message LinkedIn", key: "internal_message" },
    { header: "Message email", key: "message_mail" },
  ];

  const header = columns.map((c) => c.header);

  const rows = leads.map((l: any) =>
    columns.map((c) => {
      const value = l?.[c.key];
      if (typeof value === "boolean") return value ? "Oui" : "Non";
      return value ?? "";
    })
  );

  const csvLines = [
    header.join(";"),
    ...rows.map((r) =>
      r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")
    ),
  ];

  const csv = csvLines.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leads-mindlink.csv"',
    },
  });
}
