/**
 * Smart day-level AIS state analyzer.
 *
 * Older logic in `mapAisToDailyStatus` looked at a single position (typically
 * the last fix of the day). That fails when a brief speed bump or a stale
 * `under way using engine` flag near the end of the day flips the entire date
 * to "underway". This module looks at ALL the day's fixes and combines:
 *   - total distance traveled (haversine sum of consecutive fixes)
 *   - radius of movement (max distance from the day's geographic centroid)
 *   - average + peak reported speed
 *   - dominant AIS navigational status
 * to make a more robust call. Each verdict comes with a confidence and a
 * human-readable reason so the UI can surface the rationale.
 */

import type { DailyStatus } from '@/lib/types';
import type { DatalasticVesselPosition } from '@/lib/datalastic/client';
import {
  AIS_NAV_STATUS_LABELS,
  getNormalizedAisNavStatus,
  mapAisToDailyStatus,
} from '@/lib/ais/map-ais-to-state';

export type AisDailyConfidence = 'high' | 'medium' | 'low';

export type AisDailyStateAnalysis = {
  state: DailyStatus;
  confidence: AisDailyConfidence;
  reason: string;
  metrics: {
    positionCount: number;
    /** Sum of haversines between consecutive fixes, in nautical miles. */
    distanceTraveledNm: number;
    /** Max distance any fix is from the day's geographic centroid. */
    radiusOfMovementNm: number;
    avgSpeed: number | null;
    maxSpeed: number | null;
    dominantNavStatus: string | null;
    /** The status that wins the count among canonical labels (with count). */
    navStatusCounts: Record<string, number>;
    /**
     * Total time (ms) the vessel was actively in motion across the day, derived
     * from per-segment effective speeds. Excludes long fix gaps (> 4h) so a
     * sparse-data day doesn't get inflated underway hours from one segment.
     */
    underwayDurationMs: number;
    /**
     * Number of distinct stationary clusters detected during the day. > 1 means
     * the vessel relocated between two (or more) holding positions even if the
     * total radius/distance was small.
     */
    stationaryClusterCount: number;
    /**
     * Geographic distance between the first and last stationary cluster centers,
     * in nautical miles. Useful for spotting "moved from anchor to berth" cases.
     */
    clusterTransitionNm: number;
  };
};

export type AisAnalyzeOptions = {
  /**
   * Result from the previous day so the analyzer can carry forward a
   * stationary state when the vessel hasn't moved overnight. Provide the
   * previous day's resolved state and the last fix's lat/lon if available.
   */
  previousDay?: {
    state: DailyStatus;
    lastLatitude: number | null;
    lastLongitude: number | null;
  } | null;
  /**
   * Minimum total underway duration (ms) required before a day is classified
   * as `underway`. Defaults to 4 hours, matching the MCA-style sea-time rule
   * that the testimonial PDF already cites: "underway with main propelling
   * engines running for at least 4 hours within a 24-hour period".
   */
  minUnderwayMs?: number;
  /**
   * Optional reverse-geocoded info about the day's end-of-day position.
   * Allows the analyzer to disambiguate "anchored offshore" from "moored in
   * port" when AIS nav status is missing or unhelpful. Caller is expected to
   * fetch this once per day (e.g. via the BigDataCloud reverse geocoder) and
   * pass it in; the analyzer never makes network calls.
   */
  locationContext?: {
    /** True when the geocoder placed the end-of-day position inside a populated area (city/locality). */
    endOfDayInPopulatedArea?: boolean;
    /** Human-readable place name for the end-of-day fix, if any. */
    endOfDayPlaceName?: string | null;
  } | null;
};

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
/**
 * Drop segments whose timestamp gap exceeds this — we cannot tell what
 * happened in a 6-hour silence, so we don't credit (or debit) it against
 * the underway counter.
 */
