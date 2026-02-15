import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { buildLeadsCsv } from "../csv";

function parseSelectedIds(ids: unknown): number[] {
  if (!Array.isArray(ids)) return [];

  const unique = new Set<number>();

  ids.forEach((value) => {
    const n = Number(value);
    if (Number.isFinite(n)) unique.add(n);
  });

  return Array.from(unique);
}

export async function POST(req: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ids = parseSelectedIds(body?.ids);

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Aucun identifiant sélectionné." },
      { status: 400 }
    );
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

  // 2️⃣ Récupérer uniquement les leads sélectionnés du client
  const { data: leadsData, error: leadsError } = await supabase
    .from("leads")
    .select("*")
    .eq("client_id", client.id)
    .in("id", ids)
    .order("created_at", { ascending: false });

  if (leadsError) {
    return NextResponse.json(
      { error: "Failed to fetch selected leads" },
      { status: 500 }
    );
  }

  const leads = leadsData ?? [];
  const csv = buildLeadsCsv(leads);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leads-selection-mindlink.csv"',
    },
  });
}
