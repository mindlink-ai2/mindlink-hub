import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  return NextResponse.json({ status: "ok", message: "Leads API is running" });
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-mindlink-secret");
  if (!secret || secret !== process.env.MINDLINK_N8N_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { clientId, FirstName, LastName, Company, LinkedInURL } = body;

  if (!clientId) {
    return NextResponse.json(
      { error: "clientId is required" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("leads").insert({
    client_id: clientId,
    FirstName,
    LastName,
    Company,
    LinkedInURL,
  });

  if (error) {
    console.error("Supabase insert error:", error);
    return NextResponse.json(
      { error: "Failed to insert lead" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
