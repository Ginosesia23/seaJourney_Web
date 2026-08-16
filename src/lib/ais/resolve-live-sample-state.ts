/**
 * Stabilized per-sample state resolution for the LIVE crew AIS sync.
 *
 * WHY THIS EXISTS
 * ---------------
 * The plain `mapAisToDailyStatus` function is a pure single-fix mapping:
 * navigation status + speed → state. That works fine for the historical AIS
 * importer (which then runs `analyzeAisDailyState` over a full day of fixes)
 * but flips wildly when applied to a single hourly sample:
 *
 *   • A vessel at anchor drifts with current/wind. Its SOG oscillates
 *     between 0.1 and 1.5 kn. Without a stability check, the raw mapping
 *     produces: at-anchor → in-port → at-anchor → underway → in-port → ...
 *     over successive hours. Every flap becomes a lock-screen notification.
 *   • Some AIS transponders never actually transmit "At anchor" (nav code
 *     1) and instead leave the status as "Undefined" or the stale
 *     "Underway using engine" from the last passage. In those cases the
 *     mapping falls through to the speed-only fallback and inherits all
 *     the drift noise above.
 *
 * ALGORITHM
 * ---------
 * Four tiers of evidence, applied in order:
 *
 *   1. EXPLICIT AIS NAV STATUS. If the transponder is clearly saying
 *      "At anchor" / "Moored" / "Aground", trust it 100%. If it's clearly
 *      saying an underway variant AND SOG ≥ 1 kn, trust it. These are the
 *      only cases where a single fix by itself is reliable.
 *
 *   2. YESTERDAY ANCHOR LOCK. If we have yesterday's resolved state AND
 *      it was stationary AND today's fix is inside a tight radius of
 *      yesterday's last position AND we're not clearly underway, lock the
 *      state to yesterday's. This is the per-sample counterpart to the
 *      analyzer's sticky-stationary rule — it stops today's hourly samples
 *      from flip-flopping between at-anchor and in-port while the vessel
 *      sits in the same spot as yesterday. Runs BEFORE the previous-sample
 *      check so a bad prior sample (e.g. a geocoder-driven flip) can't
 *      poison the whole day.
 *
 *   2b. PLACE MEMORY. If the vessel has sat stationary near this lat/lon
 *      before (within a ~0.4 nm buffer — GPS never repeats exact coords),
 *      reuse that remembered state when AIS is ambiguous and we're not
 *      already locked by yesterday / a stable previous sample. Helps when
 *      returning to a marina after a passage.
 *
 *   3. POSITION STABILITY. When AIS is ambiguous (unknown/undefined nav
 *      status, or underway status with drifting speed) and no yesterday
 *      anchor applies, compare the current lat/lon to the previous
 *      sample. If the vessel hasn't moved further than the anchor-swing
 *      threshold (~300m by default), carry forward the previous state —
 *      nothing has really happened.
 *
 *   4. GEO / SPEED FALLBACK. Only when the vessel HAS moved significantly
 *      or we have no previous sample AND no yesterday anchor,
 *      disambiguate stationary states using place memory first, then the
 *      geocoded location: populated coastal area → in-port, offshore →
 *      at-anchor. High sustained speed → underway.
 *
 * The resolver also returns whether the underlying position changed
 * meaningfully, so the notification layer can suppress "state changed"
 * pings that are really just label-flapping noise from a stationary vessel.
 */

import type { DatalasticVesselPosition } from '@/lib/datalastic/client';
import type { DailyStatus } from '@/lib/types';
import {
  AIS_NAV_STATUS_LABELS,
  getNormalizedAisNavStatus,
  mapAisToDailyStatus,
} from '@/lib/ais/map-ais-to-state';
import { haversineNm } from '@/lib/ais/analyze-daily-state';
import {
  PLACE_MEMORY_RADIUS_NM,
  type PlaceMemoryHint,
} from '@/lib/ais/place-memory';

/**
 * Anchor-swing / GPS noise threshold. A vessel on a normal 5:1 anchor
 * scope in 20m of water can swing a ~200m circle; typical AIS position
 * accuracy is 10–100m. Anything within this radius of the previous fix
 * is treated as "same location". Nautical miles under the hood so we can
 * reuse `haversineNm` — 0.162 nm ≈ 300 m.
 */
const SAME_LOCATION_RADIUS_NM = 0.162; // ≈ 300 m

