// src/app/api/billing/resume/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ ok: true, build: "resume-route-POST-v123" });
}

export async function GET() {
  return NextResponse.json({ ok: true, build: "resume-route-GET-v123" });
}
