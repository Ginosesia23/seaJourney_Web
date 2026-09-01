/**
 * GET /api/passages-map/live
 *
 * Returns the caller's current live AIS position(s) and, when a vessel
 * is underway, the active in-progress passage track built from recent
 * hourly samples.
 *
 * Cache / Datalastic:
 *   Crew — READ-ONLY against `crew_ais_state_samples` (hourly cron writes).
 *   Vessel — READ from `vessel_ais_state_samples`. With `?refresh=1`
 *   (map page first load), also hits Datalastic once per managed vessel
 *   that has AIS tracking enabled so the live pin is fresh.
 *
 * Scope:
 *   Crew — one row per vessel with an ACTIVE assignment.
 *   Vessel — one row per managed vessel (`vessel_manager_id` / active).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hasPassagesMapAccess } from '@/supabase/database/subscription-helpers';
import { getCrewVesselFeatureBoost } from '@/lib/crew-vessel-feature-boost.server';
import { todayDateKey } from '@/lib/vessel-assignment-dates';
import {
  buildActiveLiveTrack,
  type LiveSamplePoint,
} from '@/lib/passages-map/build-live-track';
import { assignOrderedVesselColors } from '@/lib/passages-map/vessel-colors';
import { resolveLinkedVesselScope } from '@/lib/passages-map/linked-vessel-scope';
import { fetchVesselPosition } from '@/lib/datalastic/client';
import {
  getNormalizedAisNavStatus,
  isAisPositionStale,
  mapAisToDailyStatus,
} from '@/lib/ais/map-ais-to-state';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Fixes older than this are shown dimmed as "stale". */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
/** How far back we look for samples to build the active track. */
const ACTIVE_TRACK_LOOKBACK_MS = 72 * 60 * 60 * 1000;
/** On refresh, skip Datalastic if we already have a fresher sample. */
const REFRESH_IF_SAMPLE_OLDER_MS = 30 * 60 * 1000;

type LivePosition = {
  lat: number;
  lon: number;
  speedKn: number | null;
  heading: number | null;
  course: number | null;
  state: string;
  navStatus: string | null;
  destination: string | null;
  aisPositionAt: string | null;
  sampledAt: string;
  isStale: boolean;
};

type LiveVessel = {
  vesselId: string;
  vesselName: string;
  colorHex: string;
  live: LivePosition | null;
  activeTrack: GeoJSON.FeatureCollection | null;
};

type LiveResponse = {
  vessels: LiveVessel[];
  fetchedAt: string;
  trackingEnabled: boolean;
  message?: string;
};

type SampleRow = {
  vessel_id: string;
  lat: number | string | null;
  lon: number | string | null;
  speed_kn: number | string | null;
  state: string;
  nav_status: string | null;
  ais_position_at: string | null;
  sampled_at: string;
  raw_position: Record<string, unknown> | null;
};

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

