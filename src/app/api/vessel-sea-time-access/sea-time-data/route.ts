import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { format } from 'date-fns';
import { computeSeaTimeInDateRange } from '@/lib/sea-time-in-range';
import type { StateLog } from '@/lib/types';

function mapRowToStateLog(log: Record<string, unknown>): StateLog {
  const date = (log.date ?? log.log_date) as string;
  return {
    id: log.id as string,
    userId: log.user_id as string,
    vesselId: log.vessel_id as string,
    date,
    state: log.state as StateLog['state'],
    isPartOfActivePassage: (log.is_part_of_active_passage as boolean) ?? false,
    notes: log.notes as string | undefined,
    createdAt: log.created_at as string | undefined,
    updatedAt: log.updated_at as string | undefined,
  };
}

async function fetchCrewLogsForVessel(
  vesselId: string,
  crewUserId: string
): Promise<StateLog[]> {
  let query = supabaseAdmin
    .from('daily_state_logs')
    .select('*')
    .eq('vessel_id', vesselId)
    .eq('user_id', crewUserId);

  const { data: logs, error: logsError } = await query.order('date', { ascending: true });

  if (logsError) {
    if (logsError.message?.includes('column "date"') || logsError.code === '42703') {
      const { data: retryLogs, error: retryError } = await supabaseAdmin
        .from('daily_state_logs')
        .select('*')
        .eq('vessel_id', vesselId)
        .eq('user_id', crewUserId)
        .order('log_date', { ascending: true });

      if (retryError) {
        console.error('[VESSEL SEA TIME ACCESS] Error fetching logs:', retryError);
        return [];
      }
      return (retryLogs || []).map((log: Record<string, unknown>) => mapRowToStateLog(log));
    }
    console.error('[VESSEL SEA TIME ACCESS] Error fetching logs:', logsError);
    return [];
  }

  return (logs || []).map((log: Record<string, unknown>) => mapRowToStateLog(log));
}

