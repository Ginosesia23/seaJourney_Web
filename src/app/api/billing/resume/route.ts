import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseServerClient } from "@/supabase/server"; // adjust to your path

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-01-27.acacia", // if this errors, remove apiVersion line
});

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    // Auth: who is resuming?
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // OPTIONAL: accept subscriptionId from client
    const body = await req.json().catch(() => ({}));
    const subscriptionIdFromClient = body?.subscriptionId as string | undefined;

    // Fetch subscription id from DB (recommended)
    const { data: dbUser, error: dbErr } = await supabase
      .from("users")
      .select("stripe_subscription_id")
      .eq("id", user.id)
      .maybeSingle();

    if (dbErr) {
      return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    const subscriptionId = subscriptionIdFromClient || dbUser?.stripe_subscription_id;

    if (!subscriptionId) {
      return NextResponse.json(
        { error: "No Stripe subscription found for this user." },
        { status: 400 },
      );
    }

    // Resume means: undo “cancel at period end”
    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });

    return NextResponse.json({
      ok: true,
      subscriptionId: updated.id,
      cancel_at_period_end: updated.cancel_at_period_end,
      status: updated.status,
    });
  } catch (err: any) {
    console.error("[RESUME] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

// Optional: if something is hitting GET accidentally, return a helpful message instead of 405
export async function GET() {
  return NextResponse.json(
    { error: "Use POST /api/billing/resume" },
    { status: 405 },
  );
}
