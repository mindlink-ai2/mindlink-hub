import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const idsRaw = body?.ids;

    if (!Array.isArray(idsRaw) || idsRaw.length === 0) {
      return NextResponse.json({ error: "Missing ids" }, { status: 400 });
    }

    const ids = Array.from(
      new Set(
        idsRaw
          .map((v: any) => Number(v))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      )
    );

    if (ids.length === 0) {
      return NextResponse.json({ error: "Invalid ids" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ✅ 1) Récupérer le client_id (BIGINT) à partir du Clerk userId (string)
    // ⚠️ adapte "clerk_user_id" si ta colonne s'appelle différemment
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id")
      .eq("clerk_user_id", userId)
      .single();

    if (clientErr || !client?.id) {
      console.error("CLIENT LOOKUP ERROR", clientErr);
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const clientId = client.id;

    // ✅ 2) Suppression sécurisée par client_id (BIGINT)
    const { error } = await supabase
      .from("map_leads")
      .delete()
      .in("id", ids)
      .eq("client_id", clientId);

    if (error) {
      console.error("BULK DELETE MAPS ERROR", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedIds: ids });
  } catch (err) {
    console.error("BULK DELETE MAPS API ERROR", err);
    return NextResponse.json(
      { error: "Unexpected server error" },
      { status: 500 }
    );
  }
}