/**
 * Distance beyond which we call the vessel "definitely moved" — used to
 * confirm a real transition (e.g. at-anchor → underway). 0.27 nm ≈ 500 m.
 */
const DEFINITELY_MOVED_RADIUS_NM = 0.27; // ≈ 500 m

/**
 * Sustained SOG at or above this is unambiguously underway, regardless of
 * nav status or position stability (covers cases where the transponder is
 * flat-out lying and the vessel is clearly making way).
 */
const UNAMBIGUOUS_UNDERWAY_KN = 2.0;

/**
 * SOG below this is a-motionless-enough to count as stationary when
 * combined with position stability. Above this, the vessel might be
 * genuinely repositioning at low speed (docking, manoeuvring in a harbour).
 */
const STATIONARY_SPEED_CEILING_KN = 1.5;

/**
 * Radius (nm) around yesterday's last known position within which today's
 * fix is considered "the same spot as yesterday". Matches the analyzer's
 * `STICKY_STATIONARY_RADIUS_NM` so the live per-sample state and the daily
 * aggregate stay coherent. 0.3 nm ≈ 555 m — a bit more generous than the
 * intra-day anchor-swing radius to accommodate wider tidal / weather drift
 * across a 24 h window.
 */
const YESTERDAY_ANCHOR_RADIUS_NM = 0.3;

export type PreviousSample = {
  state: DailyStatus;
  lat: number | null;
  lon: number | null;
  sampledAt: string;
};

/**
 * Yesterday's resolved state + last-known coords. Passed in from the sync
 * layer (same shape as the analyzer's `previousDay` context). When present
 * AND stationary, it acts as a "trusted anchor" that overrides today's
 * per-sample flip-flopping while the vessel sits in the same spot.
 */
export type YesterdayAnchor = {
  state: DailyStatus;
  lat: number | null;
  lon: number | null;
};

export type ResolveLiveSampleStateInput = {
  position: DatalasticVesselPosition;
  previousSample: PreviousSample | null;
  /**
   * Optional. When yesterday's state was stationary and today's fix hasn't
   * moved beyond `YESTERDAY_ANCHOR_RADIUS_NM` from `lat/lon`, the resolver
   * locks today's state to yesterday's — regardless of what the previous
   * sample or the geocoder say. Pass `null` to skip this check.
   */
  yesterdayAnchor?: YesterdayAnchor | null;
  /**
   * Optional. Historical stationary state near the current fix (within
   * {@link PLACE_MEMORY_RADIUS_NM}). Used when AIS is ambiguous and we are
   * arriving / sitting without a reliable yesterday or previous-sample lock.
   */
  placeMemory?: PlaceMemoryHint | null;
  locationContext?: {
    endOfDayPlaceName?: string | null;
    endOfDayInPopulatedArea?: boolean;
  } | null;
};

export type LiveSampleStateResolution = {
  state: DailyStatus;
  /**
   * How the state was determined. Callers can use this to decide whether
   * a state change is trustworthy enough to notify the user about:
   *   - explicit-ais       : AIS nav status was clear and self-consistent.
   *   - explicit-underway  : underway nav status + confirmed motion.
   *   - yesterday-anchor   : locked to yesterday's stationary state because
   *                          today's fix hasn't moved from yesterday's
   *                          position. Highest-priority stability signal.
   *   - place-memory       : reused a historical stationary state from a
   *                          prior visit within ~0.4 nm of this fix.
   *   - position-stable    : carried forward from previous sample — vessel
   *                          hasn't moved since the last fix.
   *   - moved-underway     : previous sample was different, position
   *                          changed significantly, treating as underway.
   *   - geo-inferred       : ambiguous AIS + no previous sample; used
   *                          geocoded populated-area flag.
   *   - speed-fallback     : nothing else applied; pure speed mapping.
   */
  confidence:
    | 'explicit-ais'
    | 'explicit-underway'
    | 'yesterday-anchor'
    | 'place-memory'
    | 'position-stable'
    | 'moved-underway'
    | 'geo-inferred'
    | 'speed-fallback';
  reason: string;
  distanceFromPreviousNm: number | null;
  /**
   * Human-friendly "meaningfully moved" flag: true iff we have a previous
   * sample AND the current fix is > SAME_LOCATION_RADIUS_NM from it. Used
   * as a notification gate — flapping label changes without real movement
   * shouldn't buzz phones.
   */
  positionChangedMeaningfully: boolean;
};

