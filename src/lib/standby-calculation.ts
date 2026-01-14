/**
 * MCA/PYA Standby Days Calculation
 * 
 * Rules:
 * 1. Voyages = consecutive 'underway' days (or 'at-anchor' days that are part of an active passage)
 *    Note: 'at-anchor' days AFTER a voyage ends are counted as standby, not part of the voyage
 * 2. Standby = time immediately following a voyage while in 'in-port' or 'at-anchor' state
 *    (at-anchor can be both sea time when part of voyage, and standby when after voyage ends)
 * 3. Max 14 consecutive days of standby can be counted from any single period
 * 4. A standby block can't be longer than the previous voyage
 * 5. Total standby service can never exceed total actual sea service
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

/**
 * Calculate MCA/PYA compliant standby days from state logs
 */
export function calculateStandbyDays(stateLogs: StateLog[]): {
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
  const sortedLogs = [...stateLogs].sort((a, b) => {
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  // Identify voyages (ONLY consecutive 'underway' days)
  // Key rule: Voyages are ONLY 'underway' days. 'at-anchor' days after 'underway' ends are standby.
  // This ensures that after a passage ends, 'at-anchor' days count as standby, not part of the voyage.
  const voyages: Voyage[] = [];
  let currentVoyage: Voyage | null = null;

  for (let i = 0; i < sortedLogs.length; i++) {
    const log = sortedLogs[i];
    const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
    
    // Only 'underway' days count as voyages
    // 'at-anchor' days will be handled as standby after voyages end
    if (log.state === 'underway') {
      if (!currentVoyage) {
        // Start new voyage
        currentVoyage = {
          startDate: logDate,
          endDate: logDate,
          days: 1,
        };
      } else {
        // Check if this is a consecutive day
        const lastDate = currentVoyage.endDate;
        const expectedNextDate = addDays(lastDate, 1);
        
        if (format(logDate, 'yyyy-MM-dd') === format(expectedNextDate, 'yyyy-MM-dd')) {
          // Continue voyage (consecutive 'underway' day)
          currentVoyage.endDate = logDate;
          currentVoyage.days++;
        } else {
          // Gap detected - end current voyage and start new one
          voyages.push(currentVoyage);
          currentVoyage = {
            startDate: logDate,
            endDate: logDate,
            days: 1,
          };
        }
      }
    } else {
      // Any non-'underway' state (including 'at-anchor') ends the voyage
      // 'at-anchor' days will be counted as standby after the voyage ends
      if (currentVoyage) {
        voyages.push(currentVoyage);
        currentVoyage = null;
      }
    }
  }

  // Add final voyage if still in progress
  if (currentVoyage) {
    voyages.push(currentVoyage);
  }

  // Calculate total sea days
  const totalSeaDays = voyages.reduce((sum, voyage) => sum + voyage.days, 0);
  
  // Debug logging
  console.log(`[Standby Calculation] Found ${voyages.length} voyages, Total Sea Days: ${totalSeaDays}`);
  voyages.forEach((v, idx) => {
    console.log(`[Standby Calculation] Voyage ${idx + 1}: ${format(v.startDate, 'yyyy-MM-dd')} to ${format(v.endDate, 'yyyy-MM-dd')}, ${v.days} days`);
  });

  // Identify standby periods (consecutive 'in-port' or 'at-anchor' days immediately after voyages)
  // Note: 'at-anchor' can be both sea time (when part of voyage) and standby (when after voyage ends)
  // Process chronologically to properly identify consecutive standby periods after each voyage
  const standbyPeriods: StandbyPeriod[] = [];
  
  // Create a map of date -> log for quick lookup
  const logMap = new Map<string, StateLog>();
  sortedLogs.forEach(log => {
    logMap.set(log.date, log);
  });
  
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
    // Rule: Standby can't exceed the voyage duration, max 14 days
    const maxAllowedStandby = Math.min(14, voyage.days);
    
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
      
      // Check if log exists and is a standby state ('in-port' or 'at-anchor' after voyage ends)
      if (log && (log.state === 'in-port' || log.state === 'at-anchor')) {
        standbyDays++;
        currentDate = addDays(currentDate, 1); // Move to next day
      } else {
        // No log for this date or not a standby state - end standby period
        if (!log) {
          console.log(`[Standby Calculation] No log found for ${currentDateStr}, ending standby period`);
        } else {
          console.log(`[Standby Calculation] Non-standby state '${log.state}' found for ${currentDateStr}, ending standby period`);
        }
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
        precedingVoyageDays: voyage.days,
        allowedDays: maxAllowedStandby,
        countedDays: 0, // Will be set in the counting phase
      });
    } else {
      console.log(`[Standby Calculation] No standby days found after voyage ${i + 1}`);
    }
  }

  // Apply rules to calculate counted standby days
  // Note: period.days should already be limited to maxAllowedStandby, but we double-check here
  let totalStandbyDays = 0;
  
  for (const period of standbyPeriods) {
    // Rule 1: Max 14 consecutive days from any single period
    // Rule 2: A standby block can't be longer than the previous voyage
    // Apply both limits - the more restrictive one wins
    const maxAllowed = Math.min(14, period.precedingVoyageDays);
    
    // Count up to the maximum allowed (whichever is smaller: actual days, 14-day limit, or voyage length)
    // period.days should already be capped, but we ensure it here
    const counted = Math.min(period.days, maxAllowed);
    
    // Safety check: ensure we never count more than allowed
    if (counted > maxAllowed) {
      console.warn(`[Standby Calculation] WARNING: Counted ${counted} days but max allowed is ${maxAllowed}, capping to ${maxAllowed}`);
    }
    
    if (period.days > maxAllowed) {
      console.warn(`[Standby Calculation] WARNING: Period has ${period.days} days but max allowed is ${maxAllowed}, this should not happen!`);
    }
    
    period.countedDays = counted;
    totalStandbyDays += counted;
    
    // Debug logging - show which dates are being counted
    const countedDates: string[] = [];
    for (let i = 0; i < counted; i++) {
      const date = addDays(period.startDate, i);
      countedDates.push(format(date, 'yyyy-MM-dd'));
    }
    
    console.log(`[Standby Calculation] Period: ${format(period.startDate, 'yyyy-MM-dd')} to ${format(period.endDate, 'yyyy-MM-dd')}, Days in Period: ${period.days}, Preceding Voyage: ${period.precedingVoyageDays} days, Max Allowed: ${maxAllowed}, Counted: ${counted}`);
    console.log(`[Standby Calculation] Counted dates: ${countedDates.join(', ')}`);
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



