import Stripe from "stripe";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const body = await req.text();
  const sig = (await headers()).get("stripe-signature");

  if (!sig) return new Response("Missing stripe-signature", { status: 400 });

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      // ✅ 1) Lier Clerk user -> Stripe customer
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const clerkUserId = session.client_reference_id || null;
        const stripeCustomerId =
          typeof session.customer === "string" ? session.customer : null;

        if (clerkUserId && stripeCustomerId) {
          await supabase
            .from("clients")
            .update({ stripe_customer_id: stripeCustomerId })
            .eq("clerk_user_id", clerkUserId);
        }
        break;
      }

      // ✅ 2) Sync subscription
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // ⚠️ on cast en any pour éviter les soucis de typing Stripe “clover”
        const sub = event.data.object as any;

        const stripeCustomerId = String(sub.customer);
        const priceId = sub.items?.data?.[0]?.price?.id ?? null;

        const plan =
          priceId === process.env.STRIPE_PRICE_ESSENTIAL
            ? "essential"
            : priceId === process.env.STRIPE_PRICE_PREMIUM
            ? "premium"
            : "unknown";

        const periodEndIso = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;

        await supabase
          .from("clients")
          .update({
            stripe_subscription_id: sub.id,
            subscription_status: sub.status,
            plan,
            current_period_end: periodEndIso,
            cancel_at_period_end: sub.cancel_at_period_end ?? false,
          })
          .eq("stripe_customer_id", stripeCustomerId);

        break;
      }

      default:
        // on ignore le reste
        break;
    }

    return new Response("ok", { status: 200 });
  } catch (e: any) {
    return new Response(`Webhook handler failed: ${e.message}`, { status: 500 });
  }
}