/**
 * GET: Sea time for a crew member on the vessel covered by an approved access request.
 * Query: crewUserId, vesselUserId, rangeStart, rangeEnd (YYYY-MM-DD), optional vesselId (must match request).
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const crewUserId = searchParams.get('crewUserId');
    const vesselUserId = searchParams.get('vesselUserId');
    const rangeStart = searchParams.get('rangeStart');
    const rangeEnd = searchParams.get('rangeEnd');
    const vesselIdParam = searchParams.get('vesselId');

    if (!crewUserId || !vesselUserId) {
      return NextResponse.json(
        { error: 'Missing required query params: crewUserId, vesselUserId' },
        { status: 400 }
      );
    }

    if (!rangeStart || !rangeEnd) {
      return NextResponse.json(
        {
          error:
            'Missing required query params: rangeStart, rangeEnd (YYYY-MM-DD). Use the crew assignment period.',
        },
        { status: 400 }
      );
    }

    const { data: accessRequest, error: accessError } = await supabaseAdmin
      .from('vessel_sea_time_access_requests')
      .select('id, status, vessel_id')
      .eq('vessel_user_id', vesselUserId)
      .eq('crew_user_id', crewUserId)
      .eq('status', 'approved')
      .maybeSingle();

    if (accessError) {
      console.error('[VESSEL SEA TIME ACCESS] Error checking access:', accessError);
      return NextResponse.json(
        { error: 'Failed to verify access', details: accessError.message },
        { status: 500 }
      );
    }

    if (!accessRequest) {
      return NextResponse.json(
        { error: 'Access not approved or request not found' },
        { status: 403 }
      );
    }

    const vesselId = accessRequest.vessel_id as string;
    if (vesselIdParam && vesselIdParam !== vesselId) {
      return NextResponse.json(
        { error: 'Vessel does not match the approved sea time access request' },
        { status: 403 }
      );
    }

    const allLogs = await fetchCrewLogsForVessel(vesselId, crewUserId);

    const normalizeDate = (d: string) => (d.includes('T') ? d.split('T')[0]! : d);
    const filteredLogs = allLogs
      .map((l) => ({ ...l, date: normalizeDate(l.date) }))
      .filter((l) => l.date >= rangeStart && l.date <= rangeEnd);

    const { data: vesselRow } = await supabaseAdmin
      .from('vessels')
      .select('type')
      .eq('id', vesselId)
      .maybeSingle();

    const { data: crewProfile } = await supabaseAdmin
      .from('users')
      .select('position, role')
      .eq('id', crewUserId)
      .single();

    const position = (crewProfile?.position || '').toLowerCase();
    const role = (crewProfile?.role || '').toLowerCase();
    const officerPositions = [
      'captain',
      'master',
      'chief officer',
      'first officer',
      'first mate',
      'second officer',
      'third officer',
      'officer of the watch',
      'oow',
      'deck officer',
      'chief engineer',
      'first engineer',
      'second engineer',
      'third engineer',
      'fourth engineer',
    ];
    const isOfficer =
      role === 'captain' ||
      role === 'admin' ||
      officerPositions.some((op) => position.includes(op));

    let watchDates = new Set<string>();
    if (isOfficer) {
      const { data: watchLogs, error: watchError } = await supabaseAdmin
        .from('nav_watch_logs')
        .select('start_time')
        .eq('user_id', crewUserId)
        .eq('vessel_id', vesselId)
        .gte('start_time', `${rangeStart}T00:00:00`)
        .lte('start_time', `${rangeEnd}T23:59:59`);

      if (!watchError && watchLogs) {
        watchLogs.forEach((log) => {
          watchDates.add(format(new Date(log.start_time), 'yyyy-MM-dd'));
        });
      }
    }

    const computed = computeSeaTimeInDateRange({
      filteredLogs,
      rangeStart,
      rangeEnd,
      useCrewLogs: true,
      vesselType: (vesselRow?.type as string) ?? null,
      watchDates,
    });

    const seaTimeData = {
      totalDays: computed.totalDays,
      atSeaDays: computed.atSeaDays,
      standbyDays: computed.standbyDays,
      underwayDays: computed.underwayDays,
      atAnchorDays: computed.atAnchorDays,
      inPortDays: computed.inPortDays,
      onLeaveDays: computed.onLeaveDays,
      inYardDays: computed.inYardDays,
    };

    const leavePeriodsFromLogs: Array<{ startDate: string; endDate: string; notes?: string }> = [];
    const onLeaveLogs = filteredLogs
      .filter((log) => log.state === 'on-leave')
      .sort((a, b) => a.date.localeCompare(b.date));

    if (onLeaveLogs.length > 0) {
      let currentPeriodStart = onLeaveLogs[0].date;
      let currentPeriodEnd = onLeaveLogs[0].date;
      let currentPeriodNotes: string[] = [];

      if (onLeaveLogs[0].notes) {
        currentPeriodNotes.push(onLeaveLogs[0].notes);
      }

      for (let i = 1; i < onLeaveLogs.length; i++) {
        const currentDate = onLeaveLogs[i].date;
        const previousDate = onLeaveLogs[i - 1].date;

        const prevDateObj = new Date(previousDate);
        const currDateObj = new Date(currentDate);
        const daysDiff = Math.floor(
          (currDateObj.getTime() - prevDateObj.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysDiff <= 1) {
          currentPeriodEnd = currentDate;
          if (onLeaveLogs[i].notes && !currentPeriodNotes.includes(onLeaveLogs[i].notes!)) {
            currentPeriodNotes.push(onLeaveLogs[i].notes!);
          }
        } else {
          leavePeriodsFromLogs.push({
            startDate: currentPeriodStart,
            endDate: currentPeriodEnd,
            notes: currentPeriodNotes.length > 0 ? currentPeriodNotes.join('; ') : undefined,
          });

          currentPeriodStart = currentDate;
          currentPeriodEnd = currentDate;
          currentPeriodNotes = [];
          const n = onLeaveLogs[i].notes;
          if (n) currentPeriodNotes.push(n);
        }
      }

      leavePeriodsFromLogs.push({
        startDate: currentPeriodStart,
        endDate: currentPeriodEnd,
        notes: currentPeriodNotes.length > 0 ? currentPeriodNotes.join('; ') : undefined,
      });
    }

    return NextResponse.json({
      seaTimeData,
      leavePeriodsFromLogs: leavePeriodsFromLogs.length > 0 ? leavePeriodsFromLogs : undefined,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[VESSEL SEA TIME ACCESS] Exception:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    );
  }
}
