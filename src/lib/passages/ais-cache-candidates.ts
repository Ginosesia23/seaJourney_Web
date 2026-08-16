/**
 * Load AIS passage candidates from the user's Passages Map month cache
 * (`crew_passage_month_cache`) for logbook promote / enrich / sync.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { AisPassageCandidate } from '@/lib/passages/ais-logbook-link';

type CacheRow = {
  vessel_id: string;
  track_geojson: {
    type?: string;
    features?: Array<{
      type?: string;
      geometry?: {
        type?: string;
        coordinates?: [number, number][];
      };
      properties?: Record<string, unknown>;
    }>;
  } | null;
};

export function extractAisCandidatesFromCacheRows(
  rows: CacheRow[],
): AisPassageCandidate[] {
  const out: AisPassageCandidate[] = [];
  for (const row of rows) {
    const features = row.track_geojson?.features ?? [];
    for (const f of features) {
      if (f.geometry?.type !== 'LineString') continue;
      const startTime = String(f.properties?.startTime ?? '');
      const endTime = String(f.properties?.endTime ?? '');
      if (!startTime || !endTime) continue;
      const coords = Array.isArray(f.geometry.coordinates)
        ? f.geometry.coordinates.filter(
            (c): c is [number, number] =>
              Array.isArray(c) &&
              c.length >= 2 &&
              typeof c[0] === 'number' &&
              typeof c[1] === 'number',
          )
        : [];
      const distanceNm =
        typeof f.properties?.distanceNm === 'number'
          ? f.properties.distanceNm
          : null;
      const avgSpeedKn =
        typeof f.properties?.avgSpeedKn === 'number'
          ? f.properties.avgSpeedKn
          : null;
      const maxSpeedKn =
        typeof f.properties?.maxSpeedKn === 'number'
          ? f.properties.maxSpeedKn
          : null;
      const pointCount =
        typeof f.properties?.pointCount === 'number'
          ? f.properties.pointCount
          : null;
      out.push({
        vesselId: row.vessel_id,
        startTime,
        endTime,
        distanceNm,
        avgSpeedKn,
        maxSpeedKn,
        pointCount,
        coordinates: coords.length >= 2 ? coords : undefined,
      });
    }
  }
  return out;
}

export async function loadAisCandidatesForUser(userId: string): Promise<{
  candidates: AisPassageCandidate[];
  monthCount: number;
}> {
  const { data, error } = await supabaseAdmin
    .from('crew_passage_month_cache')
    .select('vessel_id, track_geojson')
    .eq('user_id', userId);
  if (error) throw error;
  const rows = (data || []) as CacheRow[];
  return {
    candidates: extractAisCandidatesFromCacheRows(rows),
    monthCount: rows.length,
  };
}
