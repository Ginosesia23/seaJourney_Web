
'use client';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Ship, Anchor, Calendar, Waves, Building, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const vesselStates: { value: string; label: string, color: string, icon: React.FC<any> }[] = [
    { value: 'underway', label: 'Underway', color: 'bg-blue-500', icon: Waves },
    { value: 'at-anchor', label: 'At Anchor', color: 'bg-orange-500', icon: Anchor },
    { value: 'in-port', label: 'In Port', color: 'bg-green-500', icon: Building },
    { value: 'on-leave', label: 'On Leave', color: 'bg-gray-500', icon: Briefcase },
    { value: 'in-yard', label: 'In Yard', color: 'bg-red-500', icon: Ship },
];

type VesselSummary = {
    id: string;
    name: string;
    type: string;
    totalDays: number;
    tripCount: number;
    dayCountByState: Record<string, number>;
    isCurrent: boolean;
};

export function VesselSummaryCard({ vesselSummary }: { vesselSummary: VesselSummary }) {
    return (
        <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg flex flex-col h-full">
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="font-headline text-xl">{vesselSummary.name}</CardTitle>
                        <CardDescription>{vesselSummary.type}</CardDescription>
                    </div>
                    {vesselSummary.isCurrent && <Badge variant="secondary">Current</Badge>}
                </div>
            </CardHeader>
            <CardContent className="flex-grow space-y-4">
                <div className="flex items-center justify-around text-center border-t border-b py-4">
                    <div className="px-2">
                        <p className="text-2xl font-bold">{vesselSummary.totalDays}</p>
                        <p className="text-xs text-muted-foreground">Total Days</p>
                    </div>
                     <div className="border-l h-10"></div>
                    <div className="px-2">
                        <p className="text-2xl font-bold">{vesselSummary.tripCount}</p>
                        <p className="text-xs text-muted-foreground">Trips</p>
                    </div>
                </div>
                <div>
                     <h4 className="text-sm font-medium mb-2">Day Breakdown</h4>
                     <div className="space-y-2">
                        {vesselStates.map(state => (
                            <div key={state.value} className="flex justify-between items-center text-sm">
                                <div className="flex items-center gap-2">
                                    <span className={cn('h-2.5 w-2.5 rounded-full', state.color)}></span>
                                    <span className="text-muted-foreground">{state.label}</span>
                                </div>
                                <span className="font-semibold">{vesselSummary.dayCountByState[state.value] || 0} days</span>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
            <CardFooter>
                 <p className="text-xs text-muted-foreground">Detailed trip logs can be found on the passages page.</p>
            </CardFooter>
        </Card>
    );
}

export function VesselSummarySkeleton() {
    return (
        <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-4 w-24 mt-1" />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-around text-center border-t border-b py-4">
                     <div className="px-2">
                        <Skeleton className="h-7 w-12 mx-auto" />
                        <Skeleton className="h-3 w-16 mx-auto mt-1" />
                    </div>
                     <div className="border-l h-10"></div>
                     <div className="px-2">
                        <Skeleton className="h-7 w-8 mx-auto" />
                        <Skeleton className="h-3 w-10 mx-auto mt-1" />
                    </div>
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-20 mb-2" />
                     {Array.from({ length: 5 }).map((_, i) => (
                         <div key={i} className="flex justify-between items-center">
                             <Skeleton className="h-4 w-24" />
                             <Skeleton className="h-4 w-12" />
                         </div>
                     ))}
                </div>
            </CardContent>
            <CardFooter>
                <Skeleton className="h-3 w-full" />
            </CardFooter>
        </Card>
    )
}
