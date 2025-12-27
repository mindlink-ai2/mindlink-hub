import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const runtime = "nodejs";

// Mapping des plans → Price IDs Stripe
const PRICE_BY_PLAN: Record<string, string | undefined> = {
  premium: process.env.STRIPE_PRICE_PREMIUM,
  essential: process.env.STRIPE_PRICE_ESSENTIAL,
};

export async function POST(req: Request) {
  // 1️⃣ Stripe
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      { error: "Missing STRIPE_SECRET_KEY" },
      { status: 500 }
    );
  }
  const stripe = new Stripe(stripeKey);

  // 2️⃣ Auth Clerk
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // 3️⃣ Plan demandé (normalisation)
  const body = await req.json();
  const rawPlan = body?.plan;
  const plan = typeof rawPlan === "string" ? rawPlan.toLowerCase() : null;

  if (!plan) {
    return NextResponse.json(
      { error: "Missing plan" },
      { status: 400 }
    );
  }

  const priceId = PRICE_BY_PLAN[plan];
  if (!priceId) {
    return NextResponse.json(
      { error: `Invalid plan: ${rawPlan}` },
      { status: 400 }
    );
  }

  // 4️⃣ Supabase
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
    return NextResponse.json(
      { error: "Client not found" },
      { status: 404 }
    );
  }

  // 5️⃣ Customer Stripe (création si absent)
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

  // 6️⃣ Checkout Stripe
  const origin =
    req.headers.get("origin") ?? "https://mind-link.fr";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${origin}/dashboard/hub/billing?success=1`,
    cancel_url: `${origin}/dashboard/hub/billing?canceled=1`,
    client_reference_id: userId,
  });

  // 7️⃣ Réponse
  return NextResponse.json({ url: session.url });
}