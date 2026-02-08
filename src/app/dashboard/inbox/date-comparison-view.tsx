'use client';

import { useMemo, useEffect } from 'react';
import { format, parse, eachDayOfInterval, addDays } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle2, AlertTriangle, User, Ship, XCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { calculateStandbyDays } from '@/lib/standby-calculation';
import type { StateLog } from '@/lib/types';

interface DateComparisonViewProps {
  requestedStart: string; // YYYY-MM-DD
  requestedEnd: string; // YYYY-MM-DD
  requestedDays: number;
  actualLogs: StateLog[]; // Crew member's logs
  vesselLogs?: StateLog[]; // All vessel logs (for comparison)
  testimonial?: any; // Testimonial object for day count breakdown
  watchDates?: Set<string>; // Watch dates for the crew member (officers only)
  onComparisonChange?: (comparison: any) => void; // Callback to pass comparison data to parent
}

// Helper to format state names
function formatStateName(state: string): string {
  const stateMap: Record<string, string> = {
    'underway': 'At Sea',
    'at-anchor': 'At Anchor',
    'in-port': 'In Port',
    'on-leave': 'On Leave',
    'in-yard': 'In Yard'
  };
  return stateMap[state] || state;
}

// Helper to get state badge color
function getStateBadgeVariant(state: string): string {
  const variantMap: Record<string, string> = {
    'underway': 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400',
    'at-anchor': 'bg-orange-500/10 text-orange-700 border-orange-500/20 dark:bg-orange-500/20 dark:text-orange-400',
    'in-port': 'bg-green-500/10 text-green-700 border-green-500/20 dark:bg-green-500/20 dark:text-green-400',
    'on-leave': 'bg-gray-500/10 text-gray-700 border-gray-500/20 dark:bg-gray-500/20 dark:text-gray-400',
    'in-yard': 'bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/20 dark:text-red-400'
  };
  return variantMap[state] || 'bg-gray-500/10 text-gray-700 border-gray-500/20';
}

