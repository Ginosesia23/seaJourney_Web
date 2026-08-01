/**
 * Turn a stream of raw AIS positions into a GeoJSON FeatureCollection of
 * passage LineStrings for the Passages Map.
 *
 * A "passage" is a contiguous run of motion fixes, bracketed by real
 * stationary time (or an AIS silence that cannot plausibly be underway).
 * Stationary periods BETWEEN passages become gaps — we do NOT draw a line
 * across a week at anchor — but we DO bridge mid-passage AIS dropouts when
 * the implied transit speed across the silence is still realistic. Ocean
 * AIS often goes quiet for 6–24 h while the ship covers well over 100 NM;
 * a flat "GPS jump" cap used to discard those points and leave half-tracks
 * with a massive empty gap until the next ping.
 *
 * Algorithm — one pass over the sorted fixes, then a merge pass:
 *   1. Sort by timestamp ascending; track the last *kept* fix so GPS
 *      outliers can be skipped without poisoning the next segment.
 *   2. For each consecutive pair (prevKept, curr):
 *        - jump too large → drop the outlier point,
 *        - silence with plausible implied speed → keep the passage open
 *          (draw straight across the dropout),
 *        - silence that looks like a stop / teleport → close,
 *        - motion → append,
 *        - brief stationary blip → grace period (do not close yet),
 *        - sustained stationary → close.
 *   3. Merge adjacent passages that still look like one voyage.
 *   4. Discard passages shorter than MIN_PASSAGE_POINTS / distance.
 */

import { haversineNm } from '@/lib/ais/analyze-daily-state';
import { segmentCrossesLand } from '@/lib/passages-map/segment-crosses-land';

export type RawAisFix = {
  lat: number;
  lon: number;
  /** UTC epoch milliseconds. */
  timestampMs: number;
  /** SOG in knots, if reported by AIS. */
  speedKn?: number | null;
};

export type PassageFeatureProperties = {
  passageIndex: number;
  startTime: string;
  endTime: string;
  distanceNm: number;
  pointCount: number;
  avgSpeedKn: number | null;
  maxSpeedKn: number | null;
  /** Total elapsed time end - start, in milliseconds. */
  durationMs: number;
};

export type PassageFeature = {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    /** [lon, lat] pairs — GeoJSON coordinate order. */
    coordinates: [number, number][];
  };
  properties: PassageFeatureProperties;
};

export type PassageFeatureCollection = {
  type: 'FeatureCollection';
  features: PassageFeature[];
};

export type SegmentTracksResult = {
  featureCollection: PassageFeatureCollection;
  /** [minLon, minLat, maxLon, maxLat] across all passages, or null if empty. */
  bbox: [number, number, number, number] | null;
  passageCount: number;
  totalDistanceNm: number;
  pointCount: number;
  firstFixAt: string | null;
  lastFixAt: string | null;
};

/** Below this SOG a segment is treated as stationary (anchor drift / manoeuvring). */
const MOTION_SPEED_THRESHOLD_KN = 0.5;

/**
 * Soft silence threshold. Gaps longer than this are bridged only when the
 * implied transit speed across the gap is still plausible (see below).
 * Shorter gaps always stay in the current passage evaluation path.
 */
const MAX_SEGMENT_GAP_MS = 4 * 60 * 60 * 1000;

/**
 * Hard ceiling for bridging an AIS dropout inside one passage. Ocean AIS
 * regularly goes dark for 1–2 days; beyond ~3 days we treat it as a new
 * voyage rather than inventing a giant straight line.
 */
const MAX_BRIDGE_GAP_MS = 72 * 60 * 60 * 1000;

/**
 * Implied average speed across a silence must fall in this band to keep the
 * passage open. Too slow ⇒ vessel was stopped (don't smear a line across
 * anchorage). Too fast ⇒ GPS teleport / bad data.
 */
const BRIDGE_MIN_IMPLIED_KN = 0.25;
const BRIDGE_MAX_IMPLIED_KN = 35;

/**
 * Brief dips below the motion threshold (pilot wait, canal lock, AIS
 * reporting 0 kn) must not shatter a voyage. Only close after this much
 * consecutive near-stationary time.
 */
const STATIONARY_CLOSE_MS = 6 * 60 * 60 * 1000;

/** Passages shorter than this are dropped as noise. */
const MIN_PASSAGE_POINTS = 3;
const MIN_PASSAGE_DISTANCE_NM = 0.5;

