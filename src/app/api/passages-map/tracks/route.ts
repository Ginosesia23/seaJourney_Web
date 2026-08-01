/**
 * GET /api/passages-map/tracks
 *
 * Returns passages for the authenticated user, formatted as one
 * GeoJSON FeatureCollection per vessel with a stable per-vessel colour.
 *
 * Scope
 * ─────
 *   Crew / captain — vessels from `vessel_assignments` for that user.
 *   Vessel manager  — vessels they manage (`vessel_manager_id` / active
 *                     vessel), spanning account `start_date` → today.
 *
 * Query params
 * ────────────
 *   ?month=YYYY-MM   Return passages for that single UTC month.
 *                    Cache miss → fetches from Datalastic, buckets by
 *                    month, and inserts a row per (user, vessel, month).
 *                    Cache hit → served instantly.
 *
 *   ?range=all       Return EVERY cached month across the whole span
 *                    of the user's assignments, unioned into one
 *                    FeatureCollection per vessel. Cache-only: no
 *                    Datalastic calls are ever made in this mode; the
 *                    user builds up their history by browsing months.
 *
 *   (default)        Equivalent to ?month=<current UTC month>.
 *
 *   ?refresh=1                     Invalidate cache for the current
 *                                  request's scope and re-fetch.
 *   ?refresh=1&vesselId=<uuid>     Same but only for one vessel.
 *
 * Cache table: `crew_passage_month_cache`
 *   Keyed by (user_id, vessel_id, month_key). See the migration file
 *   sql/create-crew-passage-month-cache.sql for the invariants that
 *   tie this API to the schema (short version: features in a row's
 *   `track_geojson` all have `startTime` inside that month).
 *
 * Freshness
 *   Past months are IMMUTABLE — once cached, they never expire (unless
 *   `?refresh=1` blows them away). Only the current month may be re-
 *   fetched, and only if `fetched_at` is older than ACTIVE_CACHE_TTL_MS
 *   (6 h) or `?refresh=1` was passed.
 *
 * Datalastic call budget
 *   Datalastic bills per API call. `?range=all` is cache-only precisely
 *   so browsing history never surprises the user with a big bill. When
 *   a month IS fetched, it costs 1-2 calls (Datalastic caps per call at
 *   30 days after `from`). Per-request chunk cap is
 *   MAX_DATALASTIC_CHUNKS_PER_REQUEST.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hasPassagesMapAccess } from '@/supabase/database/subscription-helpers';
import { DatalasticApiError, fetchVesselHistoryRange } from '@/lib/datalastic/client';
import { todayDateKey } from '@/lib/vessel-assignment-dates';
import { parseHistoryPosition } from '@/lib/ais/historical-import';
import {
  segmentAisPositionsIntoPassages,
  stitchPassageFeatures,
  type RawAisFix,
  type PassageFeature,
} from '@/lib/passages-map/segment-tracks';
import { extendPassagesWithSamples } from '@/lib/passages-map/extend-passages-with-samples';
import { splitFeaturesOnLandCrossings } from '@/lib/passages-map/segment-crosses-land';
import {
  addMonthsToKey,
  bucketFeaturesByMonth,
  currentMonthKey,
  mergeMonthBuckets,
  monthKeyFromIsoUtc,
  type MonthBucket,
} from '@/lib/passages-map/bucket-by-month';
import {
  aggregateBucketStats,
  bboxOfFeatureCollection,
  filterFeaturesByLeavePeriods,
  type LeavePeriod,
} from '@/lib/passages-map/filter-by-leave-periods';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Refresh threshold for the current-month cache row (past months never
 * refresh). Kept short so an in-progress voyage doesn't sit truncated
 * for half a day waiting on Datalastic — hourly samples also extend the
 * track on read in the meantime.
 */
const ACTIVE_CACHE_TTL_MS = 1 * 60 * 60 * 1000;
/** How far back we pull crew AIS samples to extend the newest passage. */
const SAMPLE_EXTEND_LOOKBACK_MS = 72 * 60 * 60 * 1000;
/** Maximum number of Datalastic 31-day chunks fired per API request. */
const MAX_DATALASTIC_CHUNKS_PER_REQUEST = 4;

type AssignmentRow = {
  id: string;
  vessel_id: string;
  start_date: string;
  end_date: string | null;
};

type VesselRow = {
  id: string;
  name: string | null;
  mmsi: string | null;
  imo: string | null;
};