const MAX_SEGMENT_GAP_MS = FOUR_HOURS_MS;
/** Speed (kn) above which a segment counts as motion. */
const MOTION_SPEED_THRESHOLD = 0.5;
/** Daily states we are willing to carry forward from yesterday. */
const STATIONARY_STATES: DailyStatus[] = ['in-port', 'at-anchor', 'in-yard'];
/** Max distance between yesterday's last fix and today's first fix to count as "same berth/anchor". */
const SAME_POSITION_RADIUS_NM = 0.1;
/** Two consecutive fixes within this radius are part of the same stationary cluster. */
const CLUSTER_RADIUS_NM = 0.2;
/** Stricter minimum for trusting a cluster as the "ended at" position. */
const MIN_LAST_CLUSTER_DURATION_MS = 45 * 60 * 1000;
/** Cluster-center separation above which we consider the day a relocation between two holding positions. */
const RELOCATION_CLUSTER_GAP_NM = 0.3;

const EARTH_RADIUS_NM = 3440.065;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two lat/lon points, in nautical miles. */
export function haversineNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_NM * c;
}

type PositionWithCoords = DatalasticVesselPosition & {
  timestampMs?: number | null;
};

function hasCoords(p: PositionWithCoords): p is PositionWithCoords & { lat: number; lon: number } {
  return typeof p.lat === 'number' && typeof p.lon === 'number';
}

type StationaryCluster = {
  startMs: number;
  endMs: number;
  durationMs: number;
  centerLat: number;
  centerLon: number;
  count: number;
  /** Most-frequent canonical AIS nav status across this cluster's fixes. */
  dominantStatus: string | null;
};

/**
 * Group consecutive (in time order) AIS fixes that stay within
 * {@link CLUSTER_RADIUS_NM} of each other into stationary clusters. The
 * vessel's day might split into multiple such clusters when it moves between
 * anchorages, berths, or shifts position by a small amount — and the LAST
 * cluster represents "where the vessel ended up", which is the strongest
 * signal for the day's resolved state.
 */
function buildStationaryClusters(positions: Array<PositionWithCoords & { lat: number; lon: number }>): StationaryCluster[] {
  const clusters: StationaryCluster[] = [];
  let buffer: Array<PositionWithCoords & { lat: number; lon: number }> = [];
  let centerLat = 0;
  let centerLon = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    const startMs = buffer[0].timestampMs ?? 0;
    const endMs = buffer[buffer.length - 1].timestampMs ?? 0;
    const counts = new Map<string, number>();
    for (const p of buffer) {
      const s = getNormalizedAisNavStatus(p);
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    let dominantStatus: string | null = null;
    let maxCount = 0;
    for (const [s, n] of counts) {
      if (n > maxCount) {
        dominantStatus = s;
        maxCount = n;
      }
    }
    clusters.push({
      startMs,
      endMs,
      durationMs: Math.max(0, endMs - startMs),
      centerLat,
      centerLon,
      count: buffer.length,
      dominantStatus,
    });
    buffer = [];
  };

  for (const p of positions) {
    if (buffer.length === 0) {
      buffer = [p];
      centerLat = p.lat;
      centerLon = p.lon;
      continue;
    }
    const dist = haversineNm(centerLat, centerLon, p.lat, p.lon);
    if (dist <= CLUSTER_RADIUS_NM) {
      buffer.push(p);
      const n = buffer.length;
      centerLat = (centerLat * (n - 1) + p.lat) / n;
      centerLon = (centerLon * (n - 1) + p.lon) / n;
    } else {
      flush();
      buffer = [p];
      centerLat = p.lat;
      centerLon = p.lon;
    }
  }
  flush();
  return clusters;
}

/**
 * Analyse all of a day's AIS fixes and decide on a single daily state.
 *
 * @param positions  All AIS fixes that fell on the target calendar date.
 *                   Order doesn't matter; the function sorts by timestamp.
 * @param options    Optional previous-day context + thresholds (see type).
 */
