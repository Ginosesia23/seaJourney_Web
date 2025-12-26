/**
 * Visa Compliance Calculation
 * 
 * Handles different visa rules:
 * - Fixed: Total days allowed in visa period (e.g., 90 days total)
 * - Rolling: X days in any Y-day period (e.g., 90 days in any 180-day period for Schengen)
 */

import { parse, format, subDays, addDays, differenceInDays, isWithinInterval, startOfDay, isBefore, isAfter } from 'date-fns';
import type { VisaEntry, VisaTracker } from './types';

export interface VisaComplianceResult {
  daysUsed: number;
  daysRemaining: number;
  isCompliant: boolean;
  isWarning: boolean; // Approaching limit (within 10% or 10 days)
  maxDaysInCurrentPeriod?: number; // For rolling rules
  earliestAvailableDate?: string; // For rolling rules - when next day becomes available
  violations?: Array<{
    date: string;
    daysUsed: number;
    limit: number;
  }>;
}

/**
 * Calculate compliance for a fixed rule (total days in visa period)
 */
function calculateFixedCompliance(
  visa: VisaTracker,
  entries: VisaEntry[]
): VisaComplianceResult {
  const daysUsed = entries.length;
  const daysAllowed = visa.daysAllowed || visa.totalDays;
  const daysRemaining = daysAllowed - daysUsed;
  const isCompliant = daysUsed <= daysAllowed;
  const warningThreshold = Math.max(10, daysAllowed * 0.1); // 10% or 10 days, whichever is larger
  const isWarning = !isCompliant || daysRemaining <= warningThreshold;

  return {
    daysUsed,
    daysRemaining: Math.max(0, daysRemaining),
    isCompliant,
    isWarning,
  };
}

/**
 * Calculate compliance for a rolling rule (X days in any Y-day period)
 * Example: 90 days in any 180-day period (Schengen)
 */
function calculateRollingCompliance(
  visa: VisaTracker,
  entries: VisaEntry[]
): VisaComplianceResult {
  // For rolling rules, daysAllowed must be set - don't default to 90 if not set
  // This ensures we use the correct limit from the visa configuration
  if (!visa.daysAllowed) {
    console.warn('[VISA COMPLIANCE] Rolling rule visa missing daysAllowed, defaulting to 90');
  }
  const daysAllowed = visa.daysAllowed || 90;
  const periodDays = visa.periodDays || 180;
  const daysUsed = entries.length;

  if (entries.length === 0) {
    return {
      daysUsed: 0,
      daysRemaining: daysAllowed,
      isCompliant: true,
      isWarning: false,
      maxDaysInCurrentPeriod: 0,
    };
  }

  // Sort entries by date
  const sortedEntries = [...entries].sort((a, b) => 
    new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()
  );

  // Check each possible 180-day window
  let maxDaysInWindow = 0;
  const violations: Array<{ date: string; daysUsed: number; limit: number }> = [];
  let earliestAvailableDate: Date | null = null;

  // For each entry date, check the rolling window ending on that date
  for (let i = 0; i < sortedEntries.length; i++) {
    const windowEnd = startOfDay(parse(sortedEntries[i].entryDate, 'yyyy-MM-dd', new Date()));
    const windowStart = startOfDay(subDays(windowEnd, periodDays - 1)); // -1 because we include both start and end

    // Count entries within this window
    const entriesInWindow = sortedEntries.filter(entry => {
      const entryDate = startOfDay(parse(entry.entryDate, 'yyyy-MM-dd', new Date()));
      // Use inclusive comparison: entryDate >= windowStart && entryDate <= windowEnd
      return !isBefore(entryDate, windowStart) && !isAfter(entryDate, windowEnd);
    });

    const daysInWindow = entriesInWindow.length;
    maxDaysInWindow = Math.max(maxDaysInWindow, daysInWindow);

    // Check if this window violates the rule
    if (daysInWindow > daysAllowed) {
      violations.push({
        date: format(windowEnd, 'yyyy-MM-dd'),
        daysUsed: daysInWindow,
        limit: daysAllowed,
      });
    }
  }

  // Calculate earliest available date (when the oldest entry falls out of the rolling window)
  if (sortedEntries.length > 0) {
    const oldestEntry = parse(sortedEntries[0].entryDate, 'yyyy-MM-dd', new Date());
    earliestAvailableDate = addDays(oldestEntry, periodDays);
  }

  // Check current window (last 180 days from today)
  // For a 180-day rolling window, we look back exactly 180 days from today
  // So if today is Dec 1, we look at entries from June 4 to Dec 1 (180 days total, inclusive)
  // We use periodDays - 1 to get exactly periodDays days including today
  const today = startOfDay(new Date());
  const currentWindowStart = startOfDay(subDays(today, periodDays - 1)); // Go back (periodDays - 1) days to get periodDays days total (including today)
  
  const currentWindowEntries = sortedEntries.filter(entry => {
    const entryDate = startOfDay(parse(entry.entryDate, 'yyyy-MM-dd', new Date()));
    // Only include entries that are within the rolling window (from windowStart to today, inclusive)
    // entryDate must be >= currentWindowStart AND <= today
    // This ensures dates older than the window (like May dates when it's December) are excluded
    return !isBefore(entryDate, currentWindowStart) && !isAfter(entryDate, today);
  });
  const currentWindowDays = currentWindowEntries.length;

  const isCompliant = maxDaysInWindow <= daysAllowed && currentWindowDays <= daysAllowed;
  const warningThreshold = Math.max(10, daysAllowed * 0.1);
  const isWarning = !isCompliant || (daysAllowed - currentWindowDays) <= warningThreshold;

  return {
    daysUsed: currentWindowDays,
    daysRemaining: Math.max(0, daysAllowed - currentWindowDays),
    isCompliant,
    isWarning,
    maxDaysInCurrentPeriod: currentWindowDays,
    earliestAvailableDate: earliestAvailableDate ? format(earliestAvailableDate, 'yyyy-MM-dd') : undefined,
    violations: violations.length > 0 ? violations : undefined,
  };
}

