import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { redeemPartnerPromoCode } from '@/lib/partner-promo';

/**
 * POST /api/promo-codes/redeem
 * Authenticated: apply a partner code to the signed-in user (auth callback fallback).
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { code?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const code = (body.code || user.user_metadata?.promoCode || '').toString();
  if (!code.trim()) {
    return NextResponse.json({ error: 'Code is required' }, { status: 400 });
  }

  const result = await redeemPartnerPromoCode(user.id, code);
  if (!result.ok) {
    return NextResponse.json({ error: result.error || 'Could not apply code' }, { status: 400 });
  }

  return NextResponse.json(result);
}
