/**
 * POST /api/users/remove-vessel-role
 *
 * Ends a vessel-linked secondary account's tie to the vessel.
 *
 * We do NOT delete the auth user — testimonials and signatures already
 * produced by this account should stay valid for audit. Instead we:
 *
 *  1. End any active vessel_assignments rows for this user on the vessel.
 *  2. Clear `users.managed_by_vessel_id` so the account is no longer listed
 *     under that vessel's Roles page.
 *  3. Clear `users.active_vessel_id` if it pointed at this vessel.
 *
 * Only the vessel manager (role=vessel) who currently manages the vessel
 * can call this, and only for accounts that belong to that vessel.
 *
 * Pair: src/app/api/users/invite-vessel-role/route.ts
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hasActiveSubscription, VESSEL_PREMIUM_PLUS_TIERS } from '@/supabase/database/subscription-helpers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { vesselUserId, linkedUserId, vesselId } = body as {
      vesselUserId?: string;
      linkedUserId?: string;
      vesselId?: string;
    };

    if (!vesselUserId || !linkedUserId || !vesselId) {
      return NextResponse.json(
        { error: 'Missing required fields: vesselUserId, linkedUserId, vesselId' },
        { status: 400 },
      );
    }

    // 1) Verify caller is a vessel manager on Premium+ with an active sub.
    const { data: vesselUser, error: vesselUserError } = await supabaseAdmin
      .from('users')
      .select('id, role, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, active_vessel_id')
      .eq('id', vesselUserId)
      .single();

    if (vesselUserError || !vesselUser) {
      return NextResponse.json({ error: 'Requesting user not found' }, { status: 404 });
    }
    if (vesselUser.role !== 'vessel') {
      return NextResponse.json({ error: 'Only vessel managers can remove linked accounts' }, { status: 403 });
    }
    const tier = (vesselUser.subscription_tier || '').toString().toLowerCase();
    if (!VESSEL_PREMIUM_PLUS_TIERS.has(tier) || !hasActiveSubscription(vesselUser)) {
      return NextResponse.json(
        { error: 'Premium tier required to manage vessel-linked accounts' },
        { status: 402 },
      );
    }

    // 2) Verify the caller actually owns/manages this vessel.
    const isActiveVessel = vesselUser.active_vessel_id === vesselId;
    let isManaged = false;
    if (!isActiveVessel) {
      const { data: managedVessel } = await supabaseAdmin
        .from('vessels')
        .select('id')
        .eq('id', vesselId)
        .eq('vessel_manager_id', vesselUserId)
        .maybeSingle();
      isManaged = !!managedVessel;
    }
    if (!isActiveVessel && !isManaged) {
      return NextResponse.json(
        { error: 'You can only remove linked accounts from a vessel you manage' },
        { status: 403 },
      );
    }

    // 3) Verify the target is a linked account on this vessel.
    const { data: targetUser, error: targetErr } = await supabaseAdmin
      .from('users')
      .select('id, managed_by_vessel_id, active_vessel_id')
      .eq('id', linkedUserId)
      .single();

    if (targetErr || !targetUser) {
      return NextResponse.json({ error: 'Linked account not found' }, { status: 404 });
    }
    if (targetUser.managed_by_vessel_id !== vesselId) {
      return NextResponse.json(
        { error: 'That account is not a linked account on this vessel' },
        { status: 403 },
      );
    }

    const today = new Date().toISOString().split('T')[0];

    // 4) End any active vessel_assignments for this user on this vessel.
    const { error: endAssignErr } = await supabaseAdmin
      .from('vessel_assignments')
      .update({ end_date: today, updated_at: new Date().toISOString() })
      .eq('user_id', linkedUserId)
      .eq('vessel_id', vesselId)
      .is('end_date', null);

    if (endAssignErr) {
      console.error('[REMOVE VESSEL ROLE] Failed to end assignment:', endAssignErr);
      // Continue — we still want to unlink the account.
    }

    // 5) Clear the link on the user row.
    const userPatch: Record<string, unknown> = { managed_by_vessel_id: null };
    if (targetUser.active_vessel_id === vesselId) {
      userPatch.active_vessel_id = null;
    }
    const { error: updateErr } = await supabaseAdmin
      .from('users')
      .update(userPatch)
      .eq('id', linkedUserId);

    if (updateErr) {
      console.error('[REMOVE VESSEL ROLE] Failed to clear managed_by_vessel_id:', updateErr);
      return NextResponse.json(
        { error: 'Failed to unlink account', details: updateErr.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const error = err as Error;
    console.error('[REMOVE VESSEL ROLE] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}
