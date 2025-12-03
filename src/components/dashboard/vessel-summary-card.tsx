
'use client';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Ship, Anchor, Calendar, Waves, Building, Briefcase, PlayCircle, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const vesselStates: { value: string; label: string, color: string, icon: React.FC<any> }[] = [
    { value: 'underway', label: 'Underway', color: 'hsl(var(--chart-blue))', icon: Waves },
    { value: 'at-anchor', label: 'At Anchor', color: 'hsl(var(--chart-orange))', icon: Anchor },
    { value: 'in-port', label: 'In Port', color: 'hsl(var(--chart-green))', icon: Building },
    { value: 'on-leave', label: 'On Leave', color: 'hsl(var(--chart-gray))', icon: Briefcase },
    { value: 'in-yard', label: 'In Yard', color: 'hsl(var(--chart-red))', icon: Ship },
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

type VesselSummaryCardProps = {
    vesselSummary: VesselSummary;
    onResumeService?: (vesselId: string) => void;
    showResumeButton?: boolean;
    isResuming?: boolean;
    onDelete?: (vesselId: string, vesselName: string) => void;
    showDeleteButton?: boolean;
};

export function VesselSummaryCard({ 
    vesselSummary, 
    onResumeService, 
    showResumeButton = false,
    isResuming = false,
    onDelete,
    showDeleteButton = false
}: VesselSummaryCardProps) {
    return (
        <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3 flex-1">
                        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <Ship className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <CardTitle className="text-xl font-semibold truncate">{vesselSummary.name}</CardTitle>
                            <CardDescription className="truncate">{vesselSummary.type}</CardDescription>
                        </div>
                    </div>
                    {vesselSummary.isCurrent && (
                        <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 shrink-0">Current</Badge>
                    )}
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
                        {vesselStates.map(state => {
                            const count = vesselSummary.dayCountByState[state.value] || 0;
                            if (count === 0) return null; // Only show states with logged days
                            return (
                                <div key={state.value} className="flex justify-between items-center text-sm">
                                    <div className="flex items-center gap-2">
                                        <span 
                                            className="h-2.5 w-2.5 rounded-full" 
                                            style={{ backgroundColor: state.color }}
                                        ></span>
                                        <span className="text-muted-foreground">{state.label}</span>
                                    </div>
                                    <span className="font-semibold">{count} days</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
                {vesselSummary.isCurrent ? (
                    <p className="text-xs text-muted-foreground w-full">This is your currently active vessel.</p>
                ) : (
                    <div className="flex flex-col gap-2 w-full">
                        {showResumeButton && onResumeService && (
                            <Button
                                onClick={() => onResumeService(vesselSummary.id)}
                                disabled={isResuming}
                                variant="outline"
                                className="w-full rounded-lg"
                                size="sm"
                            >
                                {isResuming ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Resuming...
                                    </>
                                ) : (
                                    <>
                                        <PlayCircle className="mr-2 h-4 w-4" />
                                        Resume Service
                                    </>
                                )}
                            </Button>
                        )}
                        {showDeleteButton && onDelete && (
                            <Button
                                onClick={() => onDelete(vesselSummary.id, vesselSummary.name)}
                                variant="destructive"
                                className="w-full rounded-xl"
                                size="sm"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete Vessel Data
                            </Button>
                        )}
                        {!showResumeButton && !showDeleteButton && (
                            <p className="text-xs text-muted-foreground w-full">Detailed trip logs can be found on the passages page.</p>
                        )}
                    </div>
                )}
            </CardFooter>
        </Card>
    );
}

export function VesselSummarySkeleton() {
    return (
        <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
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
