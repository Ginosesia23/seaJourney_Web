/**
 * GET /api/passages-map/live
 *
 * Returns the caller's current live AIS position(s) and, when a vessel
 * is underway, the active in-progress passage track built from recent
 * hourly samples.
 *
 * Cache / Datalastic:
 *   Crew path is READ-ONLY against `crew_ais_state_samples`. It never
 *   hits Datalastic — the hourly crew cron / manual sync writes samples.
 *   That keeps the map's live poll (every ~60s) free.
 *
 *   Vessel managers do not write those samples today. For vessel
 *   accounts we return managed vessels with `live: null` and surface
 *   whether vessel AIS tracking is enabled — historical passages still
 *   come from `/tracks`.
 *
 * Scope:
 *   Crew — one row per vessel with an ACTIVE assignment.
 *   Vessel — one row per managed vessel (`vessel_manager_id` / active).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hasPassagesMapAccess } from '@/supabase/database/subscription-helpers';
import { todayDateKey } from '@/lib/vessel-assignment-dates';
import {
  buildActiveLiveTrack,
  type LiveSamplePoint,
} from '@/lib/passages-map/build-live-track';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Fixes older than this are shown dimmed as "stale". */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
/** How far back we look for samples to build the active track. */
const ACTIVE_TRACK_LOOKBACK_MS = 72 * 60 * 60 * 1000;

type LivePosition = {
  lat: number;
  lon: number;
  speedKn: number | null;
  heading: number | null;
  course: number | null;
  state: string;
  navStatus: string | null;
  /** AIS voyage destination string when the transponder reports one. */
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
  /**
   * GeoJSON FeatureCollection with a single LineString for the
   * currently-underway passage. Null when not underway or when we
   * only have a single fix (not enough to draw a line).
   */
  activeTrack: GeoJSON.FeatureCollection | null;
};

type LiveResponse = {
  vessels: LiveVessel[];
  fetchedAt: string;
  /** True when the user hasn't opted into live AIS tracking. */
  trackingEnabled: boolean;
  message?: string;
};

function vesselColorHex(vesselId: string): string {
  let hash = 0;
  for (let i = 0; i < vesselId.length; i++) {
    hash = (hash * 31 + vesselId.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return hslToHex(hue, 68, 48);
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to255 = (n: number) => Math.round((n + m) * 255);
  return `#${[to255(r), to255(g), to255(b)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')}`;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
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
        'id, role, active_vessel_id, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, ais_live_tracking_enabled',
      )
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (!hasPassagesMapAccess(profile)) {
      return NextResponse.json(
        {
          error:
            'The Passages Map requires Crew Professional or Vessel Premium and above.',
        },
        { status: 402 },
      );
    }

    const role = ((profile as { role?: string }).role || '')
      .toString()
      .toLowerCase();
    const isVesselAccount = role === 'vessel';

    let vesselIds: string[] = [];
    let trackingEnabled = Boolean(
      (profile as { ais_live_tracking_enabled?: boolean }).ais_live_tracking_enabled,
    );
    let emptyScopeMessage =
      'No active vessel assignment — live position unavailable.';

    if (isVesselAccount) {
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
      trackingEnabled = ((managedRaw ?? []) as {
        ais_tracking_enabled?: boolean | null;
      }).some((v) => Boolean(v.ais_tracking_enabled));
      emptyScopeMessage =
        'No managed vessel found — live position unavailable.';
    } else {
      // Active assignments only — live position is about where the boat
      // is NOW, not historical vessels.
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
      .select('id, name')
      .in('id', vesselIds);
    if (vesselErr) throw vesselErr;
    const vesselNameById = new Map<string, string>();
    for (const v of (vesselsRaw ?? []) as { id: string; name: string | null }[]) {
      vesselNameById.set(v.id, v.name || 'Unnamed vessel');
    }

    // Vessel accounts don't write crew AIS samples yet — return the
    // vessel roster so the UI can still reconcile, without a live pin.
    if (isVesselAccount) {
      const vessels: LiveVessel[] = vesselIds.map((vesselId) => ({
        vesselId,
        vesselName: vesselNameById.get(vesselId) ?? 'Unnamed vessel',
        colorHex: vesselColorHex(vesselId),
        live: null,
        activeTrack: null,
      }));
      const response: LiveResponse = {
        vessels,
        fetchedAt: new Date().toISOString(),
        trackingEnabled,
        message: trackingEnabled
          ? 'Historical passages are plotted from AIS history. Live pin for vessel accounts is coming soon.'
          : 'Enable AIS tracking on your vessel to prepare for live position updates. Historical passages still load from AIS history.',
      };
      return NextResponse.json(response);
    }

    // Pull recent samples for every active vessel in one query. We'll
    // pick the newest per vessel in JS and build active tracks from
    // the trailing underway run.
    const lookbackIso = new Date(Date.now() - ACTIVE_TRACK_LOOKBACK_MS).toISOString();
    const { data: samplesRaw, error: samplesErr } = await supabaseAdmin
      .from('crew_ais_state_samples')
      .select(
        'vessel_id, lat, lon, speed_kn, state, nav_status, ais_position_at, sampled_at, raw_position',
      )
      .eq('user_id', user.id)
      .in('vessel_id', vesselIds)
      .gte('sampled_at', lookbackIso)
      .order('sampled_at', { ascending: true });
    if (samplesErr) throw samplesErr;

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

    const samplesByVessel = new Map<string, SampleRow[]>();
    for (const row of (samplesRaw ?? []) as SampleRow[]) {
      let list = samplesByVessel.get(row.vessel_id);
      if (!list) {
        list = [];
        samplesByVessel.set(row.vessel_id, list);
      }
      list.push(row);
    }

    const now = Date.now();
    const vessels: LiveVessel[] = [];

    for (const vesselId of vesselIds) {
      const samples = samplesByVessel.get(vesselId) ?? [];
      const latest = samples.length > 0 ? samples[samples.length - 1]! : null;
      const lat = latest ? numOrNull(latest.lat) : null;
      const lon = latest ? numOrNull(latest.lon) : null;

      let live: LivePosition | null = null;
      if (latest && lat != null && lon != null) {
        const fixMs = Date.parse(latest.ais_position_at ?? latest.sampled_at);
        const raw = latest.raw_position ?? {};
        const destRaw = raw.destination;
        live = {
          lat,
          lon,
          speedKn: numOrNull(latest.speed_kn),
          heading: numOrNull(raw.heading),
          course: numOrNull(raw.course),
          state: latest.state,
          navStatus: latest.nav_status,
          destination:
            typeof destRaw === 'string' && destRaw.trim()
              ? destRaw.trim()
              : null,
          aisPositionAt: latest.ais_position_at,
          sampledAt: latest.sampled_at,
          isStale: !Number.isFinite(fixMs) || now - fixMs > STALE_AFTER_MS,
        };
      }

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
        colorHex: vesselColorHex(vesselId),
        live,
        activeTrack,
      });
    }

    // Underway vessels first, then vessels with any live fix, then the rest.
    vessels.sort((a, b) => {
      const score = (v: LiveVessel) => {
        if (v.live?.state === 'underway') return 2;
        if (v.live) return 1;
        return 0;
      };
      return score(b) - score(a);
    });

    const response: LiveResponse = {
      vessels,
      fetchedAt: new Date().toISOString(),
      trackingEnabled,
      ...(!trackingEnabled
        ? {
            message:
              'Live AIS tracking is off — enable it on Current Service to see your position update hourly.',
          }
        : {}),
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
