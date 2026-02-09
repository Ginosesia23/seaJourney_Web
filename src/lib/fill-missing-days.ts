/**
 * Utility to automatically fill in missing days between the last logged date and today
 * with the same state as the last logged entry
 */

import { format, addDays, differenceInDays, parse, startOfDay, subDays } from 'date-fns';
import type { StateLog } from './types';

/**
 * Find gaps between the most recent logged date and today, and return the missing days
 * Only fills gaps within a reasonable period (e.g., last 90 days) to avoid filling years of historical data
 * @param stateLogs - Array of state logs for the vessel
 * @param maxDaysToFill - Maximum number of days back from today to fill gaps (default: 90 days)
 * @returns Array of dates (as strings in YYYY-MM-DD format) that need to be filled in, or null if no gap
 */
export function findMissingDays(stateLogs: StateLog[], maxDaysToFill: number = 90): {
  lastLoggedDate: Date | null;
  lastLoggedState: string | null;
  missingDays: string[];
} {
  if (!stateLogs || stateLogs.length === 0) {
    return {
      lastLoggedDate: null,
      lastLoggedState: null,
      missingDays: [],
    };
  }

  // Sort logs by date (most recent first)
  const sortedLogs = [...stateLogs].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const mostRecentLog = sortedLogs[0];
  const lastLoggedDate = parse(mostRecentLog.date, 'yyyy-MM-dd', new Date());
  const lastLoggedState = mostRecentLog.state;

  const today = startOfDay(new Date());
  const lastLoggedDateStart = startOfDay(lastLoggedDate);
  const daysDiff = differenceInDays(today, lastLoggedDateStart);

  // Calculate the cutoff date (maxDaysToFill days ago from today)
  const cutoffDate = subDays(today, maxDaysToFill);

  // Only fill gaps if:
  // 1. There's a gap (more than 0 days difference)
  // 2. Last logged date is not in the future
  // 3. Last logged date is within the maxDaysToFill period (not too far in the past)
  if (daysDiff > 0 && lastLoggedDateStart <= today && lastLoggedDateStart >= cutoffDate) {
    const missingDays: string[] = [];
    
    // Generate all dates from the day after last logged date to today (inclusive)
    // But only up to maxDaysToFill days from today
    const maxDaysFromToday = Math.min(daysDiff, maxDaysToFill);
    
    for (let i = 1; i <= maxDaysFromToday; i++) {
      const missingDate = addDays(lastLoggedDateStart, i);
      // Only include dates up to and including today
      if (missingDate <= today) {
        missingDays.push(format(missingDate, 'yyyy-MM-dd'));
      }
    }

    return {
      lastLoggedDate: lastLoggedDateStart,
      lastLoggedState,
      missingDays,
    };
  }

  return {
    lastLoggedDate,
    lastLoggedState,
    missingDays: [],
  };
}



