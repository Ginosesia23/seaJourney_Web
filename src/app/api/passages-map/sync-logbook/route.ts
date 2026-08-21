import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hasPassagesMapAccess } from '@/supabase/database/subscription-helpers';
import { isFeatureEnabledServer } from '@/lib/feature-flags/server';
import { createPassageLog } from '@/supabase/database/queries';
import { resolvePassageEndpointNames } from '@/lib/passages-map/resolve-endpoint-name';
import { loadAisCandidatesForUser } from '@/lib/passages/ais-cache-candidates';
import {
  buildAisPassageFingerprint,
  endpointsFromLineCoordinates,
  findBestAisMatchForLog,
  findLinkedOrOverlappingPassage,
  passageNeedsAisEnrichment,
  type AisTrackData,
} from '@/lib/passages/ais-logbook-link';
import { timeRangeOverlapsLeave } from '@/lib/passages-map/filter-by-leave-periods';
import { loadCrewLeavePeriodsByVessel } from '@/lib/passages-map/load-crew-leave-periods';
import { resolveLinkedVesselScope } from '@/lib/passages-map/linked-vessel-scope';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function assertPassagesFeatures(
  profile: { role?: string | null },
): Promise<NextResponse | null> {
  const role = String(profile.role || '').toLowerCase();
  const isAdmin = role === 'admin';
  const mapOn = await isFeatureEnabledServer('passages_map', { isAdmin });
  const logOn = await isFeatureEnabledServer('passage_logbook', { isAdmin });
  if (!mapOn || !logOn) {
    return NextResponse.json(
      {
        error:
          'This passages feature is temporarily unavailable.',
      },
      { status: 403 },
    );
  }
  return null;
}

