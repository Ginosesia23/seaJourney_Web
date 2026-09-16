/**
 * SeaJourney AIS classification layer.
 *
 * Raw provider navigation status is preserved separately — this module maps
 * AIS fixes to official SeaJourney daily states using the shared live-sample
 * stabilisation logic (anchor lock, place memory, geocode hints).
 */

import type { DatalasticVesselPosition } from '@/lib/datalastic/client';
import {
  getNormalizedAisNavStatus,
  mapAisToDailyStatus,
} from '@/lib/ais/map-ais-to-state';
import type { PlaceMemoryHint } from '@/lib/ais/place-memory';
import {
  resolveLiveSampleState,
  type PreviousSample,
} from '@/lib/ais/resolve-live-sample-state';
import type { ClassifiedAisFix, AISProviderPosition } from '@/lib/ais/provider/types';
import type { DailyStatus } from '@/lib/types';

export type ClassifyLiveSampleOptions = {
  position: DatalasticVesselPosition;
  previousSample?: PreviousSample | null;
  yesterdayAnchor?: {
    state: DailyStatus;
    lat: number | null;
    lon: number | null;
  } | null;
  placeMemory?: PlaceMemoryHint | null;
  locationContext?: {
    endOfDayPlaceName?: string | null;
    endOfDayInPopulatedArea?: boolean;
  };
};

/** Single-fix fallback when no stabilisation context is available. */
export function classifyAisFixSimple(
  position: DatalasticVesselPosition | AISProviderPosition,
): DailyStatus {
  const raw =
    'raw' in position && position.raw
      ? position.raw
      : (position as DatalasticVesselPosition);
  return mapAisToDailyStatus(raw);
}

/**
 * Classify a live AIS fix with full stabilisation context.
 * Used by the central AIS service and live sync pipelines.
 */
export function classifyLiveAisSample(
  opts: ClassifyLiveSampleOptions,
): ClassifiedAisFix {
  const raw = opts.position;
  const providerPosition: AISProviderPosition = {
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

  const resolution = resolveLiveSampleState({
    position: raw,
    previousSample: opts.previousSample ?? null,
    yesterdayAnchor: opts.yesterdayAnchor ?? null,
    placeMemory: opts.placeMemory ?? null,
    locationContext: opts.locationContext,
  });

  const seajourneyState =
    resolution.state || classifyAisFixSimple(providerPosition);

  return {
    seajourneyState,
    rawNavigationStatus: providerPosition.rawNavigationStatus,
    position: providerPosition,
    classificationReason: resolution.reason,
    classificationConfidence: resolution.confidence,
  };
}