type MonthCacheRow = {
  id: string;
  user_id: string;
  vessel_id: string;
  month_key: string;
  track_geojson: unknown;
  bbox: number[] | null;
  passage_count: number;
  total_distance_nm: number;
  point_count: number;
  first_fix_at: string | null;
  last_fix_at: string | null;
  fetched_at: string;
  datalastic_request_count: number;
  is_current_month: boolean;
};

type VesselResponse = {
  vesselId: string;
  vesselName: string;
  colorHex: string;
  /**
   * FeatureCollection scoped to the requested view (single month OR
   * union of all cached months when `range=all`).
   */
  featureCollection: unknown;
  bbox: number[] | null;
  totals: {
    passageCount: number;
    totalDistanceNm: number;
    pointCount: number;
    firstFixAt: string | null;
    lastFixAt: string | null;
  };
  /**
   * Which month keys we HAVE cached data for on this vessel. The UI
   * uses this to disable/enable prev/next arrows and to render a
   * scrollbar of dots showing months with data.
   */
  availableMonths: string[];
  /** Where the returned FeatureCollection came from. */
  source: 'cache' | 'fetched' | 'refreshed' | 'empty' | 'skipped';
  /** Only present if `source === 'skipped'`. */
  skipReason?: string;
  /**
   * Transparency for leave-period filtering: how many passages we
   * removed from THIS vessel's response because they fell entirely
   * inside one of the crew member's logged leave periods. The UI
   * uses this to show a small "N hidden while on leave" note so
   * users know why their sea-time is smaller than the raw AIS
   * history suggests.
   */
  excludedByLeave?: {
    passageCount: number;
    distanceNm: number;
  };
};

type TracksResponse = {
  view: {
    mode: 'month' | 'all';
    month: string | null;
    isCurrentMonth: boolean;
    /** Month keys the UI can navigate to (union across ALL user vessels). */
    availableMonths: string[];
    earliestMonth: string | null;
    latestMonth: string | null;
  };
  vessels: VesselResponse[];
  totals: VesselResponse['totals'];
  /**
   * Aggregate leave-period exclusion across every vessel in the
   * response — driven off `excludedByLeave` on the individual vessel
   * rows. Present only when at least one passage was hidden.
   */
  excludedByLeave?: {
    passageCount: number;
    distanceNm: number;
  };
  datalasticRequestCount: number;
  quotaHit: boolean;
  message?: string;
};

// ─── Colour helpers (unchanged from prior version). ───────────────────

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

function emptyTotals(): VesselResponse['totals'] {
  return {
    passageCount: 0,
    totalDistanceNm: 0,
    pointCount: 0,
    firstFixAt: null,
    lastFixAt: null,
  };
}

/**
 * Days of AIS history to fetch past the end of the requested month.
 * Without this pad, a voyage still underway at month-end is cut off in
 * the cache row (no more points), then the next month starts a brand-new
 * LineString — looking like a mid-passage split with a gap at the
 * boundary. Features are still bucketed by startTime into the requested
 * month only; the pad just lets their geometry finish naturally.
 */
const MONTH_FETCH_FORWARD_PAD_DAYS = 3;

/**
 * Compute the [from, to] date range (YYYY-MM-DD) for a fetch that covers
 * one UTC month plus a short forward pad, clipped so we never ask
 * Datalastic about a day in the future. Datalastic's `from`/`to` are
 * inclusive.
 */
function monthKeyToFetchRange(monthKey: string): { from: string; to: string } {
  const nextMonth = addMonthsToKey(monthKey, 1);
  // Last calendar day of the requested month, then + pad.
  const [ny, nm] = nextMonth.split('-').map(Number);
  const lastDayMs =
    Date.UTC(ny as number, (nm as number) - 1, 1) - 24 * 60 * 60 * 1000;
  const paddedEndMs =
    lastDayMs + MONTH_FETCH_FORWARD_PAD_DAYS * 24 * 60 * 60 * 1000;
  const paddedEnd = new Date(paddedEndMs).toISOString().slice(0, 10);
  const today = todayDateKey();
  return {
    from: monthKey,
    to: paddedEnd > today ? today : paddedEnd,
  };
}

function normaliseMonthKey(raw: string | null): string | null {
  if (!raw) return null;
  // Accept both `YYYY-MM` and `YYYY-MM-DD`; canonicalise to first of month.
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(raw);
  if (!match) return null;
  return `${match[1]}-${match[2]}-01`;
}

