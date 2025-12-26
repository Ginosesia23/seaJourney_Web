
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
import type { UserProfile, VesselAssignment, Vessel } from '@/lib/types';
import { getActiveVesselAssignmentsByVessel } from '@/supabase/database/queries';
import { useCollection } from '@/supabase/database';


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
    const [hasPendingCaptaincyRequest, setHasPendingCaptaincyRequest] = useState(false);
    const [isCheckingCaptaincy, setIsCheckingCaptaincy] = useState(false);

    // The user's own profile is needed to check their role and active vessel.
    const { data: currentUserProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
    
    // Fetch all vessels (needed to display vessel names for admins who see all crew)
    const { data: allVessels } = useCollection<Vessel>('vessels');
    
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

    // Check if captain has pending captaincy request
    useEffect(() => {
        const checkPendingCaptaincy = async () => {
            // Only check for captains with an active vessel
            if (currentUserProfile?.role !== 'captain' || !currentUserProfile?.activeVesselId || !user?.id) {
                setHasPendingCaptaincyRequest(false);
                setIsCheckingCaptaincy(false);
                return;
            }

            setIsCheckingCaptaincy(true);
            try {
                // Check if there's a pending captaincy request for this vessel
                const { data, error } = await supabase
                    .from('vessel_claim_requests')
                    .select('id, status')
                    .eq('requested_by', user.id)
                    .eq('vessel_id', currentUserProfile.activeVesselId)
                    .eq('status', 'pending')
                    .maybeSingle();

                if (error) {
                    console.error('[CREW PAGE] Error checking captaincy request:', error);
                    // On error, assume no pending request (fail open)
                    setHasPendingCaptaincyRequest(false);
                } else {
                    setHasPendingCaptaincyRequest(!!data);
                    console.log('[CREW PAGE] Captaincy request check:', { hasPending: !!data, data });
                }
            } catch (error) {
                console.error('[CREW PAGE] Exception checking captaincy request:', error);
                setHasPendingCaptaincyRequest(false);
            } finally {
                setIsCheckingCaptaincy(false);
            }
        };

        checkPendingCaptaincy();
    }, [currentUserProfile?.role, currentUserProfile?.activeVesselId, user?.id, supabase]);

    // Captains with pending requests cannot access crew page
    // Only admins, vessel managers, and captains with approved/no requests can access
    const isAuthorized = (currentUserProfile?.role === 'admin' || 
                         currentUserProfile?.role === 'vessel' || 
                         (currentUserProfile?.role === 'captain' && !hasPendingCaptaincyRequest));

    // Fetch all crew members with active vessel assignments (end_date IS NULL) for this vessel
    // Admins can see all crew from all vessels
    useEffect(() => {
        if (!isAuthorized || !user?.id) {
            console.log('[CREW PAGE] Missing requirements:', {
                isAuthorized,
                userId: user?.id,
                role: currentUserProfile?.role
            });
            setCrewMembers([]);
            return;
        }

        // For admins, we don't need activeVesselId - they see all crew
        // For vessel managers and captains, we need activeVesselId
        const isAdmin = currentUserProfile?.role === 'admin';
        if (!isAdmin && !currentUserProfile?.activeVesselId) {
            console.log('[CREW PAGE] Non-admin user missing activeVesselId:', {
                role: currentUserProfile?.role,
                activeVesselId: currentUserProfile?.activeVesselId
            });
            setCrewMembers([]);
            return;
        }

        const fetchCrew = async () => {
            setIsLoadingAssignments(true);
            try {
                if (isAdmin) {
                    // Admins: Get ALL users (except vessel accounts)
                    console.log('[CREW PAGE] Admin user - fetching all users from users table');
                    const { data: allProfiles, error: profilesError } = await supabase
                        .from('users')
                        .select('*')
                        .neq('role', 'vessel')
                        .order('created_at', { ascending: false });

                    if (profilesError) {
                        console.error('[CREW PAGE] Error fetching all users:', profilesError);
                        setCrewMembers([]);
                        setIsLoadingAssignments(false);
                        return;
                    }

                    console.log('[CREW PAGE] Fetched all users:', allProfiles?.length);

                    // Get all active assignments to match with users for position/vessel info
                    const { data: allAssignments } = await supabase
                        .from('vessel_assignments')
                        .select('*')
                        .is('end_date', null);

                    // Create a map of userId -> active assignment (most recent if multiple)
                    const assignmentMap = new Map<string, any>();
                    if (allAssignments) {
                        allAssignments.forEach(assignment => {
                            const existing = assignmentMap.get(assignment.user_id);
                            if (!existing || new Date(assignment.start_date) > new Date(existing.start_date)) {
                                assignmentMap.set(assignment.user_id, assignment);
                            }
                        });
                    }

                    // Transform profiles and match with assignments
                    const crewWithProfiles = (allProfiles || []).map(profile => {
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

                        // Get active assignment if exists
                        const activeAssignment = assignmentMap.get(profile.id);
                        const assignment: VesselAssignment = activeAssignment ? {
                            id: activeAssignment.id,
                            userId: activeAssignment.user_id,
                            vesselId: activeAssignment.vessel_id,
                            startDate: activeAssignment.start_date,
                            endDate: activeAssignment.end_date || null,
                            position: activeAssignment.position || null,
                        } : {
                            // Create a placeholder assignment if user has no active assignment
                            id: `placeholder-${profile.id}`,
                            userId: profile.id,
                            vesselId: profile.active_vessel_id || '',
                            startDate: profile.registration_date || new Date().toISOString().split('T')[0],
                            endDate: null,
                            position: profile.position || null,
                        };

                        return { profile: transformedProfile, assignment };
                    });

                    console.log('[CREW PAGE] Final crew members (all users):', crewWithProfiles.length);
                    setCrewMembers(crewWithProfiles);
                } else {
                    // Non-admins: Get active assignments for their vessel only
                    console.log('[CREW PAGE] Fetching crew for vessel:', currentUserProfile.activeVesselId);
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
                    const { data: profiles, error: profilesError } = await supabase
                        .from('users')
                        .select('*')
                        .in('id', userIds);
                    
                    // Filter out vessel accounts after fetching (RLS might interfere with .neq())
                    const filteredProfiles = profiles?.filter(p => p.role !== 'vessel') || [];
                    
                    console.log('[CREW PAGE] Fetched profiles:', filteredProfiles?.length, 'for user IDs:', userIds);
                    
                    if (profilesError) {
                        console.error('[CREW PAGE] Profiles query error:', profilesError);
                        setCrewMembers([]);
                        setIsLoadingAssignments(false);
                        return;
                    }
                    
                    if (!filteredProfiles || filteredProfiles.length === 0) {
                        console.warn('[CREW PAGE] No profiles returned for user IDs:', userIds);
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
                    
                    console.log('[CREW PAGE] Final crew members:', crewWithProfiles.length);
                    setCrewMembers(crewWithProfiles);
                }
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

    const isLoading = isLoadingProfile || isLoadingAssignments || isCheckingCaptaincy;
    
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
                        <p>
                            {currentUserProfile?.role === 'captain' && hasPendingCaptaincyRequest
                                ? "Your captaincy request is still pending approval. You will be able to view and manage crew once your request is approved."
                                : "Only users with the 'vessel', 'admin', or approved 'captain' role can access the crew management dashboard."}
                        </p>
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
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold tracking-tight">Crew Members</h1>
                            {crewMembers.length > 0 && (
                                <Badge variant="secondary" className="text-sm font-semibold">
                                    {crewMembers.length} {crewMembers.length === 1 ? 'member' : 'members'}
                                </Badge>
                            )}
                        </div>
                        <p className="text-muted-foreground">
                            {currentUserProfile?.role === 'admin'
                                ? "View and manage all crew members across all vessels."
                                : currentUserProfile?.activeVesselId 
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
                                {currentUserProfile?.role === 'admin' && <TableHead>Vessel</TableHead>}
                                <TableHead>Position</TableHead>
                                <TableHead>Role</TableHead>
                                {currentUserProfile?.role === 'admin' ? (
                                    <TableHead>Subscription Tier</TableHead>
                                ) : (
                                    <TableHead>Joined Vessel</TableHead>
                                )}
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={currentUserProfile?.role === 'admin' ? 7 : 6} className="h-24 text-center">
                                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                                    </TableCell>
                                </TableRow>
                            ) : !currentUserProfile?.activeVesselId && currentUserProfile?.role !== 'admin' ? (
                                <TableRow>
                                    <TableCell colSpan={currentUserProfile?.role === 'admin' ? 7 : 6} className="h-24 text-center text-muted-foreground">
                                        No active vessel found. Please select an active vessel to view crew members.
                                    </TableCell>
                                </TableRow>
                            ) : filteredCrewMembers && filteredCrewMembers.length > 0 ? (
                                filteredCrewMembers.map(({ profile, assignment }) => {
                                    const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
                                    const displayName = fullName || profile.username;
                                    
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
                                    
                                    // Get role badge styling (pill-shaped)
                                    const getRoleBadgeClassName = (role: string) => {
                                        switch (role) {
                                            case 'admin':
                                                return 'rounded-full bg-red-500/10 text-red-700 border-red-500/20 dark:bg-red-500/20 dark:text-red-400';
                                            case 'vessel':
                                                return 'rounded-full bg-blue-500/10 text-blue-700 border-blue-500/20 dark:bg-blue-500/20 dark:text-blue-400';
                                            case 'captain':
                                                return 'rounded-full bg-purple-500/10 text-purple-700 border-purple-500/20 dark:bg-purple-500/20 dark:text-purple-400';
                                            default:
                                                return 'rounded-full bg-gray-500/10 text-gray-700 border-gray-500/20 dark:bg-gray-500/20 dark:text-gray-400';
                                        }
                                    };

                                    // Get vessel name for admins
                                    const vesselName = currentUserProfile?.role === 'admin' && assignment.vesselId
                                        ? (allVessels?.find(v => v.id === assignment.vesselId)?.name || 'Unknown Vessel')
                                        : null;

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
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>{profile.email}</TableCell>
                                            {currentUserProfile?.role === 'admin' && (
                                                <TableCell>
                                                    <span className="font-medium">{vesselName}</span>
                                                </TableCell>
                                            )}
                                            <TableCell>
                                                {position ? (
                                                    <Badge variant="outline" className="rounded-full">{position}</Badge>
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
                                            {currentUserProfile?.role === 'admin' ? (
                                                <TableCell>
                                                    <Badge 
                                                        variant="secondary"
                                                        className={
                                                            profile.subscriptionStatus === 'active'
                                                                ? 'bg-green-500/10 text-green-700 border-green-500/20 dark:bg-green-500/20 dark:text-green-400'
                                                                : 'bg-gray-500/10 text-gray-700 border-gray-500/20 dark:bg-gray-500/20 dark:text-gray-400'
                                                        }
                                                    >
                                                        {profile.subscriptionTier && profile.subscriptionTier !== 'free'
                                                            ? profile.subscriptionTier.charAt(0).toUpperCase() + profile.subscriptionTier.slice(1).replace(/_/g, ' ')
                                                            : 'Free'}
                                                    </Badge>
                                                </TableCell>
                                            ) : (
                                                <TableCell>
                                                    {assignment.startDate 
                                                        ? format(new Date(assignment.startDate), 'dd MMM, yyyy')
                                                        : 'N/A'}
                                                </TableCell>
                                            )}
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
                                    <TableCell colSpan={currentUserProfile?.role === 'admin' ? 7 : 6} className="h-24 text-center">
                                        {currentUserProfile?.role === 'admin'
                                            ? 'No crew members found across all vessels.'
                                            : currentUserProfile?.activeVesselId 
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
