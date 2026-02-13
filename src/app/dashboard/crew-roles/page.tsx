'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useUser, useSupabase } from '@/supabase';
import { useRouter } from 'next/navigation';
import { Loader2, Users, Ship } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import type { UserProfile, VesselAssignment } from '@/lib/types';
import { getActiveVesselAssignmentsByVessel, updateVesselAssignment } from '@/supabase/database/queries';
import { useDoc } from '@/supabase/database';

/** Permission levels vessel managers can assign (what tasks the person can do on this vessel). */
const ASSIGNMENT_ROLES = [
  { value: 'crew', label: 'Crew' },
  { value: 'officer', label: 'Officer' },
  { value: 'captain', label: 'Captain' },
  { value: 'admin', label: 'Admin' },
] as const;

interface CrewMemberRow {
  profile: UserProfile;
  assignment: VesselAssignment;
}

function getDisplayName(profile: UserProfile): string {
  const first = profile.firstName || (profile as any).first_name || '';
  const last = profile.lastName || (profile as any).last_name || '';
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || profile.email || 'Unknown';
}

export default function CrewRolesPage() {
  const { user, isUserLoading } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const [crew, setCrew] = useState<CrewMemberRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Match crew/dashboard: use user?.id (no ?? null) so useDoc behaves the same
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<any>('users', user?.id);
  const currentUserProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    // Match dashboard/crew: support snake_case from DB, normalize for comparison
    const rawRole = (userProfileRaw as any).role || userProfileRaw.role || 'crew';
    const roleLower = typeof rawRole === 'string' ? rawRole.toLowerCase().trim() : 'crew';
    const role =
      roleLower === 'vessel' ? 'vessel' : roleLower === 'admin' ? 'admin' : roleLower === 'captain' ? 'captain' : 'crew';
    return {
      ...userProfileRaw,
      id: userProfileRaw.id,
      role,
      activeVesselId: (userProfileRaw as any).active_vessel_id ?? userProfileRaw.activeVesselId ?? null,
      firstName: (userProfileRaw as any).first_name ?? userProfileRaw.firstName,
      lastName: (userProfileRaw as any).last_name ?? userProfileRaw.lastName,
      email: userProfileRaw.email,
    } as UserProfile & { activeVesselId: string | null };
  }, [userProfileRaw]);

  const isVesselManager = currentUserProfile?.role === 'vessel';
  const activeVesselId = currentUserProfile?.activeVesselId ?? null;

  // Page disabled for now – redirect everyone to dashboard
  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  // Redirect only when we have a loaded profile and user is not a vessel manager (avoid redirect on slow/failed profile load)
  useEffect(() => {
    if (isUserLoading || isLoadingProfile) return;
    if (!user) {
      router.replace('/dashboard');
      return;
    }
    // Only redirect if profile has loaded and is explicitly not vessel
    if (currentUserProfile && !isVesselManager) {
      router.replace('/dashboard');
      return;
    }
  }, [isUserLoading, isLoadingProfile, user, currentUserProfile, isVesselManager, router]);

  // Fetch crew for vessel manager's active vessel
  useEffect(() => {
    if (!supabase || !isVesselManager || !activeVesselId) {
      setIsLoading(false);
      setCrew([]);
      return;
    }

    let cancelled = false;

    const fetchCrew = async () => {
      setIsLoading(true);
      try {
        const assignments = await getActiveVesselAssignmentsByVessel(supabase, activeVesselId);
        if (cancelled) return;

        if (!assignments.length) {
          setCrew([]);
          return;
        }

        const userIds = assignments.map((a) => a.userId);
        const { data: profiles, error: profilesError } = await supabase
          .from('users')
          .select('*')
          .in('id', userIds);

        if (cancelled) return;
        if (profilesError) {
          console.error('[CREW ROLES] Error fetching profiles:', profilesError);
          setCrew([]);
          return;
        }

        const filtered = (profiles ?? []).filter((p: any) => p.role !== 'vessel');
        const profileMap = new Map(
          filtered.map((profile: any) => {
            const transformed: UserProfile = {
              id: profile.id,
              email: profile.email ?? '',
              username: profile.username ?? '',
              firstName: profile.first_name ?? profile.firstName,
              lastName: profile.last_name ?? profile.lastName,
              position: profile.position ?? null,
              profilePicture: profile.profile_picture ?? profile.profilePicture,
              bio: profile.bio,
              registrationDate: profile.registration_date ?? profile.registrationDate,
              role: profile.role ?? 'crew',
              subscriptionTier: profile.subscription_tier ?? profile.subscriptionTier ?? 'free',
              subscriptionStatus: profile.subscription_status ?? profile.subscriptionStatus ?? 'inactive',
              stripeCustomerId: profile.stripe_customer_id ?? profile.stripeCustomerId,
              stripeSubscriptionId: profile.stripe_subscription_id ?? profile.stripeSubscriptionId,
              activeVesselId: profile.active_vessel_id ?? profile.activeVesselId,
            };
            return [profile.id, transformed];
          })
        );

        const rows: CrewMemberRow[] = assignments
          .map((assignment) => {
            const profile = profileMap.get(assignment.userId);
            if (!profile) return null;
            return { profile, assignment };
          })
          .filter((item): item is CrewMemberRow => item !== null);

        setCrew(rows);
      } catch (err) {
        if (!cancelled) {
          console.error('[CREW ROLES] Error:', err);
          setCrew([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchCrew();
    return () => {
      cancelled = true;
    };
  }, [supabase, isVesselManager, activeVesselId]);

  const handleRoleChange = async (assignmentId: string, newRole: string | null) => {
    if (!supabase) return;
    const value = newRole && ASSIGNMENT_ROLES.some((r) => r.value === newRole) ? newRole : null;
    setSavingId(assignmentId);
    try {
      await updateVesselAssignment(supabase, assignmentId, {
        assignmentRole: value || 'crew',
      });
      setCrew((prev) =>
        prev.map((row) =>
          row.assignment.id === assignmentId
            ? { ...row, assignment: { ...row.assignment, assignmentRole: value ?? 'crew' } }
            : row
        )
      );
      toast({
        title: 'Role updated',
        description: 'Permission level for this crew member has been updated.',
      });
    } catch (err) {
      console.error('[CREW ROLES] Update failed:', err);
      toast({
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Could not update role.',
        variant: 'destructive',
      });
    } finally {
      setSavingId(null);
    }
  };

  /** Show position (job title) from assignment or profile. */
  function getPosition(row: CrewMemberRow): string {
    const p = row.assignment.position || row.profile.position || (row.profile as any).position;
    return (p && String(p).trim()) || '—';
  }

  if (isUserLoading || isLoadingProfile) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Profile failed to load or user is not a vessel manager
  if (!currentUserProfile) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <Alert variant="destructive">
          <AlertTitle>Could not load your profile</AlertTitle>
          <AlertDescription>
            This page is only available for vessel managers. If you are a vessel manager, try refreshing or go back to the dashboard.
          </AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.push('/dashboard')}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  if (!isVesselManager) {
    return null; // redirect in progress
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assign roles</h1>
        <p className="text-muted-foreground">
          Give crew members permission levels on this vessel: Crew, Officer, Captain, or Admin. Position is their job title (read-only). Only vessel managers can access this page.
        </p>
      </div>

      {!activeVesselId ? (
        <Alert>
          <Ship className="h-4 w-4" />
          <AlertTitle>No active vessel</AlertTitle>
          <AlertDescription>
            Select an active vessel in your account to assign roles to crew members.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Crew roles
            </CardTitle>
            <CardDescription>
              Set the permission level (role) for each crew member. Position is their job title and is shown for reference only. Changes are saved when you select a new role.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : crew.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                No crew members are currently assigned to this vessel. Add crew from the Crew page first.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead className="min-w-[160px]">Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crew.map(({ profile, assignment }) => (
                    <TableRow key={assignment.id}>
                      <TableCell className="font-medium">
                        {getDisplayName(profile)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{profile.email}</TableCell>
                      <TableCell className="text-muted-foreground">{getPosition({ profile, assignment })}</TableCell>
                      <TableCell>
                        <Select
                          value={(assignment.assignmentRole ?? 'crew').toLowerCase()}
                          onValueChange={(value) => handleRoleChange(assignment.id, value)}
                          disabled={savingId === assignment.id}
                        >
                          <SelectTrigger className="w-full min-w-[140px]">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            {ASSIGNMENT_ROLES.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {savingId === assignment.id && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