/**
 * Which month keys (across all vessels) does this user have EITHER
 * cached data for OR could reasonably have — i.e. months between their
 * earliest assignment start and the current month. Used to render the
 * month scrollbar in the UI so users can browse into months we haven't
 * fetched yet and trigger the fetch by navigating there.
 */
function computeCandidateMonths(
  assignments: AssignmentRow[],
): { earliest: string | null; latest: string; keys: string[] } {
  if (assignments.length === 0) {
    const cur = currentMonthKey();
    return { earliest: null, latest: cur, keys: [cur] };
  }
  const earliestStart = assignments
    .map((a) => a.start_date)
    .sort()[0] as string;
  const earliestMonth = monthKeyFromIsoUtc(`${earliestStart}T00:00:00Z`) ?? earliestStart;
  const latestMonth = currentMonthKey();
  const keys: string[] = [];
  for (
    let cursor = earliestMonth;
    cursor <= latestMonth;
    cursor = addMonthsToKey(cursor, 1)
  ) {
    keys.push(cursor);
  }
  return { earliest: earliestMonth, latest: latestMonth, keys };
}

// ─── Auth ─────────────────────────────────────────────────────────────

async function authenticate(req: NextRequest): Promise<
  | {
      ok: true;
      userId: string;
      profile: Record<string, unknown>;
    }
  | { ok: false; response: NextResponse }
> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
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
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select(
      'id, role, active_vessel_id, start_date, subscription_tier, subscription_status, cancel_at_period_end, current_period_end',
    )
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Profile not found' }, { status: 404 }),
    };
  }

  if (!hasPassagesMapAccess(profile)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'The Passages Map requires Crew Professional or Vessel Premium and above.',
        },
        { status: 402 },
      ),
    };
  }

  return { ok: true, userId: user.id as string, profile };
}

/**
 * Resolve which vessels + date spans the caller may plot.
 * Vessel accounts use managed vessels (not crew assignments).
 */
async function resolvePassagesMapScope(
  userId: string,
  profile: Record<string, unknown>,
): Promise<{
  assignments: AssignmentRow[];
  isVesselAccount: boolean;
  emptyMessage: string;
}> {
  const role = (profile.role || '').toString().toLowerCase();

  if (role === 'vessel') {
    const { data: managedRaw, error: managedErr } = await supabaseAdmin
      .from('vessels')
      .select('id, created_at')
      .eq('vessel_manager_id', userId);
    if (managedErr) throw managedErr;

    const byId = new Map<string, { id: string; created_at: string | null }>();
    for (const row of (managedRaw ?? []) as {
      id: string;
      created_at: string | null;
    }[]) {
      byId.set(row.id, row);
    }

    const activeVesselId =
      typeof profile.active_vessel_id === 'string'
        ? profile.active_vessel_id
        : null;
    if (activeVesselId && !byId.has(activeVesselId)) {
      const { data: activeVessel } = await supabaseAdmin
        .from('vessels')
        .select('id, created_at')
        .eq('id', activeVesselId)
        .maybeSingle();
      if (activeVessel) {
        byId.set(activeVessel.id as string, {
          id: activeVessel.id as string,
          created_at: (activeVessel.created_at as string | null) ?? null,
        });
      }
    }

    const profileStart =
      typeof profile.start_date === 'string'
        ? profile.start_date.slice(0, 10)
        : null;

    const assignments: AssignmentRow[] = Array.from(byId.values()).map(
      (vessel) => {
        const created = vessel.created_at
          ? String(vessel.created_at).slice(0, 10)
          : null;
        const startDate = profileStart || created || '1970-01-01';
        return {
          id: `vessel-scope:${vessel.id}`,
          vessel_id: vessel.id,
          start_date: startDate,
          end_date: null,
        };
      },
    );

    return {
      assignments,
      isVesselAccount: true,
      emptyMessage:
        'No managed vessel found — link a vessel to this account to plot passages.',
    };
  }

  const { data: assignmentsRaw, error: assignErr } = await supabaseAdmin
    .from('vessel_assignments')
    .select('id, vessel_id, start_date, end_date')
    .eq('user_id', userId)
    .order('start_date', { ascending: true });
  if (assignErr) throw assignErr;

  return {
    assignments: (assignmentsRaw ?? []) as AssignmentRow[],
    isVesselAccount: false,
    emptyMessage:
      'No vessel assignments yet — add a vessel on Current Service and your passages will appear here.',
  };
}

