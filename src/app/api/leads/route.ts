import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeLinkedInUrlForMatching } from "@/lib/linkedin-url";

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
  const { clientId, FirstName, LastName, Company, LinkedInURL, linkedin_url } = body;

  if (!clientId) {
    return NextResponse.json(
      { error: "clientId is required" },
      { status: 400 }
    );
  }

  const linkedInUrlValue = String(LinkedInURL ?? linkedin_url ?? "").trim() || null;
  const normalizedLinkedInUrl = normalizeLinkedInUrlForMatching(linkedInUrlValue);

  const basePayload: Record<string, unknown> = {
    client_id: clientId,
    FirstName,
    LastName,
    Company,
    LinkedInURL: linkedInUrlValue,
  };

  const withNormalizedPayload: Record<string, unknown> = {
    ...basePayload,
    ...(normalizedLinkedInUrl ? { linkedin_url_normalized: normalizedLinkedInUrl } : {}),
  };

  let { error } = await supabase.from("leads").insert(withNormalizedPayload);

  if (
    error &&
    String((error as { code?: string | null }).code ?? "") === "42703" &&
    String((error as { message?: string | null }).message ?? "")
      .toLowerCase()
      .includes("linkedin_url_normalized")
  ) {
    const fallback = await supabase.from("leads").insert(basePayload);
    error = fallback.error;
  }

  if (error) {
    console.error("Supabase insert error:", error);
    return NextResponse.json(
      { error: "Failed to insert lead" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
