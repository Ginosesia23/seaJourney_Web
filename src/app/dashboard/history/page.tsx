
'use client';

import { useState, useMemo } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, Timestamp } from 'firebase/firestore';
import { History, Loader2, Search } from 'lucide-react';
import { CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { VesselSummaryCard, VesselSummarySkeleton } from '@/components/dashboard/vessel-summary-card';

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

export default function HistoryPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [searchTerm, setSearchTerm] = useState('');

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

  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(vesselsCollectionRef);
  const { data: trips, isLoading: isLoadingTrips } = useCollection<Trip>(tripsCollectionRef);
  const { data: currentStatusData, isLoading: isLoadingStatus } = useCollection<CurrentStatus>(currentStatusCollectionRef);
  
  const currentStatus = useMemo(() => currentStatusData?.[0] || null, [currentStatusData]);

  const isLoading = isLoadingVessels || isLoadingTrips || isLoadingStatus;

  const vesselSummaries = useMemo(() => {
    if (!vessels) return [];

    return vessels.map(vessel => {
      const vesselTrips = (trips || []).filter(trip => trip.vesselId === vessel.id);
      
      let totalDays = vesselTrips.reduce((acc, trip) => acc + Object.keys(trip.dailyStates).length, 0);
      
      const dayCountByState = vesselTrips.reduce((acc, trip) => {
        Object.values(trip.dailyStates).forEach(state => {
          acc[state] = (acc[state] || 0) + 1;
        });
        return acc;
      }, {} as Record<string, number>);

      let isCurrent = false;
      if (currentStatus && currentStatus.vesselId === vessel.id) {
        isCurrent = true;
        const currentDays = Object.keys(currentStatus.dailyStates).length;
        totalDays += currentDays;

        Object.values(currentStatus.dailyStates).forEach(state => {
          dayCountByState[state] = (dayCountByState[state] || 0) + 1;
        });
      }

      return {
        ...vessel,
        totalDays,
        tripCount: vesselTrips.length + (isCurrent ? 1 : 0),
        dayCountByState,
        isCurrent
      };
    });
  }, [vessels, trips, currentStatus]);

  const filteredVessels = useMemo(() => {
    if (!searchTerm) return vesselSummaries;
    return vesselSummaries.filter(vessel => 
      vessel.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [vesselSummaries, searchTerm]);

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <History className="h-6 w-6" />
          <div>
              <CardTitle className="text-2xl">Trip History</CardTitle>
              <CardDescription>A summary of your sea time on each vessel.</CardDescription>
          </div>
        </div>
        <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
                placeholder="Filter vessels..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
      </div>
      
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => <VesselSummarySkeleton key={i} />)}
        </div>
      ) : filteredVessels.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVessels.map(vessel => (
            <VesselSummaryCard key={vessel.id} vesselSummary={vessel} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <p>No vessels found.</p>
        </div>
      )}
    </div>
  );
}