export function analyzeAisDailyState(
  positions: PositionWithCoords[],
  options?: AisAnalyzeOptions,
): AisDailyStateAnalysis {
  const minUnderwayMs = options?.minUnderwayMs ?? FOUR_HOURS_MS;
  const previousDay = options?.previousDay ?? null;

  if (!positions.length) {
    if (previousDay && STATIONARY_STATES.includes(previousDay.state)) {
      return {
        state: previousDay.state,
        confidence: 'low',
        reason: `No AIS fixes today — carrying forward yesterday's "${humanState(previousDay.state)}".`,
        metrics: emptyMetrics(),
      };
    }
    return {
      state: 'in-port',
      confidence: 'low',
      reason: 'No AIS positions for this day.',
      metrics: emptyMetrics(),
    };
  }

  // ----- Sort & gather metrics -----
  const sorted = [...positions].sort((a, b) => {
    const ta = a.timestampMs ?? 0;
    const tb = b.timestampMs ?? 0;
    return ta - tb;
  });

  const coordPositions = sorted.filter(hasCoords);

  let distanceTraveledNm = 0;
  for (let i = 1; i < coordPositions.length; i++) {
    const prev = coordPositions[i - 1];
    const curr = coordPositions[i];
    distanceTraveledNm += haversineNm(prev.lat, prev.lon, curr.lat, curr.lon);
  }

  // Underway duration: walk consecutive fixes, count time intervals where
  // either the reported speed or the inter-fix computed speed is above the
  // motion threshold. Skip segments with abnormally large gaps so a single
  // long-silence segment can't claim hours of underway by itself.
  let underwayDurationMs = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const tPrev = prev.timestampMs;
    const tCurr = curr.timestampMs;
    if (tPrev == null || tCurr == null) continue;
    const dtMs = tCurr - tPrev;
    if (dtMs <= 0 || dtMs > MAX_SEGMENT_GAP_MS) continue;

    const reportedPrev = typeof prev.speed === 'number' ? Math.abs(prev.speed) : 0;
    const reportedCurr = typeof curr.speed === 'number' ? Math.abs(curr.speed) : 0;
    const reportedAvg = (reportedPrev + reportedCurr) / 2;

    let segmentSpeed = reportedAvg;
    if (hasCoords(prev) && hasCoords(curr)) {
      const segmentNm = haversineNm(prev.lat, prev.lon, curr.lat, curr.lon);
      const computedKn = segmentNm / (dtMs / 3600000);
      // Take the larger of the two to be tolerant of either signal missing,
      // but cap to a sane upper bound to ignore obvious GPS jumps.
      segmentSpeed = Math.min(40, Math.max(reportedAvg, computedKn));
    }

    if (segmentSpeed >= MOTION_SPEED_THRESHOLD) {
      underwayDurationMs += dtMs;
    }
  }

  let speedSum = 0;
  let speedCount = 0;
  let maxSpeed = 0;
  for (const p of sorted) {
    if (typeof p.speed === 'number' && Number.isFinite(p.speed)) {
      const abs = Math.abs(p.speed);
      speedSum += abs;
      speedCount += 1;
      if (abs > maxSpeed) maxSpeed = abs;
    }
  }
  const avgSpeed = speedCount > 0 ? speedSum / speedCount : null;

  let radiusOfMovementNm = 0;
  if (coordPositions.length > 0) {
    const centroidLat =
      coordPositions.reduce((s, p) => s + p.lat, 0) / coordPositions.length;
    const centroidLon =
      coordPositions.reduce((s, p) => s + p.lon, 0) / coordPositions.length;
    for (const p of coordPositions) {
      const d = haversineNm(centroidLat, centroidLon, p.lat, p.lon);
      if (d > radiusOfMovementNm) radiusOfMovementNm = d;
    }
  }

  // Dominant canonical AIS nav status
  const navStatusCounts: Record<string, number> = {};
  for (const p of sorted) {
    const norm = getNormalizedAisNavStatus(p);
    if (!norm) continue;
    navStatusCounts[norm] = (navStatusCounts[norm] ?? 0) + 1;
  }
  let dominantNavStatus: string | null = null;
  let dominantCount = 0;
  for (const [k, v] of Object.entries(navStatusCounts)) {
    if (v > dominantCount) {
      dominantNavStatus = k;
      dominantCount = v;
    }
  }

  // Cluster the day's fixes into stationary holding positions. The LAST cluster
  // is the strongest signal for "where the vessel ended up".
  const clusters = buildStationaryClusters(coordPositions);
  const lastCluster = clusters.length > 0 ? clusters[clusters.length - 1] : null;
  const firstCluster = clusters.length > 0 ? clusters[0] : null;
  const clusterTransitionNm =
    firstCluster && lastCluster && firstCluster !== lastCluster
      ? haversineNm(
          firstCluster.centerLat,
          firstCluster.centerLon,
          lastCluster.centerLat,
          lastCluster.centerLon,
        )
      : 0;
  const movedBetweenClusters =
    clusters.length > 1 && clusterTransitionNm >= RELOCATION_CLUSTER_GAP_NM;

  const metrics: AisDailyStateAnalysis['metrics'] = {
    positionCount: sorted.length,
    distanceTraveledNm,
    radiusOfMovementNm,
    avgSpeed,
    maxSpeed,
    dominantNavStatus,
    navStatusCounts,
    underwayDurationMs,
    stationaryClusterCount: clusters.length,
    clusterTransitionNm,
  };

  const underwaySatisfied = underwayDurationMs >= minUnderwayMs;
  const minUnderwayHours = minUnderwayMs / 3600000;

  // ----- Helpers -----
  const fixedHrs = (ms: number) => (ms / 3600000).toFixed(1);
  const moored = AIS_NAV_STATUS_LABELS[5];
  const atAnchor = AIS_NAV_STATUS_LABELS[1];
  const aground = AIS_NAV_STATUS_LABELS[6];

  const placeSuffix = options?.locationContext?.endOfDayPlaceName
    ? ` near ${options.locationContext.endOfDayPlaceName}`
    : '';

  const carryForwardIfStationary = (
    extraReason: string,
  ): AisDailyStateAnalysis | null => {
    if (!previousDay) return null;
    if (!STATIONARY_STATES.includes(previousDay.state)) return null;
    if (
      previousDay.lastLatitude == null ||
      previousDay.lastLongitude == null ||
      !hasCoords(sorted[0])
    ) {
      return null;
    }
    const drift = haversineNm(
      previousDay.lastLatitude,
      previousDay.lastLongitude,
      sorted[0].lat,
      sorted[0].lon,
    );
    if (drift > SAME_POSITION_RADIUS_NM) return null;

    // CRITICAL: refuse to carry forward when today's data shows the vessel
    // transitioned to a different stationary state. Otherwise the vessel can
    // sit at anchor in the morning, motor a short distance into port and moor
    // in the afternoon — and we'd still inherit yesterday's "at anchor" just
    // because today's *first* fix is near yesterday's *last* fix.
    if (movedBetweenClusters) return null;
    if (lastCluster?.dominantStatus) {
      const dominant = lastCluster.dominantStatus;
      if (previousDay.state === 'at-anchor' && dominant === moored) return null;
      if (previousDay.state === 'in-port' && dominant === atAnchor) return null;
    }
    // Only refuse carry-forward via the populated-area geocoder when today's
    // dominant AIS status *doesn't* also say "At anchor". If AIS still reports
    // at-anchor today, the geocoder's populated-area flag is not enough to
    // override the crew/system signal.
    if (
      previousDay.state === 'at-anchor' &&
      options?.locationContext?.endOfDayInPopulatedArea &&
      lastCluster?.dominantStatus !== atAnchor
    ) {
      return null;
    }

    return {
      state: previousDay.state,
      confidence: 'high',
      reason: `Same position as yesterday — ${extraReason}carrying forward "${humanState(previousDay.state)}".`,
      metrics,
    };
  };

  // ----- Decision rules (priority order) -----

  // Sparse data — we don't have enough to do clustering. If yesterday was
  // stationary at this same position, prefer that. Otherwise fall back to the
  // single-position rule so behaviour matches live sync.
  if (sorted.length < 2 || coordPositions.length < 2) {
    const carry = carryForwardIfStationary('only one AIS fix today — ');
    if (carry) return carry;
    const fallback = mapAisToDailyStatus(sorted[sorted.length - 1]);
    return {
      state: fallback,
      confidence: 'low',
      reason: 'Only one AIS fix retained for this day — using single-fix mapping.',
      metrics,
    };
  }

  // 1. Strong, sustained movement → underway (must satisfy 4h minimum)
  if (distanceTraveledNm >= 8 && underwaySatisfied) {
    return {
      state: 'underway',
      confidence: 'high',
      reason: `Travelled ${distanceTraveledNm.toFixed(1)} NM with ${fixedHrs(underwayDurationMs)} h underway.`,
      metrics,
    };
  }

  if ((avgSpeed ?? 0) >= 2 && distanceTraveledNm >= 2 && underwaySatisfied) {
    return {
      state: 'underway',
      confidence: 'high',
      reason: `Avg speed ${(avgSpeed ?? 0).toFixed(1)} kn over ${distanceTraveledNm.toFixed(1)} NM (${fixedHrs(underwayDurationMs)} h underway).`,
      metrics,
    };
  }

  if ((maxSpeed ?? 0) >= 4 && distanceTraveledNm >= 1.5 && underwaySatisfied) {
    return {
      state: 'underway',
      confidence: 'medium',
      reason: `Peak speed ${maxSpeed.toFixed(1)} kn over ${distanceTraveledNm.toFixed(1)} NM (${fixedHrs(underwayDurationMs)} h underway).`,
      metrics,
    };
  }

  // 2. Vessel relocated but didn't satisfy the 4-hour underway gate. Don't
  // count as a sea day — instead use the end-of-day nav status / location to
  // call the destination state.
  if (distanceTraveledNm >= 1.5 && !underwaySatisfied) {
    const endStatus = getNormalizedAisNavStatus(sorted[sorted.length - 1]);
    const baseReason =
      `Brief relocation only (${fixedHrs(underwayDurationMs)} h moving, ${distanceTraveledNm.toFixed(1)} NM travelled — under the ${minUnderwayHours.toFixed(0)} h minimum to count as underway)`;
    if (endStatus === AIS_NAV_STATUS_LABELS[5] /* Moored */) {
      return {
        state: 'in-port',
        confidence: 'medium',
        reason: `${baseReason}; ended moored.`,
        metrics,
      };
    }
    if (endStatus === AIS_NAV_STATUS_LABELS[1] /* At anchor */) {
      return {
        state: 'at-anchor',
        confidence: 'medium',
        reason: `${baseReason}; ended at anchor.`,
        metrics,
      };
    }
    return {
      state: 'at-anchor',
      confidence: 'low',
      reason: `${baseReason}; defaulting to at anchor at the destination.`,
      metrics,
    };
  }

  // 3. End-of-day cluster status — the vessel may have shifted between two
  // holding positions during the day (e.g. anchor → berth, or vice versa).
  // Trust the LAST stationary cluster's dominant AIS nav status when it's
  // long enough to be meaningful. This rule sits ABOVE the radius heuristic
  // because the day's net radius/distance can hide a transition between two
  // nearby stationary positions.
  if (lastCluster && lastCluster.durationMs >= MIN_LAST_CLUSTER_DURATION_MS) {
    const transitionNote = movedBetweenClusters
      ? ` Vessel relocated ${clusterTransitionNm.toFixed(2)} NM during the day.`
      : '';
    if (lastCluster.dominantStatus === moored) {
      return {
        state: 'in-port',
        confidence: 'high',
        reason: `Vessel ended the day moored${placeSuffix} for ${fixedHrs(lastCluster.durationMs)} h.${transitionNote}`,
        metrics,
      };
    }
    if (lastCluster.dominantStatus === atAnchor) {
      return {
        state: 'at-anchor',
        confidence: 'high',
        reason: `Vessel ended the day at anchor${placeSuffix} for ${fixedHrs(lastCluster.durationMs)} h.${transitionNote}`,
        metrics,
      };
    }
    if (lastCluster.dominantStatus === aground) {
      return {
        state: 'in-yard',
        confidence: 'medium',
        reason: `Vessel ended the day aground for ${fixedHrs(lastCluster.durationMs)} h.${transitionNote}`,
        metrics,
      };
    }
  }

  // 4. Vessel relocated between stationary clusters but the AIS status of the
  // last cluster is missing/unhelpful — use the geocoder hint when available
  // to call in-port vs at-anchor at the destination.
  if (movedBetweenClusters && lastCluster) {
    if (options?.locationContext?.endOfDayInPopulatedArea) {
      return {
        state: 'in-port',
        confidence: 'medium',
        reason: `Vessel relocated ${clusterTransitionNm.toFixed(2)} NM and ended${placeSuffix} for ${fixedHrs(lastCluster.durationMs)} h — populated coast suggests moored.`,
        metrics,
      };
    }
    return {
      state: 'at-anchor',
      confidence: 'medium',
      reason: `Vessel relocated ${clusterTransitionNm.toFixed(2)} NM and held position for ${fixedHrs(lastCluster.durationMs)} h at the destination.`,
      metrics,
    };
  }

  // 5. Stationary today — try to inherit yesterday's state if the vessel is
  // at the same berth/anchorage (carry-forward refuses to apply when today's
  // last cluster contradicts yesterday's state, see the helper).
  const carryStationary = carryForwardIfStationary('');
  if (carryStationary) return carryStationary;

  // 6. Stationary — fall back to the day's dominant AIS nav status.
  if (dominantNavStatus === aground) {
    return {
      state: 'in-yard',
      confidence: 'medium',
      reason: 'AIS reported the vessel aground for most of the day.',
      metrics,
    };
  }

  if (dominantNavStatus === moored) {
    return {
      state: 'in-port',
      confidence: 'high',
      reason: `AIS reported the vessel moored${placeSuffix} for most of the day.`,
      metrics,
    };
  }

  if (dominantNavStatus === atAnchor) {
    // AIS "At anchor" is a deliberate crew/system signal — trust it and do NOT
    // override with the reverse-geocoder even if the coast nearby is
    // "populated". The geocoder heuristic is reserved for cases where nav
    // status is missing/ambiguous (see Rule 7 below).
    return {
      state: 'at-anchor',
      confidence: 'high',
      reason: `AIS reported the vessel at anchor${placeSuffix} for most of the day.`,
      metrics,
    };
  }

  // 7. Heuristic by movement radius — when nav status is missing or unhelpful.
  // Moored vessels have very tight radius (cable + fender). Anchor swing is
  // typically a couple of cable lengths (~0.05–0.5 NM).
  if (radiusOfMovementNm <= 0.05 && distanceTraveledNm <= 0.3) {
    return {
      state: 'in-port',
      confidence: 'medium',
      reason: `Vessel stationary within ${(radiusOfMovementNm * 1852).toFixed(0)} m${placeSuffix} — likely moored.`,
      metrics,
    };
  }

  if (radiusOfMovementNm <= 0.5 && distanceTraveledNm <= 1.5) {
    // Geocoder tiebreaker — small radius near a populated coast usually means
    // a moored vessel, not an anchored one.
    if (options?.locationContext?.endOfDayInPopulatedArea) {
      return {
        state: 'in-port',
        confidence: 'medium',
        reason: `Vessel held within ${radiusOfMovementNm.toFixed(2)} NM${placeSuffix} — populated coast suggests moored.`,
        metrics,
      };
    }
    return {
      state: 'at-anchor',
      confidence: 'medium',
      reason: `Vessel swung within ${radiusOfMovementNm.toFixed(2)} NM — typical anchor radius.`,
      metrics,
    };
  }

  // 6. Slow drift / brief motion that didn't satisfy the underway gate either.
  if ((avgSpeed ?? 0) >= 0.5 && distanceTraveledNm >= 1) {
    return {
      state: 'at-anchor',
      confidence: 'low',
      reason: `Some movement (${distanceTraveledNm.toFixed(1)} NM, avg ${(avgSpeed ?? 0).toFixed(1)} kn) but only ${fixedHrs(underwayDurationMs)} h underway — not a sea day.`,
      metrics,
    };
  }

  // 7. Fallback
  return {
    state: 'in-port',
    confidence: 'low',
    reason: 'Inconclusive AIS data — defaulting to in-port.',
    metrics,
  };
}

function humanState(state: DailyStatus): string {
  switch (state) {
    case 'underway':
      return 'Underway';
    case 'at-anchor':
      return 'At anchor';
    case 'in-port':
      return 'Moored / In port';
    case 'in-yard':
      return 'In yard';
    case 'on-leave':
      return 'On leave';
    default:
      return state;
  }
}

function emptyMetrics(): AisDailyStateAnalysis['metrics'] {
  return {
    positionCount: 0,
    distanceTraveledNm: 0,
    radiusOfMovementNm: 0,
    avgSpeed: null,
    maxSpeed: null,
    dominantNavStatus: null,
    navStatusCounts: {},
    underwayDurationMs: 0,
    stationaryClusterCount: 0,
    clusterTransitionNm: 0,
  };
}
