import { NextResponse } from 'next/server';

import { getCrewVesselFeatureBoost } from '@/lib/crew-vessel-feature-boost.server';
import { isFeatureAccessibleServer } from '@/lib/feature-flags/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function assertCareerProgressAccess(userId: string): Promise<
  | { ok: true }
  | { error: NextResponse }
> {
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select(
      'id, role, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, active_vessel_id, linked_account_features, managed_by_vessel_id',
    )
    .eq('id', userId)
    .single();

  if (!profile) {
    return {
      error: NextResponse.json({ error: 'Profile not found' }, { status: 404 }),
    };
  }

  const isAdmin = String(profile.role || '').toLowerCase() === 'admin';
  const vesselBoost = await getCrewVesselFeatureBoost(userId);
  const allowed = await isFeatureAccessibleServer('career_progress', {
    isAdmin,
    profile,
    vesselBoost,
  });

  if (!allowed) {
    return {
      error: NextResponse.json(
        { error: 'Career progress is temporarily unavailable.' },
        { status: 403 },
      ),
    };
  }

  return { ok: true };
}
