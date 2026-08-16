/**
 * Side effects when the Onboard Tracker marks a crew member off / on board:
 *   - open/close tagged `crew_leave_periods`
 *   - when the crew has approved sea-time access, mirror leave onto their
 *     `daily_state_logs` as `on-leave` (so their own sea-time counts)
 *   - push / inbox notify the crew member
 *
 * Log notes use `ONBOARD_TOGGLE_LEAVE_MARKER` so AIS sync treats them as
 * manual overrides and does not clobber leave with underway/etc.
 */

import { addDays, format, parseISO, startOfDay } from 'date-fns';

import { ONBOARD_TOGGLE_LEAVE_MARKER } from '@/lib/crew-rotation';
import { sendUserNotification } from '@/lib/notifications/send-user-notification';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/** How far ahead we pre-write on-leave days when a leave end is far away.
 *  Open leave periods are extended day-by-day via rotation sync / AIS. */
export const ONBOARD_LEAVE_LOG_HORIZON_DAYS = 21;

export const ONBOARD_TOGGLE_LOG_NOTE = `${ONBOARD_TOGGLE_LEAVE_MARKER} Off-board via Onboard Tracker`;

function todayIso(from: Date = new Date()): string {
  return format(startOfDay(from), 'yyyy-MM-dd');
}

function eachDateInclusive(startIso: string, endIso: string): string[] {
  const start = startOfDay(parseISO(startIso));
  const end = startOfDay(parseISO(endIso));
  if (end < start) return [];
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(format(cursor, 'yyyy-MM-dd'));
    cursor = addDays(cursor, 1);
  }
  return out;
}

export async function hasApprovedSeaTimeAccess(
  crewUserId: string,
  vesselId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('vessel_sea_time_access_requests')
    .select('id')
    .eq('crew_user_id', crewUserId)
    .eq('vessel_id', vesselId)
    .eq('status', 'approved')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[onboard-leave] access lookup failed', error.message);
    return false;
  }
  return !!data;
}

