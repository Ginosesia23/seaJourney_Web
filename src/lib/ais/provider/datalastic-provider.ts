/**
 * Datalastic implementation of the AIS provider abstraction.
 * All Datalastic-specific HTTP details stay in lib/datalastic/client.ts.
 */

import {
  DatalasticApiError,
  fetchVesselPosition,
  type DatalasticVesselPosition,
} from '@/lib/datalastic/client';
import { getNormalizedAisNavStatus } from '@/lib/ais/map-ais-to-state';
import type { AisProviderRequestMeta } from '@/lib/ais/fetch-audit-shared';
import type {
  AISProvider,
  AISProviderLookup,
  AISProviderPosition,
  AISProviderResult,
} from '@/lib/ais/provider/types';

function toProviderPosition(raw: DatalasticVesselPosition): AISProviderPosition {
  return {
    latitude: typeof raw.lat === 'number' ? raw.lat : null,
    longitude: typeof raw.lon === 'number' ? raw.lon : null,
    speedKn: typeof raw.speed === 'number' ? raw.speed : null,
    course: typeof raw.course === 'number' ? raw.course : null,
    heading: typeof raw.heading === 'number' ? raw.heading : null,
    rawNavigationStatus: getNormalizedAisNavStatus(raw) || null,
    providerTimestamp: raw.last_position_UTC ?? null,
    destination:
      typeof raw.destination === 'string' && raw.destination.trim()
        ? raw.destination.trim()
        : null,
    mmsi: raw.mmsi ?? null,
    imo: raw.imo ?? null,
    raw,
  };
}

export class DatalasticAISProvider implements AISProvider {
  readonly name = 'datalastic';

  async getVesselPosition(lookup: AISProviderLookup): Promise<AISProviderResult> {
    if (!lookup.mmsi && !lookup.imo) {
      return {
        ok: false,
        position: null,
        errorMessage: 'Vessel has no MMSI or IMO on file.',
      };
    }

    // refreshVesselAIS writes the audit row (with trigger / schedule context).
    let requestMeta: AisProviderRequestMeta | undefined;
    const audit = {
      triggerSource: 'unknown' as const,
      onRequestComplete: (meta: AisProviderRequestMeta) => {
        requestMeta = meta;
      },
    };

    try {
      const raw = await fetchVesselPosition(
        {
          mmsi: lookup.mmsi,
          imo: lookup.imo,
        },
        audit,
      );
      return {
        ok: true,
        position: toProviderPosition(raw),
        responseStatus: requestMeta?.httpStatus ?? 200,
        requestMeta,
      };
    } catch (err: unknown) {
      const status = err instanceof DatalasticApiError ? err.status : 500;
      const message = err instanceof Error ? err.message : 'AIS provider request failed';
      console.error('[DatalasticAISProvider]', message);
      return {
        ok: false,
        position: null,
        responseStatus: status,
        errorMessage: message,
        requestMeta,
      };
    }
  }
}

/** Default singleton used by the central AIS service. */
export const defaultAisProvider = new DatalasticAISProvider();
