import { format as formatDate, parse, addDays } from 'date-fns';
import type { StateLog } from '@/lib/types';
import { calculateStandbyDays } from '@/lib/standby-calculation';
import {
  getVesselCalculationCategory,
  isAllDaysExceptLeaveCountAsSea,
} from '@/lib/vessel-calculation-categories';

export type SeaTimeInRangeResult = {
  totalDays: number;
  atSeaDays: number;
  standbyDays: number;
  yardDays: number;
  leaveDays: number;
  otherDays: number;
  underwayDays: number;
  atAnchorDays: number;
  inPortDays: number;
  onLeaveDays: number;
  inYardDays: number;
  standbyPeriodsForPdf?: Array<{
    passageStartDate: string;
    passageEndDate: string;
    standbyDays: number;
  }>;
  dataSource: 'crew' | 'vessel';
};

function countStatesInRange(
  dateRangeSet: Set<string>,
  effectiveState: Map<string, string>,
) {
  let underwayDays = 0;
  let atAnchorDays = 0;
  let inPortDays = 0;
  let onLeaveDays = 0;
  let inYardDays = 0;
  dateRangeSet.forEach((dateStr) => {
    const s = effectiveState.get(dateStr);
    if (s === 'underway') underwayDays++;
    else if (s === 'at-anchor') atAnchorDays++;
    else if (s === 'in-port') inPortDays++;
    else if (s === 'on-leave') onLeaveDays++;
    else if (s === 'in-yard') inYardDays++;
  });
  return { underwayDays, atAnchorDays, inPortDays, onLeaveDays, inYardDays };
}

/**
 * Same sea-time rules as the Documents generator: calendar range, forward-filled states,
 * vessel calculation category (commercial vs MCA-style), standby from voyages + caps.
 */
