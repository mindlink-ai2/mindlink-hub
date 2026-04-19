import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceSupabase } from "@/lib/inbox-server";
import { autoExtractLeads } from "@/lib/auto-extract";
import {
  renewalLeadsEmail,
  completionLeadsEmail,
  reminderEmail,
  sendLidmeoEmail,
} from "@/lib/email-templates";

export const runtime = "nodejs";
export const maxDuration = 300;

const TEST_ORG_IDS = new Set<number>([16, 18]);
const BUSINESS_DAYS_AT_RENEWAL = 5;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function diffCalendarDays(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function countWeekdaysBetween(start: Date, end: Date): number {
  const s = startOfDay(start);
  const e = startOfDay(end);
  if (e < s) return 0;
  let count = 0;
  const cur = new Date(s);
  while (cur.getTime() <= e.getTime()) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function addBusinessDays(from: Date, businessDays: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < businessDays) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

type ClientRow = {
  id: number;
  email: string | null;
  company_name: string | null;
  quota: number | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  subscription_status: string | null;
};

async function resolvePeriod(
  stripe: Stripe | null,
  supabase: ReturnType<typeof createServiceSupabase>,
  client: ClientRow
): Promise<{ periodStart: Date; periodEnd: Date } | null> {
  if (stripe && client.stripe_subscription_id) {
    try {
      const sub = await stripe.subscriptions.retrieve(client.stripe_subscription_id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = (sub as any).items?.data?.[0];
      const startTs = item?.current_period_start ?? (sub as unknown as { current_period_start?: number }).current_period_start;
      const endTs = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
      if (typeof startTs === "number" && typeof endTs === "number") {
        return {
          periodStart: new Date(startTs * 1000),
          periodEnd: new Date(endTs * 1000),
        };
      }
    } catch (err) {
      console.warn("[cron] stripe sub fetch failed:", err);
    }
  }

  // Fallback: search_credits.created_at + 31d
  const { data: creditRow } = await supabase
    .from("search_credits")
    .select("created_at")
    .eq("org_id", client.id)
    .maybeSingle();
  if (creditRow?.created_at) {
    const anchor = new Date(creditRow.created_at);
    const now = new Date();
    const PERIOD_MS = 31 * 24 * 60 * 60 * 1000;
    const diff = now.getTime() - anchor.getTime();
    const periodNumber = Math.max(0, Math.floor(diff / PERIOD_MS));
    const periodStart = new Date(anchor.getTime() + periodNumber * PERIOD_MS);
    const periodEnd = new Date(periodStart.getTime() + PERIOD_MS);
    return { periodStart, periodEnd };
  }

  return null;
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createServiceSupabase();
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripe = stripeKey ? new Stripe(stripeKey) : null;

  const { data: clients, error: clientsErr } = await supabase
    .from("clients")
    .select("id, email, company_name, quota, stripe_customer_id, stripe_subscription_id, current_period_end, subscription_status");

  if (clientsErr || !clients) {
    return NextResponse.json({ error: "clients fetch failed" }, { status: 500 });
  }

  const now = new Date();
  const report: Array<Record<string, unknown>> = [];

  for (const raw of clients as ClientRow[]) {
    const client = raw;
    if (TEST_ORG_IDS.has(client.id)) {
      report.push({ orgId: client.id, action: "skip_test" });
      continue;
    }

    // Require an active or valid subscription status if present; otherwise treat as inactive.
    const status = (client.subscription_status ?? "").toLowerCase();
    const hasActiveSub =
      status === "active" ||
      status === "trialing" ||
      status === "" || // unknown → still attempt (may use fallback period)
      status === "past_due"; // still inside grace period
    if (!hasActiveSub) {
      report.push({ orgId: client.id, action: "skip_inactive", status });
      continue;
    }

    const period = await resolvePeriod(stripe, supabase, client);
    if (!period) {
      report.push({ orgId: client.id, action: "skip_no_period" });
      continue;
    }

    const { periodStart, periodEnd } = period;

    // ICP must exist with apollo_filters
    const { data: icpRow } = await supabase
      .from("icp_configs")
      .select("id, filters, status, updated_at")
      .eq("org_id", client.id)
      .in("status", ["draft", "submitted", "reviewed", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const filters = (icpRow?.filters ?? {}) as Record<string, unknown>;
    const apolloFilters = filters.apollo_filters ?? filters;
    const hasApolloFilters =
      apolloFilters && typeof apolloFilters === "object" && Object.keys(apolloFilters).length > 0;

    const quotaPerDay = Number(client.quota) || 0;
    const clientName = client.company_name;

    // ── Task 3: J-3 reminder ──
    const daysToEnd = diffCalendarDays(now, periodEnd);
    if (daysToEnd === 3 && client.email) {
      const tmpl = reminderEmail(clientName, 3);
      const sent = await sendLidmeoEmail({
        to: client.email,
        subject: tmpl.subject,
        html: tmpl.html,
      });
      report.push({ orgId: client.id, action: "reminder_d-3", sent: sent.sent, error: sent.error });
    }

    // Nothing more to do without filters / quota / email
    if (!hasApolloFilters || !quotaPerDay) {
      continue;
    }

    // ── Task 1: J+0 renewal auto-select ──
    if (isSameDay(now, periodStart)) {
      const quota = quotaPerDay * BUSINESS_DAYS_AT_RENEWAL;
      const result = await autoExtractLeads(supabase, client.id, quota, "auto_renewal");
      if (result.leadsCount > 0 && client.email) {
        const tmpl = renewalLeadsEmail(clientName, result.leadsCount);
        await sendLidmeoEmail({ to: client.email, subject: tmpl.subject, html: tmpl.html });
      }
      report.push({
        orgId: client.id,
        action: "auto_renewal",
        leads: result.leadsCount,
        error: result.error,
      });
      continue;
    }

    // ── Task 2: J+5 business days after renewal ──
    const j5 = addBusinessDays(periodStart, BUSINESS_DAYS_AT_RENEWAL);
    if (isSameDay(now, j5)) {
      // Has the client modified their targeting since period start?
      const icpUpdated = icpRow?.updated_at ? new Date(icpRow.updated_at) : null;
      const modifiedSincePeriodStart = icpUpdated && icpUpdated > periodStart;

      if (modifiedSincePeriodStart) {
        report.push({ orgId: client.id, action: "skip_icp_modified" });
        continue;
      }

      // How many leads already extracted since period start?
      const { data: logs } = await supabase
        .from("extraction_logs")
        .select("leads_count, created_at")
        .eq("org_id", client.id)
        .eq("status", "completed")
        .gte("created_at", periodStart.toISOString());

      const alreadyExtracted = (logs ?? []).reduce(
        (sum: number, row: { leads_count: number | null }) => sum + (row.leads_count ?? 0),
        0
      );

      const businessDaysRemaining = countWeekdaysBetween(now, periodEnd);
      const monthlyQuota = quotaPerDay * (BUSINESS_DAYS_AT_RENEWAL + businessDaysRemaining);
      const missing = monthlyQuota - alreadyExtracted;

      if (missing <= 0) {
        report.push({ orgId: client.id, action: "skip_quota_met", alreadyExtracted });
        continue;
      }

      const result = await autoExtractLeads(supabase, client.id, missing, "auto_completion");
      if (result.leadsCount > 0 && client.email) {
        const tmpl = completionLeadsEmail(clientName, result.leadsCount);
        await sendLidmeoEmail({ to: client.email, subject: tmpl.subject, html: tmpl.html });
      }
      report.push({
        orgId: client.id,
        action: "auto_completion",
        leads: result.leadsCount,
        missing,
        error: result.error,
      });
    }
  }

  return NextResponse.json({ ok: true, processed: report.length, report });
}