export function DateComparisonView({ 
  requestedStart, 
  requestedEnd, 
  requestedDays, 
  actualLogs,
  vesselLogs = [],
  testimonial,
  watchDates = new Set(),
  onComparisonChange
}: DateComparisonViewProps) {
  // Debug logging for watch dates
  useEffect(() => {
    console.log('[DateComparisonView] Watch dates received:', {
      watchDatesCount: watchDates.size,
      watchDates: Array.from(watchDates),
      requestedStart,
      requestedEnd
    });
  }, [watchDates, requestedStart, requestedEnd]);

  const comparison = useMemo(() => {
    const startDate = parse(requestedStart, 'yyyy-MM-dd', new Date());
    const endDate = parse(requestedEnd, 'yyyy-MM-dd', new Date());
    
    // Get all dates in the requested range
    const requestedDates = eachDayOfInterval({ start: startDate, end: endDate });
    
    // Use the crew member's ACTUAL daily_state_logs as the source of truth for what they requested
    // Filter to the date range and create a map
    const crewLogMap = new Map<string, StateLog>();
    actualLogs.forEach(log => {
      const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
      // Only include logs within the requested date range
      if (logDate >= startDate && logDate <= endDate) {
        crewLogMap.set(log.date, log);
      }
    });
    
    // Create requested log map from actual crew member logs (what they actually recorded)
    // This is the source of truth - what the crew member logged for each date
    const requestedLogMap = new Map<string, { date: string; state: string }>();
    crewLogMap.forEach((log, dateStr) => {
      requestedLogMap.set(dateStr, { date: dateStr, state: log.state });
    });
    
    // If we don't have logs for all dates in the range, fill in missing dates
    // This can happen if the crew member didn't log every single day
    // For missing dates, we'll mark them as not requested
    requestedDates.forEach(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      if (!requestedLogMap.has(dateStr)) {
        // Date is in range but crew member didn't log it - mark as not requested
        requestedLogMap.set(dateStr, { date: dateStr, state: '' });
      }
    });
    
    // Create map for vessel logs (what the vessel actually logged)
    const vesselLogMap = new Map<string, StateLog>();
    vesselLogs.forEach(log => {
      const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
      // Only include logs within the requested date range
      if (logDate >= startDate && logDate <= endDate) {
      vesselLogMap.set(log.date, log);
      }
    });
    
    // Calculate MCA/PYA compliant standby days for crew member's logs (needed for standby dates)
    // Extract part of active passage dates from crew member's logs
    const partOfActivePassageDates = new Set<string>();
    actualLogs.forEach(log => {
      const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
      if (logDate >= startDate && logDate <= endDate && log.isPartOfActivePassage) {
        partOfActivePassageDates.add(log.date);
      }
    });

    // Filter crew logs to date range for calculation
    const crewLogsInRange = actualLogs.filter(log => {
      const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
      return logDate >= startDate && logDate <= endDate;
    });

    // Calculate standby periods using MCA/PYA compliant logic
    const { standbyPeriods } = calculateStandbyDays(
      crewLogsInRange,
      watchDates,
      partOfActivePassageDates
    );
    
    // Calculate vessel logs breakdown (needed before day-by-day comparison)
    const vesselLogsInRange = vesselLogs.filter(log => {
      const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
      return logDate >= startDate && logDate <= endDate;
    });
    
    // Extract vessel part of active passage dates
    const vesselPartOfActivePassageDates = new Set<string>();
    vesselLogsInRange.forEach(log => {
      if (log.isPartOfActivePassage) {
        vesselPartOfActivePassageDates.add(log.date);
      }
    });
    
    // Calculate vessel standby periods (needed for vesselStandbyDatesSet)
    const { standbyPeriods: vesselStandbyPeriods } = calculateStandbyDays(
      vesselLogsInRange,
      undefined, // No watch dates for vessel (watch is crew-specific)
      vesselPartOfActivePassageDates
    );
    
    // Create a set of vessel dates that are counted as standby (using MCA/PYA compliant logic)
    const vesselStandbyDatesSet = new Set<string>();
    vesselStandbyPeriods.forEach(period => {
      let currentDate = period.startDate;
      let counted = 0;
      while (currentDate <= period.endDate && counted < period.countedDays) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const log = vesselLogsInRange.find(l => l.date === dateStr);
        // Only count if it's within the date range and not part of passage day
        const logDate = parse(dateStr, 'yyyy-MM-dd', new Date());
        if (logDate >= startDate && logDate <= endDate && log) {
          const isPartOfPassage = vesselPartOfActivePassageDates.has(dateStr);
          if (!isPartOfPassage && (log.state === 'in-port' || log.state === 'at-anchor')) {
            vesselStandbyDatesSet.add(dateStr);
            counted++;
          }
        }
        currentDate = addDays(currentDate, 1);
      }
    });
    
    // Create a set of dates that are counted as standby (crew)
    const standbyDatesSet = new Set<string>();
    standbyPeriods.forEach(period => {
      let currentDate = period.startDate;
      let counted = 0;
      while (currentDate <= period.endDate && counted < period.countedDays) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const log = crewLogsInRange.find(l => l.date === dateStr);
        // Only count if it's within the date range and not a watch/part of passage day
        const logDate = parse(dateStr, 'yyyy-MM-dd', new Date());
        if (logDate >= startDate && logDate <= endDate && log) {
          const hasWatch = watchDates.has(dateStr);
          const isPartOfPassage = partOfActivePassageDates.has(dateStr);
          if (!hasWatch && !isPartOfPassage && (log.state === 'in-port' || log.state === 'at-anchor')) {
            standbyDatesSet.add(dateStr);
            counted++;
          }
        }
        currentDate = addDays(currentDate, 1);
      }
    });
    
    // Build day-by-day comparison
    // EXCLUDE "on-leave" dates from crew member's logs before comparing with vessel
    // Only compare non-leave dates with vessel state logs
    const dayByDayComparison = requestedDates.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const requestedLog = requestedLogMap.get(dateStr); // What crew member actually logged (from daily_state_logs)
      const vesselLog = vesselLogMap.get(dateStr); // What vessel actually logged
      
      // EXCLUDE on-leave dates from comparison - these should be ignored
      const isOnLeave = requestedLog?.state === 'on-leave';
      const hasRequestedState = !!requestedLog?.state && requestedLog.state !== '';
      
      // Only compare if NOT on leave and crew member has a logged state for this date
      // If crew member was on leave, we skip comparison for that date
      const statesMatch = !isOnLeave && hasRequestedState && vesselLog && requestedLog.state === vesselLog.state;
      const hasRequested = hasRequestedState && !isOnLeave; // Exclude on-leave from requested count
      const hasVesselLog = !!vesselLog;
      
      // Check if this date has special flags for crew member
      const crewLog = crewLogMap.get(dateStr);
      const crewIsPartOfActivePassage = crewLog?.isPartOfActivePassage || false;
      const isWatchDay = watchDates.has(dateStr);
      const crewIsStandbyDay = standbyDatesSet.has(dateStr);
      
      // Check if vessel also has the same indicators
      const vesselIsPartOfActivePassage = vesselLog?.isPartOfActivePassage || false;
      
      // Vessel standby: use MCA/PYA compliant calculation (dates that are actually counted as standby)
      const vesselIsStandbyDay = vesselStandbyDatesSet.has(dateStr);
      
      // Both part of passage: both crew and vessel marked as part of passage
      const bothPartOfPassage = crewIsPartOfActivePassage && vesselIsPartOfActivePassage;
      
      // Part of passage mismatch: one has it but not the other (only count if both have logs)
      const partOfPassageMismatch = hasRequested && hasVesselLog && 
        ((crewIsPartOfActivePassage && !vesselIsPartOfActivePassage) || 
         (!crewIsPartOfActivePassage && vesselIsPartOfActivePassage));
      
      // Both standby: crew is standby AND vessel is standby (using MCA/PYA compliant calculation)
      // Note: Standby is NOT included in match rate as it's automatically calculated
      // Watch days take priority and are NOT counted as standby
      const bothStandby = crewIsStandbyDay && vesselIsStandbyDay && !crewIsPartOfActivePassage && !vesselIsPartOfActivePassage && !isWatchDay;
      
      // Overall match: state matches AND part of passage matches (if applicable)
      // Standby is excluded from match calculation as it's automatically calculated
      // Watch validation errors don't affect match rate but are flagged visually
      const overallMatch = statesMatch && (!crewIsPartOfActivePassage && !vesselIsPartOfActivePassage || bothPartOfPassage);
      
      return {
        date,
        dateStr,
        crewState: requestedLog?.state || null, // What crew member actually logged (from daily_state_logs)
        vesselState: vesselLog?.state || null, // What vessel logged
        actualLogState: requestedLog?.state || null, // Same as crewState (for consistency)
        isOnLeave, // Track if this is a leave day
        statesMatch,
        overallMatch, // State match AND part of passage match (if applicable)
        hasCrewLog: hasRequested, // Whether crew member logged a state for this date (excluding leave)
        hasVesselLog,
        matchesActualLog: true, // Since we're using actual logs, this is always true
        isDiscrepancy: !isOnLeave && hasRequested && hasVesselLog && !overallMatch, // Updated to use overallMatch
        isMissingCrew: !isOnLeave && !hasRequested && hasVesselLog,
        isMissingVessel: !isOnLeave && hasRequested && !hasVesselLog,
        isPartOfActivePassage: crewIsPartOfActivePassage, // Whether crew member marked as part of active passage
        vesselIsPartOfActivePassage, // Whether vessel marked as part of active passage
        vesselIsStandbyDay, // Whether vessel day is counted as standby (MCA/PYA compliant)
        bothPartOfPassage, // Whether both crew and vessel have part of passage
        partOfPassageMismatch, // Whether part of passage doesn't match
        isWatchDay, // Whether this day is a watch day (for officers)
        isStandbyDay: crewIsStandbyDay && !crewIsPartOfActivePassage && !isWatchDay, // Whether crew day is counted as standby (excluding part of passage and watch days)
        bothStandby, // Whether both crew and vessel are in standby states (excluding part of passage)
        bothMatchState: statesMatch // Whether both have matching states
      };
    });
    
    // Calculate summary stats
    // Exclude on-leave days from all calculations
    const nonLeaveDays = dayByDayComparison.filter(d => !d.isOnLeave);
    const crewLoggedDays = nonLeaveDays.filter(d => d.hasCrewLog).length;
    // Only count vessel logs for dates where crew member has a log (to match the requested range)
    const vesselLoggedDays = nonLeaveDays.filter(d => d.hasCrewLog && d.hasVesselLog).length;
    // Match includes both state match AND part of passage match (if applicable)
    // Standby is excluded as it's automatically calculated
    const matchingDays = nonLeaveDays.filter(d => d.overallMatch).length;
    const discrepancies = nonLeaveDays.filter(d => d.isDiscrepancy);
    const missingCrewDays = nonLeaveDays.filter(d => d.isMissingCrew);
    const missingVesselDays = nonLeaveDays.filter(d => d.isMissingVessel);
    const onLeaveDays = dayByDayComparison.filter(d => d.isOnLeave).length;
    
    const percentageMatch = crewLoggedDays > 0 
      ? Math.round((matchingDays / crewLoggedDays) * 100) 
      : 0;
    
    // Calculate vessel standby days using MCA/PYA compliant logic (reuse already calculated periods)
    // This ensures standby days don't exceed sea days
    const { totalStandbyDays: vesselStandbyDays, totalSeaDays: vesselSeaDays } = calculateStandbyDays(
      vesselLogsInRange,
      undefined, // No watch dates for vessel (watch is crew-specific)
      vesselPartOfActivePassageDates
    );
    
    // At sea includes 'underway', 'at-anchor', and any days marked as 'part of active passage'
    // Use the calculated sea days from calculateStandbyDays for consistency
    const vesselAtSeaDays = vesselSeaDays;
    const vesselYardDays = vesselLogsInRange.filter(log => log.state === 'in-yard').length;
    const vesselLeaveDays = vesselLogsInRange.filter(log => log.state === 'on-leave').length;
    const vesselPartOfActivePassageDays = vesselPartOfActivePassageDates.size;
    
    // Calculate standby days using MCA/PYA compliant logic (reuse already calculated values)
    const { totalStandbyDays: crewStandbyDays, totalSeaDays: crewSeaDays } = calculateStandbyDays(
      crewLogsInRange,
      watchDates,
      partOfActivePassageDates
    );

    // Count part of active passage days
    const crewPartOfActivePassageDays = partOfActivePassageDates.size;
    
    // Calculate crew yard days (in-yard state days)
    const crewYardDays = crewLogsInRange.filter(log => log.state === 'in-yard').length;
    
    return {
      requestedDates: requestedDates.length,
      crewLoggedDays,
      vesselLoggedDays,
      matchingDays,
      discrepancies,
      missingCrewDays,
      missingVesselDays,
      onLeaveDays, // Days excluded from comparison
      percentageMatch,
      dayByDayComparison,
      vesselAtSeaDays,
      vesselStandbyDays,
      vesselYardDays,
      vesselLeaveDays,
      vesselPartOfActivePassageDays,
      hasVesselLogs: vesselLogsInRange.length > 0,
      hasIssues: discrepancies.length > 0 || missingCrewDays.length > 0 || missingVesselDays.length > 0,
      // MCA/PYA compliant calculations for crew member
      crewStandbyDays,
      crewSeaDays,
      crewYardDays,
      crewPartOfActivePassageDays,
      crewWatchDays: Array.from(watchDates).filter(dateStr => {
        const watchDate = parse(dateStr, 'yyyy-MM-dd', new Date());
        return watchDate >= startDate && watchDate <= endDate;
      }).length
    };
  }, [requestedStart, requestedEnd, actualLogs, vesselLogs, testimonial, watchDates]);

  // Notify parent component of comparison data when it changes
  useEffect(() => {
    if (onComparisonChange) {
      onComparisonChange(comparison);
    }
  }, [comparison, onComparisonChange]);

  return (
    <div className="space-y-6">
      {/* Summary Cards - Simplified */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Crew Request */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <User className="h-4 w-4 text-muted-foreground" />
              <div className="font-semibold text-sm">Crew Request</div>
            </div>
            <div className="space-y-2">
              <div>
                <div className="text-xs text-muted-foreground">Logged Days</div>
                <div className="text-xl font-bold">{comparison.crewLoggedDays}</div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t">
                <div>
                  <div className="text-muted-foreground">At Sea</div>
                  <div className="font-semibold">{comparison.crewSeaDays}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Standby</div>
                  <div className="font-semibold">{comparison.crewStandbyDays}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Yard</div>
                  <div className="font-semibold">{comparison.crewYardDays}</div>
                </div>
              </div>
              {comparison.crewPartOfActivePassageDays > 0 && (
                <div className="pt-2 border-t text-xs">
                  <div className="text-muted-foreground">Part of Passage</div>
                  <div className="font-semibold text-blue-600 dark:text-blue-400">{comparison.crewPartOfActivePassageDays}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Vessel Logs */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Ship className="h-4 w-4 text-muted-foreground" />
              <div className="font-semibold text-sm">Vessel Logs</div>
            </div>
            <div className="space-y-2">
              <div>
                <div className="text-xs text-muted-foreground">Logged Days</div>
                <div className="text-xl font-bold">{comparison.vesselLoggedDays}</div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t">
                <div>
                  <div className="text-muted-foreground">At Sea</div>
                  <div className="font-semibold">{comparison.vesselAtSeaDays}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Standby</div>
                  <div className="font-semibold">{comparison.vesselStandbyDays}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Yard</div>
                  <div className="font-semibold">{comparison.vesselYardDays}</div>
                </div>
              </div>
              {comparison.vesselPartOfActivePassageDays > 0 && (
                <div className="pt-2 border-t text-xs">
                  <div className="text-muted-foreground">Part of Passage</div>
                  <div className="font-semibold text-blue-600 dark:text-blue-400">{comparison.vesselPartOfActivePassageDays}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Match Rate */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              {comparison.hasIssues ? (
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              )}
              <div className="font-semibold text-sm">Match Rate</div>
            </div>
            <div className="space-y-2">
              <div>
                <div className={`text-3xl font-bold ${comparison.percentageMatch >= 90 ? 'text-green-600' : comparison.percentageMatch >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {comparison.percentageMatch}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {comparison.matchingDays} of {comparison.crewLoggedDays} days match
                </div>
              </div>
              {comparison.hasIssues && (
                <div className="text-xs text-yellow-600 pt-2 border-t">
                  {comparison.discrepancies.length} mismatch{comparison.discrepancies.length !== 1 ? 'es' : ''} found
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Day-by-Day Comparison Table */}
      <Card>
        <CardContent className="pt-4">
          <h5 className="text-sm font-semibold mb-3">Day-by-Day Comparison</h5>
          <div className="border rounded-lg overflow-hidden">
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="sticky top-0 z-30 bg-background dark:bg-background border-b shadow-sm backdrop-blur-sm [&_tr]:border-b">
                  <tr className="border-b bg-background dark:bg-background">
                    <th className="h-12 px-4 text-left align-middle font-semibold whitespace-nowrap bg-background dark:bg-background">Date</th>
                    <th className="h-12 px-4 text-left align-middle font-semibold whitespace-nowrap bg-background dark:bg-background">Crew State</th>
                    <th className="h-12 px-4 text-left align-middle font-semibold whitespace-nowrap bg-background dark:bg-background">Crew Indicators</th>
                    <th className="h-12 px-4 text-left align-middle font-semibold whitespace-nowrap bg-background dark:bg-background">Vessel State</th>
                    <th className="h-12 px-4 text-left align-middle font-semibold whitespace-nowrap bg-background dark:bg-background">Vessel Indicators</th>
                    <th className="h-12 px-4 text-left align-middle font-semibold whitespace-nowrap bg-background dark:bg-background">Status</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {comparison.dayByDayComparison.map((day) => (
                    <tr 
                      key={day.dateStr}
                      className={`border-b transition-colors hover:bg-muted/50 ${
                        day.isOnLeave 
                          ? 'bg-gray-100/50 dark:bg-gray-800/30 opacity-60' 
                          : day.isDiscrepancy 
                            ? 'bg-yellow-500/10 dark:bg-yellow-500/5' 
                            : ''
                      }`}
                    >
                      <td className="p-4 align-middle font-medium">
                        {format(day.date, 'MMM d, yyyy')}
                        <div className="text-xs text-muted-foreground">
                          {format(day.date, 'EEEE')}
                        </div>
                      </td>
                      <td className="p-4 align-middle">
                        {day.isOnLeave ? (
                          <div className="space-y-1">
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${getStateBadgeVariant('on-leave')}`}
                            >
                              {formatStateName('on-leave')}
                            </Badge>
                            <div className="text-xs text-muted-foreground italic">(Excluded)</div>
                          </div>
                        ) : day.crewState ? (
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${getStateBadgeVariant(day.crewState)}`}
                          >
                            {formatStateName(day.crewState)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Not requested</span>
                        )}
                      </td>
                      <td className="p-4 align-middle">
                        {!day.isOnLeave && (
                          <div className="flex flex-wrap gap-1">
                            {/* Crew Watch - Takes priority over everything */}
                            {day.isWatchDay && (
                              <Badge 
                                variant="outline" 
                                className="text-xs bg-yellow-500/20 text-yellow-800 border-yellow-600 dark:bg-yellow-500/30 dark:text-yellow-300"
                                title="Watch Day - Counts as At Sea"
                              >
                                Watch
                              </Badge>
                            )}
                            
                            {/* Crew Part of Passage - Only show if not a watch day */}
                            {!day.isWatchDay && day.isPartOfActivePassage && (
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${
                                  day.bothPartOfPassage 
                                    ? 'bg-blue-500/20 text-blue-800 border-blue-600 dark:bg-blue-500/30 dark:text-blue-300' 
                                    : 'bg-red-500/20 text-red-800 border-red-600 dark:bg-red-500/30 dark:text-red-300'
                                }`}
                                title="Crew: Part of Active Passage"
                              >
                                Part of Passage
                              </Badge>
                            )}
                            
                            {/* Crew Standby - Only show if not a watch day and not part of passage */}
                            {!day.isWatchDay && day.isStandbyDay && (
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${
                                  day.bothStandby 
                                    ? 'bg-purple-500/20 text-purple-800 border-purple-600 dark:bg-purple-500/30 dark:text-purple-300' 
                                    : 'bg-red-500/20 text-red-800 border-red-600 dark:bg-red-500/30 dark:text-red-300'
                                }`}
                                title="Crew: Standby (MCA/PYA Compliant)"
                              >
                                Standby
                              </Badge>
                            )}
                            
                            {/* No indicators */}
                            {!day.isWatchDay && !day.isPartOfActivePassage && !day.isStandbyDay && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-4 align-middle">
                        {day.vesselState ? (
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${getStateBadgeVariant(day.vesselState)}`}
                          >
                            {formatStateName(day.vesselState)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No log</span>
                        )}
                      </td>
                      <td className="p-4 align-middle">
                        {day.vesselState && (
                          <div className="flex flex-wrap gap-1">
                            {/* Vessel Part of Passage */}
                            {day.vesselIsPartOfActivePassage && (
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${
                                  day.bothPartOfPassage 
                                    ? 'bg-blue-500/20 text-blue-800 border-blue-600 dark:bg-blue-500/30 dark:text-blue-300' 
                                    : 'bg-red-500/20 text-red-800 border-red-600 dark:bg-red-500/30 dark:text-red-300'
                                }`}
                                title="Vessel: Part of Active Passage"
                              >
                                Part of Passage
                              </Badge>
                            )}
                            
                            {/* Vessel Standby */}
                            {day.vesselIsStandbyDay && (
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${
                                  day.bothStandby || day.isWatchDay
                                    ? 'bg-purple-500/20 text-purple-800 border-purple-600 dark:bg-purple-500/30 dark:text-purple-300' 
                                    : 'bg-red-500/20 text-red-800 border-red-600 dark:bg-red-500/30 dark:text-red-300'
                                }`}
                                title="Vessel: Standby (MCA/PYA Compliant Calculations)"
                              >
                                Standby
                              </Badge>
                            )}
                            
                            {/* No indicators */}
                            {!day.vesselIsPartOfActivePassage && !day.vesselIsStandbyDay && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-4 align-middle">
                        {day.isOnLeave ? (
                          <div className="flex items-center gap-1 text-gray-400">
                            <XCircle className="h-3 w-3" />
                            <span className="text-xs">Excluded</span>
                          </div>
                        ) : day.overallMatch ? (
                          <div className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 className="h-3 w-3" />
                            <span className="text-xs">Match</span>
                          </div>
                        ) : day.isDiscrepancy ? (
                          <div className="flex items-center gap-1 text-yellow-600">
                            <AlertTriangle className="h-3 w-3" />
                            <span className="text-xs">Mismatch</span>
                          </div>
                        ) : day.isMissingCrew ? (
                          <div className="flex items-center gap-1 text-blue-600">
                            <User className="h-3 w-3" />
                            <span className="text-xs">Crew missing</span>
                          </div>
                        ) : day.isMissingVessel ? (
                          <div className="flex items-center gap-1 text-gray-600">
                            <Ship className="h-3 w-3" />
                            <span className="text-xs">Vessel missing</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-gray-400">
                            <XCircle className="h-3 w-3" />
                            <span className="text-xs">Both missing</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Discrepancy Summary */}
          {comparison.discrepancies.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100 mb-2">
                    State Mismatches Found ({comparison.discrepancies.length} day{comparison.discrepancies.length !== 1 ? 's' : ''})
                  </p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {comparison.discrepancies.slice(0, 5).map(day => (
                      <div key={day.dateStr} className="flex items-center gap-2">
                        <span className="font-medium">{format(day.date, 'MMM d')}:</span>
                        <span>Crew: <strong>{formatStateName(day.crewState!)}</strong></span>
                        <span>→</span>
                        <span>Vessel: <strong>{formatStateName(day.vesselState!)}</strong></span>
                      </div>
                    ))}
                    {comparison.discrepancies.length > 5 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        +{comparison.discrepancies.length - 5} more mismatch{comparison.discrepancies.length - 5 !== 1 ? 'es' : ''}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Requested Day Count Breakdown */}
      <Card>
        <CardContent className="pt-4">
          <h5 className="text-xs font-semibold mb-3">Requested Day Count Breakdown</h5>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">At Sea:</span>
              <span className="font-medium">{testimonial?.at_sea_days || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Standby:</span>
              <span className="font-medium">{testimonial?.standby_days || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Yard:</span>
              <span className="font-medium">{testimonial?.yard_days || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Leave:</span>
              <span className="font-medium">{testimonial?.leave_days || 0}</span>
            </div>
          </div>
          
          {/* MCA/PYA Compliant Calculation Comparison */}
          <div className="border-t pt-4">
            <h5 className="text-xs font-semibold mb-3">MCA/PYA Compliant Calculation Methods</h5>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">At Sea:</span>
                <span className="font-medium text-blue-600 dark:text-blue-400">{comparison.crewSeaDays}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Standby:</span>
                <span className="font-medium text-orange-600 dark:text-orange-400">{comparison.crewStandbyDays}</span>
              </div>
              {comparison.crewPartOfActivePassageDays > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Part of Passage:</span>
                  <span className="font-medium text-green-600 dark:text-green-400">{comparison.crewPartOfActivePassageDays}</span>
                </div>
              )}
              {comparison.crewWatchDays > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Watch Days:</span>
                  <span className="font-medium text-purple-600 dark:text-purple-400">{comparison.crewWatchDays}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              These calculations use MCA/PYA compliant calculation methods, accounting for watch days and part of active passage days.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
