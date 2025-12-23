'use client';

import { useMemo } from 'react';
import { format, parse, eachDayOfInterval } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, CheckCircle2, AlertTriangle, User, Ship, XCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { StateLog } from '@/lib/types';

interface DateComparisonViewProps {
  requestedStart: string; // YYYY-MM-DD
  requestedEnd: string; // YYYY-MM-DD
  requestedDays: number;
  actualLogs: StateLog[]; // Crew member's logs
  vesselLogs?: StateLog[]; // All vessel logs (for comparison)
  testimonial?: any; // Testimonial object for day count breakdown
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

/**
 * Reconstruct requested logs from testimonial breakdown
 * This intelligently distributes the requested day counts (at_sea_days, standby_days, etc.)
 * across the date range to show what the crew member requested.
 * Tries to match vessel logs where possible for better alignment.
 */
function reconstructRequestedLogs(
  testimonial: any,
  startDate: Date,
  endDate: Date,
  vesselLogs: StateLog[]
): Array<{ date: string; state: string }> {
  if (!testimonial) return [];
  
  const requestedDates = eachDayOfInterval({ start: startDate, end: endDate });
  
  // Get counts from testimonial (what crew member requested)
  const atSeaDays = testimonial.at_sea_days || 0;
  const standbyDays = testimonial.standby_days || 0;
  const yardDays = testimonial.yard_days || 0;
  const leaveDays = testimonial.leave_days || 0;
  
  // Create a map of vessel logs for quick lookup
  const vesselLogMap = new Map<string, StateLog>();
  vesselLogs.forEach(log => {
    vesselLogMap.set(log.date, log);
  });
  
  // Track how many of each state we've assigned
  const assignedCounts = {
    'underway': 0,
    'at-anchor': 0,
    'in-port': 0,
    'in-yard': 0,
    'on-leave': 0,
    'standby': 0 // Combined count for at-anchor + in-port
  };
  
  const assignedStates = new Map<string, string>();
  
  // First pass: Try to match vessel logs where they align with requested states
  // This creates a more realistic day-by-day view
  for (const date of requestedDates) {
    const dateStr = format(date, 'yyyy-MM-dd');
    const vesselLog = vesselLogMap.get(dateStr);
    
    if (vesselLog) {
      const vesselState = vesselLog.state;
      
      // Check if this vessel state matches what we still need to assign
      if (vesselState === 'underway' && assignedCounts['underway'] < atSeaDays) {
        assignedStates.set(dateStr, 'underway');
        assignedCounts['underway']++;
      } else if (vesselState === 'in-yard' && assignedCounts['in-yard'] < yardDays) {
        assignedStates.set(dateStr, 'in-yard');
        assignedCounts['in-yard']++;
      } else if (vesselState === 'on-leave' && assignedCounts['on-leave'] < leaveDays) {
        assignedStates.set(dateStr, 'on-leave');
        assignedCounts['on-leave']++;
      } else if ((vesselState === 'at-anchor' || vesselState === 'in-port') && assignedCounts['standby'] < standbyDays) {
        // For standby, prefer matching the vessel's state (at-anchor or in-port)
        assignedStates.set(dateStr, vesselState);
        assignedCounts['standby']++;
        assignedCounts[vesselState as 'at-anchor' | 'in-port']++;
      }
    }
  }
  
  // Second pass: Fill remaining requested days with states from testimonial breakdown
  const remainingStates: string[] = [];
  remainingStates.push(...Array(Math.max(0, atSeaDays - assignedCounts['underway'])).fill('underway'));
  remainingStates.push(...Array(Math.max(0, standbyDays - assignedCounts['standby'])).fill('at-anchor')); // Default standby to at-anchor
  remainingStates.push(...Array(Math.max(0, yardDays - assignedCounts['in-yard'])).fill('in-yard'));
  remainingStates.push(...Array(Math.max(0, leaveDays - assignedCounts['on-leave'])).fill('on-leave'));
  
  let remainingIndex = 0;
  
  // Assign remaining states to unassigned dates
  for (const date of requestedDates) {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    if (!assignedStates.has(dateStr)) {
      if (remainingIndex < remainingStates.length) {
        const state = remainingStates[remainingIndex];
        assignedStates.set(dateStr, state);
        remainingIndex++;
      } else {
        // If we've used all requested states but still have dates, default to standby (at-anchor)
        assignedStates.set(dateStr, 'at-anchor');
      }
    }
  }
  
  // Build final reconstructed logs
  return requestedDates.map(date => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return { date: dateStr, state: assignedStates.get(dateStr) || 'at-anchor' };
  });
}

