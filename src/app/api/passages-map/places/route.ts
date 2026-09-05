/**
 * GET  /api/passages-map/places  — all places already unlocked for the user
 * POST /api/passages-map/places  — resolve new track samples; persist once
 *
 * Persistence is write-once per (user, cell_key). Revisits of the same
 * coast do not re-hit reverse geocode.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getCrewVesselFeatureBoost } from '@/lib/crew-vessel-feature-boost.server';
import { isFeatureAccessibleServer } from '@/lib/feature-flags/server';
import { reverseGeocodeStructured } from '@/lib/geocoding/reverse-geocode';
import {
  CLOSE_MATCH_NM,
  NEAR_MATCH_NM,
  findNearestPort,
} from '@/lib/passages-map/nearest-port';
import {
  MAX_DISCOVER_PER_BATCH,
  isCoveredByMajorCity,
  placeCellKey,
  type DiscoveredPlace,
  type DiscoveredPlaceKind,
} from '@/lib/passages-map/discover-places';
import { resolveLinkedVesselScope } from '@/lib/passages-map/linked-vessel-scope';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type SampleIn = { lat: number; lon: number; cellKey?: string };

type PlaceRow = {
  cell_key: string;
  lat: number;
  lon: number;
  name: string;
  kind: DiscoveredPlaceKind;
  port_name: string | null;
};

function rowToPlace(row: PlaceRow): DiscoveredPlace {
  return {
    cellKey: row.cell_key,
    lat: Number(row.lat),
    lon: Number(row.lon),
    name: row.name,
    kind: row.kind,
    portName: row.port_name,
  };
}

async function authUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

async function assertAccess(userId: string): Promise<
  | { profile: Record<string, unknown>; error?: undefined }
  | { error: NextResponse; profile?: undefined }
> {
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select(
      'id, role, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, active_vessel_id, linked_account_features, managed_by_vessel_id',
    )
    .eq('id', userId)
    .single();
  if (!profile) {
    return { error: NextResponse.json({ error: 'Profile not found' }, { status: 404 }) };
  }
  const isAdmin = String(profile.role || '').toLowerCase() === 'admin';
  const vesselBoost = await getCrewVesselFeatureBoost(userId);
  const mapOn = await isFeatureAccessibleServer('passages_map', {
    isAdmin,
    profile,
    vesselBoost,
  });
  if (!mapOn) {
    return {
      error: NextResponse.json(
        { error: 'Passages Map is temporarily unavailable.' },
        { status: 403 },
      ),
    };
  }
  return { profile: profile as Record<string, unknown> };
}

async function loadUserPlaces(userId: string): Promise<DiscoveredPlace[]> {
  const { data, error } = await supabaseAdmin
    .from('crew_passage_map_places')
    .select('cell_key, lat, lon, name, kind, port_name')
    .eq('user_id', userId);
  if (error) {
    // Table may not be migrated yet — treat as empty.
    console.warn('[passages-map/places] load failed', error.message);
    return [];
  }
  return (data as PlaceRow[] | null)?.map(rowToPlace) ?? [];
}

function shortenLabel(label: string): string {
  const parts = label
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
  return parts[0] ?? label;
}

async function resolveNewSample(sample: {
  lat: number;
  lon: number;
  cellKey: string;
}): Promise<DiscoveredPlace | null> {
  const close = findNearestPort(sample.lat, sample.lon, {
    maxDistanceNm: CLOSE_MATCH_NM,
  });
  if (close) {
    if (isCoveredByMajorCity(sample.lat, sample.lon, close.name)) return null;
    return {
      cellKey: sample.cellKey,
      lat: sample.lat,
      lon: sample.lon,
      name: close.name,
      kind: 'port',
      portName: close.name,
    };
  }

  const geo = await reverseGeocodeStructured(sample.lat, sample.lon);
  if (geo?.inPopulatedArea && geo.label) {
    const name = shortenLabel(geo.label);
    if (isCoveredByMajorCity(sample.lat, sample.lon, name.split(',')[0]!.trim())) {
      return null;
    }
    const near = findNearestPort(sample.lat, sample.lon, {
      maxDistanceNm: NEAR_MATCH_NM,
    });
    const portName =
      near && normalizeLoose(near.name) !== normalizeLoose(name.split(',')[0]!)
        ? near.name
        : near?.name ?? null;
    // Prefer showing the curated port when we have one nearby and the
    // geocode is a generic locality — otherwise keep the town name and
    // attach port as secondary.
    const kind: DiscoveredPlaceKind = near && near.distanceNm <= CLOSE_MATCH_NM
      ? 'port'
      : 'town';
    const primary =
      kind === 'port' && near ? near.name : name.split(',')[0]!.trim() || name;
    if (isCoveredByMajorCity(sample.lat, sample.lon, primary)) return null;
    return {
      cellKey: sample.cellKey,
      lat: sample.lat,
      lon: sample.lon,
      name: primary,
      kind,
      portName: portName && portName !== primary ? portName : null,
    };
  }

  const near = findNearestPort(sample.lat, sample.lon, {
    maxDistanceNm: NEAR_MATCH_NM,
  });
  if (near) {
    if (isCoveredByMajorCity(sample.lat, sample.lon, near.name)) return null;
    return {
      cellKey: sample.cellKey,
      lat: sample.lat,
      lon: sample.lon,
      name: near.name,
      kind: 'port',
      portName: near.name,
    };
  }

  return null;
}

function normalizeLoose(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export async function GET(req: NextRequest) {
  try {
    const user = await authUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const gate = await assertAccess(user.id);
    if (gate.error) return gate.error;

    const linkedScope = await resolveLinkedVesselScope(
      supabaseAdmin,
      gate.profile,
      'passages_map',
    );
    const placesUserId = linkedScope?.cacheUserId || user.id;
    const places = await loadUserPlaces(placesUserId);
    return NextResponse.json({ places });
  } catch (err) {
    console.error('[passages-map/places] GET', err);
    return NextResponse.json({ error: 'Failed to load places' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const gate = await assertAccess(user.id);
    if (gate.error) return gate.error;

    const linkedScope = await resolveLinkedVesselScope(
      supabaseAdmin,
      gate.profile,
      'passages_map',
    );
    const placesUserId = linkedScope?.cacheUserId || user.id;
    const readOnlyPlaces = Boolean(linkedScope);

    const body = (await req.json().catch(() => null)) as {
      samples?: SampleIn[];
    } | null;
    const rawSamples = Array.isArray(body?.samples) ? body!.samples : [];

    const samples: { lat: number; lon: number; cellKey: string }[] = [];
    const seen = new Set<string>();
    for (const s of rawSamples) {
      const lat = Number(s?.lat);
      const lon = Number(s?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const cellKey =
        typeof s.cellKey === 'string' && s.cellKey
          ? s.cellKey
          : placeCellKey(lat, lon);
      if (seen.has(cellKey)) continue;
      seen.add(cellKey);
      samples.push({ lat, lon, cellKey });
    }

    const existing = await loadUserPlaces(placesUserId);
    const existingKeys = new Set(existing.map((p) => p.cellKey));

    if (readOnlyPlaces) {
      return NextResponse.json({
        places: existing,
        newlyDiscovered: 0,
        resolvedThisBatch: 0,
      });
    }

    const toResolve = samples
      .filter((s) => !existingKeys.has(s.cellKey))
      .slice(0, MAX_DISCOVER_PER_BATCH);

    const newly: DiscoveredPlace[] = [];
    for (const sample of toResolve) {
      const place = await resolveNewSample(sample);
      if (!place) continue;
      newly.push(place);
      const { error } = await supabaseAdmin
        .from('crew_passage_map_places')
        .upsert(
          {
            user_id: user.id,
            cell_key: place.cellKey,
            lat: place.lat,
            lon: place.lon,
            name: place.name,
            kind: place.kind,
            port_name: place.portName ?? null,
          },
          { onConflict: 'user_id,cell_key', ignoreDuplicates: true },
        );
      if (error) {
        console.warn('[passages-map/places] upsert failed', error.message);
      }
    }

    // Prefer reloading so concurrent discoveries + ignoreDuplicates stay
    // consistent; fall back to merge if the table is missing.
    const reloaded = await loadUserPlaces(placesUserId);
    const places =
      reloaded.length > 0 || existing.length > 0
        ? reloaded.length > 0
          ? reloaded
          : [...existing, ...newly]
        : newly;

    return NextResponse.json({
      places,
      newlyDiscovered: newly.length,
      resolvedThisBatch: toResolve.length,
    });
  } catch (err) {
    console.error('[passages-map/places] POST', err);
    return NextResponse.json(
      { error: 'Failed to discover places' },
      { status: 500 },
    );
  }
}
