
'use client';

import { Ship, LifeBuoy, Route, Anchor, Loader2 } from 'lucide-react';
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
import { collection, Timestamp } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { differenceInDays, fromUnixTime } from 'date-fns';

type Vessel = {
  id: string;
  name: string;
  type: string;
  ownerId: string;
};

type Trip = {
    id: string;
    vesselId: string;
    position: string;
    startDate: Timestamp;
    endDate: Timestamp;
    dailyStates: Record<string, string>;
};

type CurrentStatus = {
    id: string;
    vesselId: string;
    position: string;
    startDate: Timestamp;
    dailyStates: Record<string, string>;
};

type Testimonial = {
    id: string;
    rating: number;
}

export default function DashboardPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedVessel, setSelectedVessel] = useState('all');

  const vesselsCollectionRef = useMemoFirebase(() => 
    user ? collection(firestore, 'users', user.uid, 'vessels') : null, 
    [user, firestore]
  );
  const tripsCollectionRef = useMemoFirebase(() => 
    user ? collection(firestore, 'users', user.uid, 'trips') : null, 
    [user, firestore]
  );
  const currentStatusCollectionRef = useMemoFirebase(() => 
    user ? collection(firestore, 'users', user.uid, 'currentStatus') : null, 
    [user, firestore]
  );
  const testimonialsCollectionRef = useMemoFirebase(() => 
    user ? collection(firestore, 'users', user.uid, 'profile', user.uid, 'testimonials') : null, 
    [user, firestore]
  );

  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(vesselsCollectionRef);
  const { data: trips, isLoading: isLoadingTrips } = useCollection<Trip>(tripsCollectionRef);
  const { data: currentStatusData, isLoading: isLoadingStatus } = useCollection<CurrentStatus>(currentStatusCollectionRef);
  const { data: testimonials, isLoading: isLoadingTestimonials } = useCollection<Testimonial>(testimonialsCollectionRef);
  
  const currentStatus = useMemo(() => currentStatusData?.[0] || null, [currentStatusData]);

  const filteredTrips = useMemo(() => {
    return (trips || []).filter(trip => {
      const tripYear = getYear(fromUnixTime(trip.endDate.seconds));
      const yearMatch = selectedYear === 'all' || tripYear === parseInt(selectedYear, 10);
      const vesselMatch = selectedVessel === 'all' || trip.vesselId === selectedVessel;
      return yearMatch && vesselMatch;
    });
  }, [trips, selectedYear, selectedVessel]);

  const totalSeaDays = useMemo(() => {
    const pastTripDays = filteredTrips.reduce((acc, trip) => acc + Object.keys(trip.dailyStates).length, 0);
    const currentTripDays = (selectedYear === 'all' && selectedVessel === 'all' && currentStatus)
        ? Object.keys(currentStatus.dailyStates).length
        : 0;
    return pastTripDays + currentTripDays;
  }, [filteredTrips, currentStatus, selectedYear, selectedVessel]);

  const recentActivity = useMemo(() => {
    return (trips || [])
        .sort((a, b) => b.endDate.seconds - a.endDate.seconds)
        .slice(0, 5)
        .map(trip => {
            const vessel = vessels?.find(v => v.id === trip.vesselId);
            return {
                ...trip,
                vesselName: vessel?.name || 'Unknown Vessel',
                days: differenceInDays(fromUnixTime(trip.endDate.seconds), fromUnixTime(trip.startDate.seconds)) + 1
            }
        });
  }, [trips, vessels]);
  
  const availableYears = useMemo(() => {
    if (!trips) return [];
    const years = new Set(trips.map(trip => getYear(fromUnixTime(trip.endDate.seconds))));
    return ['All', ...Array.from(years).sort((a, b) => b - a).map(String)];
  }, [trips]);

  const availableVessels = useMemo(() => {
    if(!vessels) return [];
    return [{ id: 'all', name: 'All Vessels' }, ...vessels];
  }, [vessels]);

  const chartData = useMemo(() => {
    const months = Array.from({length: 12}).map((_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        return { month: format(d, 'MMM'), seaDays: 0 };
    }).reverse();

    const allRecords = [...(trips || []), ...(currentStatus ? [currentStatus] : [])];
    
    allRecords.forEach(record => {
      Object.keys(record.dailyStates).forEach(dateStr => {
        const date = new Date(dateStr);
        const monthStr = format(date, 'MMM');
        const month = months.find(m => m.month === monthStr);
        if(month) {
            month.seaDays++;
        }
      });
    });

    return months;

  }, [trips, currentStatus]);


  const isLoading = isLoadingVessels || isLoadingTrips || isLoadingStatus || isLoadingTestimonials;
  
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
                        <SelectItem key={year} value={year.toLowerCase()}>{year}</SelectItem>
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
         <Card className="rounded-xl shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Sea Days</CardTitle>
                  <Ship className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold">{totalSeaDays}</div>
                  <p className="text-xs text-muted-foreground">{selectedYear === 'all' && selectedVessel === 'all' ? 'All time' : 'Based on filters'}</p>
              </CardContent>
          </Card>

          <Card className="rounded-xl shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Testimonials</CardTitle>
                  <LifeBuoy className="h-4 w-4 text-muted-foreground"/>
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold">{testimonials?.length || 0}</div>
                  <p className="text-xs text-muted-foreground">Total testimonials collected</p>
              </CardContent>
          </Card>
          
          <Card className="rounded-xl shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Passages Logged</CardTitle>
                  <Route className="h-4 w-4 text-muted-foreground"/>
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold">{trips?.length || 0}</div>
                  <p className="text-xs text-muted-foreground">Total completed trips</p>
              </CardContent>
          </Card>

          <Card className="rounded-xl shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Vessels Logged</CardTitle>
                  <Anchor className="h-4 w-4 text-muted-foreground"/>
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold">{vessels?.length || 0}</div>
                  <p className="text-xs text-muted-foreground">Total vessels in your fleet</p>
              </CardContent>
          </Card>
      </div>
      
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <Card className="rounded-xl shadow-sm lg:col-span-2">
            <CardHeader>
                <CardTitle>Sea Day Analytics</CardTitle>
                <CardDescription>Your sea days logged over the past year.</CardDescription>
            </CardHeader>
            <CardContent>
                <MainChart data={chartData}/>
            </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm">
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
                            <TableCell className="text-right">{format(fromUnixTime(activity.endDate.seconds), 'dd MMM, yyyy')}</TableCell>
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
    </div>
  );
}
