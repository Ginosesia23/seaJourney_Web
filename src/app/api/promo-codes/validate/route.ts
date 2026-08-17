import { NextRequest, NextResponse } from 'next/server';
import { lookupActivePartnerCode, normalizePartnerCode } from '@/lib/partner-promo';

/**
 * GET /api/promo-codes/validate?code=
 * Public: used on the signup form to preview a company code.
 */
export async function GET(req: NextRequest) {
  const code = normalizePartnerCode(req.nextUrl.searchParams.get('code'));
  if (!code) {
    return NextResponse.json({ valid: false, error: 'Enter a code' }, { status: 400 });
  }

  const found = await lookupActivePartnerCode(code);
  if (!found) {
    return NextResponse.json({ valid: false, error: 'Invalid or expired code' });
  }
  if (found.exhausted) {
    return NextResponse.json({
      valid: false,
      error: 'This code has reached its signup limit',
    });
  }

  return NextResponse.json({
    valid: true,
    companyName: found.companyName,
    rewardTier: found.rewardTier,
    rewardDays: found.rewardDays,
  });
}
