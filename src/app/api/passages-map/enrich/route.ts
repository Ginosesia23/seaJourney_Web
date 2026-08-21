import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hasPassagesMapAccess } from '@/supabase/database/subscription-helpers';
import { isFeatureEnabledServer } from '@/lib/feature-flags/server';
import { updatePassageLog } from '@/supabase/database/queries';
import { resolvePassageEndpointNames } from '@/lib/passages-map/resolve-endpoint-name';
import { loadAisCandidatesForUser } from '@/lib/passages/ais-cache-candidates';
import {
  buildEnrichmentPatch,
  endpointsFromLineCoordinates,
  findBestAisMatchForLog,
  passageNeedsAisEnrichment,
  type AisPassageCandidate,
} from '@/lib/passages/ais-logbook-link';
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

async function portHintsFromAis(ais: AisPassageCandidate): Promise<{
  departurePort: string | null;
  arrivalPort: string | null;
}> {
  const ends = endpointsFromLineCoordinates(ais.coordinates);
  const resolved = await resolvePassageEndpointNames({
    departureLat: ends.departureLat,
    departureLon: ends.departureLon,
    arrivalLat: ends.arrivalLat,
    arrivalLon: ends.arrivalLon,
  });
  return {
    departurePort: resolved.departurePort,
    arrivalPort: resolved.arrivalPort,
  };
}

type Proposal = {
  passageId: string;
  vesselId: string;
  status: 'enrichable' | 'matched_complete' | 'no_match';
  method?: 'fingerprint' | 'overlap';
  overlapRatio?: number;
  log: {
    startTime: string;
    endTime: string;
    distanceNm: number | null;
    avgSpeedKnots: number | null;
    departurePort: string | null;
    arrivalPort: string | null;
    source: string | null;
  };
  ais?: {
    startTime: string;
    endTime: string;
    distanceNm: number | null;
    avgSpeedKn: number | null;
    departurePort: string | null;
    arrivalPort: string | null;
  };
  fieldsFilled?: string[];
  proposed?: {
    startTime?: string;
    endTime?: string;
    distanceNm?: number;
    avgSpeedKnots?: number;
    departurePort?: string;
    arrivalPort?: string;
  };
};

