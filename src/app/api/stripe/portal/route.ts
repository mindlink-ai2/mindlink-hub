import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
  const stripe = new Stripe(stripeKey);

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: client } = await supabase
    .from("clients")
    .select("stripe_customer_id")
    .eq("clerk_user_id", userId)
    .single();

  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (!client.stripe_customer_id) return NextResponse.json({ error: "No Stripe customer yet" }, { status: 400 });

  const origin = req.headers.get("origin") ?? "https://mind-link.fr";

  const session = await stripe.billingPortal.sessions.create({
    customer: client.stripe_customer_id,
    return_url: `${origin}/dashboard/hub/billing`,
  });

  return NextResponse.json({ url: session.url });
}