/**
 * POST /api/passages-map/sync-logbook
 *
 * Import AIS Passages Map tracks into the Passage Log Book for the
 * current user. Creates a `passage_logs` row for each cached AIS
 * passage that is not already linked/overlapping. Does not call
 * Datalastic — uses `crew_passage_month_cache` only.
 *
 * Body (optional): { vesselId?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('users')
      .select(
        'id, role, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, active_vessel_id, linked_account_features, managed_by_vessel_id',
      )
      .eq('id', user.id)
      .single();
    if (profileErr || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }
    if (!hasPassagesMapAccess(profile)) {
      return NextResponse.json(
        { error: 'Passages map is not included on your plan' },
        { status: 402 },
      );
    }

    const blocked = await assertPassagesFeatures(profile);
    if (blocked) return blocked;

    const linkedScope = await resolveLinkedVesselScope(
      supabaseAdmin,
      profile,
      'passages_map',
    );
    const cacheUserId = linkedScope?.cacheUserId || user.id;
    const isVesselScoped = Boolean(linkedScope);

    const body = (await req.json().catch(() => ({}))) as {
      vesselId?: string;
    };
    const vesselFilter =
      linkedScope?.vesselId || body.vesselId?.trim() || null;

    const { candidates, monthCount } = await loadAisCandidatesForUser(
      cacheUserId,
    );
    const scoped = vesselFilter
      ? candidates.filter((c) => c.vesselId === vesselFilter)
      : candidates;

    if (monthCount === 0 || scoped.length === 0) {
      return NextResponse.json({
        ok: true,
        createdCount: 0,
        skippedCount: 0,
        aisPassageCount: scoped.length,
        cachedMonthCount: monthCount,
        message:
          monthCount === 0
            ? 'No AIS tracks cached yet. Open Passages Map and load months first.'
            : 'No AIS passages to import for this scope.',
        created: [],
        skipped: [],
      });
    }

    const vesselIds = Array.from(new Set(scoped.map((c) => c.vesselId)));
    const leaveByVessel = isVesselScoped
      ? new Map<string, never[]>()
      : await loadCrewLeavePeriodsByVessel(user.id, vesselIds);

    let existingQuery = supabaseAdmin
      .from('passage_logs')
      .select(
        'id, vessel_id, start_time, end_time, source, ais_fingerprint, track_data',
      );
    existingQuery = isVesselScoped && linkedScope
      ? existingQuery.eq('vessel_id', linkedScope.vesselId)
      : existingQuery.eq('crew_id', user.id);
    const { data: existingRows, error: logErr } = await existingQuery;
    if (logErr) throw logErr;
    const existing = existingRows || [];

    const created: Array<{ passageId: string; fingerprint: string }> = [];
    const skipped: Array<{ fingerprint: string; reason: string }> = [];

    // Process chronologically so overlapping stubs prefer earlier voyages.
    const ordered = [...scoped].sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    for (const ais of ordered) {
      const fingerprint = buildAisPassageFingerprint(
        ais.vesselId,
        ais.startTime,
        ais.endTime,
      );

      if (
        timeRangeOverlapsLeave(
          ais.startTime,
          ais.endTime,
          leaveByVessel.get(ais.vesselId) ?? [],
        )
      ) {
        skipped.push({ fingerprint, reason: 'on_leave' });
        continue;
      }

      const linked = findLinkedOrOverlappingPassage(existing, {
        vesselId: ais.vesselId,
        startTime: ais.startTime,
        endTime: ais.endTime,
        fingerprint,
      });
      if (linked) {
        skipped.push({ fingerprint, reason: 'already_in_logbook' });
        continue;
      }

      const ends = endpointsFromLineCoordinates(ais.coordinates);
      const { departurePort: depPort, arrivalPort: arrPort } =
        await resolvePassageEndpointNames({
          departureLat: ends.departureLat,
          departureLon: ends.departureLon,
          arrivalLat: ends.arrivalLat,
          arrivalLon: ends.arrivalLon,
        });

      const trackData: AisTrackData = {
        aisFingerprint: fingerprint,
        vesselId: ais.vesselId,
        startTime: ais.startTime,
        endTime: ais.endTime,
        distanceNm: ais.distanceNm ?? null,
        avgSpeedKn: ais.avgSpeedKn ?? null,
        maxSpeedKn: ais.maxSpeedKn ?? null,
        pointCount: ais.pointCount ?? null,
        coordinates: ais.coordinates,
      };

      try {
        const row = await createPassageLog(supabase, {
          crewId: user.id,
          vesselId: ais.vesselId,
          startTime: ais.startTime,
          endTime: ais.endTime,
          departurePort: depPort,
          arrivalPort: arrPort,
          departureLat: ends.departureLat ?? undefined,
          departureLon: ends.departureLon ?? undefined,
          arrivalLat: ends.arrivalLat ?? undefined,
          arrivalLon: ends.arrivalLon ?? undefined,
          distanceNm: ais.distanceNm ?? undefined,
          avgSpeedKnots: ais.avgSpeedKn ?? undefined,
          source: 'ais',
          trackData,
          aisFingerprint: fingerprint,
          notes: 'Imported from AIS Passages Map',
        });
        created.push({ passageId: row.id, fingerprint });
        // Keep subsequent overlap checks aware of what we just wrote.
        existing.push({
          id: row.id,
          vessel_id: ais.vesselId,
          start_time: ais.startTime,
          end_time: ais.endTime,
          source: 'ais',
          ais_fingerprint: fingerprint,
          track_data: trackData,
        });
      } catch (err: any) {
        if (err?.code === '23505') {
          skipped.push({ fingerprint, reason: 'already_in_logbook' });
          continue;
        }
        // Missing ais_fingerprint column is the usual setup gap.
        const msg = String(err?.message || err);
        if (msg.includes('ais_fingerprint')) {
          return NextResponse.json(
            {
              error:
                'Database is missing ais_fingerprint. Run sql/add-passage-log-ais-fingerprint.sql in Supabase, then try again.',
            },
            { status: 500 },
          );
        }
        throw err;
      }
    }

    return NextResponse.json({
      ok: true,
      createdCount: created.length,
      skippedCount: skipped.length,
      aisPassageCount: scoped.length,
      cachedMonthCount: monthCount,
      created,
      skipped,
      message:
        created.length > 0
          ? `Imported ${created.length} passage${created.length === 1 ? '' : 's'} into the Passage Log Book.`
          : 'All matching AIS passages are already in your logbook.',
    });
  } catch (error: any) {
    console.error('[passages-map/sync-logbook]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to sync passages to logbook' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/passages-map/sync-logbook
 * Preview how many cached AIS passages are missing from the logbook.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select(
        'id, role, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, linked_account_features, managed_by_vessel_id, active_vessel_id',
      )
      .eq('id', user.id)
      .single();
    if (!profile || !hasPassagesMapAccess(profile)) {
      return NextResponse.json(
        { error: 'Passages map is not included on your plan' },
        { status: 402 },
      );
    }

    const blocked = await assertPassagesFeatures(profile);
    if (blocked) return blocked;

    const linkedScope = await resolveLinkedVesselScope(
      supabaseAdmin,
      profile,
      'passages_map',
    );
    const cacheUserId = linkedScope?.cacheUserId || user.id;
    const isVesselScoped = Boolean(linkedScope);

    const vesselFilter =
      linkedScope?.vesselId ||
      req.nextUrl.searchParams.get('vesselId')?.trim() ||
      null;
    const { candidates, monthCount } = await loadAisCandidatesForUser(
      cacheUserId,
    );
    const scoped = vesselFilter
      ? candidates.filter((c) => c.vesselId === vesselFilter)
      : candidates;

    let existingQuery = supabaseAdmin
      .from('passage_logs')
      .select(
        'id, vessel_id, start_time, end_time, source, ais_fingerprint, track_data, distance_nm, avg_speed_knots, departure_port, arrival_port, departure_lat, arrival_lat',
      );
    existingQuery = isVesselScoped && linkedScope
      ? existingQuery.eq('vessel_id', linkedScope.vesselId)
      : existingQuery.eq('crew_id', user.id);
    const { data: existingRows, error: logErr } = await existingQuery;
    if (logErr) throw logErr;
    const existing = existingRows || [];

    const vesselIds = Array.from(new Set(scoped.map((c) => c.vesselId)));
    const leaveByVessel = isVesselScoped
      ? new Map<string, never[]>()
      : await loadCrewLeavePeriodsByVessel(user.id, vesselIds);

    let missing = 0;
    let alreadyLinked = 0;
    for (const ais of scoped) {
      if (
        timeRangeOverlapsLeave(
          ais.startTime,
          ais.endTime,
          leaveByVessel.get(ais.vesselId) ?? [],
        )
      ) {
        continue;
      }
      const fingerprint = buildAisPassageFingerprint(
        ais.vesselId,
        ais.startTime,
        ais.endTime,
      );
      const linked = findLinkedOrOverlappingPassage(existing, {
        vesselId: ais.vesselId,
        startTime: ais.startTime,
        endTime: ais.endTime,
        fingerprint,
      });
      if (linked) alreadyLinked += 1;
      else missing += 1;
    }

    let enrichableCount = 0;
    for (const log of existing) {
      const found = findBestAisMatchForLog(log, scoped);
      if (!found) continue;
      if (passageNeedsAisEnrichment(log)) enrichableCount += 1;
    }

    return NextResponse.json({
      ok: true,
      aisPassageCount: scoped.length,
      cachedMonthCount: monthCount,
      missingCount: missing,
      alreadyLinkedCount: alreadyLinked,
      enrichableCount,
    });
  } catch (error: any) {
    console.error('[passages-map/sync-logbook GET]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to preview sync' },
      { status: 500 },
    );
  }
}