async function buildProposals(opts: {
  cacheUserId: string;
  crewId?: string;
  vesselId?: string;
}): Promise<{
  proposals: Proposal[];
  aisPassageCount: number;
  cachedMonthCount: number;
}> {
  const aisBundle = await loadAisCandidatesForUser(opts.cacheUserId);
  const candidates = opts.vesselId
    ? aisBundle.candidates.filter((c) => c.vesselId === opts.vesselId)
    : aisBundle.candidates;

  let logQuery = supabaseAdmin.from('passage_logs').select('*');
  if (opts.vesselId) {
    logQuery = logQuery.eq('vessel_id', opts.vesselId);
  } else if (opts.crewId) {
    logQuery = logQuery.eq('crew_id', opts.crewId);
  }
  const { data: logRows, error: logErr } = await logQuery.order(
    'start_time',
    { ascending: false },
  );
  if (logErr) throw logErr;

  const proposals: Proposal[] = [];
  for (const log of logRows || []) {
    const found = findBestAisMatchForLog(log, candidates);
    if (!found) {
      proposals.push({
        passageId: log.id,
        vesselId: log.vessel_id,
        status: 'no_match',
        log: {
          startTime: log.start_time,
          endTime: log.end_time,
          distanceNm: log.distance_nm,
          avgSpeedKnots: log.avg_speed_knots,
          departurePort: log.departure_port,
          arrivalPort: log.arrival_port,
          source: log.source,
        },
      });
      continue;
    }

    const hints = await portHintsFromAis(found.match);
    const patch = buildEnrichmentPatch(log, found.match, {
      updateTimes: true,
      departurePortHint: hints.departurePort,
      arrivalPortHint: hints.arrivalPort,
    });
    const needs = passageNeedsAisEnrichment(log);

    if (!patch || !needs) {
      proposals.push({
        passageId: log.id,
        vesselId: log.vessel_id,
        status: 'matched_complete',
        method: found.method,
        overlapRatio: found.overlapRatio,
        log: {
          startTime: log.start_time,
          endTime: log.end_time,
          distanceNm: log.distance_nm,
          avgSpeedKnots: log.avg_speed_knots,
          departurePort: log.departure_port,
          arrivalPort: log.arrival_port,
          source: log.source,
        },
        ais: {
          startTime: found.match.startTime,
          endTime: found.match.endTime,
          distanceNm: found.match.distanceNm ?? null,
          avgSpeedKn: found.match.avgSpeedKn ?? null,
          departurePort: hints.departurePort,
          arrivalPort: hints.arrivalPort,
        },
      });
      continue;
    }

    proposals.push({
      passageId: log.id,
      vesselId: log.vessel_id,
      status: 'enrichable',
      method: found.method,
      overlapRatio: found.overlapRatio,
      log: {
        startTime: log.start_time,
        endTime: log.end_time,
        distanceNm: log.distance_nm,
        avgSpeedKnots: log.avg_speed_knots,
        departurePort: log.departure_port,
        arrivalPort: log.arrival_port,
        source: log.source,
      },
      ais: {
        startTime: found.match.startTime,
        endTime: found.match.endTime,
        distanceNm: found.match.distanceNm ?? null,
        avgSpeedKn: found.match.avgSpeedKn ?? null,
        departurePort: hints.departurePort,
        arrivalPort: hints.arrivalPort,
      },
      fieldsFilled: patch.fieldsFilled,
      proposed: {
        startTime: patch.startTime,
        endTime: patch.endTime,
        distanceNm: patch.distanceNm,
        avgSpeedKnots: patch.avgSpeedKnots,
        departurePort: patch.departurePort,
        arrivalPort: patch.arrivalPort,
      },
    });
  }

  return {
    proposals,
    aisPassageCount: candidates.length,
    cachedMonthCount: aisBundle.monthCount,
  };
}

async function requireMapUser(req: NextRequest): Promise<
  | {
      user: { id: string };
      supabase: any;
      profile: Record<string, unknown>;
      error?: undefined;
    }
  | { error: NextResponse }
> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
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
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('users')
    .select(
      'id, role, subscription_tier, subscription_status, cancel_at_period_end, current_period_end, active_vessel_id, linked_account_features, managed_by_vessel_id',
    )
    .eq('id', user.id)
    .single();
  if (profileErr || !profile) {
    return { error: NextResponse.json({ error: 'Profile not found' }, { status: 404 }) };
  }
  if (!hasPassagesMapAccess(profile)) {
    return {
      error: NextResponse.json(
        { error: 'Passages map is not included on your plan' },
        { status: 402 },
      ),
    };
  }
  const blocked = await assertMapAndLogbookFlags(profile);
  if (blocked) return { error: blocked };
  return { user, supabase, profile };
}

