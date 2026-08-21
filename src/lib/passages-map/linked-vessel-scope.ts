import type { SupabaseClient } from '@supabase/supabase-js';

import {
  isVesselLinkedFeatureGranted,
  vesselLinkedOwnedVesselId,
  type VesselLinkedFeatureKey,
} from '@/lib/vessel-linked-features';

export type LinkedVesselScope = {
  vesselId: string;
  /** Vessel manager user id — AIS month cache is stored under this user. */
  cacheUserId: string | null;
};

/**
 * If this profile is a vessel-linked account with `feature` granted, return
 * the vessel they belong to and the manager whose cached AIS/logbook to read.
 */
export async function resolveLinkedVesselScope(
  supabaseAdmin: SupabaseClient,
  profile: unknown,
  feature: VesselLinkedFeatureKey,
): Promise<LinkedVesselScope | null> {
  if (!isVesselLinkedFeatureGranted(profile, feature)) return null;
  const vesselId = vesselLinkedOwnedVesselId(profile);
  if (!vesselId) return null;

  const { data: vessel } = await supabaseAdmin
    .from('vessels')
    .select('id, vessel_manager_id')
    .eq('id', vesselId)
    .maybeSingle();

  if (!vessel) return null;

  return {
    vesselId,
    cacheUserId: (vessel.vessel_manager_id as string | null) || null,
  };
}
