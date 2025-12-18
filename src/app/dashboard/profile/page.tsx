'use client';

import { useState, useEffect, useMemo } from 'react';
import { UserProfileCard } from '@/components/dashboard/user-profile';
import { SubscriptionCard } from '@/components/dashboard/subscription-card';
import { UserInfoCard } from '@/components/dashboard/user-info-card';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser, useSupabase } from '@/supabase';
import { useCollection } from '@/supabase/database';
import { getVesselAssignments } from '@/supabase/database/queries';
import { format, parse, differenceInDays, isAfter } from 'date-fns';
import { Ship, Calendar, Briefcase, Loader2 } from 'lucide-react';
import type { VesselAssignment, Vessel } from '@/lib/types';

function CareerTab({ userId }: { userId?: string }) {
  const { supabase } = useSupabase();
  const [assignments, setAssignments] = useState<VesselAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Fetch all vessels for name lookup
  const { data: vessels } = useCollection<Vessel>('vessels');
  
  const vesselMap = useMemo(() => {
    const map = new Map<string, Vessel>();
    vessels?.forEach(vessel => {
      map.set(vessel.id, vessel);
    });
    return map;
  }, [vessels]);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const fetchAssignments = async () => {
      setIsLoading(true);
      try {
        const data = await getVesselAssignments(supabase, userId);
        setAssignments(data);
      } catch (error) {
        console.error('Error fetching vessel assignments:', error);
        setAssignments([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAssignments();
  }, [userId, supabase]);

  // Calculate total days for each assignment
  const getAssignmentDuration = (assignment: VesselAssignment): number => {
    const start = parse(assignment.startDate, 'yyyy-MM-dd', new Date());
    const end = assignment.endDate 
      ? parse(assignment.endDate, 'yyyy-MM-dd', new Date())
      : new Date();
    return differenceInDays(end, start) + 1; // +1 to include both start and end days
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <Card className="rounded-xl border">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Ship className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Career History</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Your vessel assignments and position history will appear here once you start logging sea service.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5" />
          Career History
        </CardTitle>
        <CardDescription>
          Your vessel assignments and position progression over time
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vessel</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((assignment) => {
                const vessel = vesselMap.get(assignment.vesselId);
                const duration = getAssignmentDuration(assignment);
                const isActive = !assignment.endDate;
                const endDate = assignment.endDate 
                  ? parse(assignment.endDate, 'yyyy-MM-dd', new Date())
                  : null;
                
                return (
                  <TableRow key={assignment.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Ship className="h-4 w-4 text-muted-foreground" />
                        {vessel?.name || 'Unknown Vessel'}
                      </div>
                    </TableCell>
                    <TableCell>
                      {assignment.position ? (
                        <Badge variant="outline">{assignment.position}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        {format(parse(assignment.startDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}
                      </div>
                    </TableCell>
                    <TableCell>
                      {endDate ? (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {format(endDate, 'MMM d, yyyy')}
                        </div>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {duration} {duration === 1 ? 'day' : 'days'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {isActive ? (
                        <Badge className="bg-green-500/10 text-green-700 border-green-500/20 dark:bg-green-500/20 dark:text-green-400">
                          Current
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Completed</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Career Summary */}
        {assignments.length > 0 && (
          <div className="mt-6 pt-6 border-t">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total Assignments</p>
                <p className="text-2xl font-bold">{assignments.length}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Active Assignments</p>
                <p className="text-2xl font-bold">
                  {assignments.filter(a => !a.endDate).length}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total Days at Sea</p>
                <p className="text-2xl font-bold">
                  {assignments.reduce((sum, a) => sum + getAssignmentDuration(a), 0)}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProfilePage() {
  const { user } = useUser();

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
            <p className="text-muted-foreground">
              Manage your account information and subscription
            </p>
          </div>
        </div>
        <Separator />
      </div>

      {/* Tabs Section */}
      <Tabs defaultValue="information" className="w-full">
        <TabsList className="rounded-xl">
          <TabsTrigger value="information" className="!rounded-lg">Information</TabsTrigger>
          <TabsTrigger value="career" className="!rounded-lg">Career</TabsTrigger>
        </TabsList>

        {/* Information Tab */}
        <TabsContent value="information" className="mt-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left Column - User Info and Subscription Cards */}
            <div className="lg:col-span-1 space-y-6">
              <UserInfoCard userId={user?.id} />
              <SubscriptionCard />
            </div>
            
            {/* Right Column - User Profile Card - Takes 2/3 of width on large screens */}
            <div className="lg:col-span-2">
              <UserProfileCard />
            </div>
          </div>
        </TabsContent>

        {/* Career Tab */}
        <TabsContent value="career" className="mt-6">
          <CareerTab userId={user?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}