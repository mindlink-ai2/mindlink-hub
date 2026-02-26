import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const runtime = "nodejs";

function normalizePlan(p?: unknown) {
  const value = typeof p === "string" ? p.toLowerCase().trim() : "";
  if (value === "essential") return "essential";
  if (value === "full" || value === "automated" || value === "premium") return "full";
  return null;
}

function normalizeQuota(q?: unknown): number | null {
  if (q === null || q === undefined) return null;
  const n = Number(String(q).trim());
  return Number.isFinite(n) ? n : null;
}

// ✅ Price IDs Stripe (Essential 10/20/30 fournis)
const PRICE_ESSENTIAL_BY_QUOTA: Record<number, string> = {
  10: "price_1SvQu71rJNZjWmG5D9MtzZn4",
  20: "price_1SvQuX1rJNZjWmG54cjd0AFb",
  30: "price_1SvQut1rJNZjWmG5NJEMlvyZ",
};

const STRIPE_PRICE_FULL =
  process.env.STRIPE_PRICE_FULL ??
  process.env.STRIPE_PRICE_AUTOMATED ??
  process.env.STRIPE_PRICE_PREMIUM;

export async function POST(req: Request) {
  // 1️⃣ Stripe
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
  }
  const stripe = new Stripe(stripeKey);

  // 2️⃣ Auth Clerk
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3️⃣ Body
  const body = await req.json().catch(() => ({}));
  const rawPlan = body?.plan;
  const plan = normalizePlan(rawPlan);
  const requestedQuota = normalizeQuota(body?.quota);

  if (!plan) {
    return NextResponse.json({ error: "Missing plan" }, { status: 400 });
  }

  // 4️⃣ Déterminer priceId + quota final
  let priceId: string | undefined;
  let finalQuota: number | null = null;

  if (plan === "essential") {
    const q = requestedQuota ?? 10; // défaut 10 pour compat
    if (![10, 20, 30].includes(q)) {
      return NextResponse.json({ error: `Invalid quota for essential: ${body?.quota}` }, { status: 400 });
    }
    priceId = PRICE_ESSENTIAL_BY_QUOTA[q];
    finalQuota = q;
  } else if (plan === "full") {
    if (!STRIPE_PRICE_FULL) {
      return NextResponse.json(
        { error: "Missing STRIPE_PRICE_FULL env" },
        { status: 500 }
      );
    }
    priceId = STRIPE_PRICE_FULL;
    finalQuota = 15;
  } else {
    return NextResponse.json({ error: `Invalid plan: ${rawPlan}` }, { status: 400 });
  }

  // 5️⃣ Supabase
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: client, error } = await supabase
    .from("clients")
    .select("id, stripe_customer_id, email")
    .eq("clerk_user_id", userId)
    .single();

  if (error || !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // 6️⃣ Customer Stripe (création si absent)
  let stripeCustomerId: string | null = client.stripe_customer_id;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: client.email ?? undefined,
      metadata: {
        client_id: String(client.id),
        clerk_user_id: userId,
      },
    });

    stripeCustomerId = customer.id;

    await supabase
      .from("clients")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", client.id);
  }

  // 7️⃣ Checkout Stripe
  const origin = req.headers.get("origin") ?? "https://mind-link.fr";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],

    // ✅ on stocke plan/quota dans la subscription metadata (utile pour le webhook)
    subscription_data: {
      metadata: {
        client_id: String(client.id),
        clerk_user_id: userId,
        plan,
        quota: finalQuota !== null ? String(finalQuota) : "",
      },
    },

    success_url: `${origin}/dashboard/hub/billing?success=1`,
    cancel_url: `${origin}/dashboard/hub/billing?canceled=1`,
    client_reference_id: userId,
  });

  return NextResponse.json({ url: session.url });
}
