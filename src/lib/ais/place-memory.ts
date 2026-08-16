/**
 * Place memory for AIS state detection.
 *
 * When a vessel returns near a spot it has visited before (marina, anchorage,
 * yard), we bias ambiguous live samples toward the stationary state recorded
 * there historically. Matching uses a nautical-mile radius — GPS will never
 * hit the exact same lat/lon twice.
 *
 * Sources (in order):
 *   1. `vessel_ais_place_memory` — durable per-vessel places (survives sample
 *      retention). Optional; if the table is missing we skip silently.
 *   2. Recent `vessel_ais_state_samples` / `crew_ais_state_samples` within the
 *      same radius (covers the last ~8 days of hourly fixes).
 */

import { haversineNm } from '@/lib/ais/analyze-daily-state';
import type { DailyStatus } from '@/lib/types';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Match radius around a remembered place. ≈ 740 m — wider than the
 * yesterday-anchor / sticky 0.3 nm lock so different berths or anchor swings
 * in the same marina still count as "been here before".
 */
export const PLACE_MEMORY_RADIUS_NM = 0.4;

/** Minimum agreeing historical samples before we trust a sample-only hint. */
const MIN_SAMPLE_AGREEMENT = 2;

/** How far back to scan hourly samples when the durable table is empty. */
const SAMPLE_LOOKBACK_DAYS = 90;

const STATIONARY: ReadonlySet<DailyStatus> = new Set([
  'at-anchor',
  'in-port',
  'in-yard',
]);

export type PlaceMemoryHint = {
  state: DailyStatus;
  lat: number;
  lon: number;
  distanceNm: number;
  source: 'place-memory' | 'historical-samples';
  visitCount: number;
  placeName?: string | null;
};

function isFiniteCoord(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/** Approximate degree deltas for a nm radius (used for SQL bounding boxes). */
function bboxForRadiusNm(lat: number, lon: number, radiusNm: number) {
  const latDelta = radiusNm / 60;
  const cos = Math.cos((lat * Math.PI) / 180);
  const lonDelta = radiusNm / (60 * Math.max(0.2, Math.abs(cos)));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLon: lon - lonDelta,
    maxLon: lon + lonDelta,
  };
}

function majorityStationaryState(
  states: DailyStatus[],
): { state: DailyStatus; count: number } | null {
  const counts: Partial<Record<DailyStatus, number>> = {};
  for (const s of states) {
    if (!STATIONARY.has(s)) continue;
    counts[s] = (counts[s] ?? 0) + 1;
  }
  let best: DailyStatus | null = null;
  let bestCount = 0;
  for (const s of STATIONARY) {
    const c = counts[s] ?? 0;
    if (c > bestCount) {
      best = s;
      bestCount = c;
    }
  }
  if (!best || bestCount < MIN_SAMPLE_AGREEMENT) return null;
  return { state: best, count: bestCount };
}

async function lookupDurablePlaceMemory(
  vesselId: string,
  lat: number,
  lon: number,
): Promise<PlaceMemoryHint | null> {
  const { data, error } = await supabaseAdmin
    .from('vessel_ais_place_memory')
    .select(
      'center_lat, center_lon, preferred_state, visit_count, last_place_name, last_seen_at',
    )
    .eq('vessel_id', vesselId)
    .order('visit_count', { ascending: false })
    .limit(200);

  if (error) {
    // Table may not exist yet — fall through to samples.
    if (error.code !== '42P01' && error.code !== 'PGRST205') {
      console.warn('[place-memory] durable lookup failed', error.message);
    }
    return null;
  }

  let best: PlaceMemoryHint | null = null;
  for (const row of data ?? []) {
    const plat = Number(row.center_lat);
    const plon = Number(row.center_lon);
    if (!isFiniteCoord(plat) || !isFiniteCoord(plon)) continue;
    const state = row.preferred_state as DailyStatus;
    if (!STATIONARY.has(state)) continue;
    const distanceNm = haversineNm(plat, plon, lat, lon);
    if (distanceNm > PLACE_MEMORY_RADIUS_NM) continue;
    const visitCount = Number(row.visit_count) || 1;
    if (
      !best ||
      visitCount > best.visitCount ||
      (visitCount === best.visitCount && distanceNm < best.distanceNm)
    ) {
      best = {
        state,
        lat: plat,
        lon: plon,
        distanceNm,
        source: 'place-memory',
        visitCount,
        placeName: (row.last_place_name as string) ?? null,
      };
    }
  }
  return best;
}