export function DateComparisonView({ 
  requestedStart, 
  requestedEnd, 
  requestedDays, 
  actualLogs,
  vesselLogs = [],
  testimonial
}: DateComparisonViewProps) {
  const comparison = useMemo(() => {
    const startDate = parse(requestedStart, 'yyyy-MM-dd', new Date());
    const endDate = parse(requestedEnd, 'yyyy-MM-dd', new Date());
    
    // Get all dates in the requested range
    const requestedDates = eachDayOfInterval({ start: startDate, end: endDate });
    
    // Reconstruct what the crew member requested from the testimonial breakdown
    // This is more accurate than using actualLogs which might be incomplete/incorrect
    // We use vessel logs to inform the distribution for better alignment
    const requestedLogs = reconstructRequestedLogs(testimonial, startDate, endDate, vesselLogs);
    const requestedLogMap = new Map<string, { date: string; state: string }>();
    requestedLogs.forEach(log => {
      requestedLogMap.set(log.date, log);
    });
    
    // Create maps for quick lookup of actual logs (fallback/reference)
    const crewLogMap = new Map<string, StateLog>();
    actualLogs.forEach(log => {
      crewLogMap.set(log.date, log);
    });
    
    const vesselLogMap = new Map<string, StateLog>();
    vesselLogs.forEach(log => {
      vesselLogMap.set(log.date, log);
    });
    
    // Build day-by-day comparison
    // Use reconstructed requested logs (from testimonial breakdown) as the primary source
    // This shows what the crew member actually requested, not what's in daily_state_logs
    const dayByDayComparison = requestedDates.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const requestedLog = requestedLogMap.get(dateStr); // What crew requested (from testimonial)
      const vesselLog = vesselLogMap.get(dateStr); // What vessel actually logged
      const actualLog = crewLogMap.get(dateStr); // What's in daily_state_logs (reference only)
      
      // Compare requested state (from testimonial) vs vessel state
      const statesMatch = requestedLog && vesselLog && requestedLog.state === vesselLog.state;
      const hasRequested = !!requestedLog;
      const hasVesselLog = !!vesselLog;
      
      // Check if requested state matches actual log (for reference)
      const matchesActualLog = requestedLog && actualLog && requestedLog.state === actualLog.state;
      
      return {
        date,
        dateStr,
        crewState: requestedLog?.state || null, // Use requested state from testimonial
        vesselState: vesselLog?.state || null,
        actualLogState: actualLog?.state || null, // For reference/debugging
        statesMatch,
        hasCrewLog: hasRequested, // Whether we have a requested state
        hasVesselLog,
        matchesActualLog, // Whether requested matches what's in daily_state_logs
        isDiscrepancy: hasRequested && hasVesselLog && !statesMatch,
        isMissingCrew: !hasRequested && hasVesselLog,
        isMissingVessel: hasRequested && !hasVesselLog
      };
    });
    
    // Calculate summary stats
    const crewLoggedDays = dayByDayComparison.filter(d => d.hasCrewLog).length;
    const vesselLoggedDays = dayByDayComparison.filter(d => d.hasVesselLog).length;
    const matchingDays = dayByDayComparison.filter(d => d.statesMatch).length;
    const discrepancies = dayByDayComparison.filter(d => d.isDiscrepancy);
    const missingCrewDays = dayByDayComparison.filter(d => d.isMissingCrew);
    const missingVesselDays = dayByDayComparison.filter(d => d.isMissingVessel);
    
    const percentageMatch = crewLoggedDays > 0 
      ? Math.round((matchingDays / crewLoggedDays) * 100) 
      : 0;
    
    // Calculate vessel logs breakdown
    const vesselLogsInRange = vesselLogs.filter(log => {
      const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
      return logDate >= startDate && logDate <= endDate;
    });
    
    const vesselAtSeaDays = vesselLogsInRange.filter(log => log.state === 'underway').length;
    const vesselStandbyDays = vesselLogsInRange.filter(log => 
      log.state === 'at-anchor' || log.state === 'in-port'
    ).length;
    const vesselYardDays = vesselLogsInRange.filter(log => log.state === 'in-yard').length;
    const vesselLeaveDays = vesselLogsInRange.filter(log => log.state === 'on-leave').length;
    
    return {
      requestedDates: requestedDates.length,
      crewLoggedDays,
      vesselLoggedDays,
      matchingDays,
      discrepancies,
      missingCrewDays,
      missingVesselDays,
      percentageMatch,
      dayByDayComparison,
      vesselAtSeaDays,
      vesselStandbyDays,
      vesselYardDays,
      vesselLeaveDays,
      hasVesselLogs: vesselLogsInRange.length > 0,
      hasIssues: discrepancies.length > 0 || missingCrewDays.length > 0 || missingVesselDays.length > 0
    };
  }, [requestedStart, requestedEnd, actualLogs, vesselLogs, testimonial]);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Crew Member's Summary */}
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <User className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">Crew Member Requested</span>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Requested Days:</span>
                <span className="font-semibold">{testimonial?.total_days || comparison.crewLoggedDays}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Matching States:</span>
                <span className="font-semibold text-green-600">{comparison.matchingDays}</span>
              </div>
              {comparison.discrepancies.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mismatches:</span>
                  <span className="font-semibold text-red-600">{comparison.discrepancies.length}</span>
                </div>
              )}
              <div className="pt-2 border-t text-xs text-muted-foreground">
                <div>At Sea: {testimonial?.at_sea_days || 0}</div>
                <div>Standby: {testimonial?.standby_days || 0}</div>
                <div>Yard: {testimonial?.yard_days || 0}</div>
                <div>Leave: {testimonial?.leave_days || 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vessel Summary */}
        <Card className={comparison.hasVesselLogs ? 'border-green-500/30 bg-green-500/5' : 'border-gray-500/30 bg-gray-500/5'}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Ship className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Vessel</span>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Logged Days:</span>
                <span className="font-semibold">{comparison.vesselLoggedDays}</span>
              </div>
              {comparison.hasVesselLogs && (
                <div className="grid grid-cols-2 gap-1 text-xs pt-2 border-t">
                  <div>At Sea: {comparison.vesselAtSeaDays}</div>
                  <div>Standby: {comparison.vesselStandbyDays}</div>
                  <div>Yard: {comparison.vesselYardDays}</div>
                  <div>Leave: {comparison.vesselLeaveDays}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Match Summary */}
        <Card className={comparison.hasIssues ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-green-500/30 bg-green-500/5'}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Match Rate</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Badge 
                  variant="outline" 
                  className={comparison.percentageMatch >= 90 ? 'border-green-500 text-green-700' : comparison.percentageMatch >= 50 ? 'border-yellow-500 text-yellow-700' : 'border-red-500 text-red-700'}
                >
                  {comparison.percentageMatch}%
                </Badge>
              </div>
              {comparison.hasIssues && (
                <p className="text-xs text-muted-foreground">
                  {comparison.discrepancies.length} state mismatch{comparison.discrepancies.length !== 1 ? 'es' : ''} found
                </p>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 bg-background z-10">Date</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10">Requested State</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10">Vessel State</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comparison.dayByDayComparison.map((day) => (
                    <TableRow 
                      key={day.dateStr}
                      className={day.isDiscrepancy ? 'bg-yellow-500/10 dark:bg-yellow-500/5' : ''}
                    >
                      <TableCell className="font-medium">
                        {format(day.date, 'MMM d, yyyy')}
                        <div className="text-xs text-muted-foreground">
                          {format(day.date, 'EEEE')}
                        </div>
                      </TableCell>
                      <TableCell>
                        {day.crewState ? (
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${getStateBadgeVariant(day.crewState)}`}
                          >
                            {formatStateName(day.crewState)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Not requested</span>
                        )}
                        {day.actualLogState && day.actualLogState !== day.crewState && (
                          <div className="text-xs text-muted-foreground mt-1">
                            (Actual: {formatStateName(day.actualLogState)})
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell>
                        {day.statesMatch ? (
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
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
        </CardContent>
      </Card>
    </div>
  );
}