/**
 * GET /api/passages-map/enrich
 * Dry-run: match logbook rows to cached AIS passages and propose fills.
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireMapUser(req);
    if (gate.error) return gate.error;
    const { user, profile } = gate;
    const linkedScope = await resolveLinkedVesselScope(
      supabaseAdmin,
      profile,
      'passages_map',
    );
    const result = await buildProposals(
      linkedScope
        ? {
            cacheUserId: linkedScope.cacheUserId || user.id,
            vesselId: linkedScope.vesselId,
          }
        : { cacheUserId: user.id, crewId: user.id },
    );
    const enrichable = result.proposals.filter((p) => p.status === 'enrichable');
    const matched = result.proposals.filter((p) => p.status === 'matched_complete');
    const unmatched = result.proposals.filter((p) => p.status === 'no_match');

    return NextResponse.json({
      ok: true,
      aisPassageCount: result.aisPassageCount,
      cachedMonthCount: result.cachedMonthCount,
      summary: {
        total: result.proposals.length,
        enrichable: enrichable.length,
        matchedComplete: matched.length,
        noMatch: unmatched.length,
      },
      proposals: result.proposals,
    });
  } catch (error: any) {
    console.error('[passages-map/enrich GET]', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to match passages' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/passages-map/enrich
 * Apply AIS enrichment to selected (or all enrichable) logbook rows.
 *
 * Body: { passageIds?: string[], updateTimes?: boolean, overwriteDistance?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireMapUser(req);
    if (gate.error) return gate.error;
    const { user, supabase, profile } = gate;

    const body = (await req.json().catch(() => ({}))) as {
      passageIds?: string[];
      updateTimes?: boolean;
      overwriteDistance?: boolean;
      overwritePorts?: boolean;
    };

    const linkedScope = await resolveLinkedVesselScope(
      supabaseAdmin,
      profile,
      'passages_map',
    );
    const cacheUserId = linkedScope?.cacheUserId || user.id;
    const { candidates: allCandidates } = await loadAisCandidatesForUser(
      cacheUserId,
    );
    const candidates = linkedScope
      ? allCandidates.filter((c) => c.vesselId === linkedScope.vesselId)
      : allCandidates;

    let logQuery = supabaseAdmin.from('passage_logs').select('*');
    logQuery = linkedScope
      ? logQuery.eq('vessel_id', linkedScope.vesselId)
      : logQuery.eq('crew_id', user.id);
    const { data: logRows, error: logErr } = await logQuery;
    if (logErr) throw logErr;

    const db = linkedScope ? supabaseAdmin : supabase;

    const idFilter =
      Array.isArray(body.passageIds) && body.passageIds.length > 0
        ? new Set(body.passageIds)
        : null;

    const updated: Array<{ passageId: string; fieldsFilled: string[] }> = [];
    const skipped: Array<{ passageId: string; reason: string }> = [];

    for (const log of logRows || []) {
      if (idFilter && !idFilter.has(log.id)) continue;

      const found = findBestAisMatchForLog(log, candidates);
      if (!found) {
        skipped.push({ passageId: log.id, reason: 'no_ais_match' });
        continue;
      }

      const hints = await portHintsFromAis(found.match);
      const patch = buildEnrichmentPatch(log, found.match, {
        updateTimes: body.updateTimes !== false,
        overwriteDistance: body.overwriteDistance === true,
        overwritePorts: body.overwritePorts === true,
        departurePortHint: hints.departurePort,
        arrivalPortHint: hints.arrivalPort,
      });
      if (!patch) {
        skipped.push({ passageId: log.id, reason: 'nothing_to_fill' });
        continue;
      }

      await updatePassageLog(db, log.id, {
        startTime: patch.startTime,
        endTime: patch.endTime,
        distanceNm: patch.distanceNm,
        avgSpeedKnots: patch.avgSpeedKnots,
        departurePort: patch.departurePort,
        arrivalPort: patch.arrivalPort,
        departureLat: patch.departureLat,
        departureLon: patch.departureLon,
        arrivalLat: patch.arrivalLat,
        arrivalLon: patch.arrivalLon,
        aisFingerprint: patch.aisFingerprint,
        trackData: patch.trackData,
        source: patch.source,
      });
      updated.push({ passageId: log.id, fieldsFilled: patch.fieldsFilled });
    }

    return NextResponse.json({
      ok: true,
      updatedCount: updated.length,
      skippedCount: skipped.length,
      updated,
      skipped,
    });
  } catch (error: any) {
    console.error('[passages-map/enrich POST]', error);
    if (error?.code === '23505') {
      return NextResponse.json(
        {
          error:
            'This AIS voyage is already linked to another logbook entry. Resolve the duplicate first.',
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to enrich passages' },
      { status: 500 },
    );
  }
}
