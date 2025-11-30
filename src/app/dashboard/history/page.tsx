
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useUser, useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { History, Loader2, Search, LayoutGrid, List } from 'lucide-react';
import { CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { VesselSummaryCard, VesselSummarySkeleton } from '@/components/dashboard/vessel-summary-card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { Vessel, SeaServiceRecord, StateLog } from '@/lib/types';
import { fromUnixTime, differenceInDays } from 'date-fns';

export default function HistoryPage() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [searchTerm, setSearchTerm] = useState('');
  const [layout, setLayout] = useState<'card' | 'table'>('card');

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

  const isLoading = isLoadingVessels || (vessels && vessels.length > 0 && (allSeaService.length === 0 && allStateLogs.size === 0 && vessels.length > 0));

  const vesselSummaries = useMemo(() => {
    if (!vessels) return [];

    return vessels.map(vessel => {
      const vesselServices = allSeaService.filter(s => s.vesselId === vessel.id);
      const vesselLogs = allStateLogs.get(vessel.id) || [];
      
      const totalDays = vesselLogs.length;

      const dayCountByState = vesselLogs.reduce((acc, log) => {
          acc[log.state] = (acc[log.state] || 0) + 1;
          return acc;
      }, {} as Record<string, number>);

      const isCurrent = vesselServices.some(s => s.isCurrent);

      return {
        ...vessel,
        totalDays,
        tripCount: vesselServices.length,
        dayCountByState,
        isCurrent
      };
    });
  }, [vessels, allSeaService, allStateLogs]);

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
        <div className="flex w-full sm:w-auto items-center gap-2">
            <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Filter vessels..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
                <Button variant={layout === 'card' ? 'secondary': 'ghost'} size="icon" onClick={() => setLayout('card')} className="h-8 w-8 rounded-md">
                    <LayoutGrid className="h-4 w-4"/>
                </Button>
                 <Button variant={layout === 'table' ? 'secondary': 'ghost'} size="icon" onClick={() => setLayout('table')} className="h-8 w-8 rounded-md">
                    <List className="h-4 w-4"/>
                </Button>
            </div>
        </div>
      </div>
      
      {isLoading ? (
        layout === 'card' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => <VesselSummarySkeleton key={i} />)}
            </div>
        ) : (
             <div className="border rounded-xl">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Vessel</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Total Days</TableHead>
                            <TableHead>Trips</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center">
                                <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </div>
        )
      ) : filteredVessels.length > 0 ? (
        layout === 'card' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVessels.map(vessel => (
                <VesselSummaryCard key={vessel.id} vesselSummary={vessel} />
            ))}
            </div>
        ) : (
            <div className="border rounded-xl">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Vessel</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Total Days</TableHead>
                            <TableHead>Trips</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredVessels.map(vessel => (
                            <TableRow key={vessel.id}>
                                <TableCell className="font-medium">{vessel.name}</TableCell>
                                <TableCell className="text-muted-foreground">{vessel.type}</TableCell>
                                <TableCell>{vessel.totalDays}</TableCell>
                                <TableCell>{vessel.tripCount}</TableCell>
                                <TableCell>
                                    {vessel.isCurrent ? (
                                        <Badge variant="secondary">Current</Badge>
                                    ) : (
                                        <Badge variant="outline">Past</Badge>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        )
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          <p>No vessels found.</p>
        </div>
      )}
    </div>
  );
}
