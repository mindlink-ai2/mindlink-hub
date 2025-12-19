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

    const { error } = await supabase
      .from("leads")
      .delete()
      .in("id", ids)
      .eq("client_id", userId); // ✅ sécurité : adapte si ta colonne est différente

    if (error) {
      console.error("BULK DELETE LEADS ERROR", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deletedIds: ids });
  } catch (err) {
    console.error("BULK DELETE LEADS API ERROR", err);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}