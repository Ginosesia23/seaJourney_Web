import type { SupabaseClient } from '@supabase/supabase-js';
import { format as formatDate, addDays } from 'date-fns';
import type { StateLog } from '@/lib/types';
import { getVesselStateLogs } from '@/supabase/database/queries';
import { calculateStandbyDays } from '@/lib/standby-calculation';

/**
 * Standby period entry consumed by `generateTestimonialPDF`'s SeaJourney/MLC layout.
 * Includes both the underlying voyage span and the actual standby span so the PDF can
 * print the precise "in-port/at-anchor" range (does not extend into yard/leave).
 */
export interface TestimonialStandbyPeriod {
  passageStartDate: string;
  passageEndDate: string;
  standbyStartDate: string;
  standbyEndDate: string;
  standbyDays: number;
}

const OFFICER_POSITION_KEYWORDS = [
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

function isOfficerProfile(position: string | null | undefined, role: string | null | undefined): boolean {
  const r = (role || '').toLowerCase();
  if (r === 'captain' || r === 'admin') return true;
  const p = (position || '').toLowerCase();
  return OFFICER_POSITION_KEYWORDS.some((k) => p.includes(k));
}

export interface BuildTestimonialStandbyPeriodsOptions {
  supabase: SupabaseClient;
  vesselId: string;
  /** Date range inclusive, YYYY-MM-DD. */
  startDate: string;
  endDate: string;
  /** Crew member whose service the testimonial documents. */
  crewUserId: string;
  crewPosition?: string | null;
  crewRole?: string | null;
  /**
   * Source for state logs:
   * - 'crew': use the crew member's own logs (standard for crew-owned testimonials).
   * - 'vessel': use the vessel manager's logs. Falls back to a provided `vesselUserId`.
   */
  source?: 'crew' | 'vessel';
  /** Used only when `source === 'vessel'`. Resolves which vessel-side user's logs to read. */
  vesselUserId?: string | null;
  /**
   * Whether the crew member has an approved sea-time access request for this vessel.
   * When true and source==='crew', officer watch dates are included.
   */
  hasApprovedAccess?: boolean;
}

/**
 * Compute the per-voyage standby periods used in the SeaJourney/MLC testimonial PDF
 * for a given crew member, vessel, and date range. Mirrors the logic used in
 * `crew/page.tsx` and `download-vessel-generated-testimonial-for-crew.ts` so all
 * crew-facing PDF entry points show the same breakdown.
 */
export async function buildTestimonialStandbyPeriods(
  options: BuildTestimonialStandbyPeriodsOptions,
): Promise<TestimonialStandbyPeriod[]> {
  const {
    supabase,
    vesselId,
    startDate,
    endDate,
    crewUserId,
    crewPosition,
    crewRole,
    source = 'crew',
    vesselUserId,
    hasApprovedAccess = source === 'crew',
  } = options;

  if (!vesselId || !startDate || !endDate) return [];

  try {
    let logs: StateLog[] = [];
    if (source === 'crew') {
      logs = await getVesselStateLogs(supabase, vesselId, crewUserId);
    } else {
      const targetUserId = vesselUserId || crewUserId;
      logs = await getVesselStateLogs(supabase, vesselId, targetUserId);
    }

    const filteredLogs = logs.filter((log) => {
      const logDate = log.date;
      return logDate >= startDate && logDate <= endDate;
    });

    if (filteredLogs.length === 0) return [];

    const partOfActivePassageDates = new Set<string>();
    filteredLogs.forEach((log) => {
      if (log.isPartOfActivePassage) partOfActivePassageDates.add(log.date);
    });

    const watchDates = new Set<string>();
    if (hasApprovedAccess && source === 'crew' && isOfficerProfile(crewPosition, crewRole)) {
      try {
        const { data: watchLogs } = await supabase
          .from('nav_watch_logs')
          .select('start_time')
          .eq('user_id', crewUserId)
          .eq('vessel_id', vesselId)
          .gte('start_time', `${startDate}T00:00:00`)
          .lte('start_time', `${endDate}T23:59:59`);

        if (watchLogs) {
          watchLogs.forEach((log: { start_time: string }) => {
            const dateStr = formatDate(new Date(log.start_time), 'yyyy-MM-dd');
            watchDates.add(dateStr);
          });
        }
      } catch {
        // Watch logs are an enrichment; ignore failures.
      }
    }

    const useCrewLogsForStandby = source === 'crew';
    const { standbyPeriods: calculatedPeriods, voyages } = calculateStandbyDays(
      filteredLogs,
      watchDates.size > 0 ? watchDates : undefined,
      partOfActivePassageDates.size > 0 ? partOfActivePassageDates : undefined,
      {
        rangeStart: startDate,
        rangeEnd: endDate,
        vesselManagerSeaTime: !useCrewLogsForStandby,
      },
    );

    const logMapByDate = new Map<string, string>();
    filteredLogs.forEach((log) => {
      logMapByDate.set(log.date, (log.state as string) || '');
    });

    const mapped = calculatedPeriods.map((period, index) => {
      const voyage = voyages[index];
      const standbyStartDate = formatDate(period.startDate, 'yyyy-MM-dd');
      const standbyEndDate =
        period.countedDays > 0
          ? formatDate(addDays(period.startDate, period.countedDays - 1), 'yyyy-MM-dd')
          : standbyStartDate;

      let passageStartDate: string;
      let passageEndDate: string;
      if (!voyage) {
        const voyageEndDate = new Date(period.startDate);
        voyageEndDate.setDate(voyageEndDate.getDate() - 1);
        const voyageStartDate = new Date(voyageEndDate);
        voyageStartDate.setDate(voyageStartDate.getDate() - (period.precedingVoyageDays || 0) + 1);
        passageStartDate = formatDate(voyageStartDate, 'yyyy-MM-dd');
        passageEndDate = formatDate(voyageEndDate, 'yyyy-MM-dd');
      } else {
        const voyageStart = voyage.startDate instanceof Date ? voyage.startDate : new Date(voyage.startDate);
        const voyageEnd = voyage.endDate instanceof Date ? voyage.endDate : new Date(voyage.endDate);
        passageStartDate = formatDate(voyageStart, 'yyyy-MM-dd');
        passageEndDate = formatDate(voyageEnd, 'yyyy-MM-dd');
      }

      return {
        passageStartDate,
        passageEndDate,
        standbyStartDate,
        standbyEndDate,
        standbyDays: period.countedDays,
        period,
      };
    });

    return mapped
      .filter(({ period }) => {
        if (period.countedDays <= 0) return false;
        for (let i = 0; i < period.countedDays; i++) {
          const d = addDays(period.startDate, i);
          const dateStr = formatDate(d, 'yyyy-MM-dd');
          const state = logMapByDate.get(dateStr);
          if (state === 'in-yard' || state === 'on-leave') return false;
        }
        return true;
      })
      .map(({ passageStartDate, passageEndDate, standbyStartDate, standbyEndDate, standbyDays }) => ({
        passageStartDate,
        passageEndDate,
        standbyStartDate,
        standbyEndDate,
        standbyDays,
      }));
  } catch (error) {
    console.error('[buildTestimonialStandbyPeriods] failed:', error);
    return [];
  }
}
