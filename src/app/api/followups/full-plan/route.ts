import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

// Colonnes retournées pour chaque lead
const LEAD_SELECT =
  "id, FirstName, LastName, Company, LinkedInURL, next_followup_at, relance_sent_at, relance_linkedin, responded, message_sent, message_sent_at, custom_followup_delay_days";

type LeadRow = {
  id: number | string;
  FirstName?: string | null;
  LastName?: string | null;
  Company?: string | null;
  LinkedInURL?: string | null;
  next_followup_at?: string | null;
  relance_sent_at?: string | null;
  relance_linkedin?: string | null;
  responded?: boolean | null;
  message_sent?: boolean | null;
  message_sent_at?: string | null;
  custom_followup_delay_days?: number | null;
};

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Résoudre le client + vérifier plan='full'
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id, plan, subscription_status")
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (clientErr || !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const plan = String(client.plan ?? "").trim().toLowerCase();
  const subscriptionStatus = String(client.subscription_status ?? "").trim().toLowerCase();
  if (plan !== "full" || subscriptionStatus !== "active") {
    return NextResponse.json({ error: "Forbidden: full plan only" }, { status: 403 });
  }

  const clientId: number = client.id as number;

  // Date du jour en timezone Paris (YYYY-MM-DD)
  const todayStr = new Date()
    .toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }); // "YYYY-MM-DD"
  const todayStart = `${todayStr}T00:00:00.000Z`;
  const todayEnd = `${todayStr}T23:59:59.999Z`;

  // 2. Leads "À venir" : next_followup_at > aujourd'hui, relance pas encore envoyée
  const { data: upcomingRows, error: upcomingErr } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("client_id", clientId)
    .eq("message_sent", true)
    .is("relance_sent_at", null)
    .neq("responded", true)
    .gt("next_followup_at", todayEnd)
    .order("next_followup_at", { ascending: true });

  // 3. Leads "Aujourd'hui" : next_followup_at = aujourd'hui, relance pas encore envoyée
  const { data: todayRows, error: todayErr } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("client_id", clientId)
    .eq("message_sent", true)
    .is("relance_sent_at", null)
    .neq("responded", true)
    .gte("next_followup_at", todayStart)
    .lte("next_followup_at", todayEnd)
    .order("next_followup_at", { ascending: true });

  // 4. Leads "Relance envoyée" : relance_sent_at renseigné, pas encore répondu
  const { data: relanceSentRows, error: relanceSentErr } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("client_id", clientId)
    .not("relance_sent_at", "is", null)
    .neq("responded", true)
    .order("relance_sent_at", { ascending: false });

  // 5. Leads "Répondu" : responded=true
  const { data: respondedRows, error: respondedErr } = await supabase
    .from("leads")
    .select(LEAD_SELECT)
    .eq("client_id", clientId)
    .eq("responded", true)
    .order("relance_sent_at", { ascending: false });

  const errors = [upcomingErr, todayErr, relanceSentErr, respondedErr].filter(Boolean);
  if (errors.length > 0) {
    console.error("FOLLOWUPS_FULL_PLAN_QUERY_ERROR:", errors);
    return NextResponse.json({ error: "Query error" }, { status: 500 });
  }

  return NextResponse.json({
    upcoming: (upcomingRows ?? []) as LeadRow[],
    today: (todayRows ?? []) as LeadRow[],
    relance_sent: (relanceSentRows ?? []) as LeadRow[],
    responded: (respondedRows ?? []) as LeadRow[],
    client_id: clientId,
  });
}