export function computeSeaTimeInDateRange(options: {
  filteredLogs: StateLog[];
  rangeStart: string;
  rangeEnd: string;
  useCrewLogs: boolean;
  vesselType: string | null | undefined;
  watchDates: Set<string>;
}): SeaTimeInRangeResult {
  const { rangeStart, rangeEnd, useCrewLogs, vesselType, watchDates } = options;

  const normalized = options.filteredLogs
    .map((l) => ({
      ...l,
      date: l.date.includes('T') ? (l.date.split('T')[0] as string) : l.date,
    }))
    .filter((l) => l.date >= rangeStart && l.date <= rangeEnd)
    .sort((a, b) =>
      a.date !== b.date ? a.date.localeCompare(b.date) : (a.id || '').localeCompare(b.id || ''),
    );

  const byDate = new Map<string, StateLog>();
  normalized.forEach((l) => byDate.set(l.date, l));
  const logs = Array.from(byDate.values());

  const partOfActivePassageDates = new Set<string>();
  logs.forEach((log) => {
    if (log.isPartOfActivePassage) partOfActivePassageDates.add(log.date);
  });

  const { voyages, standbyPeriods } = calculateStandbyDays(
    logs,
    watchDates.size ? watchDates : undefined,
    partOfActivePassageDates.size ? partOfActivePassageDates : undefined,
    {
      rangeStart,
      rangeEnd,
      vesselManagerSeaTime: !useCrewLogs,
    },
  );

  const logMap = new Map(logs.map((l) => [l.date, l]));
  const startDateObj = parse(rangeStart, 'yyyy-MM-dd', new Date());
  const endDateObj = parse(rangeEnd, 'yyyy-MM-dd', new Date());
  const dateRangeSet = new Set<string>();
  let cur = new Date(startDateObj);
  while (cur <= endDateObj) {
    dateRangeSet.add(formatDate(cur, 'yyyy-MM-dd'));
    cur = addDays(cur, 1);
  }
  const sortedDates = Array.from(dateRangeSet).sort();
  let lastState: string | null = null;
  const firstWithLog = sortedDates.find((d) => logMap.has(d));
  let firstState = firstWithLog ? (logMap.get(firstWithLog)!.state as string) : 'in-port';
  const effectiveState = new Map<string, string>();
  for (const dateStr of sortedDates) {
    const log = logMap.get(dateStr);
    if (log) {
      lastState = log.state as string;
      effectiveState.set(dateStr, lastState);
    } else if (lastState !== null) {
      effectiveState.set(dateStr, lastState);
    } else {
      effectiveState.set(dateStr, firstState);
    }
  }

  const category = getVesselCalculationCategory(vesselType);
  if (isAllDaysExceptLeaveCountAsSea(category)) {
    let leaveCount = 0;
    dateRangeSet.forEach((dateStr) => {
      if (effectiveState.get(dateStr) === 'on-leave') leaveCount++;
    });
    const totalDays = dateRangeSet.size;
    const counts = countStatesInRange(dateRangeSet, effectiveState);
    return {
      totalDays,
      atSeaDays: totalDays - leaveCount,
      standbyDays: 0,
      yardDays: 0,
      leaveDays: leaveCount,
      otherDays: 0,
      underwayDays: counts.underwayDays,
      atAnchorDays: counts.atAnchorDays,
      inPortDays: counts.inPortDays,
      onLeaveDays: counts.onLeaveDays,
      inYardDays: counts.inYardDays,
      dataSource: useCrewLogs ? 'crew' : 'vessel',
    };
  }

  const voyageDatesSet = new Set<string>();
  voyages.forEach((voyage) => {
    let d = new Date(voyage.startDate);
    const end = new Date(voyage.endDate);
    while (d <= end) {
      voyageDatesSet.add(formatDate(d, 'yyyy-MM-dd'));
      d = addDays(d, 1);
    }
  });

  const standbyDatesSet = new Set<string>();
  standbyPeriods.forEach((period) => {
    let d = new Date(period.startDate);
    const end = new Date(period.endDate);
    let counted = 0;
    while (d <= end && counted < period.countedDays) {
      const dateStr = formatDate(d, 'yyyy-MM-dd');
      if (!dateRangeSet.has(dateStr)) {
        d = addDays(d, 1);
        continue;
      }
      const state = effectiveState.get(dateStr) ?? logMap.get(dateStr)?.state;
      const standbyEligible = state === 'in-port' || (useCrewLogs && state === 'at-anchor');
      if (standbyEligible) {
        if (!watchDates.has(dateStr) && !partOfActivePassageDates.has(dateStr)) {
          standbyDatesSet.add(dateStr);
          counted++;
        }
      }
      d = addDays(d, 1);
    }
  });

  const standbyPeriodsForPdf = standbyPeriods
    .map((period, index) => {
      const voyage = voyages[index];
      let passageStartDate: string;
      let passageEndDate: string;
      if (!voyage) {
        const voyageEndDate = new Date(period.startDate);
        voyageEndDate.setDate(voyageEndDate.getDate() - 1);
        const voyageStartDate = new Date(voyageEndDate);
        voyageStartDate.setDate(voyageStartDate.getDate() - (period.precedingVoyageDays ?? 0) + 1);
        passageStartDate = formatDate(voyageStartDate, 'yyyy-MM-dd');
        passageEndDate = formatDate(voyageEndDate, 'yyyy-MM-dd');
      } else {
        passageStartDate = formatDate(
          voyage.startDate instanceof Date ? voyage.startDate : new Date(voyage.startDate),
          'yyyy-MM-dd',
        );
        passageEndDate = formatDate(
          voyage.endDate instanceof Date ? voyage.endDate : new Date(voyage.endDate),
          'yyyy-MM-dd',
        );
      }
      return { passageStartDate, passageEndDate, standbyDays: period.countedDays, period };
    })
    .filter(({ period }) => {
      if (period.countedDays <= 0) return false;
      for (let i = 0; i < period.countedDays; i++) {
        const d = addDays(period.startDate, i);
        const dateStr = formatDate(d, 'yyyy-MM-dd');
        const state = effectiveState.get(dateStr);
        if (state === 'in-yard' || state === 'on-leave') return false;
      }
      return true;
    })
    .map(({ passageStartDate, passageEndDate, standbyDays }) => ({
      passageStartDate,
      passageEndDate,
      standbyDays,
    }));

  let finalSeaDays = 0;
  let finalStandbyDays = 0;
  let yardDays = 0;
  let leaveDays = 0;
  let otherDays = 0;
  dateRangeSet.forEach((dateStr) => {
    const state = effectiveState.get(dateStr);
    if (!state) return;
    if (state === 'in-yard') {
      yardDays++;
      return;
    }
    if (state === 'on-leave') {
      leaveDays++;
      return;
    }
    if (voyageDatesSet.has(dateStr)) {
      finalSeaDays++;
      return;
    }
    if (watchDates.has(dateStr) && (state === 'in-port' || state === 'at-anchor')) {
      finalSeaDays++;
      return;
    }
    if (partOfActivePassageDates.has(dateStr) && state !== 'underway') {
      finalSeaDays++;
      return;
    }
    if (!useCrewLogs && state === 'at-anchor') {
      finalSeaDays++;
      return;
    }
    if (standbyDatesSet.has(dateStr)) {
      finalStandbyDays++;
      return;
    }
    if (state === 'in-port' || state === 'at-anchor') {
      otherDays++;
      return;
    }
    if (state === 'underway') finalSeaDays++;
  });

  const cappedStandby = Math.min(finalStandbyDays, finalSeaDays);
  const counts = countStatesInRange(dateRangeSet, effectiveState);

  return {
    totalDays: dateRangeSet.size,
    atSeaDays: finalSeaDays,
    standbyDays: cappedStandby,
    yardDays,
    leaveDays,
    otherDays,
    underwayDays: counts.underwayDays,
    atAnchorDays: counts.atAnchorDays,
    inPortDays: counts.inPortDays,
    onLeaveDays: counts.onLeaveDays,
    inYardDays: counts.inYardDays,
    standbyPeriodsForPdf: standbyPeriodsForPdf.length > 0 ? standbyPeriodsForPdf : undefined,
    dataSource: useCrewLogs ? 'crew' : 'vessel',
  };
}
