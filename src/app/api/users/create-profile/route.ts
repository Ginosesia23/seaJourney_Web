import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { redeemPartnerPromoCode } from '@/lib/partner-promo';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      email,
      username,
      firstName,
      lastName,
      position,
      role,
      activeVesselId,
      promoCode,
    } = body;

    if (!userId || !email) {
      return NextResponse.json(
        { error: 'Missing required fields: userId and email' },
        { status: 400 }
      );
    }

    // Position is required for crew role, but not for vessel role
    if (role !== 'vessel' && (!position || position.trim() === '')) {
      return NextResponse.json({ error: 'Position is required for crew members' }, { status: 400 });
    }

    // Do not overwrite an existing profile's subscription fields (ignoreDuplicates).
    // Promo redeem runs afterwards so a trigger-created free row can still be upgraded.
    let handledByTrigger = false;
    let insertError: { code?: string; message?: string } | null = null;

    for (let attempt = 0; attempt < 4; attempt++) {
      const { error } = await supabaseAdmin.from('users').upsert(
        {
          id: userId,
          email: email,
          username: username || `user_${userId.substring(0, 8)}`,
          first_name: firstName ?? null,
          last_name: lastName ?? null,
          position: position ?? null,
          role: role ?? 'crew',
          active_vessel_id: activeVesselId ?? null,
          subscription_tier: 'free',
          subscription_status: 'inactive',
        },
        {
          onConflict: 'id',
          ignoreDuplicates: true,
        },
      );

      if (!error) {
        insertError = null;
        break;
      }

      insertError = error;

      // Auth user transaction may not be committed yet — trigger will insert shortly.
      if (error.code === '23503') {
        handledByTrigger = true;
        await sleep(200 * (attempt + 1));
        continue;
      }

      console.error('[CREATE PROFILE API] Insert error:', error);
      return NextResponse.json(
        {
          error: 'Failed to create user profile',
          message: error.message,
        },
        { status: 500 }
      );
    }

    if (insertError?.code === '23503') {
      console.log(
        '[CREATE PROFILE API] Auth user not yet committed (normal). Profile will be created by database trigger.',
      );
    }

    let promo: Record<string, unknown> | null = null;
    const code = typeof promoCode === 'string' ? promoCode.trim() : '';
    if (code && (role ?? 'crew') !== 'vessel') {
      let lastResult = await redeemPartnerPromoCode(userId, code);
      for (let attempt = 0; attempt < 3 && lastResult.error === 'User not found'; attempt++) {
        await sleep(250 * (attempt + 1));
        lastResult = await redeemPartnerPromoCode(userId, code);
      }
      if (lastResult.ok) {
        promo = lastResult as Record<string, unknown>;
      } else if (lastResult.error && lastResult.error !== 'User not found') {
        promo = { ok: false, error: lastResult.error };
      }
    }

    return NextResponse.json({
      success: true,
      activeVesselId,
      handledByTrigger,
      promo,
    });
  } catch (error: any) {
    console.error('[CREATE PROFILE API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
      { status: 500 }
    );
  }
}
