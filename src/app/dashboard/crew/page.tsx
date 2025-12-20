
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { MoreHorizontal, Loader2, Search, Users, User as UserIcon } from 'lucide-react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { UserProfile, VesselAssignment } from '@/lib/types';
import { getActiveVesselAssignmentsByVessel } from '@/supabase/database/queries';


const getInitials = (name: string) => name ? name.split(' ').map((n) => n[0]).join('') : '';

interface CrewMemberWithAssignment {
    profile: UserProfile;
    assignment: VesselAssignment;
}

export default function CrewPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const { user } = useUser();
    const { supabase } = useSupabase();
    
    const [crewMembers, setCrewMembers] = useState<CrewMemberWithAssignment[]>([]);
    const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);

    // The user's own profile is needed to check their role and active vessel.
    const { data: currentUserProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
    
    // Transform user profile to handle both snake_case (from DB) and camelCase (from types)
    const currentUserProfile = useMemo(() => {
        if (!currentUserProfileRaw) return null;
        
        const activeVesselId = (currentUserProfileRaw as any).active_vessel_id || (currentUserProfileRaw as any).activeVesselId;
        const role = (currentUserProfileRaw as any).role || currentUserProfileRaw.role || 'crew';
        
        console.log('[CREW PAGE] User profile transform:', {
            raw: currentUserProfileRaw,
            active_vessel_id: (currentUserProfileRaw as any).active_vessel_id,
            activeVesselId: (currentUserProfileRaw as any).activeVesselId,
            resolvedActiveVesselId: activeVesselId,
            role: role,
            allKeys: Object.keys(currentUserProfileRaw)
        });
        
        return {
            ...currentUserProfileRaw,
            activeVesselId: activeVesselId || undefined,
            role: role,
        } as UserProfile;
    }, [currentUserProfileRaw]);

    const isAuthorized = currentUserProfile?.role === 'admin' || currentUserProfile?.role === 'vessel' || currentUserProfile?.role === 'captain';

    // Fetch all crew members with active vessel assignments (end_date IS NULL) for this vessel
    useEffect(() => {
        if (!isAuthorized || !currentUserProfile?.activeVesselId || !user?.id) {
            console.log('[CREW PAGE] Missing requirements:', {
                isAuthorized,
                activeVesselId: currentUserProfile?.activeVesselId,
                userId: user?.id,
                role: currentUserProfile?.role
            });
            setCrewMembers([]);
            return;
        }

        const fetchCrew = async () => {
            setIsLoadingAssignments(true);
            try {
                console.log('[CREW PAGE] Fetching crew for vessel:', currentUserProfile.activeVesselId);
                
                // Get all active assignments for the vessel (where end_date IS NULL)
                const assignments = await getActiveVesselAssignmentsByVessel(supabase, currentUserProfile.activeVesselId);
                
                console.log('[CREW PAGE] Found assignments:', assignments.length, assignments);
                
                if (assignments.length === 0) {
                    console.log('[CREW PAGE] No active assignments found for vessel:', currentUserProfile.activeVesselId);
                    setCrewMembers([]);
                    setIsLoadingAssignments(false);
                    return;
                }
                
                // Get all user IDs from assignments
                const userIds = assignments.map(a => a.userId);
                console.log('[CREW PAGE] User IDs from assignments:', userIds);
                
                // Batch fetch all user profiles at once
                console.log('[CREW PAGE] Querying users table for IDs:', userIds);
                console.log('[CREW PAGE] Current user ID (auth.uid()):', user?.id);
                console.log('[CREW PAGE] Current user role:', currentUserProfile?.role);
                console.log('[CREW PAGE] Current user activeVesselId:', currentUserProfile?.activeVesselId);
                console.log('[CREW PAGE] Assignments found:', assignments.map(a => ({ userId: a.userId, vesselId: a.vesselId, endDate: a.endDate })));
                
                // First, try querying without the role filter to see if RLS is the issue
                const { data: profiles, error: profilesError } = await supabase
                    .from('users')
                    .select('*')
                    .in('id', userIds);
                
                console.log('[CREW PAGE] Profiles before role filter:', profiles?.length, profiles);
                
                // Filter out vessel accounts after fetching (RLS might interfere with .neq())
                const filteredProfiles = profiles?.filter(p => p.role !== 'vessel') || [];
                
                console.log('[CREW PAGE] Fetched profiles:', profiles?.length, 'for user IDs:', userIds);
                console.log('[CREW PAGE] Profiles query error:', profilesError);
                console.log('[CREW PAGE] Error code:', profilesError?.code);
                console.log('[CREW PAGE] Error message:', profilesError?.message);
                console.log('[CREW PAGE] Error details:', profilesError?.details);
                console.log('[CREW PAGE] Error hint:', profilesError?.hint);
                
                if (profilesError) {
                    console.error('[CREW PAGE] Profiles query error:', profilesError);
                    console.error('[CREW PAGE] Error details:', JSON.stringify(profilesError, null, 2));
                    // Don't return immediately - check if it's an RLS policy issue
                    if (profilesError.code === 'PGRST301' || profilesError.message?.includes('permission denied') || profilesError.message?.includes('policy')) {
                        console.error('[CREW PAGE] RLS POLICY ISSUE: Vessel manager may not have permission to view user profiles. Check RLS policies on users table.');
                    }
                    setCrewMembers([]);
                    setIsLoadingAssignments(false);
                    return;
                }
                
                if (!filteredProfiles || filteredProfiles.length === 0) {
                    console.warn('[CREW PAGE] No profiles returned for user IDs:', userIds);
                    console.warn('[CREW PAGE] Profiles before filter:', profiles?.length);
                    console.warn('[CREW PAGE] This is likely an RLS policy issue. The vessel manager needs permission to view profiles of users with active assignments on their vessel.');
                    console.warn('[CREW PAGE] Please ensure the RLS policy "Vessel managers can view crew profiles" is correctly configured.');
                    console.warn('[CREW PAGE] Try running the test query in test-vessel-manager-rls.sql to debug the RLS policy.');
                    setCrewMembers([]);
                    setIsLoadingAssignments(false);
                    return;
                }
                
                // Create a map of userId -> profile for quick lookup
                const profileMap = new Map(
                    filteredProfiles.map(profile => {
                        const transformedProfile: UserProfile = {
                            id: profile.id,
                            email: profile.email || '',
                            username: profile.username || '',
                            firstName: profile.first_name || profile.firstName,
                            lastName: profile.last_name || profile.lastName,
                            position: profile.position || null,
                            profilePicture: profile.profile_picture || profile.profilePicture,
                            bio: profile.bio,
                            registrationDate: profile.registration_date || profile.registrationDate,
                            role: profile.role || 'crew',
                            subscriptionTier: profile.subscription_tier || profile.subscriptionTier || 'free',
                            subscriptionStatus: profile.subscription_status || profile.subscriptionStatus || 'inactive',
                            stripeCustomerId: profile.stripe_customer_id || profile.stripeCustomerId,
                            stripeSubscriptionId: profile.stripe_subscription_id || profile.stripeSubscriptionId,
                            activeVesselId: profile.active_vessel_id || profile.activeVesselId,
                        };
                        return [profile.id, transformedProfile];
                    })
                );
                
                // Combine assignments with profiles
                const crewWithProfiles: CrewMemberWithAssignment[] = assignments
                    .map(assignment => {
                        const profile = profileMap.get(assignment.userId);
                        if (!profile) {
                            console.warn(`[CREW PAGE] No profile found for userId: ${assignment.userId}`);
                            return null;
                        }
                        return { profile, assignment };
                    })
                    .filter((item): item is CrewMemberWithAssignment => item !== null);
                
                console.log('[CREW PAGE] Final crew members:', crewWithProfiles.length, crewWithProfiles);
                setCrewMembers(crewWithProfiles);
            } catch (error) {
                console.error('[CREW PAGE] Error fetching crew:', error);
                setCrewMembers([]);
            } finally {
                setIsLoadingAssignments(false);
            }
        };

        fetchCrew();
    }, [supabase, currentUserProfile?.activeVesselId, isAuthorized, user?.id, currentUserProfile?.role]);
    
    // Filter crew members by search term
    const filteredCrewMembers = useMemo(() => {
        console.log('[CREW PAGE] Filtering crew members:', {
            crewMembersCount: crewMembers.length,
            searchTerm: searchTerm,
            crewMembers: crewMembers
        });
        
        if (!searchTerm) {
            console.log('[CREW PAGE] No search term, returning all crew members:', crewMembers.length);
            return crewMembers;
        }

        const filtered = crewMembers.filter(({ profile }) => {
            const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.toLowerCase();
            const username = profile.username.toLowerCase();
            const email = profile.email.toLowerCase();
            const lowercasedTerm = searchTerm.toLowerCase();

            return fullName.includes(lowercasedTerm) || 
                   username.includes(lowercasedTerm) || 
                   email.includes(lowercasedTerm);
        });
        
        console.log('[CREW PAGE] Filtered crew members:', filtered.length, filtered);
        return filtered;
    }, [crewMembers, searchTerm]);

    const isLoading = isLoadingProfile || isLoadingAssignments;
    
    console.log('[CREW PAGE] Render state:', {
        isLoading,
        isLoadingProfile,
        isLoadingAssignments,
        crewMembersCount: crewMembers.length,
        filteredCrewMembersCount: filteredCrewMembers.length,
        hasActiveVessel: !!currentUserProfile?.activeVesselId,
        activeVesselId: currentUserProfile?.activeVesselId,
        isAuthorized
    });

    if (!isLoading && !isAuthorized) {
        return (
            <div className="w-full max-w-7xl mx-auto text-center py-10">
                <Card className="max-w-md mx-auto rounded-xl">
                    <CardHeader>
                        <CardTitle>Access Denied</CardTitle>
                        <CardDescription>You do not have permission to view this page.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p>Only users with the 'vessel' or 'admin' role can access the crew management dashboard.</p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Header Section */}
            <div className="space-y-2">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="space-y-1">
                        <h1 className="text-3xl font-bold tracking-tight">Crew Members</h1>
                        <p className="text-muted-foreground">
                            {currentUserProfile?.activeVesselId 
                                ? "View and manage crew members with active assignments on your vessel." 
                                : "No active vessel found. Please select an active vessel to view crew members."}
                        </p>
                    </div>
                    <div className="relative w-full sm:max-w-xs">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by name, username, or email..."
                            className="pl-8 rounded-xl"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <Separator />
            </div>

            <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>User</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Position</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Subscription</TableHead>
                                <TableHead>Joined</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center">
                                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                                    </TableCell>
                                </TableRow>
                            ) : !currentUserProfile?.activeVesselId ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                        No active vessel found. Please select an active vessel to view crew members.
                                    </TableCell>
                                </TableRow>
                            ) : filteredCrewMembers && filteredCrewMembers.length > 0 ? (
                                filteredCrewMembers.map(({ profile, assignment }) => {
                                    const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
                                    const displayName = fullName || profile.username;
                                    const regDate = profile.registrationDate ? new Date(profile.registrationDate) : null;
                                    
                                    // Get position from assignment (vessel-specific) first, fallback to profile
                                    const position = assignment.position || profile.position || null;
                                    
                                    // Get role label
                                    const getRoleLabel = (role: string) => {
                                        switch (role) {
                                            case 'admin':
                                                return 'Admin';
                                            case 'captain':
                                                return 'Captain';
                                            case 'vessel':
                                                return 'Vessel Manager';
                                            default:
                                                return 'Crew Member';
                                        }
                                    };
                                    
                                    // Get role badge styling
                                    const getRoleBadgeClassName = (role: string) => {
                                        switch (role) {
                                            case 'admin':
                                                return 'bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/20 dark:text-red-400';
                                            case 'vessel':
                                                return 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400';
                                            case 'captain':
                                                return 'bg-purple-500/10 text-purple-700 border-purple-500/20 dark:bg-purple-500/20 dark:text-purple-400';
                                            default:
                                                return 'bg-gray-500/10 text-gray-700 border-gray-500/20 dark:bg-gray-500/20 dark:text-gray-400';
                                        }
                                    };

                                    return (
                                        <TableRow key={profile.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="h-9 w-9">
                                                        <AvatarImage src={profile.profilePicture} alt={displayName} />
                                                        <AvatarFallback className="bg-primary/20">
                                                            {getInitials(displayName) || <UserIcon />}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <div className="font-medium">{displayName}</div>
                                                        <div className="text-sm text-muted-foreground">@{profile.username}</div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>{profile.email}</TableCell>
                                            <TableCell>
                                                {position ? (
                                                    <Badge variant="outline">{position}</Badge>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge 
                                                    variant="outline" 
                                                    className={getRoleBadgeClassName(profile.role)}
                                                >
                                                    {getRoleLabel(profile.role)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={profile.subscriptionTier === 'free' ? 'outline' : 'secondary'}>
                                                    {profile.subscriptionTier}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {regDate && !isNaN(regDate.getTime()) ? format(regDate, 'dd MMM, yyyy') : 'N/A'}
                                            </TableCell>
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-8 w-8 p-0 rounded-full">
                                                            <span className="sr-only">Open menu</span>
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                        <DropdownMenuItem>View Profile</DropdownMenuItem>
                                                        <DropdownMenuItem>Assign to Vessel</DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem className="text-destructive">Remove User</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center">
                                        {currentUserProfile?.activeVesselId 
                                            ? `No crew members found with active assignments on this vessel. (Total assignments: ${crewMembers.length}, Filtered: ${filteredCrewMembers.length})`
                                            : "No users found."}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
