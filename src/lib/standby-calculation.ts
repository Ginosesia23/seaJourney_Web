/**
 * MCA-style standby days calculation
 *
 * Rules:
 * 1. Voyages = consecutive 'underway' days (or 'at-anchor' days that are part of an active passage)
 *    Note: 'at-anchor' days AFTER a voyage ends are counted as standby, not part of the voyage
 * 2. Standby = time immediately following a voyage while in 'in-port' or 'at-anchor' state only.
 *    (at-anchor can be both sea time when part of voyage, and standby when after voyage ends)
 *    Vessel manager accounts (`vesselManagerSeaTime`): 'underway' and 'at-anchor' always count as sea;
 *    standby after a voyage is only 'in-port' (at-anchor after a voyage is sea, not standby).
 * 3. In-yard and on-leave are NEVER standby: they end the standby period. Example: 4 days passage,
 *    then 1 day at anchor, then yard → 4 at sea, 1 standby, rest are in-yard only.
 * 4. Max 14 consecutive days of standby can be counted from any single period
 * 5. A standby block can't be longer than the previous voyage
 * 6. Total standby service can never exceed total actual sea service
 */

import type { StateLog, DailyStatus } from './types';
import { differenceInDays, parse, addDays, format } from 'date-fns';

interface Voyage {
  startDate: Date;
  endDate: Date;
  days: number;
}

interface StandbyPeriod {
  startDate: Date;
  endDate: Date;
  days: number;
  precedingVoyageDays: number;
  allowedDays: number;
  countedDays: number;
}

export interface CalculateStandbyDaysOptions {
  /** When set, only logs and counted days within this range (inclusive) are used. YYYY-MM-DD. */
  rangeStart?: string;
  /** When set with rangeStart, only logs and counted days within this range (inclusive) are used. YYYY-MM-DD. */
  rangeEnd?: string;
  /**
   * Vessel manager (`role === 'vessel'`): count every logged 'underway' and 'at-anchor' day as sea time;
   * do not count post-voyage 'at-anchor' as standby (only 'in-port' after a voyage can be standby).
   */
  vesselManagerSeaTime?: boolean;
}

/**
 * Calculate MCA-compliant standby days from state logs
 * @param stateLogs - Array of state logs
 * @param watchDates - Set of dates (YYYY-MM-DD format) where officer was on watch (these count as "at sea" instead of standby)
 * @param partOfActivePassageDates - Set of dates (YYYY-MM-DD format) where user marked part of active passage (these count as "at sea" instead of standby)
 * @param options - Optional rangeStart/rangeEnd (YYYY-MM-DD), and vesselManagerSeaTime for vessel accounts (`role === 'vessel'`).
 */
