import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const runtime = "nodejs";

const PRICE_BY_PLAN: Record<string, string | undefined> = {
  premium: process.env.STRIPE_PRICE_PREMIUM,
  essential: process.env.STRIPE_PRICE_ESSENTIAL,
};

export async function POST(req: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
  const stripe = new Stripe(stripeKey);

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { plan } = await req.json();
  const priceId = PRICE_BY_PLAN[plan];
  if (!priceId) return NextResponse.json({ error: "Invalid plan/price" }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: client } = await supabase
    .from("clients")
    .select("id, stripe_customer_id, email")
    .eq("clerk_user_id", userId)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  let stripeCustomerId = client.stripe_customer_id as string | null;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: client.email ?? undefined,
      metadata: { client_id: client.id, clerk_user_id: userId },
    });
    stripeCustomerId = customer.id;

    await supabase
      .from("clients")
      .update({ stripe_customer_id: stripeCustomerId })
      .eq("id", client.id);
  }

  const origin = req.headers.get("origin") ?? "https://mind-link.fr";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/dashboard/hub/billing?success=1`,
    cancel_url: `${origin}/dashboard/hub/billing?canceled=1`,
    client_reference_id: userId,
  });

  return NextResponse.json({ url: session.url });
}