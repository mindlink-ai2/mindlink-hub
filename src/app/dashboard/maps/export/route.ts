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

  // 2️⃣ Récupérer les leads Google Maps
  const { data: mapsData, error: mapsError } = await supabase
    .from("maps_leads")
    .select("*")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  const leads = mapsData ?? [];

  if (mapsError) {
    return NextResponse.json(
      { error: "Failed to fetch Google Maps leads" },
      { status: 500 }
    );
  }

  // 3️⃣ Construire le CSV
  const header = [
    "Title",
    "Address",
    "PhoneNumber",
    "Website",
    "GoogleMapsURL",
    "CreatedAt",
    "Traite"
  ];

  const rows = leads.map((l: any) => [
    l.title ?? "",
    l.address ?? "",
    l.phoneNumber ?? "",
    l.website ?? "",
    l.placeUrl ?? "",
    l.created_at ?? "",
    l.traite === true ? "Oui" : "Non"
  ]);

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
      "Content-Disposition": 'attachment; filename="maps-leads-mindlink.csv"',
    },
  });
}
