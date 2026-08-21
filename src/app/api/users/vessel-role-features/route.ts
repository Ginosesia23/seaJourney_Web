/**
 * PATCH /api/users/vessel-role-features
 *
 * Vessel managers (Premium+) set which extra dashboard features a
 * vessel-linked secondary account may use. Core pages are always on.
 *
 * Body: { vesselUserId, linkedUserId, vesselId, features: string[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hasActiveSubscription, VESSEL_PREMIUM_PLUS_TIERS } from '@/supabase/database/subscription-helpers';
import { loadFeatureFlagState } from '@/lib/feature-flags/server';
import {
  filterFeaturesByPlatformFlags,
  sanitizeLinkedAccountFeatures,
  type VesselLinkedFeatureKey,
} from '@/lib/vessel-linked-features';

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { vesselUserId, linkedUserId, vesselId, features } = body as {
      vesselUserId?: string;
      linkedUserId?: string;
      vesselId?: string;
      features?: unknown;
    };

    if (!vesselUserId || !linkedUserId || !vesselId) {
      return NextResponse.json(
        { error: 'Missing required fields: vesselUserId, linkedUserId, vesselId' },
        { status: 400 },
      );
    }
    if (!Array.isArray(features)) {
      return NextResponse.json(
        { error: 'features must be an array of feature keys' },
        { status: 400 },
      );
    }

    const sanitized: VesselLinkedFeatureKey[] = sanitizeLinkedAccountFeatures(features);
    const flagState = await loadFeatureFlagState();
    const granted = filterFeaturesByPlatformFlags(
      sanitized,
      (key) => !!flagState.map[key],
    );

    const { data: vesselUser, error: vesselUserError } = await supabaseAdmin
      .from('users')
      .select(
        'id, role, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, active_vessel_id',
      )
      .eq('id', vesselUserId)
      .single();

    if (vesselUserError || !vesselUser) {
      return NextResponse.json({ error: 'Requesting user not found' }, { status: 404 });
    }
    if (vesselUser.role !== 'vessel') {
      return NextResponse.json(
        { error: 'Only vessel managers can update linked-account features' },
        { status: 403 },
      );
    }
    const tier = (vesselUser.subscription_tier || '').toString().toLowerCase();
    if (!VESSEL_PREMIUM_PLUS_TIERS.has(tier) || !hasActiveSubscription(vesselUser)) {
      return NextResponse.json(
        { error: 'Premium tier required to manage vessel-linked accounts' },
        { status: 402 },
      );
    }

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
        { error: 'You can only update linked accounts on a vessel you manage' },
        { status: 403 },
      );
    }

    const { data: linked, error: linkedError } = await supabaseAdmin
      .from('users')
      .select('id, managed_by_vessel_id, subscription_tier')
      .eq('id', linkedUserId)
      .maybeSingle();

    if (linkedError || !linked) {
      return NextResponse.json({ error: 'Linked account not found' }, { status: 404 });
    }
    if (linked.managed_by_vessel_id !== vesselId) {
      return NextResponse.json(
        { error: 'That account is not linked to this vessel' },
        { status: 403 },
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ linked_account_features: granted })
      .eq('id', linkedUserId);

    if (updateError) {
      console.error('[VESSEL ROLE FEATURES] Update failed:', updateError);
      return NextResponse.json(
        { error: 'Failed to save features', details: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, features: granted });
  } catch (err) {
    const error = err as Error;
    console.error('[VESSEL ROLE FEATURES] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}
