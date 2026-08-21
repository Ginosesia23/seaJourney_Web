import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  extractPosCodeBody,
  formatPosVerificationCode,
  posVerificationLookupCandidates,
} from '@/lib/proof-of-service/verification-code';

/**
 * GET /api/verify/proof-of-service?code=POS-XXXXXXXX
 * Looks up a Proof of Service record by verification code (server-side, bypasses RLS).
 * Returns public-safe fields only. Used by the public verify page.
 *
 * Tolerates legacy storage formats (no POS- prefix, 10-char UUID fragments).
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code || typeof code !== 'string') {
    return NextResponse.json({ error: 'Missing code' }, { status: 400 });
  }

  const body = extractPosCodeBody(code);
  if (body.length < 8) {
    return NextResponse.json({ error: 'Code too short' }, { status: 400 });
  }

  const candidates = posVerificationLookupCandidates(code);
  const orFilter = candidates
    .map((c) => `verification_code.eq.${c}`)
    .join(',');

  const { data: row, error } = await supabaseAdmin
    .from('proof_of_service')
    .select(
      'id, verification_code, vessel_name, vessel_type, vessel_imo, crew_name, crew_position, start_date, end_date, total_days, at_sea_days, standby_days, yard_days, leave_days, generated_by_name, generated_by_email, created_at',
    )
    .or(orFilter)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[VERIFY POS]', error);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ found: false }, { status: 404 });
  }

  const displayCode =
    formatPosVerificationCode(row.verification_code) ||
    formatPosVerificationCode(code) ||
    row.verification_code;

  return NextResponse.json({
    found: true,
    record: {
      verification_code: displayCode,
      vessel_name: row.vessel_name,
      vessel_type: row.vessel_type,
      vessel_imo: row.vessel_imo,
      crew_name: row.crew_name,
      crew_position: row.crew_position,
      start_date: row.start_date,
      end_date: row.end_date,
      total_days: row.total_days,
      at_sea_days: row.at_sea_days,
      standby_days: row.standby_days,
      yard_days: row.yard_days,
      leave_days: row.leave_days,
      generated_by_name: row.generated_by_name,
      generated_by_email: row.generated_by_email,
      created_at: row.created_at,
    },
  });
}