/**
 * Absolute GPS-teleport ceiling for SHORT time windows only. Over longer
 * silences a vessel can legitimately cover far more than this (e.g. 12 h
 * at 12 kn ≈ 144 NM) — those hops are handled by the bridge rules, NOT
 * discarded as outliers. Earlier we used a flat 100 NM cap which carved
 * holes in every mid-ocean passage with sparse AIS.
 */
const MAX_SEGMENT_JUMP_NM = 100;
/** Window under which the flat jump cap applies. */
const JUMP_STRICT_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * After the main pass, stitch neighbouring passages when the gap between
 * them still looks like one voyage with a quiet AIS stretch in the middle.
 */
const MERGE_MAX_GAP_MS = 72 * 60 * 60 * 1000;
const MERGE_MIN_IMPLIED_KN = 0.25;
const MERGE_MAX_IMPLIED_KN = 35;

type MutablePassage = {
  fixes: RawAisFix[];
  distanceNm: number;
  speedSum: number;
  speedCount: number;
  maxSpeedKn: number;
};

function emptyPassage(): MutablePassage {
  return {
    fixes: [],
    distanceNm: 0,
    speedSum: 0,
    speedCount: 0,
    maxSpeedKn: 0,
  };
}

function hoursFromMs(ms: number): number {
  return ms / 3_600_000;
}

function impliedSpeedKn(distanceNm: number, dtMs: number): number | null {
  if (dtMs <= 0) return null;
  return distanceNm / hoursFromMs(dtMs);
}

function isPlausibleBridge(
  distanceNm: number,
  dtMs: number,
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): boolean {
  if (dtMs <= 0 || dtMs > MAX_BRIDGE_GAP_MS) return false;
  const kn = impliedSpeedKn(distanceNm, dtMs);
  if (kn == null) return false;
  if (kn < BRIDGE_MIN_IMPLIED_KN || kn > BRIDGE_MAX_IMPLIED_KN) return false;
  // Never invent a chord across an island / continent.
  if (segmentCrossesLand(lon1, lat1, lon2, lat2)) return false;
  return true;
}

function isPlausibleMerge(
  distanceNm: number,
  dtMs: number,
  lon1: number,
  lat1: number,
  lon2: number,
  lat2: number,
): boolean {
  if (dtMs < 0 || dtMs > MERGE_MAX_GAP_MS) return false;
  if (segmentCrossesLand(lon1, lat1, lon2, lat2)) return false;
  // Tiny spatial gap with a moderate time gap (AIS blip while nearly
  // stopped in a fairway) — still one passage.
  if (distanceNm <= 5 && dtMs <= 12 * 60 * 60 * 1000) return true;
  const kn = impliedSpeedKn(distanceNm, dtMs);
  if (kn == null) return false;
  return kn >= MERGE_MIN_IMPLIED_KN && kn <= MERGE_MAX_IMPLIED_KN;
}

/**
 * True when the hop is physically impossible for the elapsed time.
 * Short windows use a tight NM cap; longer windows allow up to
 * BRIDGE_MAX_IMPLIED_KN × hours (with a little slack).
 */
function isGpsOutlier(segNm: number, dtMs: number): boolean {
  if (segNm <= MAX_SEGMENT_JUMP_NM) return false;
  if (dtMs <= JUMP_STRICT_WINDOW_MS) return true;
  const maxNm = BRIDGE_MAX_IMPLIED_KN * hoursFromMs(Math.max(dtMs, 1)) * 1.1;
  return segNm > maxNm;
}

/**
 * Effective speed between two fixes — the larger of the reported average SOG
 * and the haversine-derived speed. Mirrors the analyzer so we credit motion
 * even when the transponder is under-reporting speed.
 */
function effectiveSegmentSpeedKn(
  prev: RawAisFix,
  curr: RawAisFix,
  dtMs: number,
): number {
  const reportedPrev =
    typeof prev.speedKn === 'number' && Number.isFinite(prev.speedKn)
      ? Math.abs(prev.speedKn)
      : 0;
  const reportedCurr =
    typeof curr.speedKn === 'number' && Number.isFinite(curr.speedKn)
      ? Math.abs(curr.speedKn)
      : 0;
  const reportedAvg = (reportedPrev + reportedCurr) / 2;

  if (dtMs <= 0) return reportedAvg;

  const segNm = haversineNm(prev.lat, prev.lon, curr.lat, curr.lon);
  const computedKn = segNm / hoursFromMs(dtMs);

  // Cap at a plausible ceiling (40 kn) so a single GPS jump can't turn into
  // "vessel doing 3000 kn" and push everything into the motion bucket.
  return Math.min(40, Math.max(reportedAvg, computedKn));
}

