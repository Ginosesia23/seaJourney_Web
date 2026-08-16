/**
 * Load leave periods for a crew user across one or more vessels.
 *
 * Combines:
 *   - `crew_leave_periods` (manual / rotation leave rows)
 *   - consecutive `daily_state_logs` with state `on-leave`
 *
 * Used by Passages Map sync/promote and Passage Logbook so on-leave
 * dates are never imported or shown as the user's sea-time.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  collapseDatesToLeavePeriods,
  type LeavePeriod,
} from '@/lib/passages-map/filter-by-leave-periods';

export async function loadCrewLeavePeriodsByVessel(
  crewUserId: string,
  vesselIds: readonly string[],
): Promise<Map<string, LeavePeriod[]>> {
  const leaveByVessel = new Map<string, LeavePeriod[]>();
  if (vesselIds.length === 0) return leaveByVessel;

  const { data: leaveRowsRaw, error: leaveErr } = await supabaseAdmin
    .from('crew_leave_periods')
    .select('vessel_id, start_date, end_date')
    .eq('crew_user_id', crewUserId)
    .in('vessel_id', vesselIds);
  if (leaveErr) {
    console.warn('[loadCrewLeavePeriods] leave-period query failed', leaveErr);
  } else {
    for (const row of (leaveRowsRaw ?? []) as {
      vessel_id: string;
      start_date: string;
      end_date: string;
    }[]) {
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

  const { data: onLeaveLogsRaw, error: onLeaveErr } = await supabaseAdmin
    .from('daily_state_logs')
    .select('vessel_id, date')
    .eq('user_id', crewUserId)
    .eq('state', 'on-leave')
    .in('vessel_id', vesselIds);
  if (onLeaveErr) {
    console.warn('[loadCrewLeavePeriods] on-leave logs query failed', onLeaveErr);
  } else {
    const datesByVessel = new Map<string, string[]>();
    for (const row of (onLeaveLogsRaw ?? []) as {
      vessel_id: string;
      date: string;
    }[]) {
      const d = String(row.date).slice(0, 10);
      let list = datesByVessel.get(row.vessel_id);
      if (!list) {
        list = [];
        datesByVessel.set(row.vessel_id, list);
      }
      list.push(d);
    }
    for (const [vesselId, dates] of datesByVessel) {
      const derived = collapseDatesToLeavePeriods(vesselId, dates);
      if (derived.length === 0) continue;
      const existing = leaveByVessel.get(vesselId) ?? [];
      leaveByVessel.set(vesselId, [...existing, ...derived]);
    }
  }

  return leaveByVessel;
}
