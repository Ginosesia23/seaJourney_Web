// src/app/api/billing/resume/route.ts
import { NextResponse } from "next/server";
import { resumeMySubscription } from "@/app/actions";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "https://www.seajourney.co.uk",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, authorization",
    },
  });
}

export async function POST() {
  try {
    const subscription = await resumeMySubscription();
    return NextResponse.json({ success: true, subscriptionId: subscription.id });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to resume subscription" },
      { status: err?.status || 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}