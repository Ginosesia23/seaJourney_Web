import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  return NextResponse.json({
    userId: user?.id ?? null,
  });
}
