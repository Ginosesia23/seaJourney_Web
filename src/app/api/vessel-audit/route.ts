import { NextRequest, NextResponse } from 'next/server';

import {
  AIS_TRIGGER_SOURCES,
  normalizeAisTriggerSource,
  type AisProviderEndpoint,
  type AisTriggerSource,
} from '@/lib/ais/fetch-audit-shared';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { expectedDaysInRange, parsePeriod, vesselAuditPeriodRange } from '@/lib/vessel-audit/period';
import type { DailyStatus } from '@/lib/types';
import type {
  VesselAuditDayRow,
  VesselAuditDocumentRow,
  VesselAuditFetchRow,
  VesselAuditObservationRow,
  VesselAuditOverview,
  VesselAuditPassageRow,
  VesselAuditSection,
  VesselAuditStateLogRow,
  VesselAuditWatchRow,
} from '@/lib/vessel-audit/types';
import { createSupabaseServerClient } from '@/supabase/server';
import { normalizeStateLogDate } from '@/supabase/database/queries';

const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;

const FETCH_COLUMNS =
  'id, vessel_id, provider, endpoint, mmsi, requested_at, completed_at, success, response_status, response_time_ms, error_message, provider_credits_used, trigger_source, trigger_detail, tracking_mode, scheduled_reason, provider_called, cached_or_api';

function emptyCounts(): Record<DailyStatus, number> {
  return {
    underway: 0,
    'at-anchor': 0,
    'in-port': 0,
    'in-yard': 0,
    'on-leave': 0,
  };
}

function str(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function displayName(profile: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}) {
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
  return name || profile.email || 'Crew member';
}

async function authenticate(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  let userId: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);
    if (!error && user) userId = user.id;
  }
  if (!userId) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    userId = session?.user?.id ?? null;
  }
  return userId;
}

async function assertVesselAccess(userId: string, vesselId: string) {
  const { data: vessel } = await supabaseAdmin
    .from('vessels')
    .select('id, vessel_manager_id')
    .eq('id', vesselId)
    .maybeSingle();
  if (!vessel) return { ok: false as const, status: 404, error: 'Vessel not found' };

  if (vessel.vessel_manager_id === userId) return { ok: true as const, vessel };

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('role, active_vessel_id, managed_by_vessel_id, subscription_tier')
    .eq('id', userId)
    .maybeSingle();

  const role = (profile?.role || '').toString().toLowerCase();
  if (role === 'admin') return { ok: true as const, vessel };
  if (role === 'vessel' && profile?.active_vessel_id === vesselId) {
    return { ok: true as const, vessel };
  }
  if (
    profile?.subscription_tier === 'vessel_linked' &&
    (profile.managed_by_vessel_id === vesselId || profile.active_vessel_id === vesselId)
  ) {
    return { ok: true as const, vessel };
  }

  return { ok: false as const, status: 403, error: 'You do not have access to this vessel audit' };
}

function parseEndpoint(value: unknown): AisProviderEndpoint | null {
  if (value === 'vessel' || value === 'vessel_history' || value === 'vessel_info' || value === 'vessel_find') {
    return value;
  }
  return null;
}

function mapFetch(row: Record<string, unknown>, observation: VesselAuditFetchRow['observation']): VesselAuditFetchRow {
  const trigger = normalizeAisTriggerSource(str(row.trigger_source));
  const safeTrigger: AisTriggerSource = (AIS_TRIGGER_SOURCES as readonly string[]).includes(trigger)
    ? trigger
    : 'unknown';
  return {
    id: String(row.id),
    requestedAt: String(row.requested_at),
    completedAt: str(row.completed_at),
    success: Boolean(row.success),
    httpStatus: num(row.response_status),
    responseTimeMs: num(row.response_time_ms),
    endpoint: parseEndpoint(row.endpoint),
    triggerSource: safeTrigger,
    triggerDetail: str(row.trigger_detail),
    trackingMode: str(row.tracking_mode),
    scheduledReason: str(row.scheduled_reason),
    errorMessage: str(row.error_message),
    providerCalled: row.provider_called == null ? true : Boolean(row.provider_called),
    providerCreditsUsed: num(row.provider_credits_used),
    observation,
  };
}

