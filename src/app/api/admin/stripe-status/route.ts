import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/platform-auth";

export const runtime = "nodejs";

type StripeSubscription = {
  id: string;
  status: string;
  customer: string;
  items: {
    data: Array<{
      price: {
        id: string;
        unit_amount: number | null;
        currency: string;
        nickname: string | null;
        product: string;
      };
    }>;
  };
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  trial_end: number | null;
  latest_invoice: string | null;
};

type StripeCustomer = {
  id: string;
  email: string | null;
  name: string | null;
};

type StripeInvoice = {
  id: string;
  status: string | null;
  amount_paid: number;
  currency: string;
  created: number;
};

export async function GET() {
  const adminCtx = await getAdminContext();
  if (!adminCtx) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: "Clé Stripe non configurée" }, { status: 500 });
  }

  const stripeBase = "https://api.stripe.com/v1";
  const headers = {
    Authorization: `Bearer ${stripeKey}`,
  };

  try {
    // Récupérer tous les abonnements actifs/trialing/past_due
    const subsRes = await fetch(
      `${stripeBase}/subscriptions?limit=100&expand[]=data.customer&expand[]=data.latest_invoice`,
      { headers }
    );

    if (!subsRes.ok) {
      const err = await subsRes.text().catch(() => "");
      console.error("[admin/stripe-status] Stripe error", subsRes.status, err);
      return NextResponse.json({ error: "Erreur Stripe" }, { status: 502 });
    }

    const subsData = await subsRes.json();
    const subscriptions: StripeSubscription[] = subsData.data ?? [];

    const result = subscriptions.map((sub) => {
      const customer = sub.customer as unknown as StripeCustomer | string;
      const customerObj =
        typeof customer === "object" && customer !== null ? (customer as StripeCustomer) : null;

      const price = sub.items.data?.[0]?.price;
      const invoice = sub.latest_invoice as unknown as StripeInvoice | null;

      return {
        subscription_id: sub.id,
        customer_id: customerObj?.id ?? (typeof customer === "string" ? customer : null),
        customer_email: customerObj?.email ?? null,
        customer_name: customerObj?.name ?? null,
        status: sub.status,
        plan_name: price?.nickname ?? null,
        price_id: price?.id ?? null,
        amount: price?.unit_amount ?? null,
        currency: price?.currency ?? null,
        period_start: sub.current_period_start
          ? new Date(sub.current_period_start * 1000).toISOString()
          : null,
        period_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
        cancel_at_period_end: sub.cancel_at_period_end,
        trial_end: sub.trial_end
          ? new Date(sub.trial_end * 1000).toISOString()
          : null,
        latest_invoice: invoice
          ? {
              id: invoice.id,
              status: invoice.status,
              amount_paid: invoice.amount_paid,
              currency: invoice.currency,
              date: invoice.created
                ? new Date(invoice.created * 1000).toISOString()
                : null,
            }
          : null,
      };
    });

    return NextResponse.json({ subscriptions: result, count: result.length });
  } catch (err) {
    console.error("[admin/stripe-status] fetch error", err);
    return NextResponse.json({ error: "Impossible de contacter Stripe" }, { status: 502 });
  }
}
