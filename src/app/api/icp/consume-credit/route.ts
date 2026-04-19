import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createServiceSupabase } from "@/lib/inbox-server";
import { resolveClientContextForUser } from "@/lib/client-onboarding-state";
import { logClientActivity } from "@/lib/client-activity";

export const runtime = "nodejs";

function getPrimaryEmail(user: Awaited<ReturnType<typeof currentUser>>): string | null {
  return (
    user?.emailAddresses?.find((entry) => entry.id === user.primaryEmailAddressId)
      ?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null
  );
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createServiceSupabase();
  const user = await currentUser();
  const email = getPrimaryEmail(user);
  const ctx = await resolveClientContextForUser(supabase, userId, email);
  if (!ctx) {
    return NextResponse.json({ error: "Client introuvable" }, { status: 404 });
  }

  const { data: credits } = await supabase
    .from("search_credits")
    .select("id, credits_total, credits_used")
    .eq("org_id", ctx.clientId)
    .maybeSingle();

  if (!credits) {
    return NextResponse.json({ error: "Crédits non initialisés" }, { status: 404 });
  }

  const remaining = credits.credits_total - credits.credits_used;
  if (remaining <= 0) {
    return NextResponse.json(
      { error: "Plus de crédits de recherche disponibles." },
      { status: 402 }
    );
  }

  const { error: updErr } = await supabase
    .from("search_credits")
    .update({
      credits_used: credits.credits_used + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", credits.id);

  if (updErr) {
    return NextResponse.json({ error: "Impossible de débiter le crédit." }, { status: 500 });
  }

  await logClientActivity(supabase, ctx.clientId, "credits_consumed", {
    credits_used_now: credits.credits_used + 1,
    credits_total: credits.credits_total,
  });

  return NextResponse.json({
    success: true,
    credits_total: credits.credits_total,
    credits_used: credits.credits_used + 1,
    credits_remaining: remaining - 1,
  });
}