export function calculateStandbyDays(
  stateLogs: StateLog[],
  watchDates?: Set<string>,
  partOfActivePassageDates?: Set<string>,
  options?: CalculateStandbyDaysOptions
): {
  totalSeaDays: number;
  totalStandbyDays: number;
  voyages: Voyage[];
  standbyPeriods: StandbyPeriod[];
} {
  if (!stateLogs || stateLogs.length === 0) {
    return {
      totalSeaDays: 0,
      totalStandbyDays: 0,
      voyages: [],
      standbyPeriods: [],
    };
  }

  // Sort logs by date
  let sortedLogs = [...stateLogs].sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  const vesselManagerSeaTime = options?.vesselManagerSeaTime === true;

  // Restrict to date range when provided (e.g. testimonial start_date / end_date)
  const rangeStart = options?.rangeStart;
  const rangeEnd = options?.rangeEnd;
  if (rangeStart && rangeEnd) {
    sortedLogs = sortedLogs.filter(
      (log) => log.date >= rangeStart && log.date <= rangeEnd
    );
    if (sortedLogs.length === 0) {
      return {
        totalSeaDays: 0,
        totalStandbyDays: 0,
        voyages: [],
        standbyPeriods: [],
      };
    }
  }

  // Identify voyages (consecutive 'underway' days, with part-of-active-passage days treated as part of voyage)
  // Key rule: Voyages are 'underway' days. Part-of-active-passage days between underway days are treated as part of the voyage.
  // The full passage length (including part-of-active-passage interruptions) counts towards standby calculation.
  const voyages: Voyage[] = [];
  let currentVoyage: Voyage | null = null;
  let voyageStartDate: Date | null = null; // Track the actual start date including part-of-active-passage

  for (let i = 0; i < sortedLogs.length; i++) {
    const log = sortedLogs[i];
    const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
    const isPartOfActivePassage = partOfActivePassageDates?.has(log.date) || false;
    
    // Check if this day should be part of a voyage:
    // - 'underway' days always count
    // - Part-of-active-passage days count if they're between underway days (continuation of voyage)
    const shouldBeInVoyage = log.state === 'underway' || isPartOfActivePassage;
    
    if (shouldBeInVoyage) {
      if (!currentVoyage) {
        // Start new voyage (only if it's an underway day, not just part of active passage)
        if (log.state === 'underway') {
          voyageStartDate = logDate;
          currentVoyage = {
            startDate: logDate,
            endDate: logDate,
            days: 1, // Count of actual underway days
          };
        }
      } else {
        // Check if this is a consecutive day (or part of active passage continuing the voyage)
        const lastDate = currentVoyage.endDate;
        const expectedNextDate = addDays(lastDate, 1);
        
        if (format(logDate, 'yyyy-MM-dd') === format(expectedNextDate, 'yyyy-MM-dd')) {
          // Continue voyage (consecutive day - either underway or part of active passage)
          currentVoyage.endDate = logDate;
          // Count actual underway days for sea time calculation
          if (log.state === 'underway') {
            currentVoyage.days++;
          }
          // The voyage span (startDate to endDate) includes part-of-active-passage days
          // This full span will be used for standby calculation
        } else {
          // Gap detected - end current voyage and start new one (if this is an underway day)
          voyages.push(currentVoyage);
          if (log.state === 'underway') {
            voyageStartDate = logDate;
            currentVoyage = {
              startDate: logDate,
              endDate: logDate,
              days: 1,
            };
          } else {
            currentVoyage = null;
            voyageStartDate = null;
          }
        }
      }
    } else {
      // Any non-'underway' and non-part-of-active-passage state ends the voyage
      if (currentVoyage) {
        voyages.push(currentVoyage);
        currentVoyage = null;
        voyageStartDate = null;
      }
    }
  }

  // Add final voyage if still in progress
  if (currentVoyage) {
    voyages.push(currentVoyage);
  }
  
  // Update voyage days to include the full passage length (including part-of-active-passage days)
  // This ensures standby calculation uses the full passage length, not just the underway days
  voyages.forEach(voyage => {
    // Calculate the total span of the voyage (including part-of-active-passage days)
    const voyageSpanDays = differenceInDays(voyage.endDate, voyage.startDate) + 1;
    // Use the full span for standby calculation, but keep the actual underway count for sea days
    // We'll use voyageSpanDays when calculating max allowed standby
    (voyage as any).spanDays = voyageSpanDays;
  });

  // Create a map of date -> log for quick lookup (needed for watch days calculation)
  const logMap = new Map<string, StateLog>();
  sortedLogs.forEach(log => {
    logMap.set(log.date, log);
  });

  // Calculate total sea days
  let totalSeaDays: number;
  if (vesselManagerSeaTime) {
    const seaDates = new Set<string>();
    sortedLogs.forEach((log) => {
      if (log.state === 'underway' || log.state === 'at-anchor') {
        seaDates.add(log.date);
      }
    });
    if (partOfActivePassageDates && partOfActivePassageDates.size > 0) {
      partOfActivePassageDates.forEach((d) => {
        if (logMap.has(d)) seaDates.add(d);
      });
    }
    if (watchDates && watchDates.size > 0) {
      watchDates.forEach((d) => {
        const log = logMap.get(d);
        if (log && (log.state === 'in-port' || log.state === 'at-anchor')) {
          seaDates.add(d);
        }
      });
    }
    totalSeaDays = seaDates.size;
  } else {
    // MCA-style: at sea = underway days in voyages + part of active passage + watch on in-port/at-anchor
    // Note: at-anchor days are NOT counted as sea days unless marked as part of active passage (or watch)
    totalSeaDays = voyages.reduce((sum, voyage) => sum + voyage.days, 0);

    if (watchDates && watchDates.size > 0) {
      const watchDaysCount = Array.from(watchDates).filter((dateStr) => {
        const log = logMap.get(dateStr);
        return log && (log.state === 'in-port' || log.state === 'at-anchor');
      }).length;
      totalSeaDays += watchDaysCount;
    }

    if (partOfActivePassageDates && partOfActivePassageDates.size > 0) {
      const partOfActivePassageDaysCount = Array.from(partOfActivePassageDates).filter((dateStr) => {
        const log = logMap.get(dateStr);
        return log && log.state !== 'underway';
      }).length;
      totalSeaDays += partOfActivePassageDaysCount;
    }
  }
  
  // Debug logging
  console.log(`[Standby Calculation] Found ${voyages.length} voyages, Total Sea Days: ${totalSeaDays}`);
  voyages.forEach((v, idx) => {
    console.log(`[Standby Calculation] Voyage ${idx + 1}: ${format(v.startDate, 'yyyy-MM-dd')} to ${format(v.endDate, 'yyyy-MM-dd')}, ${v.days} days`);
  });

  // Identify standby periods (consecutive 'in-port' or 'at-anchor' days immediately after voyages)
  // Note: 'at-anchor' can be both sea time (when part of voyage) and standby (when after voyage ends)
  // Process chronologically to properly identify consecutive standby periods after each voyage
  const standbyPeriods: StandbyPeriod[] = [];
  
  // Create a set of voyage start dates for quick lookup (to stop standby when next voyage starts)
  const voyageStartDates = new Set<string>();
  voyages.forEach(voyage => {
    voyageStartDates.add(format(voyage.startDate, 'yyyy-MM-dd'));
  });
  
  // For each voyage, find the standby period immediately following it
  for (let i = 0; i < voyages.length; i++) {
    const voyage = voyages[i];
    const voyageEndDate = voyage.endDate;
    let currentDate = addDays(voyageEndDate, 1); // Day after voyage ends
    const standbyStartDate = currentDate;
    let standbyDays = 0;
    
    // Find the start date of the next voyage (if any) to know when to stop counting standby
    const nextVoyageStartDate = i < voyages.length - 1 
      ? voyages[i + 1].startDate 
      : null;
    
    // Calculate the maximum allowed standby days for this voyage
    // Rule: Standby can't exceed the voyage duration (full passage span including part-of-active-passage), max 14 days
    // Use spanDays if available (includes part-of-active-passage days), otherwise use days (underway days only)
    const voyageSpanDays = (voyage as any).spanDays || voyage.days;
    const maxAllowedStandby = Math.min(14, voyageSpanDays);
    
    // Continue checking consecutive days as long as they are standby states
    // Standby includes both 'in-port' and 'at-anchor' (at-anchor can be standby when after voyage ends)
    // Stop if we hit the start of the next voyage OR reach the maximum allowed
    while (standbyDays < maxAllowedStandby) {
      const currentDateStr = format(currentDate, 'yyyy-MM-dd');
      
      // Stop if we've reached the start of the next voyage
      if (nextVoyageStartDate && currentDate >= nextVoyageStartDate) {
        console.log(`[Standby Calculation] Stopped at next voyage start: ${format(nextVoyageStartDate, 'yyyy-MM-dd')}`);
        break;
      }
      
      const log = logMap.get(currentDateStr);
      
      // Check if this date has a watch - if so, it counts as "at sea" not standby
      const hasWatch = watchDates?.has(currentDateStr);
      const isPartOfActivePassage = partOfActivePassageDates?.has(currentDateStr);
      const hasOverride = hasWatch || isPartOfActivePassage;
      
      // Check if log exists and is a standby state ('in-port' or 'at-anchor' after voyage ends)
      // Skip if officer was on watch or user marked part of active passage (these count as "at sea", not standby)
      // BUT: Don't break the standby period - just skip over these days and continue counting
      if (!log) {
        // No log for this date - end standby period
        console.log(`[Standby Calculation] No log found for ${currentDateStr}, ending standby period`);
        break;
      } else if (hasOverride) {
        // Watch day or part of active passage - skip this day but continue the standby period
        console.log(`[Standby Calculation] Skipping ${currentDateStr} (watch/part of active passage), continuing standby period`);
        currentDate = addDays(currentDate, 1); // Move to next day without counting this one
      } else if (log.state === 'in-port') {
        standbyDays++;
        currentDate = addDays(currentDate, 1);
      } else if (log.state === 'at-anchor') {
        // MCA: at-anchor after voyage can be standby. Vessel manager: at-anchor is sea only — skip without ending period.
        if (!vesselManagerSeaTime) standbyDays++;
        currentDate = addDays(currentDate, 1);
      } else {
        // in-yard, on-leave, underway, or any other state - end standby period; never count as standby
        console.log(`[Standby Calculation] Non-standby state '${log.state}' found for ${currentDateStr}, ending standby period`);
        break;
      }
    }
    
    // Always record standby period if we found any, even if it's 0 (for debugging)
    const standbyEndDate = standbyDays > 0 ? addDays(standbyStartDate, standbyDays - 1) : standbyStartDate;
    
    // Ensure we never record more days than allowed
    const actualStandbyDays = Math.min(standbyDays, maxAllowedStandby);
    
    console.log(`[Standby Calculation] Voyage ${i + 1}: ${format(voyage.startDate, 'yyyy-MM-dd')} to ${format(voyage.endDate, 'yyyy-MM-dd')} (${voyage.days} days)`);
    console.log(`[Standby Calculation] Standby period: ${format(standbyStartDate, 'yyyy-MM-dd')} to ${format(standbyEndDate, 'yyyy-MM-dd')} (${standbyDays} days found, ${actualStandbyDays} days will be counted, max allowed: ${maxAllowedStandby})`);
    if (nextVoyageStartDate) {
      console.log(`[Standby Calculation] Next voyage starts: ${format(nextVoyageStartDate, 'yyyy-MM-dd')}`);
    }
    
    if (standbyDays > 0) {
      standbyPeriods.push({
        startDate: standbyStartDate,
        endDate: standbyEndDate,
        days: actualStandbyDays, // Store the actual counted days, not the found days
        precedingVoyageDays: voyageSpanDays, // Use spanDays (includes part-of-active-passage) instead of voyage.days
        allowedDays: maxAllowedStandby,
        countedDays: 0, // Will be set in the counting phase
      });
    } else {
      console.log(`[Standby Calculation] No standby days found after voyage ${i + 1}`);
    }
  }

  // Apply rules to calculate counted standby days
  // When rangeStart/rangeEnd are set, only count days that fall within the range
  let totalStandbyDays = 0;
  
  for (const period of standbyPeriods) {
    // Rule 1: Max 14 consecutive days from any single period
    // Rule 2: A standby block can't be longer than the previous voyage
    // Apply both limits - the more restrictive one wins
    const maxAllowed = Math.min(14, period.precedingVoyageDays);
    
    // Count up to the maximum allowed (whichever is smaller: actual days, 14-day limit, or voyage length)
    const rawCounted = Math.min(period.days, maxAllowed);
    
    // Only count days that fall within the document/testimonial range when range is provided
    let counted = 0;
    const countedDates: string[] = [];
    for (let i = 0; i < rawCounted; i++) {
      const date = addDays(period.startDate, i);
      const dateStr = format(date, 'yyyy-MM-dd');
      if (rangeStart && rangeEnd) {
        if (dateStr < rangeStart || dateStr > rangeEnd) continue;
      }
      counted++;
      countedDates.push(dateStr);
    }
    
    period.countedDays = counted;
    totalStandbyDays += counted;
    
    console.log(`[Standby Calculation] Period: ${format(period.startDate, 'yyyy-MM-dd')} to ${format(period.endDate, 'yyyy-MM-dd')}, Days in Period: ${period.days}, Preceding Voyage: ${period.precedingVoyageDays} days, Max Allowed: ${maxAllowed}, Counted (in range): ${counted}`);
    if (countedDates.length > 0) {
      console.log(`[Standby Calculation] Counted dates: ${countedDates.join(', ')}`);
    }
  }

  // Debug logging
  console.log(`[Standby Calculation] Before final cap - Total Standby: ${totalStandbyDays}, Total Sea: ${totalSeaDays}`);

  // Rule 4: Total standby service can never exceed total actual sea service
  // This is a final cap on the total
  const finalStandbyDays = Math.min(totalStandbyDays, totalSeaDays);
  
  console.log(`[Standby Calculation] After final cap - Final Standby: ${finalStandbyDays}`);

  return {
    totalSeaDays,
    totalStandbyDays: finalStandbyDays,
    voyages,
    standbyPeriods,
  };
}



