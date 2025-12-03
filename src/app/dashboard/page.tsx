
'use client';

import { Ship, LifeBuoy, Anchor, Loader2, Star, Waves, Building, Calendar, MapPin, PlusCircle, Clock, TrendingUp, History, CalendarDays, TrendingDown, Activity, Target, Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { format, getYear, subDays, startOfDay, isWithinInterval, parse, startOfMonth, endOfMonth, isSameMonth } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { getVesselSeaService, getVesselStateLogs, updateStateLogsBatch } from '@/supabase/database/queries';
import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Vessel, SeaServiceRecord, StateLog, UserProfile, DailyStatus } from '@/lib/types';
import { calculateStandbyDays } from '@/lib/standby-calculation';
import { findMissingDays } from '@/lib/fill-missing-days';

const vesselStates: { value: DailyStatus; label: string; color: string, icon: React.FC<any> }[] = [
  { value: 'underway', label: 'Underway', color: 'hsl(var(--chart-blue))', icon: Waves },
  { value: 'at-anchor', label: 'At Anchor', color: 'hsl(var(--chart-orange))', icon: Anchor },
  { value: 'in-port', label: 'In Port', color: 'hsl(var(--chart-green))', icon: Building },
  { value: 'on-leave', label: 'On Leave', color: 'hsl(var(--chart-gray))', icon: LifeBuoy },
  { value: 'in-yard', label: 'In Yard', color: 'hsl(var(--chart-red))', icon: Ship },
];