function finalisePassage(
  passage: MutablePassage,
  passageIndex: number,
): PassageFeature | null {
  if (passage.fixes.length < MIN_PASSAGE_POINTS) return null;
  if (passage.distanceNm < MIN_PASSAGE_DISTANCE_NM) return null;

  const first = passage.fixes[0]!;
  const last = passage.fixes[passage.fixes.length - 1]!;

  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: passage.fixes.map((f) => [f.lon, f.lat] as [number, number]),
    },
    properties: {
      passageIndex,
      startTime: new Date(first.timestampMs).toISOString(),
      endTime: new Date(last.timestampMs).toISOString(),
      distanceNm: Number(passage.distanceNm.toFixed(2)),
      pointCount: passage.fixes.length,
      avgSpeedKn:
        passage.speedCount > 0
          ? Number((passage.speedSum / passage.speedCount).toFixed(2))
          : null,
      maxSpeedKn: passage.maxSpeedKn > 0 ? Number(passage.maxSpeedKn.toFixed(2)) : null,
      durationMs: Math.max(0, last.timestampMs - first.timestampMs),
    },
  };
}

function passageFromFeature(feat: PassageFeature): MutablePassage {
  const fixes: RawAisFix[] = feat.geometry.coordinates.map((c, i) => {
    const isFirst = i === 0;
    const isLast = i === feat.geometry.coordinates.length - 1;
    return {
      lon: c[0],
      lat: c[1],
      timestampMs: isFirst
        ? Date.parse(feat.properties.startTime)
        : isLast
          ? Date.parse(feat.properties.endTime)
          : Date.parse(feat.properties.startTime) +
            Math.round(
              (feat.properties.durationMs * i) /
                Math.max(1, feat.geometry.coordinates.length - 1),
            ),
      speedKn: feat.properties.avgSpeedKn,
    };
  });
  return {
    fixes,
    distanceNm: feat.properties.distanceNm,
    speedSum:
      (feat.properties.avgSpeedKn ?? 0) * Math.max(1, feat.properties.pointCount),
    speedCount: feat.properties.avgSpeedKn != null ? feat.properties.pointCount : 0,
    maxSpeedKn: feat.properties.maxSpeedKn ?? 0,
  };
}

/**
 * Stitch neighbouring passages when the gap between them still looks like
 * continuous transit with an AIS dropout in the middle.
 *
 * Features are sorted by `startTime` first — important when stitching a
 * multi-month union where bucket concatenation is not voyage-ordered.
 */
function mergeAdjacentPassages(features: PassageFeature[]): PassageFeature[] {
  if (features.length <= 1) return features;

  const sorted = features.slice().sort((a, b) => {
    const aMs = Date.parse(a.properties.startTime);
    const bMs = Date.parse(b.properties.startTime);
    return aMs - bMs;
  });

  const merged: PassageFeature[] = [];
  let acc = passageFromFeature(sorted[0]!);

  for (let i = 1; i < sorted.length; i++) {
    const nextFeat = sorted[i]!;
    const prevFix = acc.fixes[acc.fixes.length - 1]!;
    const nextFirst = {
      lon: nextFeat.geometry.coordinates[0]![0],
      lat: nextFeat.geometry.coordinates[0]![1],
      timestampMs: Date.parse(nextFeat.properties.startTime),
      speedKn: nextFeat.properties.avgSpeedKn,
    };
    const gapMs = nextFirst.timestampMs - prevFix.timestampMs;
    const gapNm = haversineNm(
      prevFix.lat,
      prevFix.lon,
      nextFirst.lat,
      nextFirst.lon,
    );

    if (
      isPlausibleMerge(
        gapNm,
        gapMs,
        prevFix.lon,
        prevFix.lat,
        nextFirst.lon,
        nextFirst.lat,
      )
    ) {
      const nextPassage = passageFromFeature(nextFeat);
      // Avoid duplicating the shared endpoint if coordinates match.
      const overlap =
        Math.abs(prevFix.lat - nextFirst.lat) < 1e-5 &&
        Math.abs(prevFix.lon - nextFirst.lon) < 1e-5;
      const addFixes = overlap
        ? nextPassage.fixes.slice(1)
        : nextPassage.fixes;
      // Prefer real geometry coords from the next feature (passageFromFeature
      // synthesises intermediate timestamps; coordinates stay exact).
      const realCoords = overlap
        ? nextFeat.geometry.coordinates.slice(1)
        : nextFeat.geometry.coordinates;
      for (let c = 0; c < addFixes.length; c++) {
        const coord = realCoords[c];
        if (coord) {
          addFixes[c] = {
            ...addFixes[c]!,
            lon: coord[0],
            lat: coord[1],
          };
        }
      }
      acc.fixes.push(...addFixes);
      acc.distanceNm += gapNm + nextPassage.distanceNm;
      acc.speedSum += nextPassage.speedSum;
      acc.speedCount += nextPassage.speedCount;
      acc.maxSpeedKn = Math.max(acc.maxSpeedKn, nextPassage.maxSpeedKn);
    } else {
      const closed = finalisePassage(acc, merged.length);
      if (closed) merged.push(closed);
      acc = passageFromFeature(nextFeat);
    }
  }

  const closed = finalisePassage(acc, merged.length);
  if (closed) merged.push(closed);

  // Re-index after merges.
  return merged.map((f, i) => ({
    ...f,
    properties: { ...f.properties, passageIndex: i },
  }));
}