export async function openOrExtendOnboardToggleLeave(args: {
  crewUserId: string;
  vesselId: string;
  vesselUserId: string;
  leaveEndIso: string;
  startIso?: string;
}): Promise<{ action: 'inserted' | 'extended' | 'unchanged' | 'error'; id?: string }> {
  const startIso = args.startIso ?? todayIso();
  const { data: openLeaves, error: fetchErr } = await supabaseAdmin
    .from('crew_leave_periods')
    .select('id, end_date')
    .eq('crew_user_id', args.crewUserId)
    .eq('vessel_id', args.vesselId)
    .gte('end_date', startIso)
    .like('notes', `${ONBOARD_TOGGLE_LEAVE_MARKER}%`)
    .order('start_date', { ascending: false })
    .limit(1);

  if (fetchErr) {
    console.warn('[onboard-leave] open leave lookup failed', fetchErr.message);
    return { action: 'error' };
  }

  const open = openLeaves?.[0];
  if (open) {
    if (open.end_date < args.leaveEndIso) {
      const { error } = await supabaseAdmin
        .from('crew_leave_periods')
        .update({ end_date: args.leaveEndIso })
        .eq('id', open.id);
      if (error) {
        console.warn('[onboard-leave] extend leave failed', error.message);
        return { action: 'error', id: open.id };
      }
      return { action: 'extended', id: open.id };
    }
    return { action: 'unchanged', id: open.id };
  }

  const { data: inserted, error } = await supabaseAdmin
    .from('crew_leave_periods')
    .insert({
      crew_user_id: args.crewUserId,
      vessel_id: args.vesselId,
      vessel_user_id: args.vesselUserId,
      start_date: startIso,
      end_date: args.leaveEndIso,
      notes: ONBOARD_TOGGLE_LOG_NOTE,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    console.warn('[onboard-leave] insert leave failed', error.message);
    return { action: 'error' };
  }
  return { action: 'inserted', id: inserted?.id };
}

export async function closeOnboardToggleLeave(args: {
  crewUserId: string;
  vesselId: string;
  asOfIso?: string;
}): Promise<{ action: 'deleted' | 'closed' | 'none' | 'error' }> {
  const asOf = args.asOfIso ?? todayIso();
  const { data: openLeaves, error: fetchErr } = await supabaseAdmin
    .from('crew_leave_periods')
    .select('id, start_date, end_date')
    .eq('crew_user_id', args.crewUserId)
    .eq('vessel_id', args.vesselId)
    .gte('end_date', asOf)
    .like('notes', `${ONBOARD_TOGGLE_LEAVE_MARKER}%`)
    .order('start_date', { ascending: false })
    .limit(1);

  if (fetchErr) {
    console.warn('[onboard-leave] close leave lookup failed', fetchErr.message);
    return { action: 'error' };
  }

  const open = openLeaves?.[0];
  if (!open) return { action: 'none' };

  if (open.start_date >= asOf) {
    const { error } = await supabaseAdmin
      .from('crew_leave_periods')
      .delete()
      .eq('id', open.id);
    if (error) {
      console.warn('[onboard-leave] delete leave failed', error.message);
      return { action: 'error' };
    }
    return { action: 'deleted' };
  }

  const yesterdayIso = format(addDays(parseISO(asOf), -1), 'yyyy-MM-dd');
  const { error } = await supabaseAdmin
    .from('crew_leave_periods')
    .update({ end_date: yesterdayIso })
    .eq('id', open.id);
  if (error) {
    console.warn('[onboard-leave] close leave failed', error.message);
    return { action: 'error' };
  }
  return { action: 'closed' };
}

/**
 * Mirror onboard-toggle leave onto the crew member's daily_state_logs when
 * they have approved sea-time access for this vessel.
 */
export async function applyOnboardToggleToCrewLogs(args: {
  crewUserId: string;
  vesselId: string;
  /** true = back on board (clear future toggle leave logs) */
  onboard: boolean;
  leaveEndIso?: string | null;
}): Promise<{
  applied: boolean;
  daysTouched: number;
  skipped?: 'no_access' | 'noop';
}> {
  const access = await hasApprovedSeaTimeAccess(args.crewUserId, args.vesselId);
  if (!access) {
    return { applied: false, daysTouched: 0, skipped: 'no_access' };
  }

  const today = todayIso();

  if (args.onboard) {
    // Clear today and future days that we wrote with the toggle marker.
    const { data: rows, error } = await supabaseAdmin
      .from('daily_state_logs')
      .select('id, date, notes')
      .eq('user_id', args.crewUserId)
      .eq('vessel_id', args.vesselId)
      .gte('date', today)
      .like('notes', `${ONBOARD_TOGGLE_LEAVE_MARKER}%`);

    if (error) {
      console.warn('[onboard-leave] clear logs lookup failed', error.message);
      return { applied: false, daysTouched: 0 };
    }

    const ids = (rows ?? []).map((r) => r.id as string);
    if (ids.length === 0) {
      return { applied: true, daysTouched: 0, skipped: 'noop' };
    }

    const { error: delErr } = await supabaseAdmin
      .from('daily_state_logs')
      .delete()
      .in('id', ids);

    if (delErr) {
      console.warn('[onboard-leave] clear logs failed', delErr.message);
      return { applied: false, daysTouched: 0 };
    }
    return { applied: true, daysTouched: ids.length };
  }

  // Off-board → write on-leave for today through min(leaveEnd, horizon).
  const horizonEnd = format(
    addDays(parseISO(today), ONBOARD_LEAVE_LOG_HORIZON_DAYS),
    'yyyy-MM-dd',
  );
  const leaveEnd = args.leaveEndIso && args.leaveEndIso >= today
    ? args.leaveEndIso
    : horizonEnd;
  const fillEnd = leaveEnd < horizonEnd ? leaveEnd : horizonEnd;
  const dates = eachDateInclusive(today, fillEnd);
  if (dates.length === 0) {
    return { applied: false, daysTouched: 0, skipped: 'noop' };
  }

  const rows = dates.map((date) => ({
    user_id: args.crewUserId,
    vessel_id: args.vesselId,
    date,
    state: 'on-leave',
    notes: ONBOARD_TOGGLE_LOG_NOTE,
  }));

  const { error: upsertErr } = await supabaseAdmin
    .from('daily_state_logs')
    .upsert(rows, { onConflict: 'user_id,vessel_id,date' });

  if (upsertErr) {
    console.warn('[onboard-leave] upsert on-leave logs failed', upsertErr.message);
    return { applied: false, daysTouched: 0 };
  }

  return { applied: true, daysTouched: rows.length };
}

/** Ensure today's log is on-leave for every open toggle leave on a vessel
 *  (crew with approved access only). Used by rotation sync / cron-adjacent paths. */
export async function ensureTodayOnLeaveForOpenToggleLeaves(
  vesselId: string,
): Promise<number> {
  const today = todayIso();
  const { data: openLeaves, error } = await supabaseAdmin
    .from('crew_leave_periods')
    .select('crew_user_id, end_date')
    .eq('vessel_id', vesselId)
    .lte('start_date', today)
    .gte('end_date', today)
    .like('notes', `${ONBOARD_TOGGLE_LEAVE_MARKER}%`);

  if (error || !openLeaves?.length) return 0;

  let touched = 0;
  for (const leave of openLeaves) {
    const result = await applyOnboardToggleToCrewLogs({
      crewUserId: leave.crew_user_id as string,
      vesselId,
      onboard: false,
      leaveEndIso: leave.end_date as string,
    });
    if (result.applied) touched += result.daysTouched;
  }
  return touched;
}

export async function notifyCrewOnboardChange(args: {
  crewUserId: string;
  vesselId: string;
  onboard: boolean;
}): Promise<void> {
  const { data: vessel } = await supabaseAdmin
    .from('vessels')
    .select('name')
    .eq('id', args.vesselId)
    .maybeSingle();
  const vesselName = (vessel?.name as string) || 'your vessel';

  const title = args.onboard ? 'Back on board' : 'You are now on leave';
  const body = args.onboard
    ? `${vesselName} marked you as back on board. Your leave period has been closed.`
    : `${vesselName} marked you as off board. Your sea-time record is now counting this time as on leave.`;

  await sendUserNotification({
    userId: args.crewUserId,
    title,
    body,
    kind: 'sea_time',
    metadata: {
      vesselId: args.vesselId,
      vesselName,
      onboard: args.onboard,
      source: 'onboard_tracker',
      route: '/dashboard/current',
    },
  });
}

/** True when an open onboard-toggle leave covers `dateIso` for this crew/vessel. */
export async function hasOpenOnboardToggleLeave(
  crewUserId: string,
  vesselId: string,
  dateIso: string = todayIso(),
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('crew_leave_periods')
    .select('id')
    .eq('crew_user_id', crewUserId)
    .eq('vessel_id', vesselId)
    .lte('start_date', dateIso)
    .gte('end_date', dateIso)
    .like('notes', `${ONBOARD_TOGGLE_LEAVE_MARKER}%`)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[onboard-leave] open leave check failed', error.message);
    return false;
  }
  return !!data;
}

/**
 * True when AIS / daily sync should force `on-leave` for this crew today:
 * open tagged leave (or active manual off-board override) AND the crew has
 * approved sea-time access so the vessel is allowed to write their logs.
 */
export async function shouldForceOnLeaveFromOnboardTracker(
  crewUserId: string,
  vesselId: string,
  dateIso: string = todayIso(),
): Promise<boolean> {
  const access = await hasApprovedSeaTimeAccess(crewUserId, vesselId);
  if (!access) return false;

  if (await hasOpenOnboardToggleLeave(crewUserId, vesselId, dateIso)) {
    return true;
  }

  const { data, error } = await supabaseAdmin
    .from('vessel_assignments')
    .select('onboard, onboard_override_until')
    .eq('user_id', crewUserId)
    .eq('vessel_id', vesselId)
    .is('end_date', null)
    .maybeSingle();

  if (error || !data) return false;
  if (data.onboard !== false || !data.onboard_override_until) return false;
  return new Date(data.onboard_override_until as string) > new Date();
}
