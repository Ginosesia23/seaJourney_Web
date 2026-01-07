'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Users, 
  Ship, 
  AlertCircle,
  Loader2,
  Search,
  UserX,
  CheckCircle2,
  XCircle,
  Calendar,
  Mail
} from 'lucide-react';
import type { UserProfile, VesselAssignment } from '@/lib/types';
import { format, parse, isAfter, isBefore, startOfDay } from 'date-fns';
import { getVesselAssignments } from '@/supabase/database/queries';
import { useRouter } from 'next/navigation';

interface CrewWithoutVessel {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: string;
  createdAt: string;
  lastAssignmentEndDate: string | null;
  daysSinceLastAssignment: number | null;
  hasActiveAssignment: boolean;
}

export default function CrewAnalyticsPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const [crewWithoutVessels, setCrewWithoutVessels] = useState<CrewWithoutVessel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch user profile to check if admin
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    // Handle both snake_case and camelCase role fields
    const role = (userProfileRaw as any).role || (userProfileRaw as any).role || userProfileRaw.role || 'crew';
    return {
      ...userProfileRaw,
      role: role,
    } as UserProfile;
  }, [userProfileRaw]);

  const isAdmin = userProfile?.role === 'admin';
  
  // Debug logging
  useEffect(() => {
    if (userProfileRaw) {
      console.log('[CREW ANALYTICS] User profile:', {
        role: userProfile?.role,
        isAdmin,
        rawRole: (userProfileRaw as any).role,
        hasUserProfile: !!userProfile,
      });
    }
  }, [userProfileRaw, userProfile, isAdmin]);

  // Redirect if not admin (only after profile has loaded)
  useEffect(() => {
    if (!isLoadingProfile && userProfile && !isAdmin) {
      router.push('/dashboard');
    }
  }, [isAdmin, isLoadingProfile, userProfile, router]);

  // Fetch crew without active vessels
  useEffect(() => {
    if (!isAdmin || !user?.id) {
      setIsLoading(false);
      return;
    }

    const fetchCrewAnalytics = async () => {
      setIsLoading(true);
      try {
        // Fetch all crew users (excluding vessel accounts and admins)
        const { data: allCrew, error: crewError } = await supabase
          .from('users')
          .select('id, first_name, last_name, username, email, role, created_at, active_vessel_id')
          .in('role', ['crew', 'captain'])
          .order('created_at', { ascending: false });

        if (crewError) {
          console.error('[CREW ANALYTICS] Error fetching crew:', crewError);
          setCrewWithoutVessels([]);
          setIsLoading(false);
          return;
        }

        // Fetch all vessel assignments
        const allAssignments: VesselAssignment[] = [];
        for (const crewMember of allCrew || []) {
          try {
            const assignments = await getVesselAssignments(supabase, crewMember.id);
            allAssignments.push(...assignments);
          } catch (error) {
            console.error(`[CREW ANALYTICS] Error fetching assignments for ${crewMember.id}:`, error);
          }
        }

        // Group assignments by user ID
        const assignmentsByUser = new Map<string, VesselAssignment[]>();
        allAssignments.forEach(assignment => {
          if (!assignmentsByUser.has(assignment.userId)) {
            assignmentsByUser.set(assignment.userId, []);
          }
          assignmentsByUser.get(assignment.userId)!.push(assignment);
        });

        // Process each crew member
        const crewData: CrewWithoutVessel[] = (allCrew || []).map(crewMember => {
          const userAssignments = assignmentsByUser.get(crewMember.id) || [];
          
          // Find active assignments (end_date is null)
          const activeAssignments = userAssignments.filter(a => !a.endDate);
          const hasActiveAssignment = activeAssignments.length > 0;

          // Find the most recent assignment end date
          const assignmentsWithEndDate = userAssignments
            .filter(a => a.endDate)
            .sort((a, b) => {
              const dateA = parse(a.endDate!, 'yyyy-MM-dd', new Date());
              const dateB = parse(b.endDate!, 'yyyy-MM-dd', new Date());
              return dateB.getTime() - dateA.getTime();
            });

          const lastAssignmentEndDate = assignmentsWithEndDate.length > 0 
            ? assignmentsWithEndDate[0].endDate 
            : null;

          // Calculate days since last assignment ended
          let daysSinceLastAssignment: number | null = null;
          if (lastAssignmentEndDate) {
            const endDate = parse(lastAssignmentEndDate, 'yyyy-MM-dd', new Date());
            const today = startOfDay(new Date());
            const daysDiff = Math.floor((today.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));
            daysSinceLastAssignment = daysDiff;
          } else if (userAssignments.length === 0) {
            // No assignments at all - calculate days since account creation
            const createdAt = new Date(crewMember.created_at);
            const today = startOfDay(new Date());
            const daysDiff = Math.floor((today.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
            daysSinceLastAssignment = daysDiff;
          }

          return {
            id: crewMember.id,
            firstName: crewMember.first_name || '',
            lastName: crewMember.last_name || '',
            username: crewMember.username || '',
            email: crewMember.email || '',
            role: crewMember.role || 'crew',
            createdAt: crewMember.created_at,
            lastAssignmentEndDate,
            daysSinceLastAssignment,
            hasActiveAssignment,
          };
        });

        // Filter to only show crew without active vessels
        const crewWithoutActive = crewData.filter(crew => !crew.hasActiveAssignment);
        
        // Sort by days since last assignment (most recent first, then by account creation)
        crewWithoutActive.sort((a, b) => {
          if (a.daysSinceLastAssignment !== null && b.daysSinceLastAssignment !== null) {
            return b.daysSinceLastAssignment - a.daysSinceLastAssignment;
          }
          if (a.daysSinceLastAssignment !== null) return -1;
          if (b.daysSinceLastAssignment !== null) return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        setCrewWithoutVessels(crewWithoutActive);
      } catch (error) {
        console.error('[CREW ANALYTICS] Error fetching analytics:', error);
        setCrewWithoutVessels([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCrewAnalytics();
  }, [isAdmin, user?.id, supabase]);

  // Filter crew by search term
  const filteredCrew = useMemo(() => {
    if (!searchTerm.trim()) return crewWithoutVessels;
    
    const search = searchTerm.toLowerCase();
    return crewWithoutVessels.filter(crew => 
      crew.firstName.toLowerCase().includes(search) ||
      crew.lastName.toLowerCase().includes(search) ||
      crew.username.toLowerCase().includes(search) ||
      crew.email.toLowerCase().includes(search)
    );
  }, [crewWithoutVessels, searchTerm]);

  const stats = useMemo(() => {
    const total = crewWithoutVessels.length;
    const noAssignments = crewWithoutVessels.filter(c => c.lastAssignmentEndDate === null).length;
    const recentEnded = crewWithoutVessels.filter(c => 
      c.daysSinceLastAssignment !== null && c.daysSinceLastAssignment <= 30
    ).length;
    const longTermInactive = crewWithoutVessels.filter(c => 
      c.daysSinceLastAssignment !== null && c.daysSinceLastAssignment > 90
    ).length;

    return { total, noAssignments, recentEnded, longTermInactive };
  }, [crewWithoutVessels]);

  if (isLoadingProfile || isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Crew Analytics</h1>
          <p className="text-muted-foreground">
            Analyze crew members who are not currently tracking an active vessel.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Crew Analytics</h1>
        <p className="text-muted-foreground">
          Analyze crew members who are not currently tracking an active vessel.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Without Vessel</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              Crew members without active assignments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Never Assigned</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.noAssignments}</div>
            <p className="text-xs text-muted-foreground">
              Never had a vessel assignment
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recently Ended</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.recentEnded}</div>
            <p className="text-xs text-muted-foreground">
              Assignment ended in last 30 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Long Term Inactive</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.longTermInactive}</div>
            <p className="text-xs text-muted-foreground">
              No assignment for 90+ days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Crew Without Active Vessels</CardTitle>
          <CardDescription>
            {filteredCrew.length} of {crewWithoutVessels.length} crew members
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, username, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Last Assignment</TableHead>
                  <TableHead>Days Since</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCrew.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {searchTerm ? 'No crew members found matching your search.' : 'All crew members have active vessel assignments.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCrew.map((crew) => (
                    <TableRow key={crew.id}>
                      <TableCell className="font-medium">
                        {crew.firstName} {crew.lastName}
                      </TableCell>
                      <TableCell>{crew.username}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {crew.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={crew.role === 'captain' ? 'default' : 'secondary'}>
                          {crew.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {crew.lastAssignmentEndDate ? (
                          format(parse(crew.lastAssignmentEndDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')
                        ) : (
                          <span className="text-muted-foreground">Never assigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {crew.daysSinceLastAssignment !== null ? (
                          <span className={crew.daysSinceLastAssignment > 90 ? 'text-destructive font-medium' : ''}>
                            {crew.daysSinceLastAssignment} days
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {crew.daysSinceLastAssignment !== null && crew.daysSinceLastAssignment > 90 ? (
                          <Badge variant="destructive">Inactive</Badge>
                        ) : crew.lastAssignmentEndDate === null ? (
                          <Badge variant="outline">New</Badge>
                        ) : (
                          <Badge variant="secondary">Available</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