async function loadObservationsForFetches(
  vesselId: string,
  fetches: Array<{ id: string; requestedAt: string; success: boolean; endpoint: AisProviderEndpoint | null }>,
) {
  const map = new Map<string, VesselAuditFetchRow['observation']>();
  const liveFetches = fetches.filter(
    (f) => f.success && (f.endpoint ?? 'vessel') === 'vessel',
  );
  await Promise.all(
    liveFetches.map(async (fetch) => {
      const windowEnd = new Date(Date.parse(fetch.requestedAt) + 2 * 60_000).toISOString();
      const { data } = await supabaseAdmin
        .from('ais_observations')
        .select(
          'id, fetched_at, provider_timestamp, seajourney_state, speed_kn, course, heading, latitude, longitude, raw_navigation_status',
        )
        .eq('vessel_id', vesselId)
        .gte('fetched_at', fetch.requestedAt)
        .lte('fetched_at', windowEnd)
        .order('fetched_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!data) return;
      const o = data as Record<string, unknown>;
      map.set(fetch.id, {
        id: String(o.id),
        fetchedAt: String(o.fetched_at),
        state: str(o.seajourney_state),
        speedKn: num(o.speed_kn),
        course: num(o.course),
        heading: num(o.heading),
        latitude: num(o.latitude),
        longitude: num(o.longitude),
        navStatus: str(o.raw_navigation_status),
        providerTimestamp: str(o.provider_timestamp),
      });
    }),
  );
  return map;
}

export async function GET(req: NextRequest) {
  try {
    const userId = await authenticate(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const vesselId = req.nextUrl.searchParams.get('vesselId');
    if (!vesselId) {
      return NextResponse.json({ error: 'Missing vesselId' }, { status: 400 });
    }

    const access = await assertVesselAccess(userId, vesselId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const period = parsePeriod(req.nextUrl.searchParams.get('period'));
    const section = (req.nextUrl.searchParams.get('section') || 'overview') as VesselAuditSection;
    const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || 1) || 1);
    const pageSize = Math.min(
      PAGE_SIZE_MAX,
      Math.max(1, Number(req.nextUrl.searchParams.get('pageSize') || PAGE_SIZE_DEFAULT) || PAGE_SIZE_DEFAULT),
    );
    const { from, to, fromIso, toIso } = vesselAuditPeriodRange(period);
    const fromTs = fromIso ? `${fromIso}T00:00:00.000Z` : null;
    const toTsExclusive = new Date(Date.parse(`${toIso}T00:00:00.000Z`) + 86_400_000).toISOString();

    if (section === 'overview') {
      const [
        vesselRes,
        statusRes,
        assignmentsRes,
        logsRes,
        fetchesCount,
        observationsCount,
        daysCount,
        passagesCount,
        watchesCount,
        vgCount,
        posCount,
        testimonialsRes,
      ] = await Promise.all([
        supabaseAdmin.from('vessels').select('*').eq('id', vesselId).maybeSingle(),
        supabaseAdmin.from('vessel_ais_status').select('*').eq('vessel_id', vesselId).maybeSingle(),
        supabaseAdmin
          .from('vessel_assignments')
          .select('user_id, position, onboard, start_date, end_date')
          .eq('vessel_id', vesselId)
          .is('end_date', null)
          .order('start_date', { ascending: false }),
        supabaseAdmin
          .from('daily_state_logs')
          .select('date, state')
          .eq('vessel_id', vesselId),
        (() => {
          let q = supabaseAdmin
            .from('ais_fetch_log')
            .select('id', { count: 'exact', head: true })
            .eq('vessel_id', vesselId)
            .eq('cached_or_api', 'api')
            .lt('requested_at', toTsExclusive);
          if (fromTs) q = q.gte('requested_at', fromTs);
          return q;
        })(),
        (() => {
          let q = supabaseAdmin
            .from('ais_observations')
            .select('id', { count: 'exact', head: true })
            .eq('vessel_id', vesselId)
            .lt('fetched_at', toTsExclusive);
          if (fromTs) q = q.gte('fetched_at', fromTs);
          return q;
        })(),
        (() => {
          let q = supabaseAdmin
            .from('vessel_daily_ais_summary')
            .select('date', { count: 'exact', head: true })
            .eq('vessel_id', vesselId)
            .lte('date', toIso);
          if (fromIso) q = q.gte('date', fromIso);
          return q;
        })(),
        (async () => {
          let q = supabaseAdmin
            .from('passage_logs')
            .select('id', { count: 'exact', head: true })
            .eq('vessel_id', vesselId)
            .is('ais_dismissed_at', null)
            .lt('start_time', toTsExclusive);
          if (fromTs) q = q.gte('start_time', fromTs);
          const first = await q;
          if (!first.error) return first;
          let fallback = supabaseAdmin
            .from('passage_logs')
            .select('id', { count: 'exact', head: true })
            .eq('vessel_id', vesselId)
            .lt('start_time', toTsExclusive);
          if (fromTs) fallback = fallback.gte('start_time', fromTs);
          return fallback;
        })(),
        (() => {
          let q = supabaseAdmin
            .from('nav_watch_logs')
            .select('id', { count: 'exact', head: true })
            .eq('vessel_id', vesselId)
            .lt('start_time', toTsExclusive);
          if (fromTs) q = q.gte('start_time', fromTs);
          return q;
        })(),
        (() => {
          let q = supabaseAdmin
            .from('vessel_generated_testimonials')
            .select('id', { count: 'exact', head: true })
            .eq('vessel_id', vesselId)
            .lt('created_at', toTsExclusive);
          if (fromTs) q = q.gte('created_at', fromTs);
          return q;
        })(),
        (() => {
          let q = supabaseAdmin
            .from('proof_of_service')
            .select('id', { count: 'exact', head: true })
            .eq('vessel_id', vesselId)
            .eq('data_source', 'vessel')
            .lt('created_at', toTsExclusive);
          if (fromTs) q = q.gte('created_at', fromTs);
          return q;
        })(),
        (() => {
          let q = supabaseAdmin
            .from('testimonials')
            .select('id, status')
            .eq('vessel_id', vesselId)
            .lt('created_at', toTsExclusive);
          if (fromTs) q = q.gte('created_at', fromTs);
          return q;
        })(),
      ]);

      if (vesselRes.error || !vesselRes.data) {
        return NextResponse.json({ error: 'Vessel not found' }, { status: 404 });
      }

      const v = vesselRes.data as Record<string, unknown>;
      const vessel: VesselAuditOverview['vessel'] = {
        id: String(v.id),
        name: String(v.name || 'Vessel'),
        type: String(v.type || ''),
        officialNumber: str(v.official_number),
        imo: str(v.imo),
        flag: str(v.flag),
        mmsi: str(v.mmsi),
        callSign: str(v.call_sign),
        grossTonnage: num(v.gross_tonnage),
        managementCompany: str(v.management_company),
        hasStamp: Boolean(v.stamp),
        aisTrackingEnabled: Boolean(v.ais_tracking_enabled),
        aisLastSyncAt: str(v.ais_last_sync_at),
        aisLastNavStatus: str(v.ais_last_nav_status),
        aisLastSpeed: num(v.ais_last_speed),
        aisLastPositionAt: str(v.ais_last_position_at),
        aisLastSyncError: str(v.ais_last_sync_error),
      };

      const statusRow = statusRes.data as Record<string, unknown> | null;
      const aisStatus = statusRow
        ? {
            state: str(statusRow.seajourney_state),
            speedKn: num(statusRow.speed_kn),
            course: num(statusRow.course),
            heading: num(statusRow.heading),
            latitude: num(statusRow.latitude),
            longitude: num(statusRow.longitude),
            navStatus: str(statusRow.raw_navigation_status),
            fetchedAt: str(statusRow.fetched_at),
            providerTimestamp: str(statusRow.provider_timestamp),
            trackingMode: str(statusRow.ais_tracking_mode),
            nextCheckAt: str(statusRow.next_ais_check_at),
            lastSuccessfulFetchAt: str(statusRow.last_successful_fetch_at),
            consecutiveFailures: num(statusRow.consecutive_fetch_failures) ?? 0,
            refreshError: str(statusRow.refresh_error),
          }
        : null;

      const assignments = assignmentsRes.data || [];
      const userIds = assignments.map((a: { user_id: string }) => a.user_id);
      let profiles: Array<{
        id: string;
        first_name?: string | null;
        last_name?: string | null;
        email?: string | null;
        role?: string | null;
      }> = [];
      if (userIds.length > 0) {
        const { data } = await supabaseAdmin
          .from('users')
          .select('id, first_name, last_name, email, role')
          .in('id', userIds);
        profiles = data || [];
      }
      const profileMap = new Map(profiles.map((p) => [p.id, p]));
      const crew = assignments
        .filter((a: { user_id: string }) => profileMap.get(a.user_id)?.role !== 'vessel')
        .map((a: {
          user_id: string;
          position: string | null;
          onboard: boolean | null;
          start_date: string;
        }) => {
          const profile = profileMap.get(a.user_id);
          return {
            userId: a.user_id,
            name: profile ? displayName(profile) : 'Crew member',
            email: profile?.email || null,
            position: a.position,
            onboard: Boolean(a.onboard),
            startDate: a.start_date,
          };
        });

      const byDate = new Map<string, DailyStatus>();
      for (const row of logsRes.data || []) {
        const date = normalizeStateLogDate((row as { date?: unknown }).date);
        if (!date) continue;
        if (fromIso && date < fromIso) continue;
        if (date > toIso) continue;
        byDate.set(date, (row as { state: DailyStatus }).state);
      }
      const stateCounts = emptyCounts();
      byDate.forEach((state) => {
        stateCounts[state] = (stateCounts[state] || 0) + 1;
      });
      const sortedDates = [...byDate.keys()].sort();
      const loggedDays = byDate.size;
      const expectedDays = expectedDaysInRange(from, to, sortedDates[0] ?? null);
      const missingDays = Math.max(0, expectedDays - loggedDays);
      const lastLoggedDate = sortedDates.at(-1) ?? null;
      const onboardCount = crew.filter((c) => c.onboard).length;
      const testimonials = testimonialsRes.data || [];
      const pendingTestimonials = testimonials.filter(
        (t: { status: string }) =>
          t.status === 'pending_captain' || t.status === 'pending_official',
      ).length;
      const approvedTestimonials = testimonials.filter(
        (t: { status: string }) => t.status === 'approved',
      ).length;

      const overview: VesselAuditOverview = {
        vessel,
        aisStatus,
        period: { from: fromIso, to: toIso },
        crew,
        stateCounts,
        loggedDays,
        expectedDays,
        missingDays,
        lastLoggedDate,
        counts: {
          fetches: fetchesCount.count || 0,
          observations: observationsCount.count || 0,
          aisDays: daysCount.count || 0,
          passages: passagesCount.count || 0,
          watches: watchesCount.count || 0,
          vesselGeneratedDocs: vgCount.count || 0,
          proofOfService: posCount.count || 0,
          pendingTestimonials,
          approvedTestimonials,
        },
        readiness: [
          { id: 'name', ok: Boolean(vessel.name), label: 'Vessel name on file' },
          {
            id: 'id',
            ok: Boolean(vessel.imo || vessel.officialNumber || vessel.mmsi),
            label: 'Identification number',
            hint: 'IMO, official number, or MMSI',
          },
          { id: 'flag', ok: Boolean(vessel.flag), label: 'Flag state recorded' },
          {
            id: 'stamp',
            ok: vessel.hasStamp,
            label: 'Ship stamp uploaded',
            hint: 'Used on testimonials and proof of service',
          },
          {
            id: 'crew',
            ok: crew.length > 0,
            label: 'Active crew assignments',
            hint: `${crew.length} assigned · ${onboardCount} onboard`,
          },
          {
            id: 'sea-time',
            ok: loggedDays > 0,
            label: 'Sea-time days logged in period',
            hint:
              missingDays > 0
                ? `${missingDays} day${missingDays === 1 ? '' : 's'} without a state`
                : 'No gaps in this period',
          },
          {
            id: 'docs',
            ok:
              (vgCount.count || 0) +
                (posCount.count || 0) +
                approvedTestimonials >
              0,
            label: 'Supporting documents issued',
            hint: 'Testimonials or proof of service in archive',
          },
          {
            id: 'ais',
            ok: !vessel.aisTrackingEnabled || (observationsCount.count || 0) > 0,
            label: vessel.aisTrackingEnabled
              ? 'AIS observations stored'
              : 'AIS tracking optional',
            hint: vessel.aisTrackingEnabled
              ? `${observationsCount.count || 0} stored fixes in period`
              : 'Tracking is off — manual logs only',
          },
        ],
      };

      return NextResponse.json({ section: 'overview', data: overview });
    }

    const offset = (page - 1) * pageSize;

    if (section === 'ais-fetches') {
      let query = supabaseAdmin
        .from('ais_fetch_log')
        .select(FETCH_COLUMNS, { count: 'exact' })
        .eq('vessel_id', vesselId)
        .eq('cached_or_api', 'api')
        .lt('requested_at', toTsExclusive);
      if (fromTs) query = query.gte('requested_at', fromTs);
      const { data, error, count } = await query
        .order('requested_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;

      const rawRows = (data || []) as Record<string, unknown>[];
      const mappedBase = rawRows.map((row) =>
        mapFetch(row, null),
      );
      const obsMap = await loadObservationsForFetches(
        vesselId,
        mappedBase.map((r) => ({
          id: r.id,
          requestedAt: r.requestedAt,
          success: r.success,
          endpoint: r.endpoint,
        })),
      );
      const rows: VesselAuditFetchRow[] = mappedBase.map((row) => ({
        ...row,
        observation: obsMap.get(row.id) ?? null,
      }));

      return NextResponse.json({
        section,
        data: { rows, total: count || 0, page, pageSize },
      });
    }

    if (section === 'ais-observations') {
      let query = supabaseAdmin
        .from('ais_observations')
        .select(
          'id, fetched_at, provider_timestamp, seajourney_state, speed_kn, course, heading, latitude, longitude, raw_navigation_status',
          { count: 'exact' },
        )
        .eq('vessel_id', vesselId)
        .lt('fetched_at', toTsExclusive);
      if (fromTs) query = query.gte('fetched_at', fromTs);
      const { data, error, count } = await query
        .order('fetched_at', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const rows: VesselAuditObservationRow[] = (data || []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id),
          fetchedAt: String(r.fetched_at),
          providerTimestamp: str(r.provider_timestamp),
          state: String(r.seajourney_state || '—'),
          speedKn: num(r.speed_kn),
          course: num(r.course),
          heading: num(r.heading),
          latitude: num(r.latitude),
          longitude: num(r.longitude),
          navStatus: str(r.raw_navigation_status),
        };
      });
      return NextResponse.json({
        section,
        data: { rows, total: count || 0, page, pageSize },
      });
    }

    if (section === 'ais-days') {
      let query = supabaseAdmin
        .from('vessel_daily_ais_summary')
        .select(
          'date, qualifying_daily_state, current_state, observation_count, distance_nm, underway_seconds, anchor_seconds, moored_seconds, is_final',
          { count: 'exact' },
        )
        .eq('vessel_id', vesselId)
        .lte('date', toIso);
      if (fromIso) query = query.gte('date', fromIso);
      const { data, error, count } = await query
        .order('date', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;

      const dates = (data || []).map((r: { date: string }) => r.date);
      const loggedByDate = new Map<string, DailyStatus>();
      if (dates.length > 0) {
        const { data: logs } = await supabaseAdmin
          .from('daily_state_logs')
          .select('date, state')
          .eq('vessel_id', vesselId)
          .in('date', dates);
        for (const row of logs || []) {
          const date = normalizeStateLogDate((row as { date?: unknown }).date);
          if (date) loggedByDate.set(date, (row as { state: DailyStatus }).state);
        }
      }

      const rows: VesselAuditDayRow[] = (data || []).map((row) => {
        const r = row as Record<string, unknown>;
        const date = String(r.date);
        return {
          date,
          qualifyingState: str(r.qualifying_daily_state),
          currentState: str(r.current_state),
          observationCount: num(r.observation_count) ?? 0,
          distanceNm: num(r.distance_nm),
          underwaySeconds: num(r.underway_seconds) ?? 0,
          anchorSeconds: num(r.anchor_seconds) ?? 0,
          mooredSeconds: num(r.moored_seconds) ?? 0,
          isFinal: Boolean(r.is_final),
          loggedState: loggedByDate.get(date) ?? null,
        };
      });
      return NextResponse.json({
        section,
        data: { rows, total: count || 0, page, pageSize },
      });
    }

    if (section === 'sea-time') {
      let query = supabaseAdmin
        .from('daily_state_logs')
        .select('id, date, state, notes, is_part_of_active_passage', {
          count: 'exact',
        })
        .eq('vessel_id', vesselId)
        .lte('date', toIso);
      if (fromIso) query = query.gte('date', fromIso);
      const { data, error, count } = await query
        .order('date', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const rows: VesselAuditStateLogRow[] = (data || [])
        .map((row) => {
          const r = row as Record<string, unknown>;
          const date = normalizeStateLogDate(r.date);
          if (!date) return null;
          return {
            id: String(r.id),
            date,
            state: r.state as DailyStatus,
            notes: str(r.notes),
            isPartOfActivePassage: Boolean(r.is_part_of_active_passage),
          };
        })
        .filter(Boolean) as VesselAuditStateLogRow[];
      return NextResponse.json({
        section,
        data: { rows, total: count || 0, page, pageSize },
      });
    }

    if (section === 'passages') {
      let query = supabaseAdmin
        .from('passage_logs')
        .select(
          'id, start_time, end_time, departure_port, arrival_port, distance_nm, source',
          { count: 'exact' },
        )
        .eq('vessel_id', vesselId)
        .is('ais_dismissed_at', null)
        .lt('start_time', toTsExclusive);
      if (fromTs) query = query.gte('start_time', fromTs);
      const { data, error, count } = await query
        .order('start_time', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) {
        // Fallback if ais_dismissed_at missing
        let fallback = supabaseAdmin
          .from('passage_logs')
          .select(
            'id, start_time, end_time, departure_port, arrival_port, distance_nm, source',
            { count: 'exact' },
          )
          .eq('vessel_id', vesselId)
          .lt('start_time', toTsExclusive);
        if (fromTs) fallback = fallback.gte('start_time', fromTs);
        const retry = await fallback
          .order('start_time', { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (retry.error) throw retry.error;
        const rows: VesselAuditPassageRow[] = (retry.data || []).map((row) => {
          const r = row as Record<string, unknown>;
          return {
            id: String(r.id),
            startTime: String(r.start_time),
            endTime: str(r.end_time),
            departurePort: str(r.departure_port),
            arrivalPort: str(r.arrival_port),
            distanceNm: num(r.distance_nm),
            source: str(r.source),
          };
        });
        return NextResponse.json({
          section,
          data: { rows, total: retry.count || 0, page, pageSize },
        });
      }
      const rows: VesselAuditPassageRow[] = (data || []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id),
          startTime: String(r.start_time),
          endTime: str(r.end_time),
          departurePort: str(r.departure_port),
          arrivalPort: str(r.arrival_port),
          distanceNm: num(r.distance_nm),
          source: str(r.source),
        };
      });
      return NextResponse.json({
        section,
        data: { rows, total: count || 0, page, pageSize },
      });
    }

    if (section === 'watches') {
      let query = supabaseAdmin
        .from('nav_watch_logs')
        .select('id, start_time, end_time, watch_type, user_id', { count: 'exact' })
        .eq('vessel_id', vesselId)
        .lt('start_time', toTsExclusive);
      if (fromTs) query = query.gte('start_time', fromTs);
      const { data, error, count } = await query
        .order('start_time', { ascending: false })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const crewIds = [
        ...new Set(
          (data || [])
            .map((r: { user_id?: string }) => r.user_id)
            .filter(Boolean) as string[],
        ),
      ];
      const nameMap = new Map<string, string>();
      if (crewIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from('users')
          .select('id, first_name, last_name, email')
          .in('id', crewIds);
        for (const p of profiles || []) {
          nameMap.set(p.id, displayName(p));
        }
      }
      const rows: VesselAuditWatchRow[] = (data || []).map((row) => {
        const r = row as Record<string, unknown>;
        const userId = str(r.user_id);
        return {
          id: String(r.id),
          startTime: String(r.start_time),
          endTime: str(r.end_time),
          watchType: str(r.watch_type),
          crewName: userId ? nameMap.get(userId) || null : null,
        };
      });
      return NextResponse.json({
        section,
        data: { rows, total: count || 0, page, pageSize },
      });
    }

    if (section === 'documents') {
      const [vgRes, posRes, testRes] = await Promise.all([
        (() => {
          let q = supabaseAdmin
            .from('vessel_generated_testimonials')
            .select(
              'id, created_at, start_date, end_date, crew_name, total_days, at_sea_days',
              { count: 'exact' },
            )
            .eq('vessel_id', vesselId)
            .lt('created_at', toTsExclusive);
          if (fromTs) q = q.gte('created_at', fromTs);
          return q.order('created_at', { ascending: false }).limit(pageSize);
        })(),
        (() => {
          let q = supabaseAdmin
            .from('proof_of_service')
            .select(
              'id, created_at, start_date, end_date, crew_name, verification_code, total_days',
              { count: 'exact' },
            )
            .eq('vessel_id', vesselId)
            .eq('data_source', 'vessel')
            .lt('created_at', toTsExclusive);
          if (fromTs) q = q.gte('created_at', fromTs);
          return q.order('created_at', { ascending: false }).limit(pageSize);
        })(),
        (() => {
          let q = supabaseAdmin
            .from('testimonials')
            .select(
              'id, created_at, start_date, end_date, status, total_days, user_id',
              { count: 'exact' },
            )
            .eq('vessel_id', vesselId)
            .lt('created_at', toTsExclusive);
          if (fromTs) q = q.gte('created_at', fromTs);
          return q.order('created_at', { ascending: false }).limit(pageSize);
        })(),
      ]);

      const crewIds = [
        ...new Set(
          (testRes.data || [])
            .map((r: { user_id?: string }) => r.user_id)
            .filter(Boolean) as string[],
        ),
      ];
      const nameMap = new Map<string, string>();
      if (crewIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from('users')
          .select('id, first_name, last_name, email')
          .in('id', crewIds);
        for (const p of profiles || []) nameMap.set(p.id, displayName(p));
      }

      const rows: VesselAuditDocumentRow[] = [
        ...(vgRes.data || []).map((r) => {
          const row = r as Record<string, unknown>;
          return {
            id: String(row.id),
            kind: 'vessel_generated' as const,
            title: 'Vessel testimonial',
            status: 'issued',
            crewName: str(row.crew_name),
            startDate: str(row.start_date),
            endDate: str(row.end_date),
            createdAt: String(row.created_at),
            verificationCode: null,
          };
        }),
        ...(posRes.data || []).map((r) => {
          const row = r as Record<string, unknown>;
          return {
            id: String(row.id),
            kind: 'proof' as const,
            title: 'Proof of service',
            status: 'issued',
            crewName: str(row.crew_name),
            startDate: str(row.start_date),
            endDate: str(row.end_date),
            createdAt: String(row.created_at),
            verificationCode: str(row.verification_code),
          };
        }),
        ...(testRes.data || []).map((r) => {
          const row = r as Record<string, unknown>;
          const userId = str(row.user_id);
          return {
            id: String(row.id),
            kind: 'testimonial' as const,
            title: 'Crew testimonial',
            status: str(row.status),
            crewName: userId ? nameMap.get(userId) || null : null,
            startDate: str(row.start_date),
            endDate: str(row.end_date),
            createdAt: String(row.created_at),
            verificationCode: null,
          };
        }),
      ]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, pageSize);

      const total =
        (vgRes.count || 0) + (posRes.count || 0) + (testRes.count || 0);

      return NextResponse.json({
        section,
        data: { rows, total, page, pageSize },
      });
    }

    if (section === 'crew') {
      // Crew is included in overview; keep endpoint for refresh
      return NextResponse.json({ error: 'Use section=overview for crew' }, { status: 400 });
    }

    return NextResponse.json({ error: `Unknown section: ${section}` }, { status: 400 });
  } catch (error) {
    console.error('[vessel-audit]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load audit' },
      { status: 500 },
    );
  }
}
