import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hasPassagesMapAccess } from '@/supabase/database/subscription-helpers';
import { getCrewVesselFeatureBoost } from '@/lib/crew-vessel-feature-boost.server';
import { isFeatureEnabledServer } from '@/lib/feature-flags/server';
import { createPassageLog, getPassageLogs, getPassageLogsByVessel, updatePassageLog } from '@/supabase/database/queries';
import { resolvePassageEndpointNames } from '@/lib/passages-map/resolve-endpoint-name';
import {
  buildAisPassageFingerprint,
  endpointsFromLineCoordinates,
  findLinkedOrOverlappingPassage,
  isAisSourcedPassage,
  type AisTrackData,
} from '@/lib/passages/ais-logbook-link';
import { timeRangeOverlapsLeave } from '@/lib/passages-map/filter-by-leave-periods';
import { loadCrewLeavePeriodsByVessel } from '@/lib/passages-map/load-crew-leave-periods';
import { resolveLinkedVesselScope } from '@/lib/passages-map/linked-vessel-scope';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function assertMapAndLogbookFlags(profile: {
  role?: string | null;
}): Promise<NextResponse | null> {
  const isAdmin = String(profile.role || '').toLowerCase() === 'admin';
  const mapOn = await isFeatureEnabledServer('passages_map', { isAdmin });
  const logOn = await isFeatureEnabledServer('passage_logbook', { isAdmin });
  if (!mapOn || !logOn) {
    return NextResponse.json(
      { error: 'This passages feature is temporarily unavailable.' },
      { status: 403 },
    );
  }
  return null;
}

type PromoteBody = {
  vesselId: string;
  startTime: string;
  endTime: string;
  distanceNm?: number | null;
  avgSpeedKn?: number | null;
  maxSpeedKn?: number | null;
  pointCount?: number | null;
  coordinates?: [number, number][];
  departurePort?: string | null;
  arrivalPort?: string | null;
};