/**
 * Re-stitch a FeatureCollection of passages (e.g. after unioning several
 * month cache rows). Safe no-op for empty / single-feature collections.
 */
export function stitchPassageFeatures(
  fc: PassageFeatureCollection,
): PassageFeatureCollection {
  if (!fc?.features?.length) return fc;
  const features = mergeAdjacentPassages(fc.features);
  return { type: 'FeatureCollection', features };
}

/**
 * Segment a vessel's raw AIS history into passage LineStrings.
 *
 * Positions do NOT need to be sorted; we sort defensively. Positions with
 * missing lat/lon/timestamp are silently dropped.
 */
export function segmentAisPositionsIntoPassages(
  positions: readonly RawAisFix[],
): SegmentTracksResult {
  const usable = positions
    .filter(
      (p) =>
        typeof p.lat === 'number' &&
        Number.isFinite(p.lat) &&
        typeof p.lon === 'number' &&
        Number.isFinite(p.lon) &&
        typeof p.timestampMs === 'number' &&
        Number.isFinite(p.timestampMs),
    )
    .slice()
    .sort((a, b) => a.timestampMs - b.timestampMs);

  const rawPassages: PassageFeature[] = [];
  let current = emptyPassage();
  let lastKept: RawAisFix | null = null;
  let stationaryMs = 0;
  let pointCount = 0;
  let firstFixMs: number | null = null;
  let lastFixMs: number | null = null;
  let bounds: [number, number, number, number] | null = null;

  const noteBbox = (lon: number, lat: number) => {
    if (!bounds) bounds = [lon, lat, lon, lat];
    else {
      if (lon < bounds[0]) bounds[0] = lon;
      if (lat < bounds[1]) bounds[1] = lat;
      if (lon > bounds[2]) bounds[2] = lon;
      if (lat > bounds[3]) bounds[3] = lat;
    }
  };

  const speedIntoStats = (kn: number | null | undefined) => {
    if (typeof kn !== 'number' || !Number.isFinite(kn)) return;
    const abs = Math.abs(kn);
    current.speedSum += abs;
    current.speedCount += 1;
    if (abs > current.maxSpeedKn) current.maxSpeedKn = abs;
  };

  const closeCurrent = () => {
    const feat = finalisePassage(current, rawPassages.length);
    if (feat) rawPassages.push(feat);
    current = emptyPassage();
    stationaryMs = 0;
  };

  const seedCurrent = (fix: RawAisFix) => {
    current = emptyPassage();
    current.fixes.push(fix);
    speedIntoStats(fix.speedKn);
    noteBbox(fix.lon, fix.lat);
    lastKept = fix;
    stationaryMs = 0;
  };

  const appendMotion = (fix: RawAisFix, segNm: number) => {
    if (current.fixes.length === 0 && lastKept) {
      current.fixes.push(lastKept);
      speedIntoStats(lastKept.speedKn);
      noteBbox(lastKept.lon, lastKept.lat);
    }
    current.fixes.push(fix);
    current.distanceNm += segNm;
    speedIntoStats(fix.speedKn);
    noteBbox(fix.lon, fix.lat);
    lastKept = fix;
    stationaryMs = 0;
  };

  for (let i = 0; i < usable.length; i++) {
    const curr = usable[i]!;
    pointCount += 1;
    if (firstFixMs == null) firstFixMs = curr.timestampMs;
    lastFixMs = curr.timestampMs;

    if (!lastKept) {
      seedCurrent(curr);
      continue;
    }

    const prev = lastKept;
    const dtMs = curr.timestampMs - prev.timestampMs;
    const segNm = haversineNm(prev.lat, prev.lon, curr.lat, curr.lon);

    // Impossible hop for the elapsed time — drop the outlier point and
    // keep evaluating against lastKept. Must be time-aware: a 150 NM
    // move over 12 h is normal ocean progress, not a GPS spike.
    if (isGpsOutlier(segNm, dtMs)) {
      continue;
    }

    // A straight chord over land is never a valid boat track — close
    // here even for short time gaps (sparse AIS around an island).
    if (segmentCrossesLand(prev.lon, prev.lat, curr.lon, curr.lat)) {
      closeCurrent();
      seedCurrent(curr);
      continue;
    }

    // Long AIS silence: bridge when the hop still looks like underway
    // transit over water; otherwise close so we don't draw anchorage
    // smears (or island shortcuts).
    if (dtMs > MAX_SEGMENT_GAP_MS) {
      const hasOpenPassage =
        current.fixes.length >= 2 ||
        (current.fixes.length >= 1 && current.distanceNm >= MIN_PASSAGE_DISTANCE_NM);
      const canBridge =
        hasOpenPassage &&
        isPlausibleBridge(
          segNm,
          dtMs,
          prev.lon,
          prev.lat,
          curr.lon,
          curr.lat,
        );

      if (canBridge) {
        appendMotion(curr, segNm);
        continue;
      }

      closeCurrent();
      seedCurrent(curr);
      continue;
    }

    const segSpeed = effectiveSegmentSpeedKn(prev, curr, dtMs);
    const isMotion = segSpeed >= MOTION_SPEED_THRESHOLD_KN;

    if (isMotion) {
      appendMotion(curr, segNm);
      continue;
    }

    // Near-stationary. Accumulate grace time; only close once it looks
    // like a real stop rather than a momentary AIS blip.
    stationaryMs += Math.max(0, dtMs);
    if (stationaryMs >= STATIONARY_CLOSE_MS) {
      closeCurrent();
      seedCurrent(curr);
    } else {
      // Stay open but advance lastKept so the next segment isn't measured
      // across the whole grace window as one huge hop. Do not add these
      // drift points to the drawn line — they clutter harbour approaches.
      lastKept = curr;
    }
  }

  closeCurrent();

  const passages = mergeAdjacentPassages(rawPassages);
  let totalDistanceNm = 0;
  for (const f of passages) totalDistanceNm += f.properties.distanceNm;

  // Recompute bbox from final geometry (merges may have bridged gaps).
  bounds = null;
  for (const f of passages) {
    for (const [lon, lat] of f.geometry.coordinates) {
      noteBbox(lon, lat);
    }
  }

  return {
    featureCollection: {
      type: 'FeatureCollection',
      features: passages,
    },
    bbox: bounds,
    passageCount: passages.length,
    totalDistanceNm: Number(totalDistanceNm.toFixed(2)),
    pointCount,
    firstFixAt: firstFixMs != null ? new Date(firstFixMs).toISOString() : null,
    lastFixAt: lastFixMs != null ? new Date(lastFixMs).toISOString() : null,
  };
}

export const PASSAGE_SEGMENTATION_THRESHOLDS = {
  MOTION_SPEED_THRESHOLD_KN,
  MAX_SEGMENT_GAP_MS,
  MAX_BRIDGE_GAP_MS,
  BRIDGE_MIN_IMPLIED_KN,
  BRIDGE_MAX_IMPLIED_KN,
  STATIONARY_CLOSE_MS,
  MIN_PASSAGE_POINTS,
  MIN_PASSAGE_DISTANCE_NM,
  MAX_SEGMENT_JUMP_NM,
  MERGE_MAX_GAP_MS,
} as const;
