// src/app/api/billing/resume/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: row, error: dbErr } = await supabaseAdmin
    .from("users")
    .select("stripe_subscription_id")
    .eq("id", user.id)
    .maybeSingle();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });
  if (!row?.stripe_subscription_id) {
    return NextResponse.json({ error: "No subscription found" }, { status: 400 });
  }

  const sub = await stripe.subscriptions.update(row.stripe_subscription_id, {
    cancel_at_period_end: false,
  });

  return NextResponse.json({ success: true, subscriptionId: sub.id });
}