function liveFromSample(latest: SampleRow, now: number): LivePosition | null {
  const lat = numOrNull(latest.lat);
  const lon = numOrNull(latest.lon);
  if (lat == null || lon == null) return null;
  const fixMs = Date.parse(latest.ais_position_at ?? latest.sampled_at);
  const raw = latest.raw_position ?? {};
  const destRaw = raw.destination;
  return {
    lat,
    lon,
    speedKn: numOrNull(latest.speed_kn),
    heading: numOrNull(raw.heading),
    course: numOrNull(raw.course),
    state: latest.state,
    navStatus: latest.nav_status,
    destination:
      typeof destRaw === 'string' && destRaw.trim() ? destRaw.trim() : null,
    aisPositionAt: latest.ais_position_at,
    sampledAt: latest.sampled_at,
    isStale: !Number.isFinite(fixMs) || now - fixMs > STALE_AFTER_MS,
  };
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select(
        'id, role, active_vessel_id, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, ais_live_tracking_enabled, linked_account_features, managed_by_vessel_id',
      )
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    const vesselBoost = await getCrewVesselFeatureBoost(user.id);
    if (!hasPassagesMapAccess(profile, vesselBoost)) {
      return NextResponse.json(
        {
          error:
            'The Passages Map requires Crew Professional or Vessel Premium and above.',
        },
        { status: 402 },
      );
    }

    const refreshLive = new URL(req.url).searchParams.get('refresh') === '1';

    const role = ((profile as { role?: string }).role || '')
      .toString()
      .toLowerCase();
    const linkedScope = await resolveLinkedVesselScope(
      supabaseAdmin,
      profile,
      'passages_map',
    );
    const isVesselAccount = role === 'vessel' || Boolean(linkedScope);

    let vesselIds: string[] = [];
    let trackingEnabled = Boolean(
      (profile as { ais_live_tracking_enabled?: boolean }).ais_live_tracking_enabled,
    );
    let emptyScopeMessage =
      'No active vessel assignment — live position unavailable.';

    if (linkedScope) {
      vesselIds = [linkedScope.vesselId];
      const { data: linkedVessel } = await supabaseAdmin
        .from('vessels')
        .select('id, ais_tracking_enabled')
        .eq('id', linkedScope.vesselId)
        .maybeSingle();
      trackingEnabled = Boolean(
        (linkedVessel as { ais_tracking_enabled?: boolean | null } | null)
          ?.ais_tracking_enabled,
      );
      emptyScopeMessage =
        'No managed vessel found — live position unavailable.';
    } else if (isVesselAccount) {
      const { data: managedRaw, error: managedErr } = await supabaseAdmin
        .from('vessels')
        .select('id, ais_tracking_enabled')
        .eq('vessel_manager_id', user.id);
      if (managedErr) throw managedErr;

      const managedIds = new Set(
        ((managedRaw ?? []) as { id: string; ais_tracking_enabled?: boolean | null }[])
          .map((v) => v.id),
      );
      const activeVesselId = (profile as { active_vessel_id?: string | null })
        .active_vessel_id;
      if (activeVesselId) managedIds.add(activeVesselId);
      vesselIds = Array.from(managedIds);
      trackingEnabled = (
        (managedRaw ?? []) as { ais_tracking_enabled?: boolean | null }[]
      ).some((v) => Boolean(v.ais_tracking_enabled));
      emptyScopeMessage =
        'No managed vessel found — live position unavailable.';
    } else {
      const today = todayDateKey();
      const { data: assignmentsRaw, error: assignErr } = await supabaseAdmin
        .from('vessel_assignments')
        .select('vessel_id')
        .eq('user_id', user.id)
        .or(`end_date.is.null,end_date.gte.${today}`);
      if (assignErr) throw assignErr;

      vesselIds = Array.from(
        new Set(
          ((assignmentsRaw ?? []) as { vessel_id: string }[]).map(
            (a) => a.vessel_id,
          ),
        ),
      );
    }

    if (vesselIds.length === 0) {
      const empty: LiveResponse = {
        vessels: [],
        fetchedAt: new Date().toISOString(),
        trackingEnabled,
        message: emptyScopeMessage,
      };
      return NextResponse.json(empty);
    }

    const { data: vesselsRaw, error: vesselErr } = await supabaseAdmin
      .from('vessels')
      .select('id, name, mmsi, imo, ais_tracking_enabled')
      .in('id', vesselIds);
    if (vesselErr) throw vesselErr;

    type VesselMeta = {
      id: string;
      name: string | null;
      mmsi: string | null;
      imo: string | null;
      ais_tracking_enabled: boolean | null;
    };
    const vesselMetaById = new Map<string, VesselMeta>();
    const vesselNameById = new Map<string, string>();
    for (const v of (vesselsRaw ?? []) as VesselMeta[]) {
      vesselMetaById.set(v.id, v);
      vesselNameById.set(v.id, v.name || 'Unnamed vessel');
    }

    const lookbackIso = new Date(Date.now() - ACTIVE_TRACK_LOOKBACK_MS).toISOString();
    let samplesQuery = supabaseAdmin
      .from(isVesselAccount ? 'vessel_ais_state_samples' : 'crew_ais_state_samples')
      .select(
        'vessel_id, lat, lon, speed_kn, state, nav_status, ais_position_at, sampled_at, raw_position',
      )
      .in('vessel_id', vesselIds)
      .gte('sampled_at', lookbackIso)
      .order('sampled_at', { ascending: true });

    if (!isVesselAccount) {
      samplesQuery = samplesQuery.eq('user_id', user.id);
    }

    const { data: samplesRaw, error: samplesErr } = await samplesQuery;
    if (samplesErr) throw samplesErr;

    const samplesByVessel = new Map<string, SampleRow[]>();
    for (const row of (samplesRaw ?? []) as SampleRow[]) {
      let list = samplesByVessel.get(row.vessel_id);
      if (!list) {
        list = [];
        samplesByVessel.set(row.vessel_id, list);
      }
      list.push(row);
    }

    // Vessel accounts: on map load (`refresh=1`), pull a fresh AIS fix
    // when tracking is on and samples are missing/old.
    if (isVesselAccount && refreshLive) {
      const nowMs = Date.now();
      await Promise.all(
        vesselIds.map(async (vesselId) => {
          const meta = vesselMetaById.get(vesselId);
          if (!meta?.ais_tracking_enabled) return;
          if (!meta.mmsi && !meta.imo) return;

          const existing = samplesByVessel.get(vesselId) ?? [];
          const latest = existing.length > 0 ? existing[existing.length - 1]! : null;
          if (latest) {
            const fixMs = Date.parse(latest.ais_position_at ?? latest.sampled_at);
            if (Number.isFinite(fixMs) && nowMs - fixMs < REFRESH_IF_SAMPLE_OLDER_MS) {
              return;
            }
          }

          try {
            const position = await fetchVesselPosition({
              mmsi: meta.mmsi,
              imo: meta.imo,
            });
            const lat = position.lat ?? null;
            const lon = position.lon ?? null;
            if (lat == null || lon == null) return;
            if (isAisPositionStale(position)) return;

            const sampledAt = new Date().toISOString();
            const aisPositionAt = position.last_position_UTC ?? sampledAt;
            const navStatus = getNormalizedAisNavStatus(position) || null;
            const state = mapAisToDailyStatus(position);
            const synthetic: SampleRow = {
              vessel_id: vesselId,
              lat,
              lon,
              speed_kn: position.speed ?? null,
              state,
              nav_status: navStatus,
              ais_position_at: aisPositionAt,
              sampled_at: sampledAt,
              raw_position: position as unknown as Record<string, unknown>,
            };
            const list = samplesByVessel.get(vesselId) ?? [];
            list.push(synthetic);
            samplesByVessel.set(vesselId, list);
          } catch (err) {
            console.warn(
              '[passages-map/live] vessel AIS refresh failed',
              vesselId,
              err instanceof Error ? err.message : err,
            );
          }
        }),
      );
    }

    const now = Date.now();
    const vesselColors = assignOrderedVesselColors(
      vesselIds.map((id) => ({
        id,
        name: vesselNameById.get(id) ?? null,
      })),
    );

    const vessels: LiveVessel[] = [];

    for (const vesselId of vesselIds) {
      const samples = samplesByVessel.get(vesselId) ?? [];
      const latest = samples.length > 0 ? samples[samples.length - 1]! : null;
      const live = latest ? liveFromSample(latest, now) : null;

      let activeTrack: GeoJSON.FeatureCollection | null = null;
      if (live && live.state === 'underway') {
        const points: LiveSamplePoint[] = [];
        for (const s of samples) {
          const sLat = numOrNull(s.lat);
          const sLon = numOrNull(s.lon);
          if (sLat == null || sLon == null) continue;
          points.push({
            lat: sLat,
            lon: sLon,
            at: s.ais_position_at ?? s.sampled_at,
            state: s.state,
            speedKn: numOrNull(s.speed_kn),
          });
        }
        const feature = buildActiveLiveTrack(points);
        if (feature) {
          activeTrack = { type: 'FeatureCollection', features: [feature] };
        }
      }

      vessels.push({
        vesselId,
        vesselName: vesselNameById.get(vesselId) ?? 'Unnamed vessel',
        colorHex: vesselColors.get(vesselId)?.colorHex ?? '#2563eb',
        live,
        activeTrack,
      });
    }

    vessels.sort((a, b) => {
      const score = (v: LiveVessel) => {
        if (v.live?.state === 'underway') return 2;
        if (v.live) return 1;
        return 0;
      };
      return score(b) - score(a);
    });

    const hasAnyLive = vessels.some((v) => Boolean(v.live));
    let message: string | undefined;
    if (isVesselAccount) {
      if (!trackingEnabled) {
        message =
          'Enable AIS tracking on your vessel to show a live position on the map. Historical passages still load from AIS history.';
      } else if (!hasAnyLive) {
        message =
          'AIS tracking is on, but no recent position was found. Check MMSI/IMO on the vessel profile.';
      }
    } else if (!trackingEnabled) {
      message =
        'Live AIS tracking is off — enable it on Current Service to see your position update hourly.';
    }

    const response: LiveResponse = {
      vessels,
      fetchedAt: new Date().toISOString(),
      trackingEnabled,
      ...(message ? { message } : {}),
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error('[passages-map/live] failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load live positions' },
      { status: 500 },
    );
  }
}
