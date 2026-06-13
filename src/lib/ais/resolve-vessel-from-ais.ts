import type { VesselRegistrationAutofill } from '@/lib/ais/map-datalastic-to-vessel';
import type { AisVesselLookupSelection } from '@/lib/ais/vessel-lookup-types';

export type ResolveVesselFromAisResult = {
  vesselId: string;
  vesselName: string;
  created: boolean;
  linkedExisting?: boolean;
};

/**
 * Resolve an AIS selection to a SeaJourney vessel id via the server (admin dedupe).
 * Never creates a duplicate when MMSI, IMO, or exact name already exists.
 */
export async function resolveVesselFromAisSelection(
  selection: AisVesselLookupSelection,
): Promise<ResolveVesselFromAisResult> {
  const response = await fetch('/api/vessels/resolve-from-ais', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      autofill: selection.autofill,
      existingVesselId: selection.existingInDatabase?.id ?? null,
    }),
  });

  const body = (await response.json().catch(() => ({}))) as ResolveVesselFromAisResult & {
    error?: string;
    message?: string;
  };

  if (!response.ok || !body.vesselId) {
    throw new Error(body.error || body.message || 'Failed to resolve vessel from AIS');
  }

  return body;
}

export type { VesselRegistrationAutofill };
