/**
 * MCA/PYA Standby Days Calculation
 * 
 * Rules:
 * 1. Standby = time immediately following a voyage (consecutive 'underway' days)
 *    while in 'in-port' or 'at-anchor' states
 * 2. Max 14 consecutive days of standby can be counted from any single period
 * 3. A standby block can't be longer than the previous voyage
 * 4. Total standby service can never exceed total actual sea service
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

  // Identify voyages (consecutive 'underway' days)
  const voyages: Voyage[] = [];
  let currentVoyage: Voyage | null = null;

  for (let i = 0; i < sortedLogs.length; i++) {
    const log = sortedLogs[i];
    const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
    
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
          // Continue voyage (consecutive day)
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
      // End current voyage if exists
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
  // Process chronologically to properly identify consecutive standby periods after each voyage
  const standbyPeriods: StandbyPeriod[] = [];
  
  // Create a map of date -> log for quick lookup
  const logMap = new Map<string, StateLog>();
  sortedLogs.forEach(log => {
    logMap.set(log.date, log);
  });
  
  // For each voyage, find the standby period immediately following it
  for (const voyage of voyages) {
    const voyageEndDate = voyage.endDate;
    let currentDate = addDays(voyageEndDate, 1); // Day after voyage ends
    const standbyStartDate = currentDate;
    let standbyDays = 0;
    
    // Continue checking consecutive days as long as they are standby states
    while (true) {
      const currentDateStr = format(currentDate, 'yyyy-MM-dd');
      const log = logMap.get(currentDateStr);
      
      // Check if log exists and is a standby state
      if (log && (log.state === 'in-port' || log.state === 'at-anchor')) {
        standbyDays++;
        currentDate = addDays(currentDate, 1); // Move to next day
      } else {
        // No log for this date or not a standby state - end standby period
        break;
      }
    }
    
    if (standbyDays > 0) {
      const standbyEndDate = addDays(standbyStartDate, standbyDays - 1);
      
      standbyPeriods.push({
        startDate: standbyStartDate,
        endDate: standbyEndDate,
        days: standbyDays,
        precedingVoyageDays: voyage.days,
        allowedDays: Math.min(14, voyage.days),
        countedDays: 0,
      });
    }
  }

  // Apply rules to calculate counted standby days
  let totalStandbyDays = 0;
  
  for (const period of standbyPeriods) {
    // Rule 1: Max 14 consecutive days from any single period
    // Rule 2: A standby block can't be longer than the previous voyage
    // Apply both limits - the more restrictive one wins
    const maxAllowed = Math.min(14, period.precedingVoyageDays);
    
    // Count up to the maximum allowed (whichever is smaller: actual days, 14-day limit, or voyage length)
    const counted = Math.min(period.days, maxAllowed);
    period.countedDays = counted;
    totalStandbyDays += counted;
    
    // Debug logging
    console.log(`[Standby Calculation] Period: ${format(period.startDate, 'yyyy-MM-dd')} to ${format(period.endDate, 'yyyy-MM-dd')}, Days: ${period.days}, Preceding Voyage: ${period.precedingVoyageDays} days, Allowed: ${maxAllowed}, Counted: ${counted}`);
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



