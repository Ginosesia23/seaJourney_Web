
'use client';

import { Ship, LifeBuoy, Route, Anchor, Loader2, Award, Star, Globe, Waves, Building } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import MainChart from '@/components/dashboard/main-chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format, getYear } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, getDocs } from 'firebase/firestore';
import { useMemo, useState, useEffect } from 'react';
import { differenceInDays, fromUnixTime } from 'date-fns';
import { ComposableMap, Geographies, Geography, Line, Marker } from "react-simple-maps"
import worldAtlas from "world-atlas/countries-110m.json"
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Vessel, SeaServiceRecord, StateLog } from '@/lib/types';

type Testimonial = {
    id: string;
    rating: number;
}

export default function DashboardPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedVessel, setSelectedVessel] = useState('all');
  
  const [allSeaService, setAllSeaService] = useState<SeaServiceRecord[]>([]);
  const [allStateLogs, setAllStateLogs] = useState<Map<string, StateLog[]>>(new Map());

  const vesselsCollectionRef = useMemoFirebase(() => 
    user ? collection(firestore, 'users', user.uid, 'vessels') : null, 
    [user, firestore]
  );
  
  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(vesselsCollectionRef);

  useEffect(() => {
    if (vessels && firestore && user?.uid) {
        const fetchServiceAndLogs = async () => {
            const serviceRecords: SeaServiceRecord[] = [];
            const logsMap = new Map<string, StateLog[]>();

            await Promise.all(vessels.map(async (vessel) => {
                const serviceRef = collection(firestore, 'users', user.uid, 'vessels', vessel.id, 'seaService');
                const logsRef = collection(firestore, 'users', user.uid, 'vessels', vessel.id, 'stateLogs');

                const [serviceSnap, logsSnap] = await Promise.all([getDocs(serviceRef), getDocs(logsRef)]);
                
                serviceSnap.forEach(doc => serviceRecords.push({ id: doc.id, ...doc.data() } as SeaServiceRecord));
                const logs = logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StateLog));
                logsMap.set(vessel.id, logs);
            }));
            setAllSeaService(serviceRecords);
            setAllStateLogs(logsMap);
        };
        fetchServiceAndLogs();
    }
  }, [vessels, firestore, user?.uid]);


  const filteredServiceRecords = useMemo(() => {
    if (!allSeaService) return [];
    return allSeaService.filter(service => {
      const serviceYear = getYear(fromUnixTime(service.startDate.seconds));
      const yearMatch = selectedYear === 'all' || serviceYear === parseInt(selectedYear, 10);
      const vesselMatch = selectedVessel === 'all' || service.vesselId === selectedVessel;
      return yearMatch && vesselMatch;
    });
  }, [allSeaService, selectedYear, selectedVessel]);

   const { totalDays, atSeaDays, standbyDays } = useMemo(() => {
    let days = 0;
    let atSea = 0;
    let standby = 0;

    filteredServiceRecords.forEach(service => {
        const logs = allStateLogs.get(service.vesselId) || [];
        const serviceLogs = logs.filter(log => {
            const logDate = new Date(log.date);
            const startDate = fromUnixTime(service.startDate.seconds);
            const endDate = service.endDate ? fromUnixTime(service.endDate.seconds) : new Date();
            return logDate >= startDate && logDate <= endDate;
        });

        serviceLogs.forEach(log => {
            days++;
            if (log.state === 'underway') {
                atSea++;
            } else if (log.state === 'in-port' || log.state === 'at-anchor') {
                standby++;
            }
        });
    });

    return { totalDays: days, atSeaDays: atSea, standbyDays: standby };
  }, [filteredServiceRecords, allStateLogs]);

  const recentActivity = useMemo(() => {
    if (!allSeaService || !vessels) return [];
    return allSeaService
        .filter(s => s.endDate)
        .sort((a, b) => b.endDate!.seconds - a.endDate!.seconds)
        .slice(0, 5)
        .map(service => {
            const vessel = vessels.find(v => v.id === service.vesselId);
            return {
                ...service,
                vesselName: vessel?.name || 'Unknown Vessel',
                days: differenceInDays(fromUnixTime(service.endDate!.seconds), fromUnixTime(service.startDate.seconds)) + 1
            }
        });
  }, [allSeaService, vessels]);
  
  const availableYears = useMemo(() => {
    if (!allSeaService) return [];
    const years = new Set(allSeaService.map(service => getYear(fromUnixTime(service.startDate.seconds))));
    return ['all', ...Array.from(years).sort((a, b) => b - a).map(String)];
  }, [allSeaService]);

  const availableVessels = useMemo(() => {
    if(!vessels) return [];
    return [{ id: 'all', name: 'All Vessels' }, ...vessels];
  }, [vessels]);

  const chartData = useMemo(() => {
    const months = Array.from({length: 12}).map((_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        return { month: format(d, 'MMM'), seaDays: 0, underway: 0, inPort: 0, atAnchor: 0 };
    }).reverse();

    allStateLogs.forEach(logs => {
      logs.forEach(log => {
        const date = new Date(log.date);
        const monthStr = format(date, 'MMM');
        const monthData = months.find(m => m.month === monthStr);
        if(monthData) {
            monthData.seaDays++;
            if (log.state === 'underway') monthData.underway++;
            if (log.state === 'in-port') monthData.inPort++;
            if (log.state === 'at-anchor') monthData.atAnchor++;
        }
      });
    });

    return months;
  }, [allStateLogs]);

  const longestPassage = useMemo(() => {
    if (!allSeaService || allSeaService.length === 0 || !vessels) return null;
    let longest: SeaServiceRecord | null = null;
    let maxDays = 0;

    allSeaService.forEach(service => {
        const days = differenceInDays(
            service.endDate ? fromUnixTime(service.endDate.seconds) : new Date(), 
            fromUnixTime(service.startDate.seconds)
        );
        if (days > maxDays) {
            maxDays = days;
            longest = service;
        }
    });

    if (!longest) return null;
    const vessel = vessels.find(v => v.id === longest!.vesselId);
    return {
      vesselName: vessel?.name || 'Unknown',
      days: maxDays
    }
  }, [allSeaService, vessels]);

  const topVessel = useMemo(() => {
    if(!vessels || !allSeaService) return null;

    const daysByVessel: Record<string, number> = {};
    allSeaService.forEach(service => {
        const days = differenceInDays(
            service.endDate ? fromUnixTime(service.endDate.seconds) : new Date(),
            fromUnixTime(service.startDate.seconds)
        ) + 1;
        daysByVessel[service.vesselId] = (daysByVessel[service.vesselId] || 0) + days;
    });

    if (Object.keys(daysByVessel).length === 0) return null;

    const topVesselId = Object.entries(daysByVessel).sort(([,a],[,b]) => b - a)[0][0];
    const vessel = vessels.find(v => v.id === topVesselId);

    return {
      vesselName: vessel?.name || 'Unknown',
      days: daysByVessel[topVesselId]
    }
  }, [vessels, allSeaService]);


  const isLoading = isLoadingVessels || (vessels && (allSeaService.length === 0 && allStateLogs.size === 0 && vessels.length > 0));
  
  if (isLoading) {
    return (
        <div className="flex items-center justify-center h-full">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <CardTitle className="text-2xl">Dashboard</CardTitle>
            <CardDescription>Your career at a glance.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-full sm:w-auto rounded-full">
                    <SelectValue placeholder="Filter by year..." />
                </SelectTrigger>
                <SelectContent>
                    {availableYears.map(year => (
                        <SelectItem key={year} value={year.toLowerCase()}>
                            {year.charAt(0).toUpperCase() + year.slice(1)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Select value={selectedVessel} onValueChange={setSelectedVessel}>
                <SelectTrigger className="w-full sm:w-auto rounded-full">
                    <SelectValue placeholder="Filter by vessel..." />
                </SelectTrigger>
                <SelectContent>
                    {availableVessels.map(vessel => (
                        <SelectItem key={vessel.id} value={vessel.id}>{vessel.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
         <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Days Logged</CardTitle>
                <Ship className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{totalDays}</div>
                <p className="text-xs text-muted-foreground">{selectedYear === 'all' && selectedVessel === 'all' ? 'All time' : 'Based on filters'}</p>
            </CardContent>
        </Card>
        <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">At Sea Days</CardTitle>
                <Waves className="h-4 w-4 text-muted-foreground"/>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{atSeaDays}</div>
                <p className="text-xs text-muted-foreground">Total days underway</p>
            </CardContent>
        </Card>
        <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Standby Days</CardTitle>
                <Anchor className="h-4 w-4 text-muted-foreground"/>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{standbyDays}</div>
                <p className="text-xs text-muted-foreground">Total days in port or at anchor</p>
            </CardContent>
        </Card>
        <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Vessels Logged</CardTitle>
                <Building className="h-4 w-4 text-muted-foreground"/>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{vessels?.length || 0}</div>
                <p className="text-xs text-muted-foreground">Total vessels in your fleet</p>
            </CardContent>
        </Card>
      </div>
      
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg lg:col-span-2">
            <CardHeader>
                <CardTitle>Sea Day Analytics</CardTitle>
                <CardDescription>Your sea days logged over the past year.</CardDescription>
            </CardHeader>
            <CardContent>
                <MainChart data={chartData}/>
            </CardContent>
        </Card>
        <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
            <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Your most recently logged sea time.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Vessel</TableHead>
                            <TableHead className="text-right">Date</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {recentActivity.length > 0 ? recentActivity.map((activity) => (
                        <TableRow key={activity.id}>
                            <TableCell>
                                <div className="font-medium">{activity.vesselName}</div>
                                <div className="text-sm text-muted-foreground">{activity.days} days</div>
                            </TableCell>
                            <TableCell className="text-right">{format(fromUnixTime(activity.endDate!.seconds), 'dd MMM, yyyy')}</TableCell>
                        </TableRow>
                        )) : (
                            <TableRow>
                                <TableCell colSpan={2} className="h-24 text-center">
                                    No recent activity found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>
      <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg overflow-hidden">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" /> World Map Preview</CardTitle>
              <CardDescription>A snapshot of your global passages.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/world-map">View Interactive Map</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 relative h-80">
          <div className="absolute inset-0 bg-map-ocean">
            <ComposableMap
              projection="geoMercator"
              projectionConfig={{
                rotate: [-10, 0, 0],
                scale: 120,
                center: [0, 20]
              }}
              style={{ width: "100%", height: "100%" }}
            >
              <Geographies geography={worldAtlas}>
                {({ geographies }) =>
                  geographies.map(geo => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill="hsl(var(--map-land))"
                      stroke="hsl(var(--map-ocean))"
                      strokeWidth={0.5}
                    />
                  ))
                }
              </Geographies>
              <Line
                from={[12.4964, 41.9028]}
                to={[-80.1918, 25.7617]}
                stroke="hsl(var(--accent))"
                strokeWidth={2}
                strokeDasharray="6 6"
              />
              <Marker coordinates={[12.4964, 41.9028]}>
                <circle r={4} fill="hsl(var(--accent))" className="animate-pulse" />
              </Marker>
              <Marker coordinates={[-80.1918, 25.7617]}>
                <circle r={4} fill="hsl(var(--accent))" className="animate-pulse" />
              </Marker>
            </ComposableMap>
          </div>
        </CardContent>
      </Card>

       <div className="grid gap-4 md:grid-cols-2 md:gap-8">
        {longestPassage && (
            <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Longest Service</CardTitle>
                    <Award className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{longestPassage.days} days</div>
                    <p className="text-xs text-muted-foreground">on {longestPassage.vesselName}</p>
                </CardContent>
            </Card>
        )}
        {topVessel && (
            <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Top Vessel</CardTitle>
                    <Star className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{topVessel.vesselName}</div>
                    <p className="text-xs text-muted-foreground">{topVessel.days} total days logged</p>
                </CardContent>
            </Card>
        )}
      </div>

    </div>
  );
}
