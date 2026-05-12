/**
 * Build per-row "RowContext" entries for the document scanner so multi-
 * vessel service tables (MCA, AMSA, etc.) fill each row with the right
 * vessel instead of repeating the currently-active vessel on every row.
 *
 * Given a crew member, we:
 *   1. Fetch every vessel assignment they have (sorted newest-first).
 *   2. Load each vessel's record.
 *   3. Compute sea-time for each assignment's date window using the same
 *      rules the documents generator uses (vessel calculation category,
 *      standby voyages, etc.).
 *
 * The returned array is 1-indexed: `contexts[1]` is row 1 (most recent
 * vessel), `contexts[2]` is row 2 (next), etc. `contexts[0]` is left
 * empty so callers can just look up by the row number the AI extracted.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { format as formatDate } from 'date-fns';
import {
  getVesselAssignments,
  getVesselStateLogs,
} from '@/supabase/database/queries';
import { computeSeaTimeInDateRange } from './sea-time-in-range';
import type { RowContext } from '@/ai/document-scan-flow';

/** Soft cap — no sea-service form realistically lists this many vessels. */
const MAX_ROWS = 12;

export async function buildScanRowContexts(
  supabase: SupabaseClient,
  crewUserId: string,
): Promise<RowContext[]> {
  let assignments: Array<{
    vesselId: string;
    startDate: string | null;
    endDate: string | null;
    position: string | null;
  }> = [];
  try {
    const raw = await getVesselAssignments(supabase, crewUserId);
    assignments = raw.map((a) => ({
      vesselId: a.vesselId,
      startDate: a.startDate ?? null,
      endDate: a.endDate ?? null,
      position: a.position ?? null,
    }));
  } catch (err) {
    console.warn('[buildScanRowContexts] getVesselAssignments failed:', err);
    return [];
  }

  if (!assignments.length) return [];

  // Fetch every vessel referenced in one round-trip.
  const vesselIds = Array.from(new Set(assignments.map((a) => a.vesselId)));
  const { data: vesselRows } = await supabase
    .from('vessels')
    .select('*')
    .in('id', vesselIds);
  const vesselsById = new Map<string, any>();
  (vesselRows || []).forEach((v: any) => vesselsById.set(v.id, v));

  const today = formatDate(new Date(), 'yyyy-MM-dd');

  // Index 0 intentionally left undefined — `contexts[0]` is never a real
  // row, it's just here so `contexts[rowIndex]` can be used directly with
  // the 1-based row numbers the AI returns.
  const contexts: RowContext[] = [];
  contexts[0] = {};

  const capped = assignments.slice(0, MAX_ROWS);
  for (let i = 0; i < capped.length; i++) {
    const a = capped[i];
    const vessel = vesselsById.get(a.vesselId) ?? null;

    let seaTime: RowContext['seaTime'] = null;
    const rangeStart = a.startDate;
    const rangeEnd = a.endDate || today;
    if (vessel && rangeStart && rangeEnd && rangeStart <= rangeEnd) {
      try {
        // Prefer the vessel manager's perspective (same as the generator),
        // and fall back to unscoped logs if the vessel has no recorded
        // manager.
        const managerId =
          vessel.vessel_manager_id || vessel.vesselManagerId || undefined;
        const logs = await getVesselStateLogs(supabase, a.vesselId, managerId);
        const filtered = logs.filter(
          (l) => l.date >= rangeStart && l.date <= rangeEnd,
        );
        if (filtered.length) {
          const result = computeSeaTimeInDateRange({
            filteredLogs: filtered,
            rangeStart,
            rangeEnd,
            useCrewLogs: false,
            vesselType: vessel.type ?? null,
            watchDates: new Set(),
          });
          seaTime = {
            startDate: rangeStart,
            endDate: rangeEnd,
            totalDays: result.totalDays,
            atSeaDays: result.atSeaDays,
            standbyDays: result.standbyDays,
            yardDays: result.yardDays,
            leaveDays: result.leaveDays,
            underwayDays: result.underwayDays,
            atAnchorDays: result.atAnchorDays,
            inPortDays: result.inPortDays,
          };
        }
      } catch (err) {
        console.warn(
          `[buildScanRowContexts] sea-time calc failed for vessel ${a.vesselId}:`,
          err,
        );
      }
    }

    contexts[i + 1] = {
      vessel,
      assignmentStartDate: a.startDate ?? null,
      assignmentEndDate: a.endDate ?? null,
      assignmentPosition: a.position ?? null,
      seaTime,
    };
  }

  return contexts;
}