/**
 * POST /api/passages-map/promote
 * Promote an AIS map passage into the Passage Log Book (or return the
 * existing linked/overlapping row). Requires Passages Map access.
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
    const vesselBoost = await getCrewVesselFeatureBoost(user.id);
    if (!hasPassagesMapAccess(profile, vesselBoost)) {
      return NextResponse.json(
        { error: 'Passages map is not included on your plan' },
        { status: 402 },
      );
    }

    const blocked = await assertMapAndLogbookFlags(profile);
    if (blocked) return blocked;

    const body = (await req.json()) as PromoteBody;
    const vesselId = body.vesselId?.trim();
    const startTime = body.startTime?.trim();
    const endTime = body.endTime?.trim();
    if (!vesselId || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'vesselId, startTime, and endTime are required' },
        { status: 400 },
      );
    }
    if (new Date(endTime).getTime() < new Date(startTime).getTime()) {
      return NextResponse.json(
        { error: 'endTime must be after startTime' },
        { status: 400 },
      );
    }

    // Scope check: crew assignment, managed vessel, or granted linked account
    const role = String(profile.role || '').toLowerCase();
    const linkedScope = await resolveLinkedVesselScope(
      supabaseAdmin,
      profile,
      'passages_map',
    );
    const isVesselScoped = role === 'vessel' || Boolean(linkedScope);

    if (linkedScope) {
      if (linkedScope.vesselId !== vesselId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else if (role === 'vessel') {
      const { data: vessel } = await supabaseAdmin
        .from('vessels')
        .select('id, vessel_manager_id')
        .eq('id', vesselId)
        .maybeSingle();
      const manages =
        vessel?.vessel_manager_id === user.id ||
        profile.active_vessel_id === vesselId;
      if (!manages) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else if (role !== 'admin') {
      const { data: assignment } = await supabaseAdmin
        .from('vessel_assignments')
        .select('id')
        .eq('user_id', user.id)
        .eq('vessel_id', vesselId)
        .limit(1)
        .maybeSingle();
      if (!assignment) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const fingerprint = buildAisPassageFingerprint(vesselId, startTime, endTime);
    const existingLogs = isVesselScoped
      ? await getPassageLogsByVessel(supabaseAdmin, vesselId)
      : await getPassageLogs(supabase, user.id);
    const linked = findLinkedOrOverlappingPassage(existingLogs, {
      vesselId,
      startTime,
      endTime,
      fingerprint,
    });

    // Crew accounts: refuse to create a NEW logbook row for a passage
    // that overlaps leave (vessel accounts own the vessel track).
    if (!linked && !isVesselScoped && role !== 'admin') {
      const leaveByVessel = await loadCrewLeavePeriodsByVessel(user.id, [
        vesselId,
      ]);
      if (
        timeRangeOverlapsLeave(
          startTime,
          endTime,
          leaveByVessel.get(vesselId) ?? [],
        )
      ) {
        return NextResponse.json(
          {
            error:
              'This passage overlaps a leave period — it was not added to your logbook.',
            onLeave: true,
          },
          { status: 409 },
        );
      }
    }

    const coords = Array.isArray(body.coordinates)
      ? body.coordinates.filter(
          (c): c is [number, number] =>
            Array.isArray(c) &&
            c.length >= 2 &&
            typeof c[0] === 'number' &&
            typeof c[1] === 'number',
        )
      : [];

    const trackData: AisTrackData = {
      aisFingerprint: fingerprint,
      vesselId,
      startTime,
      endTime,
      distanceNm: body.distanceNm ?? null,
      avgSpeedKn: body.avgSpeedKn ?? null,
      maxSpeedKn: body.maxSpeedKn ?? null,
      pointCount: body.pointCount ?? null,
      coordinates: coords.length >= 2 ? coords : undefined,
    };

    if (linked) {
      // Stamp fingerprint + track snapshot so Map Log badges survive refresh
      // even when the match was time-overlap only.
      const needsFingerprint = linked.ais_fingerprint !== fingerprint;
      const needsSource =
        !isAisSourcedPassage(linked.source) &&
        String(linked.source || '').toLowerCase() !== 'ais_assisted';
      if (needsFingerprint || needsSource || !linked.ais_fingerprint) {
        try {
          await updatePassageLog(isVesselScoped ? supabaseAdmin : supabase, linked.id, {
            aisFingerprint: fingerprint,
            trackData,
            ...(needsSource || !isAisSourcedPassage(linked.source)
              ? { source: 'ais_assisted' }
              : {}),
          });
        } catch (stampErr) {
          console.warn(
            '[passages-map/promote] could not stamp fingerprint on overlap',
            stampErr,
          );
        }
      }
      return NextResponse.json({
        ok: true,
        alreadyLinked: true,
        passageId: linked.id,
        fingerprint,
        stamped: true,
      });
    }

    const ends = endpointsFromLineCoordinates(coords);
    const resolved = await resolvePassageEndpointNames({
      departureLat: ends.departureLat,
      departureLon: ends.departureLon,
      arrivalLat: ends.arrivalLat,
      arrivalLon: ends.arrivalLon,
    });
    const depPort = body.departurePort?.trim() || resolved.departurePort;
    const arrPort = body.arrivalPort?.trim() || resolved.arrivalPort;

    const created = await createPassageLog(supabase, {
      crewId: user.id,
      vesselId,
      startTime,
      endTime,
      departurePort: depPort,
      arrivalPort: arrPort,
      departureLat: ends.departureLat ?? undefined,
      departureLon: ends.departureLon ?? undefined,
      arrivalLat: ends.arrivalLat ?? undefined,
      arrivalLon: ends.arrivalLon ?? undefined,
      distanceNm: body.distanceNm ?? undefined,
      avgSpeedKnots: body.avgSpeedKn ?? undefined,
      source: 'ais',
      trackData,
      aisFingerprint: fingerprint,
      notes: 'Promoted from AIS passage track',
    });

    return NextResponse.json({
      ok: true,
      alreadyLinked: false,
      passageId: created.id,
      fingerprint,
    });
  } catch (error: any) {
    console.error('[passages-map/promote]', error);
    // Unique fingerprint race
    if (error?.code === '23505') {
      return NextResponse.json({
        ok: true,
        alreadyLinked: true,
        error: 'Already in logbook',
      });
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to promote passage' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/passages-map/promote?vesselId=…
 * Returns AIS fingerprints already in the caller's logbook for a vessel
 * (or all vessels if omitted).
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
        'id, role, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, active_vessel_id, linked_account_features, managed_by_vessel_id',
      )
      .eq('id', user.id)
      .maybeSingle();
    const vesselBoost = await getCrewVesselFeatureBoost(user.id);
    if (!profile || !hasPassagesMapAccess(profile, vesselBoost)) {
      return NextResponse.json(
        { error: 'Passages map is not included on your plan' },
        { status: 402 },
      );
    }

    const linkedScope = await resolveLinkedVesselScope(
      supabaseAdmin,
      profile,
      'passages_map',
    );
    const vesselId = req.nextUrl.searchParams.get('vesselId')?.trim() || null;
    if (linkedScope && vesselId && vesselId !== linkedScope.vesselId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let query = supabaseAdmin
      .from('passage_logs')
      .select('id, vessel_id, start_time, end_time, source, ais_fingerprint, track_data');
    if (linkedScope) {
      query = query.eq('vessel_id', linkedScope.vesselId);
    } else {
      query = query.eq('crew_id', user.id);
      if (vesselId) query = query.eq('vessel_id', vesselId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const fingerprints: string[] = [];
    const links: Array<{
      passageId: string;
      vesselId: string;
      fingerprint: string | null;
      startTime: string;
      endTime: string;
      source: string | null;
    }> = [];

    for (const row of data || []) {
      const fp =
        row.ais_fingerprint ||
        (row.track_data as AisTrackData | null)?.aisFingerprint ||
        null;
      if (fp) fingerprints.push(fp);
      links.push({
        passageId: row.id,
        vesselId: row.vessel_id,
        fingerprint: fp,
        startTime: row.start_time,
        endTime: row.end_time,
        source: row.source,
      });
    }

    return NextResponse.json({ fingerprints, links });
  } catch (error: any) {
    console.error('[passages-map/promote GET]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to load links' },
      { status: 500 },
    );
  }
}