/**
 * Check if a new date would violate visa rules
 */
export function checkDateCompliance(
  visa: VisaTracker,
  entries: VisaEntry[],
  newDate: Date
): { allowed: boolean; reason?: string; daysInWindow?: number; limit?: number } {
  if (visa.ruleType === 'rolling' && visa.periodDays && visa.daysAllowed) {
    const dateStr = format(newDate, 'yyyy-MM-dd');
    const windowEnd = startOfDay(newDate);
    const windowStart = startOfDay(subDays(windowEnd, visa.periodDays - 1));

    // Count entries in the rolling window ending on the new date
    const entriesInWindow = entries.filter(entry => {
      const entryDate = startOfDay(parse(entry.entryDate, 'yyyy-MM-dd', new Date()));
      // Use inclusive comparison: entryDate >= windowStart && entryDate <= windowEnd
      return !isBefore(entryDate, windowStart) && !isAfter(entryDate, windowEnd);
    });

    const daysInWindow = entriesInWindow.length + 1; // +1 for the new date
    const allowed = daysInWindow <= visa.daysAllowed;

    if (!allowed) {
      return {
        allowed: false,
        reason: `This date would exceed the limit of ${visa.daysAllowed} days in any ${visa.periodDays}-day period. You would have ${daysInWindow} days in this window.`,
        daysInWindow,
        limit: visa.daysAllowed,
      };
    }
  } else {
    // Fixed rule
    const daysAllowed = visa.daysAllowed || visa.totalDays;
    const daysUsed = entries.length;
    const allowed = daysUsed < daysAllowed;

    if (!allowed) {
      return {
        allowed: false,
        reason: `You have already used all ${daysAllowed} days allowed for this visa.`,
        daysInWindow: daysUsed,
        limit: daysAllowed,
      };
    }
  }

  return { allowed: true };
}

/**
 * Calculate visa compliance based on rule type
 */
export function calculateVisaCompliance(
  visa: VisaTracker,
  entries: VisaEntry[]
): VisaComplianceResult {
  if (visa.ruleType === 'rolling' && visa.periodDays) {
    return calculateRollingCompliance(visa, entries);
  } else {
    return calculateFixedCompliance(visa, entries);
  }
}

/**
 * Common visa rule presets
 */
