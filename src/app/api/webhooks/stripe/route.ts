import Stripe from "stripe";
import { headers } from "next/headers";
import { createServiceSupabase } from "@/lib/inbox-server";
import { autoExtractLeads } from "@/lib/auto-extract";
import {
  adminClientSheetExportEmail,
  renewalLeadsEmail,
  sendLidmeoEmail,
} from "@/lib/email-templates";
import { logClientActivity } from "@/lib/client-activity";

const ADMIN_NOTIFY_EMAIL = "contact@lidmeo.com";

export const runtime = "nodejs";
export const maxDuration = 300;

const TEST_ORG_IDS = new Set<number>([16, 18]);
const BUSINESS_DAYS_AT_RENEWAL = 5;

export async function POST(req: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return new Response("Missing STRIPE_SECRET_KEY", { status: 500 });

  const webhookSecret = process.env.STRIPE_LEADS_WEBHOOK_SECRET;
  if (!webhookSecret) return new Response("Missing STRIPE_LEADS_WEBHOOK_SECRET", { status: 500 });

  const stripe = new Stripe(stripeKey);
  const body = await req.text();
  const sig = (await headers()).get("stripe-signature");
  if (!sig) return new Response("Missing stripe-signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`Webhook Error: ${message}`, { status: 400 });
  }

  if (event.type !== "invoice.payment_succeeded") {
    return new Response("ok", { status: 200 });
  }

  const invoice = event.data.object as Stripe.Invoice;

  // subscription_cycle = renouvellement mensuel ; subscription_create = premier paiement
  if (invoice.billing_reason !== "subscription_cycle") {
    return new Response("ok", { status: 200 });
  }

  const stripeCustomerId =
    typeof invoice.customer === "string" ? invoice.customer : null;
  if (!stripeCustomerId) return new Response("ok", { status: 200 });

  const supabase = createServiceSupabase();

  const { data: client } = await supabase
    .from("clients")
    .select("id, email, company_name, quota, stripe_subscription_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();

  if (!client) return new Response("ok", { status: 200 });
  if (TEST_ORG_IDS.has(client.id)) return new Response("ok", { status: 200 });

  // Résoudre la période depuis la ligne d'abonnement de la facture
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subLine = invoice.lines?.data?.find((l: any) => l.type === "subscription");
  const periodStart = subLine?.period?.start
    ? new Date(subLine.period.start * 1000)
    : null;
  const periodEnd = subLine?.period?.end
    ? new Date(subLine.period.end * 1000)
    : null;

  if (!periodStart || !periodEnd) {
    console.warn("[webhook/leads] Cannot resolve period from invoice", invoice.id);
    return new Response("ok", { status: 200 });
  }

  // ICP actif requis
  const { data: icpRow } = await supabase
    .from("icp_configs")
    .select("id, filters")
    .eq("org_id", client.id)
    .in("status", ["draft", "submitted", "reviewed", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const filters = (icpRow?.filters ?? {}) as Record<string, unknown>;
  const apolloFilters = filters.apollo_filters ?? filters;
  const hasApolloFilters =
    apolloFilters &&
    typeof apolloFilters === "object" &&
    Object.keys(apolloFilters).length > 0;

  const quotaPerDay = Number(client.quota) || 0;

  if (!hasApolloFilters || !quotaPerDay) {
    console.log(
      "[webhook/leads] Skipping org",
      client.id,
      !hasApolloFilters ? "no_icp_filters" : "no_quota"
    );
    return new Response("ok", { status: 200 });
  }

  // Anti-doublon : J+0 déjà déclenché pour cette période ?
  const { data: existingRenewal } = await supabase
    .from("extraction_logs")
    .select("id")
    .eq("org_id", client.id)
    .eq("source", "auto_renewal")
    .gte("created_at", periodStart.toISOString())
    .limit(1);

  if (existingRenewal && existingRenewal.length > 0) {
    console.log("[webhook/leads] J+0 already triggered for org", client.id, "— skipping");
    return new Response("ok", { status: 200 });
  }

  // Leads déjà extraits depuis le début de la période (toutes sources)
  const { data: periodLogs } = await supabase
    .from("extraction_logs")
    .select("leads_count")
    .eq("org_id", client.id)
    .eq("status", "completed")
    .gte("created_at", periodStart.toISOString());

  const alreadyExtracted = (periodLogs ?? []).reduce(
    (sum: number, row: { leads_count: number | null }) =>
      sum + (row.leads_count ?? 0),
    0
  );

  const targetQuota = quotaPerDay * BUSINESS_DAYS_AT_RENEWAL;
  const missing = targetQuota - alreadyExtracted;

  if (missing <= 0) {
    console.log("[webhook/leads] Quota already met for org", client.id);
    return new Response("ok", { status: 200 });
  }

  const result = await autoExtractLeads(supabase, client.id, missing, "auto_renewal");

  if (result.leadsCount > 0 && client.email) {
    const tmpl = renewalLeadsEmail(client.company_name, result.leadsCount);
    await sendLidmeoEmail({
      to: client.email,
      subject: tmpl.subject,
      html: tmpl.html,
    });
  }

  await logClientActivity(supabase, client.id, "leads_extracted", {
    source: "auto_renewal",
    leads_count: result.leadsCount,
    invoice_id: invoice.id,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    error: result.error ?? null,
  });

  if (result.leadsCount > 0) {
    try {
      const { subject, html } = adminClientSheetExportEmail({
        clientName: client.company_name,
        clientEmail: client.email,
        orgId: client.id,
        leadsCount: result.leadsCount,
        source: "auto_renewal",
      });
      await sendLidmeoEmail({ to: ADMIN_NOTIFY_EMAIL, subject, html });
    } catch (emailErr) {
      console.error(
        "[webhook/leads] admin sheet-export email failed:",
        emailErr
      );
    }
  }

  console.log(
    "[webhook/leads] J+0 done for org",
    client.id,
    "leads:",
    result.leadsCount,
    result.error ? `error: ${result.error}` : ""
  );

  return new Response("ok", { status: 200 });
}