/** Return `true` iff both coords are finite numbers. */
function hasCoords(
  s: Pick<PreviousSample, 'lat' | 'lon'> | null,
): s is PreviousSample & { lat: number; lon: number } {
  return Boolean(
    s &&
      typeof s.lat === 'number' &&
      Number.isFinite(s.lat) &&
      typeof s.lon === 'number' &&
      Number.isFinite(s.lon),
  );
}

/** Compute distance (nm) between current fix and previous sample, or null. */
function distanceFromPreviousNm(
  position: DatalasticVesselPosition,
  previous: PreviousSample | null,
): number | null {
  if (
    typeof position.lat !== 'number' ||
    typeof position.lon !== 'number' ||
    !hasCoords(previous)
  ) {
    return null;
  }
  return haversineNm(previous.lat, previous.lon, position.lat, position.lon);
}

/**
 * Resolve the state for a single hourly AIS fix, stabilized against
 * position and previous-sample context. See file header for the algorithm.
 */
export function resolveLiveSampleState(
  input: ResolveLiveSampleStateInput,
): LiveSampleStateResolution {
  const {
    position,
    previousSample,
    yesterdayAnchor,
    placeMemory,
    locationContext,
  } = input;
  const speed = typeof position.speed === 'number' ? position.speed : 0;
  const canonical = getNormalizedAisNavStatus(position);
  const distanceNm = distanceFromPreviousNm(position, previousSample);
  const positionChangedMeaningfully =
    distanceNm != null && distanceNm > SAME_LOCATION_RADIUS_NM;

  const placeMemoryUsable =
    !!placeMemory &&
    (placeMemory.state === 'at-anchor' ||
      placeMemory.state === 'in-port' ||
      placeMemory.state === 'in-yard') &&
    placeMemory.distanceNm <= PLACE_MEMORY_RADIUS_NM &&
    speed < UNAMBIGUOUS_UNDERWAY_KN;

  const applyPlaceMemory = (why: string): LiveSampleStateResolution => ({
    state: placeMemory!.state,
    confidence: 'place-memory',
    reason: `${why} Remembered ${placeMemory!.state} from a prior visit ${(
      placeMemory!.distanceNm * 1852
    ).toFixed(0)} m away${
      placeMemory!.placeName ? ` (${placeMemory!.placeName})` : ''
    } · ${placeMemory!.visitCount} prior fix${
      placeMemory!.visitCount === 1 ? '' : 'es'
    }.`,
    distanceFromPreviousNm: distanceNm,
    positionChangedMeaningfully,
  });

  /**
   * Distance from yesterday's last known position, or null if we don't
   * have yesterday's coords or today's coords. Used by the yesterday-anchor
   * tier below.
   */
  const distanceFromYesterdayNm: number | null =
    yesterdayAnchor &&
    typeof yesterdayAnchor.lat === 'number' &&
    typeof yesterdayAnchor.lon === 'number' &&
    Number.isFinite(yesterdayAnchor.lat) &&
    Number.isFinite(yesterdayAnchor.lon) &&
    typeof position.lat === 'number' &&
    typeof position.lon === 'number'
      ? haversineNm(
          yesterdayAnchor.lat,
          yesterdayAnchor.lon,
          position.lat,
          position.lon,
        )
      : null;
  const isYesterdayStationary =
    yesterdayAnchor?.state === 'at-anchor' ||
    yesterdayAnchor?.state === 'in-port' ||
    yesterdayAnchor?.state === 'in-yard';

  // ─── Tier 1: EXPLICIT AIS NAV STATUS ─────────────────────────────────
  // Aground: always in-yard. There is no reasonable "false positive" here —
  // no vessel transmits code 6 unless it's actually run aground / in
  // maintenance.
  if (canonical === AIS_NAV_STATUS_LABELS[6]) {
    return {
      state: 'in-yard',
      confidence: 'explicit-ais',
      reason: 'AIS reports aground / in yard.',
      distanceFromPreviousNm: distanceNm,
      positionChangedMeaningfully,
    };
  }

  // Moored (code 5): confirmed in port at a berth / alongside.
  if (canonical === AIS_NAV_STATUS_LABELS[5]) {
    return {
      state: 'in-port',
      confidence: 'explicit-ais',
      reason: 'AIS reports moored / alongside.',
      distanceFromPreviousNm: distanceNm,
      positionChangedMeaningfully,
    };
  }

  // At anchor (code 1): confirmed anchored, regardless of drift SOG.
  if (canonical === AIS_NAV_STATUS_LABELS[1]) {
    return {
      state: 'at-anchor',
      confidence: 'explicit-ais',
      reason: 'AIS reports at anchor.',
      distanceFromPreviousNm: distanceNm,
      positionChangedMeaningfully,
    };
  }

  // Underway variants (codes 0, 2, 3, 4, 7, 8, 11, 12). Only trust these
  // when there's actual motion — otherwise we fall through to position
  // stability (many transponders never clear the underway flag when the
  // vessel drops anchor).
  const isUnderwayNavStatus =
    canonical === AIS_NAV_STATUS_LABELS[0] ||
    canonical === AIS_NAV_STATUS_LABELS[2] ||
    canonical === AIS_NAV_STATUS_LABELS[3] ||
    canonical === AIS_NAV_STATUS_LABELS[4] ||
    canonical === AIS_NAV_STATUS_LABELS[7] ||
    canonical === AIS_NAV_STATUS_LABELS[8] ||
    canonical === AIS_NAV_STATUS_LABELS[11] ||
    canonical === AIS_NAV_STATUS_LABELS[12];

  if (isUnderwayNavStatus && speed >= UNAMBIGUOUS_UNDERWAY_KN) {
    return {
      state: 'underway',
      confidence: 'explicit-underway',
      reason: `AIS ${canonical.toLowerCase()} at ${speed.toFixed(1)} kn.`,
      distanceFromPreviousNm: distanceNm,
      positionChangedMeaningfully,
    };
  }

  // ─── Tier 2: YESTERDAY ANCHOR LOCK ──────────────────────────────────
  // If yesterday was stationary and today's fix is inside a tight radius
  // of yesterday's last position, we treat the vessel as "not having
  // moved from yesterday" and lock the state to yesterday's. This runs
  // BEFORE the previous-sample check so a bad prior sample (e.g. a
  // geocoder-driven at-anchor→in-port flip earlier today) cannot poison
  // the rest of the day — every subsequent hourly sample will snap back
  // to yesterday's trusted state as long as the boat sits still.
  //
  // Guardrails:
  //   * yesterday's state must be stationary (never lock to "underway"
  //     from yesterday — a genuinely new day of movement must be able
  //     to overturn yesterday's underway verdict).
  //   * we bail if the vessel is unambiguously underway right now
  //     (SOG ≥ UNAMBIGUOUS_UNDERWAY_KN was already handled by Tier 1
  //     for the explicit-underway case; here we defensively require
  //     speed below the stationary ceiling so a coasting vessel doesn't
  //     get pinned).
  if (
    isYesterdayStationary &&
    distanceFromYesterdayNm != null &&
    distanceFromYesterdayNm <= YESTERDAY_ANCHOR_RADIUS_NM &&
    speed < UNAMBIGUOUS_UNDERWAY_KN
  ) {
    const driftMeters = distanceFromYesterdayNm * 1852;
    return {
      state: yesterdayAnchor!.state,
      confidence: 'yesterday-anchor',
      reason: `Vessel is ${driftMeters.toFixed(0)} m from yesterday's ${yesterdayAnchor!.state} position — locking to yesterday's state (boat hasn't moved).`,
      distanceFromPreviousNm: distanceNm,
      positionChangedMeaningfully,
    };
  }

  // ─── Tier 3: POSITION STABILITY ──────────────────────────────────────
  // If we have a previous sample AND the vessel is inside the anchor-swing
  // radius, carry forward the previous state. This is the primary fix for
  // the drift-flip-flop bug: an anchored vessel that's had SOG oscillate
  // 0–1.5 kn but hasn't moved will keep whatever state it settled into.
  if (
    previousSample &&
    hasCoords(previousSample) &&
    distanceNm != null &&
    distanceNm <= SAME_LOCATION_RADIUS_NM &&
    speed < UNAMBIGUOUS_UNDERWAY_KN
  ) {
    // Special case: previous was "underway" but vessel is now stationary
    // in the same spot. That's a genuine transition — the vessel just
    // arrived and stopped moving. Prefer place memory (been here before),
    // then geocoding; otherwise default to at-anchor.
    if (previousSample.state === 'underway' && speed < STATIONARY_SPEED_CEILING_KN) {
      if (placeMemoryUsable) {
        return applyPlaceMemory('Vessel has stopped after being underway.');
      }
      const inPop = locationContext?.endOfDayInPopulatedArea === true;
      return {
        state: inPop ? 'in-port' : 'at-anchor',
        confidence: 'position-stable',
        reason: inPop
          ? 'Vessel has stopped moving inside a populated coastal area.'
          : 'Vessel has stopped moving offshore.',
        distanceFromPreviousNm: distanceNm,
        positionChangedMeaningfully,
      };
    }

    // Self-heal for stale stationary states. If the previous sample is
    // at-anchor or in-port AND we have a geocode reading, use the
    // populated-area flag as a tie-breaker between the two. Without this
    // step, a bad historical sample (e.g. from before the resolver was
    // introduced, when a drift-noise SOG got mapped to in-port) would be
    // carried forward forever because nothing else in the pipeline
    // corrects it. Same-position stationary↔stationary transitions never
    // notify (see shouldNotifyForTransition), so the correction is silent.
    if (
      (previousSample.state === 'at-anchor' || previousSample.state === 'in-port') &&
      locationContext &&
      typeof locationContext.endOfDayInPopulatedArea === 'boolean'
    ) {
      const inPop = locationContext.endOfDayInPopulatedArea === true;
      const preferred: DailyStatus = inPop ? 'in-port' : 'at-anchor';
      if (preferred !== previousSample.state) {
        return {
          state: preferred,
          confidence: 'position-stable',
          reason: `Same position (${(distanceNm * 1852).toFixed(0)} m from last fix), but geocode says ${inPop ? 'populated coastal area' : 'offshore'} — correcting stored ${previousSample.state} → ${preferred}.`,
          distanceFromPreviousNm: distanceNm,
          positionChangedMeaningfully,
        };
      }
    }

    return {
      state: previousSample.state,
      confidence: 'position-stable',
      reason: `Vessel has not moved (${(distanceNm * 1852).toFixed(0)} m from last fix); keeping ${previousSample.state}.`,
      distanceFromPreviousNm: distanceNm,
      positionChangedMeaningfully,
    };
  }

  // ─── Tier 4: GEO / SPEED FALLBACK ────────────────────────────────────
  // We're here when: no previous sample, OR previous sample far away, OR
  // speed is unambiguously high. Decide from motion + place memory + geocoding.

  // Unambiguous underway: high speed regardless of nav status flakiness.
  if (speed >= UNAMBIGUOUS_UNDERWAY_KN) {
    return {
      state: 'underway',
      confidence: 'moved-underway',
      reason: `Sustained ${speed.toFixed(1)} kn — treating as underway.`,
      distanceFromPreviousNm: distanceNm,
      positionChangedMeaningfully,
    };
  }

  // Returning to / sitting at a known place after a passage (previous fix
  // far away, or first sample). Prefer remembered state over generic geo.
  if (placeMemoryUsable) {
    return applyPlaceMemory('Ambiguous AIS near a known place.');
  }

  // Vessel is stationary-ish and we have no reliable AIS status.
  // Use geocoding to distinguish anchor from port.
  if (locationContext) {
    const inPop = locationContext.endOfDayInPopulatedArea === true;
    if (inPop) {
      return {
        state: 'in-port',
        confidence: 'geo-inferred',
        reason: `Stationary at ${locationContext.endOfDayPlaceName ?? 'a populated area'} — treating as in port.`,
        distanceFromPreviousNm: distanceNm,
        positionChangedMeaningfully,
      };
    }
    return {
      state: 'at-anchor',
      confidence: 'geo-inferred',
      reason: locationContext.endOfDayPlaceName
        ? `Stationary offshore near ${locationContext.endOfDayPlaceName} — treating as at anchor.`
        : 'Stationary offshore — treating as at anchor.',
      distanceFromPreviousNm: distanceNm,
      positionChangedMeaningfully,
    };
  }

  // Final fallback: use the plain single-fix mapping.
  const fallback = mapAisToDailyStatus(position);
  return {
    state: fallback,
    confidence: 'speed-fallback',
    reason: `No previous fix or geocode available — falling back to single-fix mapping (${fallback}).`,
    distanceFromPreviousNm: distanceNm,
    positionChangedMeaningfully,
  };
}

export const LIVE_SAMPLE_THRESHOLDS = {
  SAME_LOCATION_RADIUS_NM,
  DEFINITELY_MOVED_RADIUS_NM,
  UNAMBIGUOUS_UNDERWAY_KN,
  STATIONARY_SPEED_CEILING_KN,
  YESTERDAY_ANCHOR_RADIUS_NM,
  PLACE_MEMORY_RADIUS_NM,
} as const;