// ─── Main handler ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (!auth.ok) return auth.response;

    const url = req.nextUrl;
    const rangeParam = url.searchParams.get('range');
    const monthParamRaw = url.searchParams.get('month');
    const refresh = url.searchParams.get('refresh') === '1';
    const refreshVesselId = url.searchParams.get('vesselId') || null;

    const isAllTime = rangeParam === 'all';
    const requestedMonth = isAllTime ? null : (normaliseMonthKey(monthParamRaw) ?? currentMonthKey());
    const currentMonth = currentMonthKey();

    // 1. Load scope (crew assignments, or managed vessels for vessel accounts).
    const scope = await resolvePassagesMapScope(auth.userId, auth.profile);
    const assignments = scope.assignments;

    if (assignments.length === 0) {
      const empty: TracksResponse = {
        view: {
          mode: isAllTime ? 'all' : 'month',
          month: requestedMonth,
          isCurrentMonth: requestedMonth === currentMonth,
          availableMonths: [currentMonth],
          earliestMonth: null,
          latestMonth: currentMonth,
        },
        vessels: [],
        totals: emptyTotals(),
        datalasticRequestCount: 0,
        quotaHit: false,
        message: scope.emptyMessage,
      };
      return NextResponse.json(empty);
    }

    const vesselIds = Array.from(new Set(assignments.map((a) => a.vessel_id)));

    // 2. Load vessel metadata in one shot.
    const { data: vesselsRaw, error: vesselErr } = await supabaseAdmin
      .from('vessels')
      .select('id, name, mmsi, imo')
      .in('id', vesselIds);
    if (vesselErr) throw vesselErr;
    const vesselById = new Map<string, VesselRow>();
    for (const v of (vesselsRaw ?? []) as VesselRow[]) {
      vesselById.set(v.id, v);
    }

    // Which vessel(s) is each assignment covering which month(s)?
    // Used to gate fetches — we should only fetch a given (vessel,
    // month) if the user actually had an assignment on that vessel
    // during that month.
    const vesselMonths = collectVesselMonths(assignments);

    // Leave periods only apply to crew/captain personal history. Vessel
    // accounts plot the vessel's own continuous track.
    const leaveByVessel = new Map<string, LeavePeriod[]>();
    if (!scope.isVesselAccount) {
      const { data: leaveRowsRaw, error: leaveErr } = await supabaseAdmin
        .from('crew_leave_periods')
        .select('vessel_id, start_date, end_date')
        .eq('crew_user_id', auth.userId)
        .in('vessel_id', vesselIds);
      if (leaveErr) {
        // Don't fail the whole map on a leave-period query error —
        // degrade gracefully by showing all passages (the previous
        // behaviour). Log so we can investigate.
        console.warn('[passages-map/tracks] leave-period query failed', leaveErr);
      }
      for (const row of (leaveRowsRaw ?? []) as {
        vessel_id: string;
        start_date: string;
        end_date: string;
      }[]) {
        // Normalise DATE columns to just the `YYYY-MM-DD` prefix so
        // downstream `Date.parse(`${d}T00:00:00Z`)` works regardless of
        // whether Postgres returned a plain DATE or a timestamp string.
        const startDate = row.start_date.slice(0, 10);
        const endDate = row.end_date.slice(0, 10);
        let list = leaveByVessel.get(row.vessel_id);
        if (!list) {
          list = [];
          leaveByVessel.set(row.vessel_id, list);
        }
        list.push({ vesselId: row.vessel_id, startDate, endDate });
      }
    }

    // 3. Handle explicit refresh (delete cache rows before we load them).
    if (refresh) {
      let q = supabaseAdmin
        .from('crew_passage_month_cache')
        .delete()
        .eq('user_id', auth.userId);
      if (refreshVesselId) q = q.eq('vessel_id', refreshVesselId);
      if (!isAllTime && requestedMonth) q = q.eq('month_key', requestedMonth);
      await q;
    }

    // 4. Load ALL existing cache rows for this user (small — one row per
    //    vessel-month; a heavy user has maybe a few hundred).
    const { data: cacheRowsRaw, error: cacheErr } = await supabaseAdmin
      .from('crew_passage_month_cache')
      .select(
        'id, user_id, vessel_id, month_key, track_geojson, bbox, passage_count, total_distance_nm, point_count, first_fix_at, last_fix_at, fetched_at, datalastic_request_count, is_current_month',
      )
      .eq('user_id', auth.userId)
      .in('vessel_id', vesselIds);
    if (cacheErr) throw cacheErr;
    const cacheByKey = new Map<string, MonthCacheRow>();
    for (const row of (cacheRowsRaw ?? []) as MonthCacheRow[]) {
      // Normalise DATE-typed month_key back to a canonical YYYY-MM-01.
      const monthKey = row.month_key.slice(0, 10);
      cacheByKey.set(monthCacheKey(row.vessel_id, monthKey), {
        ...row,
        month_key: monthKey,
      });
    }

    // 5. Fetch strategy branch.
    let datalasticChunks = 0;
    const vessels = Array.from(vesselIds)
      .map((id) => vesselById.get(id))
      .filter((v): v is VesselRow => !!v);

    const vesselResponses: VesselResponse[] = [];

    // Recent hourly samples — used to extend the newest cached passage
    // so an underway voyage isn't truncated at the last Datalastic
    // fetch (the classic "half a track, vessel further along" gap).
    const samplesByVessel = await loadRecentSampleFixes(
      auth.userId,
      vesselIds,
    );

    // Curry the response builder with per-vessel leave periods so the
    // filter is applied uniformly at every callsite below without
    // having to remember to pass leave periods each time. Keeps the
    // control-flow branches (cache hit / empty / fetched / skipped)
    // consistent — every response goes through the same filter.
    const buildVesselResponse = (
      vessel: VesselRow,
      bucket: Omit<MonthBucket, 'monthKey'> | MonthBucket,
      availableMonths: string[],
      source: VesselResponse['source'],
      skipReason?: string,
    ): VesselResponse =>
      assembleVesselResponse(
        vessel,
        bucket,
        availableMonths,
        source,
        leaveByVessel.get(vessel.id) ?? [],
        samplesByVessel.get(vessel.id) ?? [],
        skipReason,
      );

    if (isAllTime) {
      // "All time" view: cache-only, no Datalastic. Union every cached
      // month per vessel into one FeatureCollection, then feed it
      // through the same helper as the single-month branch so leave-
      // period exclusion applies uniformly.
      for (const vessel of vessels) {
        const cachedMonths = collectCachedMonthsForVessel(
          cacheByKey,
          vessel.id,
        );
        const merged = mergeMonthBuckets(
          cachedMonths.map((r) => cacheRowToBucket(r)),
        );
        vesselResponses.push(
          buildVesselResponse(
            vessel,
            merged,
            cachedMonths.map((r) => r.month_key),
            cachedMonths.length > 0 ? 'cache' : 'empty',
          ),
        );
      }
    } else {
      // Single-month view: cache-hit fast path, else fetch.
      const month = requestedMonth as string; // narrowed by isAllTime === false

      for (const vessel of vessels) {
        // If the user had no assignment on this vessel during the
        // requested month, we don't fetch — just return empty. This
        // prevents spurious Datalastic calls for months a user wasn't
        // on that vessel yet.
        const monthsForVessel = vesselMonths.get(vessel.id);
        const wasAssignedThatMonth = monthsForVessel?.has(month) ?? false;

        const cached = cacheByKey.get(monthCacheKey(vessel.id, month));
        const shouldServeCache =
          cached && (!isCacheRowStale(cached) || datalasticChunks >= MAX_DATALASTIC_CHUNKS_PER_REQUEST);

        if (shouldServeCache && cached) {
          const bucket = cacheRowToBucket(cached);
          vesselResponses.push(
            buildVesselResponse(
              vessel,
              bucket,
              collectCachedMonthsForVessel(cacheByKey, vessel.id).map(
                (r) => r.month_key,
              ),
              'cache',
            ),
          );
          continue;
        }

        if (!wasAssignedThatMonth && !cached) {
          // No assignment covers this month for this vessel and there's
          // no historical cache row — skip cleanly.
          vesselResponses.push(
            buildVesselResponse(
              vessel,
              emptyBucket(month),
              collectCachedMonthsForVessel(cacheByKey, vessel.id).map(
                (r) => r.month_key,
              ),
              'empty',
            ),
          );
          continue;
        }

        // Need to fetch. Cost guard first.
        if (datalasticChunks >= MAX_DATALASTIC_CHUNKS_PER_REQUEST) {
          vesselResponses.push(
            buildVesselResponse(
              vessel,
              emptyBucket(month),
              collectCachedMonthsForVessel(cacheByKey, vessel.id).map(
                (r) => r.month_key,
              ),
              'skipped',
              'AIS-history quota for this request exceeded — refresh to load more.',
            ),
          );
          continue;
        }

        if (!vessel.mmsi && !vessel.imo) {
          vesselResponses.push(
            buildVesselResponse(
              vessel,
              emptyBucket(month),
              collectCachedMonthsForVessel(cacheByKey, vessel.id).map(
                (r) => r.month_key,
              ),
              'skipped',
              'Vessel has no MMSI or IMO — add one on the vessel profile.',
            ),
          );
          continue;
        }

        try {
          const range = monthKeyToFetchRange(month);
          if (range.from > range.to) {
            // Future month — nothing to fetch. Return empty gracefully.
            vesselResponses.push(
              buildVesselResponse(
                vessel,
                emptyBucket(month),
                collectCachedMonthsForVessel(cacheByKey, vessel.id).map(
                  (r) => r.month_key,
                ),
                'empty',
              ),
            );
            continue;
          }

          const { positions, requestCount } = await fetchVesselHistoryRange({
            mmsi: vessel.mmsi,
            imo: vessel.imo,
            from: range.from,
            to: range.to,
          });
          datalasticChunks += requestCount;

          const fixes: RawAisFix[] = positions
            .map((p) => parseHistoryPosition(p as unknown as Record<string, unknown>))
            .filter(
              (p): p is NonNullable<typeof p> =>
                !!p &&
                typeof p.lat === 'number' &&
                typeof p.lon === 'number' &&
                !!p.timestampMs,
            )
            .map((p) => ({
              lat: p.lat as number,
              lon: p.lon as number,
              timestampMs: p.timestampMs as number,
              speedKn: typeof p.speed === 'number' ? p.speed : null,
            }));

          const segmented = segmentAisPositionsIntoPassages(fixes);

          // Bucket by startTime. The fetch includes a forward pad into
          // the next month so in-progress voyages keep their geometry;
          // only features that *start* in the requested month are stored
          // here. Spill that starts in the pad/next month is discarded
          // (that month's own cache row owns it).
          const buckets = bucketFeaturesByMonth(segmented.featureCollection);
          const requestedBucket = buckets.get(month) ?? emptyBucket(month);

          // Upsert this month's row (delete + insert so a refresh
          // replaces cleanly).
          await supabaseAdmin
            .from('crew_passage_month_cache')
            .delete()
            .eq('user_id', auth.userId)
            .eq('vessel_id', vessel.id)
            .eq('month_key', month);

          const { data: inserted, error: insertErr } = await supabaseAdmin
            .from('crew_passage_month_cache')
            .insert({
              user_id: auth.userId,
              vessel_id: vessel.id,
              month_key: month,
              track_geojson: requestedBucket.featureCollection,
              bbox: requestedBucket.bbox,
              passage_count: requestedBucket.passageCount,
              total_distance_nm: requestedBucket.totalDistanceNm,
              point_count: requestedBucket.pointCount,
              first_fix_at: requestedBucket.firstFixAt,
              last_fix_at: requestedBucket.lastFixAt,
              source: 'datalastic_history',
              datalastic_request_count: requestCount,
              is_current_month: month === currentMonth,
            })
            .select(
              'id, user_id, vessel_id, month_key, track_geojson, bbox, passage_count, total_distance_nm, point_count, first_fix_at, last_fix_at, fetched_at, datalastic_request_count, is_current_month',
            )
            .single();
          if (insertErr) throw insertErr;

          const insertedRow = inserted as MonthCacheRow;
          insertedRow.month_key = insertedRow.month_key.slice(0, 10);
          cacheByKey.set(monthCacheKey(vessel.id, month), insertedRow);

          vesselResponses.push(
            buildVesselResponse(
              vessel,
              cacheRowToBucket(insertedRow),
              collectCachedMonthsForVessel(cacheByKey, vessel.id).map(
                (r) => r.month_key,
              ),
              cached ? 'refreshed' : 'fetched',
            ),
          );
        } catch (err) {
          const msg = err instanceof DatalasticApiError ? err.message : (err as Error).message;
          console.warn('[passages-map/tracks] month fetch failed', {
            userId: auth.userId,
            vesselId: vessel.id,
            month,
            err: msg,
          });
          vesselResponses.push(
            buildVesselResponse(
              vessel,
              emptyBucket(month),
              collectCachedMonthsForVessel(cacheByKey, vessel.id).map(
                (r) => r.month_key,
              ),
              'skipped',
              msg,
            ),
          );
        }
      }
    }

    // 6. Sort vessels: most recent activity first.
    vesselResponses.sort((a, b) => {
      const aLast = a.totals.lastFixAt ? Date.parse(a.totals.lastFixAt) : 0;
      const bLast = b.totals.lastFixAt ? Date.parse(b.totals.lastFixAt) : 0;
      return bLast - aLast;
    });

    // 7. Grand totals + view metadata.
    const grandTotals = vesselResponses.reduce((acc, v) => {
      acc.passageCount += v.totals.passageCount;
      acc.totalDistanceNm += v.totals.totalDistanceNm;
      acc.pointCount += v.totals.pointCount;
      if (v.totals.firstFixAt && (!acc.firstFixAt || v.totals.firstFixAt < acc.firstFixAt))
        acc.firstFixAt = v.totals.firstFixAt;
      if (v.totals.lastFixAt && (!acc.lastFixAt || v.totals.lastFixAt > acc.lastFixAt))
        acc.lastFixAt = v.totals.lastFixAt;
      return acc;
    }, emptyTotals());

    // Roll up per-vessel leave exclusions into a single top-level
    // number. UI shows this alongside the totals so the user
    // understands why their sea-time is lower than the raw AIS
    // history suggests.
    let excludedPassageCount = 0;
    let excludedDistanceNm = 0;
    for (const v of vesselResponses) {
      if (v.excludedByLeave) {
        excludedPassageCount += v.excludedByLeave.passageCount;
        excludedDistanceNm += v.excludedByLeave.distanceNm;
      }
    }

    const candidates = computeCandidateMonths(assignments);
    const cachedMonthSet = new Set<string>();
    for (const row of cacheByKey.values()) cachedMonthSet.add(row.month_key);
    // The scrollbar shows candidate months (assignment span) unioned
    // with any cached months (some might sit outside current
    // assignments if the crew had older ones — keep them navigable).
    const availableMonths = Array.from(
      new Set([...candidates.keys, ...cachedMonthSet]),
    ).sort();

    const response: TracksResponse = {
      view: {
        mode: isAllTime ? 'all' : 'month',
        month: requestedMonth,
        isCurrentMonth: requestedMonth === currentMonth,
        availableMonths,
        earliestMonth: availableMonths[0] ?? null,
        latestMonth: availableMonths[availableMonths.length - 1] ?? currentMonth,
      },
      vessels: vesselResponses,
      totals: grandTotals,
      ...(excludedPassageCount > 0
        ? {
            excludedByLeave: {
              passageCount: excludedPassageCount,
              distanceNm: Number(excludedDistanceNm.toFixed(2)),
            },
          }
        : {}),
      datalasticRequestCount: datalasticChunks,
      quotaHit: datalasticChunks >= MAX_DATALASTIC_CHUNKS_PER_REQUEST,
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error('[passages-map/tracks] failed', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load passages' },
      { status: 500 },
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function monthCacheKey(vesselId: string, monthKey: string): string {
  return `${vesselId}|${monthKey}`;
}

function isCacheRowStale(row: MonthCacheRow): boolean {
  if (!row.is_current_month) return false; // Past months are immutable.
  const fetchedMs = Date.parse(row.fetched_at);
  if (!Number.isFinite(fetchedMs)) return true;
  return Date.now() - fetchedMs > ACTIVE_CACHE_TTL_MS;
}

function cacheRowToBucket(row: MonthCacheRow): MonthBucket {
  return {
    monthKey: row.month_key,
    featureCollection:
      (row.track_geojson as MonthBucket['featureCollection']) ??
      ({ type: 'FeatureCollection', features: [] as PassageFeature[] } as MonthBucket['featureCollection']),
    bbox: (row.bbox as [number, number, number, number] | null) ?? null,
    passageCount: row.passage_count,
    totalDistanceNm: Number(row.total_distance_nm),
    pointCount: row.point_count,
    firstFixAt: row.first_fix_at,
    lastFixAt: row.last_fix_at,
  };
}

function emptyBucket(monthKey: string): MonthBucket {
  return {
    monthKey,
    featureCollection: { type: 'FeatureCollection', features: [] },
    bbox: null,
    passageCount: 0,
    totalDistanceNm: 0,
    pointCount: 0,
    firstFixAt: null,
    lastFixAt: null,
  };
}

function collectCachedMonthsForVessel(
  cache: Map<string, MonthCacheRow>,
  vesselId: string,
): MonthCacheRow[] {
  const out: MonthCacheRow[] = [];
  for (const row of cache.values()) {
    if (row.vessel_id === vesselId) out.push(row);
  }
  return out.sort((a, b) => a.month_key.localeCompare(b.month_key));
}

async function loadRecentSampleFixes(
  userId: string,
  vesselIds: string[],
): Promise<Map<string, RawAisFix[]>> {
  const out = new Map<string, RawAisFix[]>();
  if (vesselIds.length === 0) return out;

  const lookbackIso = new Date(
    Date.now() - SAMPLE_EXTEND_LOOKBACK_MS,
  ).toISOString();
  const { data, error } = await supabaseAdmin
    .from('crew_ais_state_samples')
    .select('vessel_id, lat, lon, speed_kn, ais_position_at, sampled_at')
    .eq('user_id', userId)
    .in('vessel_id', vesselIds)
    .gte('sampled_at', lookbackIso)
    .order('sampled_at', { ascending: true });
  if (error) {
    console.warn('[passages-map/tracks] sample extend query failed', error);
    return out;
  }

  for (const row of data ?? []) {
    const lat = Number((row as { lat: unknown }).lat);
    const lon = Number((row as { lon: unknown }).lon);
    const at =
      (row as { ais_position_at?: string | null }).ais_position_at ??
      (row as { sampled_at: string }).sampled_at;
    const timestampMs = Date.parse(at);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(timestampMs)) {
      continue;
    }
    const vesselId = (row as { vessel_id: string }).vessel_id;
    let list = out.get(vesselId);
    if (!list) {
      list = [];
      out.set(vesselId, list);
    }
    const speedRaw = (row as { speed_kn?: unknown }).speed_kn;
    list.push({
      lat,
      lon,
      timestampMs,
      speedKn:
        typeof speedRaw === 'number'
          ? speedRaw
          : typeof speedRaw === 'string' && speedRaw !== ''
            ? Number(speedRaw)
            : null,
    });
  }
  return out;
}

function assembleVesselResponse(
  vessel: VesselRow,
  bucket: Omit<MonthBucket, 'monthKey'> | MonthBucket,
  availableMonths: string[],
  source: VesselResponse['source'],
  leavePeriods: readonly LeavePeriod[] = [],
  recentSamples: readonly RawAisFix[] = [],
  skipReason?: string,
): VesselResponse {
  // Stitch fragments → extend with hourly samples → cut any chords that
  // paint across land (cached bridges from before the land check) →
  // leave filter. Totals/bbox always recomputed off the final FC.
  let working = stitchPassageFeatures(bucket.featureCollection);
  if (recentSamples.length > 0) {
    working = extendPassagesWithSamples(working, recentSamples);
  }
  working = splitFeaturesOnLandCrossings(working);
  const filtered = filterFeaturesByLeavePeriods(working, leavePeriods);

  const usedFc = filtered.featureCollection;
  const usedTotals = aggregateBucketStats(usedFc);
  const usedBbox = bboxOfFeatureCollection(usedFc);

  return {
    vesselId: vessel.id,
    vesselName: vessel.name || 'Unnamed vessel',
    colorHex: vesselColorHex(vessel.id),
    featureCollection: usedFc,
    bbox: usedBbox,
    totals: usedTotals,
    availableMonths: availableMonths.slice().sort(),
    source,
    ...(skipReason ? { skipReason } : {}),
    ...(filtered.excludedCount > 0
      ? {
          excludedByLeave: {
            passageCount: filtered.excludedCount,
            distanceNm: filtered.excludedDistanceNm,
          },
        }
      : {}),
  };
}

/**
 * For each vessel, compute the set of month keys during which the user
 * had at least one assignment on that vessel. Used to decide whether a
 * Datalastic fetch is even sensible for a given (vessel, month).
 */
function collectVesselMonths(
  assignments: AssignmentRow[],
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const today = todayDateKey();
  for (const a of assignments) {
    const startMonth = monthKeyFromIsoUtc(`${a.start_date}T00:00:00Z`);
    // end_date exclusive per the app's convention; use `today` when active.
    const endBoundary = a.end_date ?? today;
    const endMonth = monthKeyFromIsoUtc(`${endBoundary}T00:00:00Z`);
    if (!startMonth || !endMonth) continue;
    let set = out.get(a.vessel_id);
    if (!set) {
      set = new Set<string>();
      out.set(a.vessel_id, set);
    }
    for (let m = startMonth; m <= endMonth; m = addMonthsToKey(m, 1)) {
      set.add(m);
    }
  }
  return out;
}
