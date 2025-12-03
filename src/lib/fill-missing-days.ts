/**
 * Utility to automatically fill in missing days between the last logged date and today
 * with the same state as the last logged entry
 */

import { format, addDays, differenceInDays, parse, startOfDay } from 'date-fns';
import type { StateLog } from './types';

/**
 * Find gaps between the most recent logged date and today, and return the missing days
 * @param stateLogs - Array of state logs for the vessel
 * @returns Array of dates (as strings in YYYY-MM-DD format) that need to be filled in, or null if no gap
 */
export function findMissingDays(stateLogs: StateLog[]): {
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

  // If there's a gap (more than 0 days difference) and last logged date is not in the future
  if (daysDiff > 0 && lastLoggedDateStart <= today) {
    const missingDays: string[] = [];
    
    // Generate all dates from the day after last logged date to today (inclusive)
    // If last logged date was 3 days ago, we fill: 2 days ago, 1 day ago, and today
    for (let i = 1; i <= daysDiff; i++) {
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