export default function DashboardPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();

  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedVessel, setSelectedVessel] = useState('all');
  
  const [allSeaService, setAllSeaService] = useState<SeaServiceRecord[]>([]);
  const [allStateLogs, setAllStateLogs] = useState<Map<string, StateLog[]>>(new Map());
  const [currentVesselLogs, setCurrentVesselLogs] = useState<StateLog[]>([]);

  // Fetch user profile to get active vessel
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  
  // Transform user profile to handle both snake_case (from DB) and camelCase (from types)
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    const activeVesselId = (userProfileRaw as any).active_vessel_id || (userProfileRaw as any).activeVesselId;
    return {
      ...userProfileRaw,
      activeVesselId: activeVesselId || undefined,
    } as UserProfile;
  }, [userProfileRaw]);

  // Query all vessels (vessels are shared, not owned by users)
  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
    user?.id ? 'vessels' : null,
    user?.id ? { orderBy: 'created_at', ascending: false } : undefined
  );

  // Get current vessel
  const currentVessel = useMemo(() => {
    if (!userProfile || !vessels || vessels.length === 0) return undefined;
    const activeVesselId = userProfile.activeVesselId;
    return vessels.find(v => v.id === activeVesselId);
  }, [vessels, userProfile]);

  useEffect(() => {
    if (vessels && user?.id) {
        const fetchServiceAndLogs = async () => {
            const serviceRecords: SeaServiceRecord[] = [];
            const logsMap = new Map<string, StateLog[]>();

            await Promise.all(vessels.map(async (vessel) => {
                const [seaService, stateLogs] = await Promise.all([
                    getVesselSeaService(supabase, user.id, vessel.id),
                    getVesselStateLogs(supabase, vessel.id, user.id)
                ]);
                
                serviceRecords.push(...seaService);
                logsMap.set(vessel.id, stateLogs);
            }));
            setAllSeaService(serviceRecords);
            setAllStateLogs(logsMap);
        };
        fetchServiceAndLogs();
    }
  }, [vessels, user?.id, supabase]);

  const [isFillingGaps, setIsFillingGaps] = useState(false);

  // Fetch state logs for current vessel
  useEffect(() => {
    if (!currentVessel || !user?.id) {
      setCurrentVesselLogs([]);
      return;
    }

    getVesselStateLogs(supabase, currentVessel.id, user.id)
      .then((logs) => {
        setCurrentVesselLogs(logs);
      })
      .catch((error) => {
        console.error('Error fetching current vessel logs:', error);
        setCurrentVesselLogs([]);
      });
  }, [currentVessel?.id, user?.id, supabase]);

  // Automatically fill missing days between last logged date and today for active vessel
  useEffect(() => {
    const fillGaps = async () => {
      // Only run if we have an active vessel, state logs are loaded, and we're not already filling gaps
      if (!currentVessel || !user?.id || currentVesselLogs.length === 0 || isFillingGaps) {
        return;
      }

      // Find missing days
      const { lastLoggedDate, lastLoggedState, missingDays } = findMissingDays(currentVesselLogs);

      // If there are missing days and we have a last logged state, fill them
      if (missingDays.length > 0 && lastLoggedState) {
        setIsFillingGaps(true);
        
        try {
          console.log(`[FILL MISSING DAYS] Found ${missingDays.length} missing days from ${lastLoggedDate ? format(lastLoggedDate, 'yyyy-MM-dd') : 'unknown'} to today. Filling with state: ${lastLoggedState}`);
          
          // Create logs for all missing days with the same state as the last logged entry
          const logsToCreate = missingDays.map(date => ({
            date,
            state: lastLoggedState,
          }));

          await updateStateLogsBatch(supabase, user.id, currentVessel.id, logsToCreate);

          console.log(`[FILL MISSING DAYS] Successfully filled ${missingDays.length} missing days`);

          // Refresh current vessel logs to show the newly created entries
          const updatedLogs = await getVesselStateLogs(supabase, currentVessel.id, user.id);
          setCurrentVesselLogs(updatedLogs);

          // Also update the allStateLogs map
          setAllStateLogs(prev => {
            const updated = new Map(prev);
            updated.set(currentVessel.id, updatedLogs);
            return updated;
          });
        } catch (error: any) {
          console.error('Error filling missing days:', error);
          // Don't show toast error - this is automatic background operation
        } finally {
          setIsFillingGaps(false);
        }
      }
    };

    fillGaps();
  }, [currentVesselLogs, currentVessel?.id, user?.id, supabase, isFillingGaps]);


  const filteredServiceRecords = useMemo(() => {
    if (!allSeaService) return [];
    return allSeaService.filter(service => {
      const serviceYear = getYear(new Date(service.date));
      const yearMatch = selectedYear === 'all' || serviceYear === parseInt(selectedYear, 10);
      const vesselMatch = selectedVessel === 'all' || service.vesselId === selectedVessel;
      return yearMatch && vesselMatch;
    });
  }, [allSeaService, selectedYear, selectedVessel]);

   const { totalDays, atSeaDays, standbyDays } = useMemo(() => {
    let days = 0;
    let atSea = 0;
    let standby = 0;

    // Collect all logs to filter by vessel and year
    const vesselIdsToCount = selectedVessel === 'all' 
      ? Array.from(allStateLogs.keys())
      : [selectedVessel];

    // Collect filtered logs for MCA/PYA calculation
    const filteredLogs: StateLog[] = [];

    vesselIdsToCount.forEach(vesselId => {
      const logs = allStateLogs.get(vesselId) || [];
        logs.forEach(log => {
        // Filter by year if needed
        const logYear = getYear(new Date(log.date));
        const yearMatch = selectedYear === 'all' || logYear === parseInt(selectedYear, 10);
        
        if (yearMatch) {
            days++;
          filteredLogs.push(log);
            if (log.state === 'underway') {
                atSea++;
          }
            }
        });
    });

    // Calculate MCA/PYA compliant standby days
    const { totalStandbyDays } = calculateStandbyDays(filteredLogs);
    standby = totalStandbyDays;

    return { totalDays: days, atSeaDays: atSea, standbyDays: standby };
  }, [allStateLogs, selectedVessel, selectedYear]);

  const recentActivity = useMemo(() => {
    if (!allStateLogs || !vessels) return [];
    
    // Collect all state logs from all vessels
    const allLogs: Array<StateLog & { vesselName: string; vesselType?: string }> = [];
    
    allStateLogs.forEach((logs, vesselId) => {
      const vessel = vessels.find(v => v.id === vesselId);
      logs.forEach(log => {
        allLogs.push({
          ...log,
                vesselName: vessel?.name || 'Unknown Vessel',
          vesselType: vessel?.type
        });
      });
    });
    
    // Sort by date (most recent first) and take the last 5
    return allLogs
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5)
      .map(log => ({
        id: log.id,
        date: log.date,
        state: log.state,
        vesselName: log.vesselName,
        vesselType: log.vesselType,
        vesselId: log.vesselId,
      }));
  }, [allStateLogs, vessels]);
  
  const availableYears = useMemo(() => {
    if (!allSeaService) return [];
    const years = new Set(allSeaService.map(service => getYear(new Date(service.date))));
    return ['all', ...Array.from(years).sort((a, b) => b - a).map(String)];
  }, [allSeaService]);

  const availableVessels = useMemo(() => {
    if(!vessels) return [];
    return [{ id: 'all', name: 'All Vessels' }, ...vessels];
  }, [vessels]);

  // Calculate stats for the past 7 days
  const past7DaysStats = useMemo(() => {
    const today = startOfDay(new Date());
    const sevenDaysAgo = subDays(today, 6); // Include today, so 6 days ago + today = 7 days
    
    // Collect all logs from the past 7 days
    const past7DaysLogs: StateLog[] = [];
    
    allStateLogs.forEach((logs) => {
      logs.forEach(log => {
        const logDate = startOfDay(parse(log.date, 'yyyy-MM-dd', new Date()));
        if (isWithinInterval(logDate, { start: sevenDaysAgo, end: today })) {
          past7DaysLogs.push(log);
        }
      });
    });

    // Calculate stats with state breakdown
    const totalDays = past7DaysLogs.length;
    const atSeaDays = past7DaysLogs.filter(log => log.state === 'underway').length;
    const atAnchorDays = past7DaysLogs.filter(log => log.state === 'at-anchor').length;
    const inPortDays = past7DaysLogs.filter(log => log.state === 'in-port').length;
    const onLeaveDays = past7DaysLogs.filter(log => log.state === 'on-leave').length;
    const inYardDays = past7DaysLogs.filter(log => log.state === 'in-yard').length;
    
    // Calculate MCA/PYA compliant standby days for the past 7 days
    const { totalStandbyDays } = calculateStandbyDays(past7DaysLogs);
    const standbyDays = totalStandbyDays;

    return {
      totalDays,
      atSeaDays,
      atAnchorDays,
      inPortDays,
      onLeaveDays,
      inYardDays,
      standbyDays,
    };
  }, [allStateLogs]);

  // Calculate stats for this month
  const thisMonthStats = useMemo(() => {
    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    
    // Collect all logs from this month
    const thisMonthLogs: StateLog[] = [];
    
    allStateLogs.forEach((logs) => {
      logs.forEach(log => {
        const logDate = startOfDay(parse(log.date, 'yyyy-MM-dd', new Date()));
        if (isWithinInterval(logDate, { start: monthStart, end: monthEnd })) {
          thisMonthLogs.push(log);
        }
      });
    });

    // Calculate stats with state breakdown
    const totalDays = thisMonthLogs.length;
    const atSeaDays = thisMonthLogs.filter(log => log.state === 'underway').length;
    const atAnchorDays = thisMonthLogs.filter(log => log.state === 'at-anchor').length;
    const inPortDays = thisMonthLogs.filter(log => log.state === 'in-port').length;
    const onLeaveDays = thisMonthLogs.filter(log => log.state === 'on-leave').length;
    const inYardDays = thisMonthLogs.filter(log => log.state === 'in-yard').length;
    
    // Calculate MCA/PYA compliant standby days for this month
    const { totalStandbyDays } = calculateStandbyDays(thisMonthLogs);
    const standbyDays = totalStandbyDays;

    return {
      totalDays,
      atSeaDays,
      atAnchorDays,
      inPortDays,
      onLeaveDays,
      inYardDays,
      standbyDays,
    };
  }, [allStateLogs]);

  // Get today's status for current vessel
  const todayStatus = useMemo(() => {
    if (!currentVesselLogs || currentVesselLogs.length === 0) return null;
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const todayLog = currentVesselLogs.find(log => log.date === todayKey);
    return todayLog ? todayLog.state : null;
  }, [currentVesselLogs]);

  // Get current vessel stats with detailed breakdown
  const currentVesselStats = useMemo(() => {
    if (!currentVesselLogs || currentVesselLogs.length === 0) {
      return { 
        totalDays: 0, 
        atSeaDays: 0, 
        standbyDays: 0,
        stateBreakdown: {},
        serviceStartDate: null,
        serviceDuration: 0
      };
    }

    let atSea = 0;
    const stateBreakdown: Record<string, number> = {};
    let earliestDate: Date | null = null;

    currentVesselLogs.forEach(log => {
      // Count by state
      stateBreakdown[log.state] = (stateBreakdown[log.state] || 0) + 1;
      
      // Count at sea
      if (log.state === 'underway') atSea++;
      
      // Find earliest date
      const logDate = new Date(log.date);
      if (earliestDate === null) {
        earliestDate = logDate;
      } else if (logDate < earliestDate) {
        earliestDate = logDate;
      }
    });

    // Calculate MCA/PYA compliant standby days
    const { totalStandbyDays } = calculateStandbyDays(currentVesselLogs);
    const standby = totalStandbyDays;

    // Calculate service duration
    let serviceDuration = 0;
    if (earliestDate) {
      const now = new Date();
      const startDate = earliestDate as Date;
      const diffTime = now.getTime() - startDate.getTime();
      serviceDuration = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1);
    }

    return { 
      totalDays: currentVesselLogs.length,
      atSeaDays: atSea,
      standbyDays: standby,
      stateBreakdown,
      serviceStartDate: earliestDate,
      serviceDuration
    };
  }, [currentVesselLogs]);

  const longestPassage = useMemo(() => {
    // With new structure, each record is for one date, so "longest passage" 
    // would be based on state logs, not service records
    // For now, return null or calculate based on state logs
    return null;
  }, []);

  // Calculate the number of vessels the user has logged time on
  const userVesselCount = useMemo(() => {
    if (!allStateLogs || allStateLogs.size === 0) return 0;
    // Count vessels that have state logs (user has logged time on them)
    return allStateLogs.size;
  }, [allStateLogs]);

  const topVessel = useMemo(() => {
    if(!vessels || !allStateLogs || allStateLogs.size === 0) return null;

    // Count days based on state logs per vessel
    const daysByVessel: Record<string, number> = {};
    allStateLogs.forEach((logs, vesselId) => {
      daysByVessel[vesselId] = logs.length;
    });

    if (Object.keys(daysByVessel).length === 0) return null;

    const topVesselId = Object.entries(daysByVessel).sort(([,a],[,b]) => b - a)[0][0];
    const vessel = vessels.find(v => v.id === topVesselId);

    return {
      vesselName: vessel?.name || 'Unknown',
      days: daysByVessel[topVesselId]
    }
  }, [vessels, allStateLogs]);


  const isLoading = isLoadingVessels || isLoadingProfile || (vessels && (allSeaService.length === 0 && allStateLogs.size === 0 && vessels.length > 0));
  
  // Loading skeleton component
  const StatCardSkeleton = () => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16 mb-2" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
  
  if (isLoading) {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <Card className="lg:col-span-2 rounded-xl">
            <CardHeader>
              <Skeleton className="h-6 w-40 mb-2" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">Your career at a glance</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-full sm:w-[140px] rounded-xl">
                <Calendar className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                    {availableYears.map(year => (
                        <SelectItem key={year} value={year.toLowerCase()}>
                    {year === 'all' ? 'All Years' : year}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Select value={selectedVessel} onValueChange={setSelectedVessel}>
              <SelectTrigger className="w-full sm:w-[180px] rounded-xl">
                <Ship className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Vessel" />
                </SelectTrigger>
                <SelectContent>
                    {availableVessels.map(vessel => (
                        <SelectItem key={vessel.id} value={vessel.id}>{vessel.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
      </div>
        <Separator />
      </div>
      
      {/* Past 7 Days Summary */}
      {past7DaysStats.totalDays > 0 && (
        <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow bg-gradient-to-r from-primary/5 to-primary/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <CalendarDays className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-2">Last 7 Days Summary</h3>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    In the last week, you logged{' '}
                    <span className="font-semibold text-foreground">{past7DaysStats.totalDays} day{past7DaysStats.totalDays !== 1 ? 's' : ''}</span>:
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {past7DaysStats.atSeaDays > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-blue))' }} />
                        <span className="text-muted-foreground">
                          <span className="font-semibold text-foreground">{past7DaysStats.atSeaDays}</span> day{past7DaysStats.atSeaDays !== 1 ? 's' : ''} at sea
                        </span>
                      </div>
                    )}
                    {past7DaysStats.standbyDays > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-orange))' }} />
                        <span className="text-muted-foreground">
                          <span className="font-semibold text-foreground">{past7DaysStats.standbyDays}</span> standby day{past7DaysStats.standbyDays !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                    {past7DaysStats.atAnchorDays > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-orange))' }} />
                        <span className="text-muted-foreground">
                          <span className="font-semibold text-foreground">{past7DaysStats.atAnchorDays}</span> day{past7DaysStats.atAnchorDays !== 1 ? 's' : ''} at anchor
                        </span>
                      </div>
                    )}
                    {past7DaysStats.inPortDays > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-green))' }} />
                        <span className="text-muted-foreground">
                          <span className="font-semibold text-foreground">{past7DaysStats.inPortDays}</span> day{past7DaysStats.inPortDays !== 1 ? 's' : ''} in port
                        </span>
                      </div>
                    )}
                    {past7DaysStats.onLeaveDays > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-gray))' }} />
                        <span className="text-muted-foreground">
                          <span className="font-semibold text-foreground">{past7DaysStats.onLeaveDays}</span> day{past7DaysStats.onLeaveDays !== 1 ? 's' : ''} on leave
                        </span>
                      </div>
                    )}
                    {past7DaysStats.inYardDays > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-red))' }} />
                        <span className="text-muted-foreground">
                          <span className="font-semibold text-foreground">{past7DaysStats.inYardDays}</span> day{past7DaysStats.inYardDays !== 1 ? 's' : ''} in yard
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Days Logged</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Ship className="h-4 w-4 text-primary" />
            </div>
            </CardHeader>
            <CardContent>
            <div className="text-3xl font-bold">{totalDays}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedYear === 'all' && selectedVessel === 'all' ? 'All time' : 'Filtered results'}
            </p>
            </CardContent>
        </Card>
        
        <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">At Sea Days</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Waves className="h-4 w-4 text-blue-500" />
            </div>
            </CardHeader>
            <CardContent>
            <div className="text-3xl font-bold">{atSeaDays}</div>
            <p className="text-xs text-muted-foreground mt-1">Total days underway</p>
            </CardContent>
        </Card>
        
        <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Standby Days</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <Anchor className="h-4 w-4 text-orange-500" />
            </div>
            </CardHeader>
            <CardContent>
            <div className="text-3xl font-bold">{standbyDays}</div>
            <p className="text-xs text-muted-foreground mt-1">In port or at anchor</p>
            </CardContent>
        </Card>
        
        <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vessels Logged</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Building className="h-4 w-4 text-purple-500" />
            </div>
            </CardHeader>
            <CardContent>
            <div className="text-3xl font-bold">{userVesselCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Vessels you've been on</p>
            </CardContent>
        </Card>
      </div>
      
      {/* Current Vessel and Recent Activity Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Current Vessel Card */}
        <Card className="rounded-xl border shadow-sm hover:shadow-md transition-all duration-300 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent relative overflow-hidden">
            {/* Decorative background element */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16" />
            <CardHeader className="relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Current Vessel</CardTitle>
                  <CardDescription className="mt-0.5">
                    {currentVessel ? `${currentVessel.name}` : 'No active vessel at this time'}
                  </CardDescription>
                </div>
              </div>
              {currentVessel && (
                <Badge variant="secondary" className="bg-primary text-primary-foreground animate-pulse">Active</Badge>
              )}
            </div>
            </CardHeader>
            <CardContent>
            {currentVessel ? (
              <div className="space-y-4">
                {/* Vessel Header */}
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center">
                      <Ship className="h-7 w-7 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xl font-semibold">{currentVessel.name}</p>
                      <p className="text-sm text-muted-foreground">{currentVessel.type || 'Vessel'}</p>
                    </div>
                  </div>
                </div>
                
                {/* Service Duration and Start Date */}
                {currentVesselStats.serviceStartDate && (
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {currentVesselStats.serviceDuration} day{currentVesselStats.serviceDuration !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Since {format(currentVesselStats.serviceStartDate, 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>
                )}
                
                <Separator />
                
                {/* Today's Status */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Today's Status</p>
                  {todayStatus ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-background/50 border">
                      {(() => {
                        const stateInfo = vesselStates.find(s => s.value === todayStatus);
                        const StateIcon = stateInfo?.icon || Ship;
                        return (
                          <>
                            <div 
                              className="h-10 w-10 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: `${stateInfo?.color || 'hsl(var(--muted-foreground))'}20` }}
                            >
                              <StateIcon className="h-5 w-5" style={{ color: stateInfo?.color || 'hsl(var(--muted-foreground))' }} />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-semibold">{stateInfo?.label || todayStatus}</p>
                              <p className="text-xs text-muted-foreground">{format(new Date(), 'EEEE, MMM d')}</p>
                            </div>
                            <div 
                              className="h-3 w-3 rounded-full" 
                              style={{ backgroundColor: stateInfo?.color || 'hsl(var(--muted-foreground))' }}
                            />
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-background/50 border border-dashed">
                      <p className="text-sm text-muted-foreground">No status logged for today</p>
                    </div>
                  )}
                </div>

                <Separator />
                
                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 rounded-xl bg-background/50">
                    <p className="text-2xl font-bold">{currentVesselStats.totalDays}</p>
                    <p className="text-xs text-muted-foreground mt-1">Total Days</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-background/50">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Waves className="h-3 w-3 text-blue-500" />
                      <p className="text-2xl font-bold">{currentVesselStats.atSeaDays}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">At Sea</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-background/50">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Anchor className="h-3 w-3 text-orange-500" />
                      <p className="text-2xl font-bold">{currentVesselStats.standbyDays}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">Standby</p>
                  </div>
                </div>
                
                {/* State Breakdown Visualization */}
                {currentVesselStats.totalDays > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-3">State Distribution</p>
                      <div className="space-y-2.5">
                        {vesselStates.map(state => {
                          const count = currentVesselStats.stateBreakdown[state.value] || 0;
                          if (count === 0) return null;
                          const percentage = (count / currentVesselStats.totalDays) * 100;
                          const StateIcon = state.icon;
                          
                          return (
                            <div key={state.value} className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <StateIcon className="h-3.5 w-3.5" style={{ color: state.color }} />
                                  <span className="text-muted-foreground">{state.label}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-foreground">{count}</span>
                                  <span className="text-muted-foreground">({Math.round(percentage)}%)</span>
                                </div>
                              </div>
                              <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
                                <div 
                                  className="h-full rounded-full transition-all"
                                  style={{ 
                                    width: `${percentage}%`,
                                    backgroundColor: state.color
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
                
                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button asChild className="flex-1 rounded-xl">
                    <Link href="/dashboard/current">
                      <MapPin className="mr-2 h-4 w-4" />
                      Manage Service
                    </Link>
                  </Button>
                  {todayStatus && (
                    <Button asChild variant="outline" className="rounded-xl" size="icon">
                      <Link href="/dashboard/current">
                        <TrendingUp className="h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <Ship className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-4">No active vessel</p>
                <Button asChild variant="outline" className="rounded-lg">
                  <Link href="/dashboard/current">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Start a Service
                  </Link>
                </Button>
              </div>
            )}
            </CardContent>
        </Card>
        
        <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
                <CardTitle>Recent Activity</CardTitle>
            </div>
            <CardDescription>Your most recently logged sea time entries</CardDescription>
            </CardHeader>
            <CardContent>
            {recentActivity.length > 0 ? (
              <div className="space-y-3">
                {recentActivity.map((activity, index) => {
                  const stateInfo = vesselStates.find(s => s.value === activity.state);
                  const StateIcon = stateInfo?.icon || Ship;
                  const activityDate = new Date(activity.date);
                  const isToday = format(activityDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                  const isYesterday = format(activityDate, 'yyyy-MM-dd') === format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
                  
                  let dateLabel = '';
                  if (isToday) {
                    dateLabel = 'Today';
                  } else if (isYesterday) {
                    dateLabel = 'Yesterday';
                  } else {
                    dateLabel = format(activityDate, 'MMM d, yyyy');
                  }
                  
                  return (
                    <div 
                      key={activity.id || `${activity.date}-${activity.vesselId}-${index}`}
                      className="flex items-center gap-3 p-3 rounded-xl border bg-background/50 hover:bg-background transition-colors"
                    >
                      <div 
                        className="h-10 w-10 flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${stateInfo?.color || 'hsl(var(--muted-foreground))'}20` }}
                      >
                        <StateIcon 
                          className="h-5 w-5" 
                          style={{ color: stateInfo?.color || 'hsl(var(--muted-foreground))' }} 
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold truncate">{activity.vesselName}</p>
                          {activity.vesselType && (
                            <span className="text-xs text-muted-foreground truncate">• {activity.vesselType}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium" style={{ color: stateInfo?.color || 'hsl(var(--muted-foreground))' }}>
                            {stateInfo?.label || activity.state}
                          </span>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">{dateLabel}</span>
                        </div>
                      </div>
                      <div 
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: stateInfo?.color || 'hsl(var(--muted-foreground))' }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                  <History className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground mb-1">No recent activity</p>
                <p className="text-xs text-muted-foreground">Start logging your sea time to see activity here</p>
              </div>
            )}
            {recentActivity.length > 0 && (
              <div className="mt-4 pt-3 border-t">
                <Button asChild variant="ghost" className="w-full rounded-lg" size="sm">
                  <Link href="/dashboard/history">
                    <History className="mr-2 h-4 w-4" />
                    View Full History
                  </Link>
                </Button>
              </div>
            )}
            </CardContent>
        </Card>
      </div>

      {/* This Month Summary Section */}
      {thisMonthStats.totalDays > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Activity className="h-5 w-5 text-accent-foreground" />
              </div>
            <div>
                <h2 className="text-2xl font-bold tracking-tight">This Month</h2>
                <p className="text-sm text-muted-foreground">
                  Your activity overview for {format(new Date(), 'MMMM yyyy')}
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Days</CardTitle>
                  <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Calendar className="h-4 w-4 text-primary" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{thisMonthStats.totalDays}</div>
                  <p className="text-xs text-muted-foreground mt-1">This month</p>
                </CardContent>
              </Card>
              
              <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">At Sea</CardTitle>
                  <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Waves className="h-4 w-4 text-blue-500" />
          </div>
        </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{thisMonthStats.atSeaDays}</div>
                  <p className="text-xs text-muted-foreground mt-1">Days underway</p>
                </CardContent>
              </Card>
              
              <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Standby</CardTitle>
                  <div className="h-8 w-8 rounded-xl bg-orange-500/10 flex items-center justify-center">
                    <Anchor className="h-4 w-4 text-orange-500" />
          </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{thisMonthStats.standbyDays}</div>
                  <p className="text-xs text-muted-foreground mt-1">MCA/PYA compliant</p>
        </CardContent>
      </Card>

              <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">On Leave</CardTitle>
                  <div className="h-8 w-8 rounded-xl bg-gray-500/10 flex items-center justify-center">
                    <LifeBuoy className="h-4 w-4 text-gray-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{thisMonthStats.onLeaveDays}</div>
                  <p className="text-xs text-muted-foreground mt-1">Days off</p>
                </CardContent>
            </Card>
            </div>
          </div>
        </>
      )}

      {/* Career Highlights Section */}
      <Separator />

    </div>
  );
}
