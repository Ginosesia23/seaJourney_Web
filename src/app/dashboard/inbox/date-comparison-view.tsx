'use client';

import { useMemo, useEffect } from 'react';
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
  onComparisonChange
}: DateComparisonViewProps) {
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
      
      return {
        date,
        dateStr,
        crewState: requestedLog?.state || null, // What crew member actually logged (from daily_state_logs)
        vesselState: vesselLog?.state || null, // What vessel logged
        actualLogState: requestedLog?.state || null, // Same as crewState (for consistency)
        isOnLeave, // Track if this is a leave day
        statesMatch,
        hasCrewLog: hasRequested, // Whether crew member logged a state for this date (excluding leave)
        hasVesselLog,
        matchesActualLog: true, // Since we're using actual logs, this is always true
        isDiscrepancy: !isOnLeave && hasRequested && hasVesselLog && !statesMatch,
        isMissingCrew: !isOnLeave && !hasRequested && hasVesselLog,
        isMissingVessel: !isOnLeave && hasRequested && !hasVesselLog
      };
    });
    
    // Calculate summary stats
    // Exclude on-leave days from all calculations
    const nonLeaveDays = dayByDayComparison.filter(d => !d.isOnLeave);
    const crewLoggedDays = nonLeaveDays.filter(d => d.hasCrewLog).length;
    const vesselLoggedDays = nonLeaveDays.filter(d => d.hasVesselLog).length;
    const matchingDays = nonLeaveDays.filter(d => d.statesMatch).length;
    const discrepancies = nonLeaveDays.filter(d => d.isDiscrepancy);
    const missingCrewDays = nonLeaveDays.filter(d => d.isMissingCrew);
    const missingVesselDays = nonLeaveDays.filter(d => d.isMissingVessel);
    const onLeaveDays = dayByDayComparison.filter(d => d.isOnLeave).length;
    
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
      onLeaveDays, // Days excluded from comparison
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

  // Notify parent component of comparison data when it changes
  useEffect(() => {
    if (onComparisonChange) {
      onComparisonChange(comparison);
    }
  }, [comparison, onComparisonChange]);

  return (
    <div className="space-y-6">
      {/* Summary Cards - Redesigned for better readability */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Crew Member's Summary */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <User className="h-5 w-5 text-blue-700 dark:text-blue-400" />
            </div>
            <div>
              <div className="font-semibold text-sm text-blue-900 dark:text-blue-100">Crew Request</div>
              <div className="text-xs text-blue-700/70 dark:text-blue-300/70">What was requested</div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="bg-white/60 dark:bg-gray-900/40 rounded-lg p-3 border border-blue-200/50 dark:border-blue-800/50">
              <div className="text-xs text-muted-foreground mb-1">Total Days</div>
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{testimonial?.total_days || comparison.crewLoggedDays}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white/40 dark:bg-gray-900/30 rounded p-2">
                <div className="text-muted-foreground mb-0.5">Compared</div>
                <div className="font-semibold">{comparison.crewLoggedDays}</div>
              </div>
              <div className="bg-white/40 dark:bg-gray-900/30 rounded p-2">
                <div className="text-muted-foreground mb-0.5">Matching</div>
                <div className="font-semibold text-green-600 dark:text-green-400">{comparison.matchingDays}</div>
              </div>
            </div>
            {comparison.discrepancies.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded p-2">
                <div className="text-xs text-red-700 dark:text-red-400 font-medium">
                  {comparison.discrepancies.length} mismatch{comparison.discrepancies.length !== 1 ? 'es' : ''}
                </div>
              </div>
            )}
            {comparison.onLeaveDays > 0 && (
              <div className="text-xs text-muted-foreground pt-2 border-t border-blue-200/50 dark:border-blue-800/50">
                {comparison.onLeaveDays} day{comparison.onLeaveDays !== 1 ? 's' : ''} on leave (excluded)
              </div>
            )}
          </div>
        </div>

        {/* Vessel Summary */}
        <div className={`bg-gradient-to-br ${comparison.hasVesselLogs ? 'from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 border-2 border-green-200 dark:border-green-800' : 'from-gray-50 to-gray-100/50 dark:from-gray-900/30 dark:to-gray-800/20 border-2 border-gray-200 dark:border-gray-800'} rounded-xl p-5`}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2 ${comparison.hasVesselLogs ? 'bg-green-500/20' : 'bg-gray-500/20'} rounded-lg`}>
              <Ship className={`h-5 w-5 ${comparison.hasVesselLogs ? 'text-green-700 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`} />
            </div>
            <div>
              <div className={`font-semibold text-sm ${comparison.hasVesselLogs ? 'text-green-900 dark:text-green-100' : 'text-gray-700 dark:text-gray-300'}`}>Vessel Logs</div>
              <div className={`text-xs ${comparison.hasVesselLogs ? 'text-green-700/70 dark:text-green-300/70' : 'text-gray-600/70 dark:text-gray-400/70'}`}>Actual logged states</div>
            </div>
          </div>
          <div className="space-y-3">
            <div className={`${comparison.hasVesselLogs ? 'bg-white/60 dark:bg-gray-900/40' : 'bg-white/40 dark:bg-gray-900/30'} rounded-lg p-3 border ${comparison.hasVesselLogs ? 'border-green-200/50 dark:border-green-800/50' : 'border-gray-200/50 dark:border-gray-800/50'}`}>
              <div className="text-xs text-muted-foreground mb-1">Logged Days</div>
              <div className={`text-2xl font-bold ${comparison.hasVesselLogs ? 'text-green-900 dark:text-green-100' : 'text-gray-600 dark:text-gray-400'}`}>
                {comparison.vesselLoggedDays}
              </div>
            </div>
            {comparison.hasVesselLogs && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white/40 dark:bg-gray-900/30 rounded p-2">
                  <div className="text-muted-foreground mb-0.5">At Sea</div>
                  <div className="font-semibold">{comparison.vesselAtSeaDays}</div>
                </div>
                <div className="bg-white/40 dark:bg-gray-900/30 rounded p-2">
                  <div className="text-muted-foreground mb-0.5">Standby</div>
                  <div className="font-semibold">{comparison.vesselStandbyDays}</div>
                </div>
                <div className="bg-white/40 dark:bg-gray-900/30 rounded p-2">
                  <div className="text-muted-foreground mb-0.5">Yard</div>
                  <div className="font-semibold">{comparison.vesselYardDays}</div>
                </div>
                <div className="bg-white/40 dark:bg-gray-900/30 rounded p-2">
                  <div className="text-muted-foreground mb-0.5">Leave</div>
                  <div className="font-semibold">{comparison.vesselLeaveDays}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Match Summary - Most Important */}
        <div className={`bg-gradient-to-br ${comparison.hasIssues ? 'from-yellow-50 to-yellow-100/50 dark:from-yellow-950/30 dark:to-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800' : 'from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 border-2 border-green-200 dark:border-green-800'} rounded-xl p-5`}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-2 ${comparison.hasIssues ? 'bg-yellow-500/20' : 'bg-green-500/20'} rounded-lg`}>
              {comparison.hasIssues ? (
                <AlertTriangle className="h-5 w-5 text-yellow-700 dark:text-yellow-400" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-700 dark:text-green-400" />
              )}
            </div>
            <div>
              <div className={`font-semibold text-sm ${comparison.hasIssues ? 'text-yellow-900 dark:text-yellow-100' : 'text-green-900 dark:text-green-100'}`}>Match Rate</div>
              <div className={`text-xs ${comparison.hasIssues ? 'text-yellow-700/70 dark:text-yellow-300/70' : 'text-green-700/70 dark:text-green-300/70'}`}>Overall accuracy</div>
            </div>
          </div>
          <div className="space-y-3">
            <div className={`${comparison.hasIssues ? 'bg-white/60 dark:bg-gray-900/40 border-yellow-200/50 dark:border-yellow-800/50' : 'bg-white/60 dark:bg-gray-900/40 border-green-200/50 dark:border-green-800/50'} rounded-lg p-4 border text-center`}>
              <div className="text-xs text-muted-foreground mb-2">Match Percentage</div>
              <div className={`text-4xl font-bold ${comparison.percentageMatch >= 90 ? 'text-green-600 dark:text-green-400' : comparison.percentageMatch >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                {comparison.percentageMatch}%
              </div>
            </div>
            {comparison.hasIssues && (
              <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded p-3">
                <div className="text-xs font-medium text-yellow-900 dark:text-yellow-100 mb-1">
                  ⚠️ Review Required
                </div>
                <div className="text-xs text-yellow-700 dark:text-yellow-300">
                  {comparison.discrepancies.length} state mismatch{comparison.discrepancies.length !== 1 ? 'es' : ''} found. Please review the day-by-day comparison below.
                </div>
              </div>
            )}
            {!comparison.hasIssues && comparison.matchingDays > 0 && (
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded p-3">
                <div className="text-xs font-medium text-green-900 dark:text-green-100">
                  ✓ All states match
                </div>
              </div>
            )}
          </div>
        </div>
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
                      className={
                        day.isOnLeave 
                          ? 'bg-gray-100/50 dark:bg-gray-800/30 opacity-60' 
                          : day.isDiscrepancy 
                            ? 'bg-yellow-500/10 dark:bg-yellow-500/5' 
                            : ''
                      }
                    >
                      <TableCell className="font-medium">
                        {format(day.date, 'MMM d, yyyy')}
                        <div className="text-xs text-muted-foreground">
                          {format(day.date, 'EEEE')}
                        </div>
                      </TableCell>
                      <TableCell>
                        {day.isOnLeave ? (
                          <div className="space-y-1">
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${getStateBadgeVariant('on-leave')}`}
                            >
                              {formatStateName('on-leave')}
                            </Badge>
                            <div className="text-xs text-muted-foreground italic">(Excluded from comparison)</div>
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
                        {!day.isOnLeave && day.actualLogState && day.actualLogState !== day.crewState && (
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
                        {day.isOnLeave ? (
                          <div className="flex items-center gap-1 text-gray-400">
                            <XCircle className="h-3 w-3" />
                            <span className="text-xs">Excluded</span>
                          </div>
                        ) : day.statesMatch ? (
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