export const visaRulePresets: Record<string, { ruleType: 'fixed' | 'rolling'; daysAllowed: number; periodDays?: number }> = {
  // Schengen Area - 90 days in any 180-day period
  'schengen_area': {
    ruleType: 'rolling',
    daysAllowed: 90,
    periodDays: 180,
  },
  'schengen': {
    ruleType: 'rolling',
    daysAllowed: 90,
    periodDays: 180,
  },
  'european union': {
    ruleType: 'rolling',
    daysAllowed: 90,
    periodDays: 180,
  },
  'eu': {
    ruleType: 'rolling',
    daysAllowed: 90,
    periodDays: 180,
  },
  
  // USA - 90 days fixed (ESTA/Visa Waiver)
  'usa_esta': {
    ruleType: 'fixed',
    daysAllowed: 90,
  },
  'usa': {
    ruleType: 'fixed',
    daysAllowed: 90,
  },
  'united states': {
    ruleType: 'fixed',
    daysAllowed: 90,
  },
  'us': {
    ruleType: 'fixed',
    daysAllowed: 90,
  },
  
  // UK - 180 days in any 365-day period
  'uk_visitor': {
    ruleType: 'rolling',
    daysAllowed: 180,
    periodDays: 365,
  },
  'uk': {
    ruleType: 'rolling',
    daysAllowed: 180,
    periodDays: 365,
  },
  'united kingdom': {
    ruleType: 'rolling',
    daysAllowed: 180,
    periodDays: 365,
  },
  
  // Australia - 90 days fixed (ETA)
  'australia_eta': {
    ruleType: 'fixed',
    daysAllowed: 90,
  },
  'australia': {
    ruleType: 'fixed',
    daysAllowed: 90,
  },
  
  // Canada - 180 days in any 365-day period
  'canada': {
    ruleType: 'rolling',
    daysAllowed: 180,
    periodDays: 365,
  },
  
  // New Zealand - 90 days fixed
  'new zealand': {
    ruleType: 'fixed',
    daysAllowed: 90,
  },
  'nz': {
    ruleType: 'fixed',
    daysAllowed: 90,
  },
  
  // Japan - 90 days fixed
  'japan': {
    ruleType: 'fixed',
    daysAllowed: 90,
  },
  
  // Singapore - 90 days fixed
  'singapore': {
    ruleType: 'fixed',
    daysAllowed: 90,
  },
  
  // Hong Kong - 90 days fixed
  'hong kong': {
    ruleType: 'fixed',
    daysAllowed: 90,
  },
  
  // UAE - 90 days fixed
  'united arab emirates': {
    ruleType: 'fixed',
    daysAllowed: 90,
  },
  'uae': {
    ruleType: 'fixed',
    daysAllowed: 90,
  },
  
  // Bahamas - 90 days fixed
  'bahamas': {
    ruleType: 'fixed',
    daysAllowed: 90,
  },
  
  // Caribbean - 90 days fixed (general)
  'caribbean': {
    ruleType: 'fixed',
    daysAllowed: 90,
  },
  
  // Mediterranean - 90 days in any 180-day period (Schengen-like)
  'mediterranean': {
    ruleType: 'rolling',
    daysAllowed: 90,
    periodDays: 180,
  },
};

/**
 * Detect visa rules based on area name
 * Returns the matching preset or null if no match found
 */
export function detectVisaRules(areaName: string): { ruleType: 'fixed' | 'rolling'; daysAllowed: number; periodDays?: number } | null {
  if (!areaName) return null;
  
  // Normalize the area name for matching (lowercase, remove extra spaces)
  const normalized = areaName.toLowerCase().trim().replace(/\s+/g, ' ');
  
  // Check exact matches first
  if (visaRulePresets[normalized]) {
    return visaRulePresets[normalized];
  }
  
  // Check for partial matches (e.g., "Schengen Area" contains "schengen")
  for (const [key, preset] of Object.entries(visaRulePresets)) {
    // Check if the normalized area name contains the key or vice versa
    if (normalized.includes(key) || key.includes(normalized)) {
      return preset;
    }
  }
  
  // Special cases for common variations
  // Schengen variations
  if (normalized.includes('schengen') || normalized.includes('european union') || normalized.includes(' eu ') || normalized === 'eu') {
    return visaRulePresets['schengen'];
  }
  
  // USA variations
  if (normalized.includes('united states') || normalized.includes(' usa ') || normalized === 'us' || normalized.startsWith('usa')) {
    return visaRulePresets['usa'];
  }
  
  // UK variations
  if (normalized.includes('united kingdom') || normalized.includes(' uk ') || normalized === 'uk' || normalized.startsWith('uk ')) {
    return visaRulePresets['uk'];
  }
  
  // UAE variations
  if (normalized.includes('united arab emirates') || normalized === 'uae' || normalized.includes(' uae ')) {
    return visaRulePresets['uae'];
  }
  
  // New Zealand variations
  if (normalized.includes('new zealand') || normalized === 'nz' || normalized.includes(' nz ')) {
    return visaRulePresets['new zealand'];
  }
  
  return null;
}

