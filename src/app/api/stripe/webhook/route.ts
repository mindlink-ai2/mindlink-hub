import Stripe from "stripe";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function priceToPlanAndQuota(priceId: string | null) {
  if (!priceId) return { plan: "unknown", quota: null as string | null };

  // Essential 10/20/30
  if (priceId === process.env.STRIPE_PRICE_ESSENTIAL_10) return { plan: "essential", quota: "10" };
  if (priceId === process.env.STRIPE_PRICE_ESSENTIAL_20) return { plan: "essential", quota: "20" };
  if (priceId === process.env.STRIPE_PRICE_ESSENTIAL_30) return { plan: "essential", quota: "30" };

  // Legacy (si tu en as encore)
  if (priceId === process.env.STRIPE_PRICE_PREMIUM) return { plan: "premium", quota: null };

  // Ancien essential unique (si tu l’avais avant)
  if (priceId === process.env.STRIPE_PRICE_ESSENTIAL) return { plan: "essential", quota: null };

  return { plan: "unknown", quota: null as string | null };
}

export async function POST(req: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return new Response("Missing STRIPE_SECRET_KEY", { status: 500 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return new Response("Missing STRIPE_WEBHOOK_SECRET", { status: 500 });
  }

  const stripe = new Stripe(stripeKey);

  const body = await req.text();
  const sig = (await headers()).get("stripe-signature");

  if (!sig) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    switch (event.type) {
      // 1) Checkout terminé : on sécurise stripe_customer_id (utile si pas encore set)
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const clerkUserId = session.client_reference_id ?? null;
        const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;

        if (clerkUserId && stripeCustomerId) {
          await supabase
            .from("clients")
            .update({ stripe_customer_id: stripeCustomerId })
            .eq("clerk_user_id", clerkUserId);
        }

        break;
      }

      // 2) Subscription events : on met à jour plan, quota, status, dates
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as any;

        const stripeCustomerId = sub?.customer ? String(sub.customer) : null;
        if (!stripeCustomerId) break;

        const priceId: string | null = sub.items?.data?.[0]?.price?.id ?? null;

        // 👉 Plan/quota depuis le priceId (source de vérité)
        const { plan, quota } = priceToPlanAndQuota(priceId);

        // Dates
        const periodEndIso = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;

        // Si deleted, Stripe envoie sub.status mais parfois “canceled” / “incomplete_expired”
        const subscriptionStatus = sub.status ?? null;

        await supabase
          .from("clients")
          .update({
            stripe_subscription_id: sub.id,
            subscription_status: subscriptionStatus,
            plan,
            quota, // ✅ nouveauté : on stocke 10/20/30 (text OK)
            current_period_end: periodEndIso,
            cancel_at_period_end: sub.cancel_at_period_end ?? false,
          })
          .eq("stripe_customer_id", stripeCustomerId);

        break;
      }

      default:
        // pas d'action
        break;
    }

    return new Response("ok", { status: 200 });
  } catch (e: any) {
    return new Response(`Webhook handler failed: ${e.message}`, { status: 500 });
  }
}