async function lookupFromSamples(
  vesselId: string,
  lat: number,
  lon: number,
): Promise<PlaceMemoryHint | null> {
  const box = bboxForRadiusNm(lat, lon, PLACE_MEMORY_RADIUS_NM);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - SAMPLE_LOOKBACK_DAYS);
  const cutoffIso = cutoff.toISOString();

  const [vesselRes, crewRes] = await Promise.all([
    supabaseAdmin
      .from('vessel_ais_state_samples')
      .select('state, lat, lon, sampled_at')
      .eq('vessel_id', vesselId)
      .gte('sampled_at', cutoffIso)
      .gte('lat', box.minLat)
      .lte('lat', box.maxLat)
      .gte('lon', box.minLon)
      .lte('lon', box.maxLon)
      .in('state', ['at-anchor', 'in-port', 'in-yard'])
      .order('sampled_at', { ascending: false })
      .limit(80),
    supabaseAdmin
      .from('crew_ais_state_samples')
      .select('state, lat, lon, sampled_at')
      .eq('vessel_id', vesselId)
      .gte('sampled_at', cutoffIso)
      .gte('lat', box.minLat)
      .lte('lat', box.maxLat)
      .gte('lon', box.minLon)
      .lte('lon', box.maxLon)
      .in('state', ['at-anchor', 'in-port', 'in-yard'])
      .order('sampled_at', { ascending: false })
      .limit(80),
  ]);

  const nearby: Array<{ state: DailyStatus; lat: number; lon: number; distanceNm: number }> =
    [];

  for (const row of [...(vesselRes.data ?? []), ...(crewRes.data ?? [])]) {
    const plat = Number(row.lat);
    const plon = Number(row.lon);
    if (!isFiniteCoord(plat) || !isFiniteCoord(plon)) continue;
    const distanceNm = haversineNm(plat, plon, lat, lon);
    if (distanceNm > PLACE_MEMORY_RADIUS_NM) continue;
    nearby.push({
      state: row.state as DailyStatus,
      lat: plat,
      lon: plon,
      distanceNm,
    });
  }

  if (nearby.length === 0) return null;

  const majority = majorityStationaryState(nearby.map((n) => n.state));
  if (!majority) return null;

  const matching = nearby.filter((n) => n.state === majority.state);
  const avgLat =
    matching.reduce((s, n) => s + n.lat, 0) / Math.max(1, matching.length);
  const avgLon =
    matching.reduce((s, n) => s + n.lon, 0) / Math.max(1, matching.length);
  const distanceNm = haversineNm(avgLat, avgLon, lat, lon);

  return {
    state: majority.state,
    lat: avgLat,
    lon: avgLon,
    distanceNm,
    source: 'historical-samples',
    visitCount: majority.count,
    placeName: null,
  };
}

/**
 * Find a historical stationary state near `lat`/`lon` for this vessel.
 * Returns null when nothing within {@link PLACE_MEMORY_RADIUS_NM} is trusted.
 */
export async function findPlaceMemoryHint(args: {
  vesselId: string;
  lat: number | null;
  lon: number | null;
}): Promise<PlaceMemoryHint | null> {
  const { vesselId, lat, lon } = args;
  if (!isFiniteCoord(lat) || !isFiniteCoord(lon)) return null;

  try {
    const durable = await lookupDurablePlaceMemory(vesselId, lat, lon);
    if (durable && durable.visitCount >= 1) return durable;
    return await lookupFromSamples(vesselId, lat, lon);
  } catch (err) {
    console.warn('[place-memory] lookup failed', err);
    return null;
  }
}

/**
 * Record / strengthen a place memory after a stationary live resolution.
 * No-ops quietly if the table is missing or coords/state are invalid.
 */
export async function recordPlaceMemoryVisit(args: {
  vesselId: string;
  lat: number | null;
  lon: number | null;
  state: DailyStatus;
  placeName?: string | null;
}): Promise<void> {
  const { vesselId, lat, lon, state, placeName } = args;
  if (!STATIONARY.has(state)) return;
  if (!isFiniteCoord(lat) || !isFiniteCoord(lon)) return;

  try {
    const existing = await lookupDurablePlaceMemory(vesselId, lat, lon);
    const nowIso = new Date().toISOString();

    if (existing && existing.source === 'place-memory') {
      // Re-find the row id via a tight bbox + state match.
      const box = bboxForRadiusNm(lat, lon, PLACE_MEMORY_RADIUS_NM);
      const { data: rows } = await supabaseAdmin
        .from('vessel_ais_place_memory')
        .select('id, center_lat, center_lon, visit_count, preferred_state')
        .eq('vessel_id', vesselId)
        .gte('center_lat', box.minLat)
        .lte('center_lat', box.maxLat)
        .gte('center_lon', box.minLon)
        .lte('center_lon', box.maxLon)
        .limit(20);

      let matchId: string | null = null;
      let matchVisits = 0;
      let matchLat = lat;
      let matchLon = lon;
      for (const row of rows ?? []) {
        const plat = Number(row.center_lat);
        const plon = Number(row.center_lon);
        if (!isFiniteCoord(plat) || !isFiniteCoord(plon)) continue;
        if (haversineNm(plat, plon, lat, lon) > PLACE_MEMORY_RADIUS_NM) continue;
        matchId = row.id as string;
        matchVisits = Number(row.visit_count) || 1;
        // Nudge the center toward the new fix so the place drifts with use.
        matchLat = (plat * matchVisits + lat) / (matchVisits + 1);
        matchLon = (plon * matchVisits + lon) / (matchVisits + 1);
        break;
      }

      if (matchId) {
        await supabaseAdmin
          .from('vessel_ais_place_memory')
          .update({
            center_lat: matchLat,
            center_lon: matchLon,
            preferred_state: state,
            visit_count: matchVisits + 1,
            last_seen_at: nowIso,
            last_place_name: placeName ?? null,
            updated_at: nowIso,
          })
          .eq('id', matchId);
        return;
      }
    }

    await supabaseAdmin.from('vessel_ais_place_memory').insert({
      vessel_id: vesselId,
      center_lat: lat,
      center_lon: lon,
      preferred_state: state,
      visit_count: 1,
      last_seen_at: nowIso,
      last_place_name: placeName ?? null,
    });
  } catch (err) {
    console.warn('[place-memory] record visit failed', err);
  }
}
