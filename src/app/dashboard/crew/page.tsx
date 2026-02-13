
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { MoreHorizontal, Loader2, Search, Users, User as UserIcon, Ship, Anchor, ChevronDown, ChevronUp, Clock, Calendar, UserCheck, UserPlus, GripVertical, Bug, CalendarDays, X, FileText, Download, CalendarIcon, CheckCircle2, Plus, ExternalLink, ChevronRight, Trash2, AlertCircle, ArrowUpCircle, Send } from 'lucide-react';
import { format, parse, eachDayOfInterval, format as formatDate, addDays } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragStartEvent,
    DragOverlay,
    useDraggable,
    useDroppable,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import Link from 'next/link';
import type { UserProfile, VesselAssignment, Vessel, VesselSeaTimeAccessRequest, CrewLeavePeriod, Testimonial, VesselGeneratedTestimonial, StateLog } from '@/lib/types';
import { getActiveVesselAssignmentsByVessel, getVesselStateLogs } from '@/supabase/database/queries';
import { useCollection } from '@/supabase/database';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { generateTestimonialPDF, generateMCADeckhandTestimonial, generateMCAOfficerTestimonial, generateMCAWatchRatingForm, type TestimonialPDFFormat, type MCACertificateType } from '@/lib/pdf-generator';
import { calculateStandbyDays } from '@/lib/standby-calculation';


const getInitials = (name: string) => name ? name.split(' ').map((n) => n[0]).join('') : '';

const inviteCrewSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email address'),
});

type InviteCrewFormValues = z.infer<typeof inviteCrewSchema>;

interface CrewMemberWithAssignment {
    profile: UserProfile;
    assignment: VesselAssignment;
    accessRequest?: VesselSeaTimeAccessRequest | null;
    seaTimeData?: {
        totalDays: number;
        atSeaDays: number;
        standbyDays: number;
        underwayDays: number;
        atAnchorDays: number;
        inPortDays: number;
        onLeaveDays: number;
        inYardDays: number;
    };
    leavePeriods?: CrewLeavePeriod[];
    leavePeriodsFromLogs?: Array<{ startDate: string; endDate: string; notes?: string }>;
    testimonials?: Testimonial[];
    vesselGeneratedTestimonials?: VesselGeneratedTestimonial[];
    hasApprovedAccess?: boolean;
}

// Sortable Row Component
interface SortableRowProps {
    member: CrewMemberWithAssignment;
    index: number;
    currentUserProfile: UserProfile | null;
    allVessels: Vessel[] | undefined;
    expandedRows: Set<string>;
    updatingOnboardStatus: string | null;
    requestingAccess: string | null;
    loadingSeaTime: Set<string>;
    hasProTier: boolean;
    onToggleOnboard: (assignmentId: string, currentStatus: boolean, userId: string) => void;
    onToggleRowExpansion: (member: CrewMemberWithAssignment) => void;
    onRequestAccess: (userId: string) => void;
    onOpenLeavePeriodsDialog: (member: CrewMemberWithAssignment) => void;
}

function SortableRow({
    member,
    index,
    currentUserProfile,
    allVessels,
    expandedRows,
    updatingOnboardStatus,
    requestingAccess,
    loadingSeaTime,
    hasProTier,
    onToggleOnboard,
    onToggleRowExpansion,
    onRequestAccess,
    onOpenLeavePeriodsDialog,
}: SortableRowProps) {
    const { profile, assignment } = member;
    const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
    const displayName = fullName || profile.username;
    
    // Check if user has a paid subscription (not free tier) - required for requesting sea time access
    const hasPaidTier = useMemo(() => {
        if (!currentUserProfile) return false;
        const tier = (currentUserProfile.subscriptionTier || '').toLowerCase();
        const status = (currentUserProfile.subscriptionStatus || '').toLowerCase();
        return tier !== 'free' && status === 'active';
    }, [currentUserProfile?.subscriptionTier, currentUserProfile?.subscriptionStatus]);
    
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: profile.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const position = assignment.position || profile.position || null;
    
    const getRoleLabel = (role: string) => {
        switch (role) {
            case 'admin':
                return 'Admin';
            case 'captain':
                return 'Captain';
            case 'vessel':
                return 'Vessel Manager';
            default:
                return 'Crew';
        }
    };
    
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

    // For admin view, show vessel name if assignment has a vesselId
    const vesselName = currentUserProfile?.role === 'admin' && assignment.vesselId && !assignment.id.startsWith('placeholder-')
        ? (allVessels?.find(v => v.id === assignment.vesselId)?.name || `Vessel ID: ${assignment.vesselId.slice(0, 8)}...`)
        : currentUserProfile?.role === 'admin' && assignment.id.startsWith('placeholder-') && !assignment.vesselId
        ? 'Not assigned'
        : null;

    const isVesselManager = currentUserProfile?.role === 'vessel';
    const handleRowClick = () => {
        // Only allow clicking to open crew member details if vessel has Pro tier
        if (isVesselManager && hasProTier && !isDragging) {
            onOpenLeavePeriodsDialog(member);
        }
    };

    return (
        <TableRow
            ref={setNodeRef}
            style={style}
            className={cn(
                isDragging ? 'bg-muted/50' : '',
                isVesselManager && hasProTier ? 'cursor-pointer hover:bg-muted/30 transition-colors' : '',
                isVesselManager && !hasProTier ? 'cursor-default' : ''
            )}
            onClick={handleRowClick}
        >
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
            {currentUserProfile?.role === 'vessel' && (
                <TableCell>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Switch
                            checked={assignment.onboard || false}
                            onCheckedChange={() => {
                                if (assignment.id && !assignment.id.startsWith('placeholder-')) {
                                    onToggleOnboard(assignment.id, assignment.onboard || false, assignment.userId);
                                }
                            }}
                            disabled={updatingOnboardStatus === assignment.id || assignment.id.startsWith('placeholder-')}
                        />
                        <span className="text-xs text-muted-foreground">
                            {assignment.onboard ? (
                                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                    <Ship className="h-3 w-3" /> Onboard
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 text-muted-foreground">
                                    <Anchor className="h-3 w-3" /> Offboard
                                </span>
                            )}
                        </span>
                    </div>
                </TableCell>
            )}
            <TableCell>
                {currentUserProfile?.role === 'vessel' ? (
                    <div className="flex items-center gap-2">
                        {member.accessRequest?.status === 'approved' ? (
                            <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-700 border-green-500/20">
                                Approved
                            </Badge>
                        ) : member.accessRequest?.status === 'pending' ? (
                            <Badge variant="secondary" className="text-xs">
                                Request Pending
                            </Badge>
                        ) : member.accessRequest?.status === 'rejected' ? (
                            <Badge variant="destructive" className="text-xs">
                                Request Rejected
                            </Badge>
                        ) : hasPaidTier ? (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onRequestAccess(profile.id);
                                }}
                                disabled={requestingAccess === profile.id}
                                className="h-8"
                            >
                                {requestingAccess === profile.id ? (
                                    <>
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        Requesting...
                                    </>
                                ) : (
                                    'Request Sea Time Access'
                                )}
                            </Button>
                        ) : null}
                    </div>
                ) : (
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
                )}
            </TableCell>
            {currentUserProfile?.role === 'vessel' && hasProTier && (
                <TableCell className="w-[50px]">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            onOpenLeavePeriodsDialog(member);
                        }}
                        className="h-8 w-8 p-0"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </TableCell>
            )}
            {currentUserProfile?.role === 'vessel' && !hasProTier && (
                <TableCell className="w-[50px]"></TableCell>
            )}
        </TableRow>
    );
}

export default function CrewPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const { user } = useUser();
    const { supabase, session } = useSupabase();
    
    const [crewMembers, setCrewMembers] = useState<CrewMemberWithAssignment[]>([]);
    const [orderedCrewMembers, setOrderedCrewMembers] = useState<CrewMemberWithAssignment[]>([]);
    const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
    const [hasPendingCaptaincyRequest, setHasPendingCaptaincyRequest] = useState(false);
    const [isCheckingCaptaincy, setIsCheckingCaptaincy] = useState(false);
    const [updatingOnboardStatus, setUpdatingOnboardStatus] = useState<string | null>(null);
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [requestingAccess, setRequestingAccess] = useState<string | null>(null);
    const [loadingSeaTime, setLoadingSeaTime] = useState<Set<string>>(new Set());
    const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
    const [isInviting, setIsInviting] = useState(false);
    const [debugMode, setDebugMode] = useState(false);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [dragCoordinates, setDragCoordinates] = useState<{ x: number; y: number; index: number } | null>(null);
    const [selectedCrewMemberId, setSelectedCrewMemberId] = useState<string | null>(null);
    const [isLeavePeriodDialogOpen, setIsLeavePeriodDialogOpen] = useState(false);
    const [leavePeriodStartDate, setLeavePeriodStartDate] = useState<Date | undefined>(undefined);
    const [leavePeriodEndDate, setLeavePeriodEndDate] = useState<Date | undefined>(undefined);
    const [leavePeriodNotes, setLeavePeriodNotes] = useState('');
    const [isSavingLeavePeriod, setIsSavingLeavePeriod] = useState(false);
    const [isDeletingLeavePeriod, setIsDeletingLeavePeriod] = useState<string | null>(null);
    const [isLoadingTestimonials, setIsLoadingTestimonials] = useState(false);
    const [generatingPDF, setGeneratingPDF] = useState<string | null>(null);
    const [showGenerateForm, setShowGenerateForm] = useState(false);
    const [deletingTestimonial, setDeletingTestimonial] = useState<string | null>(null);
    const [sendToCaptainDocId, setSendToCaptainDocId] = useState<string | null>(null);
    const [sendToCaptainEmail, setSendToCaptainEmail] = useState('');
    const [isSendingToCaptainDoc, setIsSendingToCaptainDoc] = useState(false);
    const [sendToCaptainDialogOpen, setSendToCaptainDialogOpen] = useState(false);
    const [documentStartDate, setDocumentStartDate] = useState<Date | undefined>(undefined);
    const [documentEndDate, setDocumentEndDate] = useState<Date | undefined>(undefined);
    const [isCalculatingSeaTime, setIsCalculatingSeaTime] = useState(false);
    const [calculatedSeaTime, setCalculatedSeaTime] = useState<{
        totalDays: number;
        atSeaDays: number;
        standbyDays: number;
        yardDays: number;
        leaveDays: number;
        isOfficer: boolean;
    } | null>(null);
    const [isSendingToCaptain, setIsSendingToCaptain] = useState(false);
    const [isSavingTestimonial, setIsSavingTestimonial] = useState(false);
    const [activeCaptain, setActiveCaptain] = useState<{ id: string; name: string } | null>(null);
    const [selectedDataSource, setSelectedDataSource] = useState<'crew' | 'vessel' | null>(null);

    // The user's own profile is needed to check their role and active vessel.
    const { data: currentUserProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
    
    // Fetch all vessels (needed to display vessel names for admins who see all crew)
    const { data: allVesselsFromCollection } = useCollection<Vessel>('vessels');
    
    // For admins, we'll fetch vessels directly to ensure we have access to all data
    const [allVesselsForAdmin, setAllVesselsForAdmin] = useState<Vessel[] | undefined>(undefined);
    
    // Transform user profile to handle both snake_case (from DB) and camelCase (from types)
    const currentUserProfile = useMemo(() => {
        if (!currentUserProfileRaw) return null;
        
        const activeVesselId = (currentUserProfileRaw as any).active_vessel_id || (currentUserProfileRaw as any).activeVesselId;
        const role = (currentUserProfileRaw as any).role || currentUserProfileRaw.role || 'crew';
        const subscriptionTier = (currentUserProfileRaw as any).subscription_tier || (currentUserProfileRaw as any).subscriptionTier || 'free';
        const subscriptionStatus = (currentUserProfileRaw as any).subscription_status || (currentUserProfileRaw as any).subscriptionStatus || 'inactive';
        
        console.log('[CREW PAGE] User profile transform:', {
            raw: currentUserProfileRaw,
            active_vessel_id: (currentUserProfileRaw as any).active_vessel_id,
            activeVesselId: (currentUserProfileRaw as any).activeVesselId,
            resolvedActiveVesselId: activeVesselId,
            role: role,
            subscriptionTier: subscriptionTier,
            subscriptionStatus: subscriptionStatus,
            allKeys: Object.keys(currentUserProfileRaw)
        });
        
        return {
            ...currentUserProfileRaw,
            activeVesselId: activeVesselId || undefined,
            role: role,
            subscriptionTier: subscriptionTier,
            subscriptionStatus: subscriptionStatus,
        } as UserProfile;
    }, [currentUserProfileRaw]);

    // Use admin-fetched vessels if admin, otherwise use collection
    const allVessels = currentUserProfile?.role === 'admin' ? allVesselsForAdmin : allVesselsFromCollection;

    // Get crew limit based on vessel subscription tier
    const getCrewLimit = (tier: string | undefined, status: string | undefined): number => {
        if (!tier || (status || '').toLowerCase() !== 'active') {
            return 0; // No active subscription = no access
        }
        
        const tierLower = tier.toLowerCase();
        switch (tierLower) {
            case 'vessel_lite':
                return 15;
            case 'vessel_basic':
                return 30;
            case 'vessel_pro':
            case 'vessel_fleet':
                return Infinity; // Unlimited
            default:
                return 0; // Unknown tier = no access
        }
    };

    const crewLimit = useMemo(() => {
        // Only apply limits to vessel managers (not admins)
        if (currentUserProfile?.role !== 'vessel') {
            return Infinity; // Admins and captains see all
        }
        return getCrewLimit(currentUserProfile.subscriptionTier, currentUserProfile.subscriptionStatus);
    }, [currentUserProfile?.role, currentUserProfile?.subscriptionTier, currentUserProfile?.subscriptionStatus]);

    // Check if vessel has Pro tier subscription (required for document generation and crew member details)
    const hasProTier = useMemo(() => {
        if (currentUserProfile?.role !== 'vessel') {
            return true; // Admins always have access
        }
        const tier = (currentUserProfile.subscriptionTier || '').toLowerCase();
        const status = (currentUserProfile.subscriptionStatus || '').toLowerCase();
        return (tier === 'vessel_pro' || tier === 'vessel_fleet') && status === 'active';
    }, [currentUserProfile?.role, currentUserProfile?.subscriptionTier, currentUserProfile?.subscriptionStatus]);

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
                    // Admins: Start with vessel_assignments table, then fetch user info
                    console.log('[CREW PAGE] Admin user - fetching assignments first');
                    
                    // Step 1: Fetch ALL assignments (not just active) to get all users with assignments
                    const { data: allAssignments, error: assignmentsError } = await supabase
                        .from('vessel_assignments')
                        .select('*')
                        .order('start_date', { ascending: false });

                    if (assignmentsError) {
                        console.error('[CREW PAGE] Error fetching assignments for admin:', {
                            error: assignmentsError,
                            message: assignmentsError.message,
                            code: assignmentsError.code,
                            details: assignmentsError.details,
                            hint: assignmentsError.hint
                        });
                        setCrewMembers([]);
                        setIsLoadingAssignments(false);
                        return;
                    }

                    console.log('[CREW PAGE] Fetched assignments:', allAssignments?.length);
                    if (allAssignments && allAssignments.length > 0) {
                        console.log('[CREW PAGE] Sample assignments:', allAssignments.slice(0, 3));
                    }

                    if (!allAssignments || allAssignments.length === 0) {
                        console.log('[CREW PAGE] No assignments found - this might be an RLS issue or there are no assignments in the database');
                        setCrewMembers([]);
                        setIsLoadingAssignments(false);
                        return;
                    }

                    // Step 2: Get unique user IDs from assignments
                    const userIds = [...new Set(allAssignments.map(a => a.user_id))];
                    console.log('[CREW PAGE] Unique user IDs from assignments:', userIds.length, userIds);

                    if (userIds.length === 0) {
                        console.log('[CREW PAGE] No user IDs found in assignments');
                        setCrewMembers([]);
                        setIsLoadingAssignments(false);
                        return;
                    }

                    // Step 3: Fetch user profiles for those user IDs (excluding vessel accounts)
                    // Note: RLS policy should allow admins to view all users
                    const { data: userProfiles, error: profilesError } = await supabase
                        .from('users')
                        .select('*')
                        .in('id', userIds)
                        .neq('role', 'vessel');

                    console.log('[CREW PAGE] User IDs requested:', userIds.length);
                    console.log('[CREW PAGE] User profiles fetched:', userProfiles?.length);

                    if (profilesError) {
                        console.error('[CREW PAGE] Error fetching user profiles:', {
                            error: profilesError,
                            message: profilesError.message,
                            code: profilesError.code,
                            details: profilesError.details,
                            hint: profilesError.hint
                        });
                        setCrewMembers([]);
                        setIsLoadingAssignments(false);
                        return;
                    }

                    if (!userProfiles || userProfiles.length === 0) {
                        console.warn('[CREW PAGE] No user profiles returned, but we had', userIds.length, 'user IDs');
                        console.warn('[CREW PAGE] This might be an RLS policy issue. User IDs were:', userIds);
                        setCrewMembers([]);
                        setIsLoadingAssignments(false);
                        return;
                    }

                    console.log('[CREW PAGE] Fetched user profiles:', userProfiles.length);

                    // Step 4: Fetch all vessels for admin to display vessel names
                    const { data: allVesselsData, error: vesselsError } = await supabase
                        .from('vessels')
                        .select('*')
                        .order('name', { ascending: true });

                    if (vesselsError) {
                        console.error('[CREW PAGE] Error fetching vessels for admin:', {
                            error: vesselsError,
                            message: vesselsError.message,
                            code: vesselsError.code,
                            details: vesselsError.details,
                            hint: vesselsError.hint
                        });
                        setAllVesselsForAdmin([]);
                    } else {
                        console.log('[CREW PAGE] Fetched vessels for admin:', allVesselsData?.length);
                        // Transform vessels to match Vessel type
                        const transformedVessels: Vessel[] = (allVesselsData || []).map((v: any) => ({
                            id: v.id,
                            name: v.name,
                            type: v.type,
                            officialNumber: v.imo || v.official_number,
                        }));
                        setAllVesselsForAdmin(transformedVessels);
                    }

                    // Step 5: Create a map of userId -> most recent assignment (prefer active, but show latest if no active)
                    const assignmentMap = new Map<string, any>();
                    allAssignments.forEach(assignment => {
                        const existing = assignmentMap.get(assignment.user_id);
                        if (!existing) {
                            // No assignment yet, use this one
                            assignmentMap.set(assignment.user_id, assignment);
                        } else {
                            // Prefer active assignments, otherwise use most recent
                            const existingIsActive = !existing.end_date;
                            const currentIsActive = !assignment.end_date;
                            
                            if (currentIsActive && !existingIsActive) {
                                // Current is active, existing is not - prefer current
                                assignmentMap.set(assignment.user_id, assignment);
                            } else if (!currentIsActive && existingIsActive) {
                                // Existing is active, current is not - keep existing
                                // Do nothing
                            } else {
                                // Both same status - use most recent by start_date
                                if (new Date(assignment.start_date) > new Date(existing.start_date)) {
                                    assignmentMap.set(assignment.user_id, assignment);
                                }
                            }
                        }
                    });

                    // Step 6: Match assignments with user profiles
                    const crewWithProfiles = (userProfiles || []).map(profile => {
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

                        // Get most recent assignment (should always exist since we filtered by assignments)
                        const mostRecentAssignment = assignmentMap.get(profile.id);
                        const assignment: VesselAssignment = mostRecentAssignment ? {
                            id: mostRecentAssignment.id,
                            userId: mostRecentAssignment.user_id,
                            vesselId: mostRecentAssignment.vessel_id,
                            startDate: mostRecentAssignment.start_date,
                            endDate: mostRecentAssignment.end_date || null,
                            position: mostRecentAssignment.position || null,
                            onboard: mostRecentAssignment.onboard || false,
                        } : {
                            // Fallback (shouldn't happen, but handle gracefully)
                            id: `fallback-${profile.id}`,
                            userId: profile.id,
                            vesselId: profile.active_vessel_id || '',
                            startDate: profile.registration_date || new Date().toISOString().split('T')[0],
                            endDate: null,
                            position: profile.position || null,
                        };

                        return { profile: transformedProfile, assignment };
                    });

                    console.log('[CREW PAGE] Final crew members (from assignments):', crewWithProfiles.length);
                    if (crewWithProfiles.length > 0) {
                        console.log('[CREW PAGE] Sample crew member:', crewWithProfiles[0]);
                    } else {
                        console.warn('[CREW PAGE] No crew members created despite having', userProfiles.length, 'user profiles and', allAssignments.length, 'assignments');
                    }
                    setCrewMembers(crewWithProfiles);
                } else {
                    // Non-admins: Get active assignments for their vessel only
                    if (!currentUserProfile.activeVesselId) {
                        console.log('[CREW PAGE] No active vessel ID for non-admin user');
                        setCrewMembers([]);
                        setIsLoadingAssignments(false);
                        return;
                    }
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

    // Fetch access requests for crew members (vessel managers only)
    useEffect(() => {
        if (currentUserProfile?.role !== 'vessel' || !user?.id) {
            return;
        }
        
        // Don't wait for crewMembers.length > 0, fetch immediately when crew members are loaded
        if (crewMembers.length === 0) {
            return;
        }

        const fetchAccessRequests = async () => {
            try {
                // Use current crewMembers from state, not closure
                const currentCrewMembers = crewMembers.length > 0 ? crewMembers : [];
                const crewUserIds = currentCrewMembers.map(m => m.profile.id);
                if (crewUserIds.length === 0) {
                    console.log('[CREW PAGE] No crew user IDs to fetch requests for');
                    return;
                }
                
                console.log('[CREW PAGE] Fetching access requests for crew user IDs:', crewUserIds);

                // Fetch ALL requests (pending, approved, rejected) so vessel managers can see approved status
                const { data: requests, error } = await supabase
                    .from('vessel_sea_time_access_requests')
                    .select('*')
                    .eq('vessel_user_id', user.id)
                    .in('crew_user_id', crewUserIds);

                if (error) {
                    console.error('[CREW PAGE] Error fetching access requests:', error);
                    return;
                }

                console.log('[CREW PAGE] Fetched access requests:', requests);

                // Map requests to crew members
                const requestMap = new Map<string, VesselSeaTimeAccessRequest>();
                requests?.forEach(req => {
                    requestMap.set(req.crew_user_id, {
                        id: req.id,
                        vesselUserId: req.vessel_user_id,
                        crewUserId: req.crew_user_id,
                        vesselId: req.vessel_id,
                        vesselName: req.vessel_name,
                        status: req.status,
                        notes: req.notes,
                        rejectionReason: req.rejection_reason,
                        createdAt: req.created_at,
                        updatedAt: req.updated_at,
                    });
                });

                setCrewMembers(prev => {
                    const updated = prev.map(member => {
                        const existingRequest = requestMap.get(member.profile.id);
                        // Always update to reflect current status
                        const updatedMember = {
                            ...member,
                            accessRequest: existingRequest || null,
                        };
                        
                        // Debug logging
                        if (existingRequest) {
                            console.log(`[CREW PAGE] Updated access request for ${member.profile.id}:`, {
                                status: existingRequest.status,
                                id: existingRequest.id,
                                crewUserId: existingRequest.crewUserId,
                                vesselUserId: existingRequest.vesselUserId,
                                previousStatus: member.accessRequest?.status,
                            });
                        } else if (member.accessRequest) {
                            console.log(`[CREW PAGE] Removed access request for ${member.profile.id} (no longer exists)`);
                        }
                        
                        return updatedMember;
                    });
                    
                    console.log('[CREW PAGE] Updated crew members with access requests:', updated.map(m => ({
                        id: m.profile.id,
                        name: `${m.profile.firstName} ${m.profile.lastName}`,
                        hasAccessRequest: !!m.accessRequest,
                        status: m.accessRequest?.status,
                    })));
                    
                    return updated;
                });
            } catch (error) {
                console.error('[CREW PAGE] Exception fetching access requests:', error);
            }
        };

        fetchAccessRequests();

        // Set up realtime subscription to listen for changes
        const channelName = `vessel-sea-time-access-requests-${user.id}`;
        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'vessel_sea_time_access_requests',
                    filter: `vessel_user_id=eq.${user.id}`,
                },
                (payload) => {
                    console.log('[CREW PAGE] Access request changed:', payload);
                    // Refetch requests when they change - use setTimeout to ensure we have latest crewMembers
                    setTimeout(() => {
                        fetchAccessRequests();
                    }, 100);
                }
            )
            .subscribe();

        // Also set up polling as a fallback (every 5 seconds) to ensure updates are seen
        const pollInterval = setInterval(() => {
            fetchAccessRequests();
        }, 5000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(pollInterval);
        };
    }, [currentUserProfile?.role, user?.id, supabase, crewMembers.length]);

    // Function to request sea time access
    const handleRequestAccess = async (crewUserId: string) => {
        if (!user?.id) return;

        setRequestingAccess(crewUserId);
        try {
            const response = await fetch('/api/vessel-sea-time-access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vesselUserId: user.id,
                    crewUserId,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to request access');
            }

            toast({
                title: 'Request Sent',
                description: 'The crew member will be notified of your request.',
            });

            // Refresh access requests
            const { data: requests } = await supabase
                .from('vessel_sea_time_access_requests')
                .select('*')
                .eq('vessel_user_id', user.id)
                .eq('crew_user_id', crewUserId)
                .maybeSingle();

            if (requests) {
                setCrewMembers(prev => prev.map(member => 
                    member.profile.id === crewUserId
                        ? { ...member, accessRequest: {
                            id: requests.id,
                            vesselUserId: requests.vessel_user_id,
                            crewUserId: requests.crew_user_id,
                            vesselId: requests.vessel_id,
                            vesselName: requests.vessel_name,
                            status: requests.status,
                            notes: requests.notes,
                            rejectionReason: requests.rejection_reason,
                            createdAt: requests.created_at,
                            updatedAt: requests.updated_at,
                        } as VesselSeaTimeAccessRequest}
                        : member
                ));
            }
        } catch (error: any) {
            console.error('[CREW PAGE] Error requesting access:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to request access. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setRequestingAccess(null);
        }
    };

    // Function to load sea time data for a crew member
    const loadSeaTimeData = async (crewMember: CrewMemberWithAssignment) => {
        if (crewMember.seaTimeData || loadingSeaTime.has(crewMember.profile.id)) {
            return;
        }

        if (!user?.id || currentUserProfile?.role !== 'vessel') {
            console.error('[CREW PAGE] Cannot load sea time data: user not authenticated or not vessel manager');
            return;
        }

        setLoadingSeaTime(prev => new Set(prev).add(crewMember.profile.id));

        try {
            // Use API endpoint that verifies access and fetches data with admin privileges
            const response = await fetch(
                `/api/vessel-sea-time-access/sea-time-data?crewUserId=${crewMember.profile.id}&vesselUserId=${user.id}`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                if (response.status === 403) {
                    console.error('[CREW PAGE] Access not approved for crew member:', crewMember.profile.id);
                    toast({
                        title: 'Access Denied',
                        description: 'You do not have approved access to view this crew member\'s sea time data.',
                        variant: 'destructive',
                    });
                } else {
                    throw new Error(errorData.error || 'Failed to fetch sea time data');
                }
                return;
            }

            const { seaTimeData, leavePeriodsFromLogs } = await response.json();

            setCrewMembers(prev => prev.map(m => 
                m.profile.id === crewMember.profile.id
                    ? { ...m, seaTimeData, leavePeriodsFromLogs }
                    : m
            ));
        } catch (error: any) {
            console.error('[CREW PAGE] Error loading sea time data:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to load sea time data.',
                variant: 'destructive',
            });
        } finally {
            setLoadingSeaTime(prev => {
                const next = new Set(prev);
                next.delete(crewMember.profile.id);
                return next;
            });
        }
    };

    // Function to toggle expanded row (no longer used, but kept for compatibility)
    const toggleRowExpansion = async (crewMember: CrewMemberWithAssignment) => {
        // This function is no longer needed as sea time is shown in focused view
        // But kept for compatibility with SortableRow component
    };

    // Function to toggle onboard status (vessel accounts only)
    const handleToggleOnboard = async (assignmentId: string, currentOnboardStatus: boolean, userId: string) => {
        if (currentUserProfile?.role !== 'vessel') return;
        
        setUpdatingOnboardStatus(assignmentId);
        try {
            const newOnboardStatus = !currentOnboardStatus;
            
            const { error } = await supabase
                .from('vessel_assignments')
                .update({ onboard: newOnboardStatus })
                .eq('id', assignmentId);
            
            if (error) {
                throw error;
            }
            
            // Update local state
            setCrewMembers(prev => prev.map(member => {
                if (member.assignment.id === assignmentId) {
                    return {
                        ...member,
                        assignment: {
                            ...member.assignment,
                            onboard: newOnboardStatus
                        }
                    };
                }
                return member;
            }));
            
            toast({
                title: newOnboardStatus ? 'Crew member marked as onboard' : 'Crew member marked as offboard',
                description: `The crew member's onboard status has been updated.`,
            });
        } catch (error: any) {
            console.error('[CREW PAGE] Error updating onboard status:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to update onboard status. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setUpdatingOnboardStatus(null);
        }
    };
    
    // Initialize ordered crew members when crewMembers changes
    useEffect(() => {
        setOrderedCrewMembers(crewMembers);
    }, [crewMembers]);

    // Sensors for drag and drop
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Handle drag start
    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    // Handle drag end
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        
        if (over && active.id !== over.id) {
            setOrderedCrewMembers((items) => {
                const oldIndex = items.findIndex(item => item.profile.id === active.id);
                const newIndex = items.findIndex(item => item.profile.id === over.id);
                const newItems = arrayMove(items, oldIndex, newIndex);
                
                if (debugMode) {
                    console.log('[CREW PAGE] Drag coordinates:', {
                        fromIndex: oldIndex,
                        toIndex: newIndex,
                        activeId: active.id,
                        overId: over.id,
                    });
                }
                
                return newItems;
            });
        }
        
        setActiveId(null);
        setDragCoordinates(null);
    };

    
    // Filter crew members by search term and apply tier-based limits
    const filteredCrewMembers = useMemo(() => {
        console.log('[CREW PAGE] Filtering crew members:', {
            crewMembersCount: orderedCrewMembers.length,
            searchTerm: searchTerm,
            crewLimit: crewLimit,
            crewMembers: orderedCrewMembers
        });
        
        // First apply search filter
        let filtered = orderedCrewMembers;
        if (searchTerm) {
            filtered = orderedCrewMembers.filter(({ profile }) => {
            const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.toLowerCase();
            const username = profile.username.toLowerCase();
            const email = profile.email.toLowerCase();
            const lowercasedTerm = searchTerm.toLowerCase();

            return fullName.includes(lowercasedTerm) || 
                   username.includes(lowercasedTerm) || 
                   email.includes(lowercasedTerm);
        });
        }
        
        // Then apply tier-based limit (only for vessel managers)
        if (crewLimit !== Infinity && filtered.length > crewLimit) {
            console.log('[CREW PAGE] Applying tier limit:', {
                total: filtered.length,
                limit: crewLimit,
                showing: crewLimit
            });
            filtered = filtered.slice(0, crewLimit);
        }
        
        console.log('[CREW PAGE] Final filtered crew members:', filtered.length);
        return filtered;
    }, [orderedCrewMembers, searchTerm, crewLimit]);

    const isLoading = isLoadingProfile || isLoadingAssignments || isCheckingCaptaincy;
    
    // Get selected crew member data
    const selectedMemberData = useMemo(() => {
        if (!selectedCrewMemberId) return null;
        const member = crewMembers.find(m => m.profile.id === selectedCrewMemberId);
        if (!member) return null;
        
        // Add hasApprovedAccess flag
        return {
            ...member,
            hasApprovedAccess: member.accessRequest?.status === 'approved' || false,
        };
    }, [selectedCrewMemberId, crewMembers]);
    
    // Form for inviting crew members
    const inviteForm = useForm<InviteCrewFormValues>({
        resolver: zodResolver(inviteCrewSchema),
        defaultValues: {
            firstName: '',
            lastName: '',
            email: '',
        },
    });

    // Handler for selecting a crew member (show focused view)
    const handleSelectCrewMember = async (memberId: string) => {
        setSelectedCrewMemberId(memberId);
        
        // Find the crew member
        const member = crewMembers.find(m => m.profile.id === memberId);
        if (!member) return;
        
        // Fetch leave periods for this crew member
        if (currentUserProfile?.activeVesselId && user?.id) {
            try {
                const response = await fetch(
                    `/api/crew-leave-periods?crewUserId=${memberId}&vesselId=${currentUserProfile.activeVesselId}`
                );
                if (response.ok) {
                    const { leavePeriods } = await response.json();
                    setCrewMembers(prev => prev.map(m => 
                        m.profile.id === memberId
                            ? { ...m, leavePeriods }
                            : m
                    ));
                }
            } catch (error) {
                console.error('[CREW PAGE] Error fetching leave periods:', error);
            }
        }
        
        // Load sea time data if access is approved and not already loaded
        // This will also fetch leave periods from logs
        if (member.accessRequest?.status === 'approved' && !member.seaTimeData && !loadingSeaTime.has(memberId)) {
            await loadSeaTimeData(member);
        }
        
        // Fetch vessel-generated testimonials for this crew member
        if (currentUserProfile?.activeVesselId && currentUserProfile?.role === 'vessel') {
            setIsLoadingTestimonials(true);
            try {
                const { data: vesselTestimonials, error: testimonialsError } = await supabase
                    .from('vessel_generated_testimonials')
                    .select('*')
                    .eq('crew_user_id', memberId)
                    .eq('vessel_id', currentUserProfile.activeVesselId)
                    .order('created_at', { ascending: false });

                if (!testimonialsError && vesselTestimonials) {
                    setCrewMembers(prev => prev.map(m => 
                        m.profile.id === memberId
                            ? { ...m, vesselGeneratedTestimonials: vesselTestimonials as VesselGeneratedTestimonial[] }
                            : m
                    ));
                }
            } catch (error) {
                console.error('[CREW PAGE] Error fetching vessel-generated testimonials:', error);
            } finally {
                setIsLoadingTestimonials(false);
            }
        }
    };


    // Get vessel details helper
    const getVesselDetails = (vesselId: string) => {
        return allVessels?.find(v => v.id === vesselId);
    };

    // Calculate available periods between leave periods
    const availablePeriodsBetweenLeave = useMemo(() => {
        if (!selectedMemberData) return [];

        const allLeavePeriods: Array<{ startDate: string; endDate: string }> = [];
        
        // Add manually logged leave periods
        if (selectedMemberData.leavePeriods) {
            selectedMemberData.leavePeriods.forEach(period => {
                allLeavePeriods.push({
                    startDate: period.startDate,
                    endDate: period.endDate,
                });
            });
        }
        
        // Add leave periods from logs
        if (selectedMemberData.leavePeriodsFromLogs) {
            selectedMemberData.leavePeriodsFromLogs.forEach(period => {
                allLeavePeriods.push({
                    startDate: period.startDate,
                    endDate: period.endDate,
                });
            });
        }

        // If no leave periods, return empty array
        if (allLeavePeriods.length === 0) return [];

        // Sort leave periods by start date
        const sortedLeavePeriods = [...allLeavePeriods].sort((a, b) => 
            new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        );

        // Helper to normalize date to midnight
        const normalizeDate = (dateStr: string | null | undefined): Date => {
            if (!dateStr) return new Date(new Date().setHours(0, 0, 0, 0));
            // If it's already a full ISO string, parse it; otherwise add time component
            const date = dateStr.includes('T') 
                ? new Date(dateStr) 
                : new Date(dateStr + 'T00:00:00');
            date.setHours(0, 0, 0, 0);
            return date;
        };

        // Get assignment start date (use today if not available)
        const assignmentStartDate = normalizeDate(selectedMemberData.assignment.startDate);
        
        // Get assignment end date or use today
        const assignmentEndDate = normalizeDate(selectedMemberData.assignment.endDate);
        
        const today = new Date(new Date().setHours(0, 0, 0, 0));
        const effectiveEndDate = assignmentEndDate > today ? today : assignmentEndDate;

        const periods: Array<{ startDate: Date; endDate: Date; label: string }> = [];

        // Helper to normalize leave period date
        const normalizeLeaveDate = (dateStr: string): Date => {
            const date = dateStr.includes('T') 
                ? new Date(dateStr) 
                : new Date(dateStr + 'T00:00:00');
            date.setHours(0, 0, 0, 0);
            return date;
        };

        // Period before first leave
        const firstLeaveStart = normalizeLeaveDate(sortedLeavePeriods[0].startDate);
        if (assignmentStartDate < firstLeaveStart) {
            const periodEnd = new Date(firstLeaveStart);
            periodEnd.setDate(periodEnd.getDate() - 1);
            periodEnd.setHours(0, 0, 0, 0);
            if (periodEnd >= assignmentStartDate) {
                periods.push({
                    startDate: assignmentStartDate,
                    endDate: periodEnd,
                    label: `Before first leave (${formatDate(assignmentStartDate, 'MMM dd')} - ${formatDate(periodEnd, 'MMM dd, yyyy')})`,
                });
            }
        }

        // Periods between leave periods
        for (let i = 0; i < sortedLeavePeriods.length - 1; i++) {
            const currentLeaveEnd = normalizeLeaveDate(sortedLeavePeriods[i].endDate);
            const nextLeaveStart = normalizeLeaveDate(sortedLeavePeriods[i + 1].startDate);
            
            const periodStart = new Date(currentLeaveEnd);
            periodStart.setDate(periodStart.getDate() + 1);
            periodStart.setHours(0, 0, 0, 0);
            
            const periodEnd = new Date(nextLeaveStart);
            periodEnd.setDate(periodEnd.getDate() - 1);
            periodEnd.setHours(0, 0, 0, 0);
            
            if (periodStart <= periodEnd) {
                periods.push({
                    startDate: periodStart,
                    endDate: periodEnd,
                    label: `Between leave periods (${formatDate(periodStart, 'MMM dd')} - ${formatDate(periodEnd, 'MMM dd, yyyy')})`,
                });
            }
        }

        // Period after last leave
        const lastLeaveEnd = normalizeLeaveDate(sortedLeavePeriods[sortedLeavePeriods.length - 1].endDate);
        const periodStart = new Date(lastLeaveEnd);
        periodStart.setDate(periodStart.getDate() + 1);
        periodStart.setHours(0, 0, 0, 0);
        
        if (periodStart <= effectiveEndDate) {
            periods.push({
                startDate: periodStart,
                endDate: effectiveEndDate,
                label: `After last leave (${formatDate(periodStart, 'MMM dd')} - ${formatDate(effectiveEndDate, 'MMM dd, yyyy')})`,
            });
        }

        return periods;
    }, [selectedMemberData]);

    // Check if selected crew member's MCA information is complete
    const isMCAInfoComplete = useMemo(() => {
        if (!selectedMemberData?.profile) return true;
        
        const profile = selectedMemberData.profile as any;
        const hasDateOfBirth = !!(profile.date_of_birth || profile.dateOfBirth);
        const hasAddressLine1 = !!(profile.address_line1 || profile.addressLine1);
        const hasAddressTownCity = !!(profile.address_town_city || profile.addressTownCity);
        const hasAddressPostCode = !!(profile.address_post_code || profile.addressPostCode);
        const hasAddressCountry = !!(profile.address_country || profile.addressCountry);
        const hasNationality = !!(profile.nationality);
        
        return hasDateOfBirth && hasAddressLine1 && hasAddressTownCity && hasAddressPostCode && hasAddressCountry && hasNationality;
    }, [selectedMemberData]);

    // Delete a vessel-generated testimonial
    const handleDeleteVesselTestimonial = async (testimonialId: string) => {
        if (!user?.id || !selectedCrewMemberId || !currentUserProfile?.activeVesselId) {
            return;
        }

        setDeletingTestimonial(testimonialId);
        try {
            const { error } = await supabase
                .from('vessel_generated_testimonials')
                .delete()
                .eq('id', testimonialId)
                .eq('vessel_id', currentUserProfile.activeVesselId)
                .eq('vessel_user_id', user.id); // Ensure only the vessel manager who created it can delete

            if (error) throw error;

            toast({
                title: 'Document Deleted',
                description: 'The vessel-generated document has been successfully deleted.',
            });

            // Refresh vessel-generated testimonials
            if (selectedCrewMemberId && currentUserProfile?.activeVesselId && currentUserProfile?.role === 'vessel') {
                setIsLoadingTestimonials(true);
                try {
                    const { data: vesselTestimonials, error: testimonialsError } = await supabase
                        .from('vessel_generated_testimonials')
                        .select('*')
                        .eq('crew_user_id', selectedCrewMemberId)
                        .eq('vessel_id', currentUserProfile.activeVesselId)
                        .order('created_at', { ascending: false });

                    if (!testimonialsError && vesselTestimonials) {
                        setCrewMembers(prev => prev.map(m => 
                            m.profile.id === selectedCrewMemberId
                                ? { ...m, vesselGeneratedTestimonials: vesselTestimonials as VesselGeneratedTestimonial[] }
                                : m
                        ));
                    }
                } catch (error) {
                    console.error('[CREW PAGE] Error refreshing vessel-generated testimonials:', error);
                } finally {
                    setIsLoadingTestimonials(false);
                }
            }
        } catch (error: any) {
            console.error('[CREW PAGE] Error deleting vessel-generated testimonial:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to delete document. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setDeletingTestimonial(null);
        }
    };

    // Send saved document to captain via one-time link
    const handleSendDocumentToCaptain = async () => {
        if (!sendToCaptainDocId || !sendToCaptainEmail.trim()) {
            toast({
                title: 'Error',
                description: 'Please enter the captain’s email address.',
                variant: 'destructive',
            });
            return;
        }
        if (!session?.access_token) {
            toast({
                title: 'Error',
                description: 'Your session has expired. Please refresh the page and try again.',
                variant: 'destructive',
            });
            return;
        }
        setIsSendingToCaptainDoc(true);
        try {
            const res = await fetch('/api/vessel-document/send-to-captain', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    documentId: sendToCaptainDocId,
                    captainEmail: sendToCaptainEmail.trim(),
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'Failed to send');
            }
            toast({
                title: 'Sent',
                description: data.message || 'Captain will receive an email with a one-time link to view or download the document.',
            });
            setSendToCaptainDocId(null);
            setSendToCaptainEmail('');
            setSendToCaptainDialogOpen(false);
            // Refresh testimonials so we can show "Sent to X" if we display it later
            if (selectedMemberData?.profile?.id && currentUserProfile?.activeVesselId) {
                const { data: vesselTestimonials } = await supabase
                    .from('vessel_generated_testimonials')
                    .select('*')
                    .eq('crew_user_id', selectedMemberData.profile.id)
                    .eq('vessel_id', currentUserProfile.activeVesselId)
                    .order('created_at', { ascending: false });
                setCrewMembers(prev =>
                    prev.map((m) =>
                        m.profile.id === selectedMemberData.profile.id
                            ? { ...m, vesselGeneratedTestimonials: (vesselTestimonials as VesselGeneratedTestimonial[]) || m.vesselGeneratedTestimonials }
                            : m
                    )
                );
            }
        } catch (e) {
            toast({
                title: 'Error',
                description: e instanceof Error ? e.message : 'Failed to send link to captain.',
                variant: 'destructive',
            });
        } finally {
            setIsSendingToCaptainDoc(false);
        }
    };

    // Generate PDF for a vessel-generated testimonial
    const handleGenerateVesselTestimonialPDF = async (testimonial: VesselGeneratedTestimonial, format: TestimonialPDFFormat = 'seajourney') => {
        if (!selectedMemberData) {
            toast({
                title: 'Error',
                description: 'Crew member data not available.',
                variant: 'destructive',
            });
            return;
        }

        setGeneratingPDF(testimonial.id);
        
        try {
            const vessel = getVesselDetails(testimonial.vessel_id);
            if (!vessel) {
                toast({
                    title: 'Error',
                    description: 'Vessel details not found.',
                    variant: 'destructive',
                });
                return;
            }

            // Fetch logs and calculate standby periods
            let standbyPeriods: Array<{ passageStartDate: string; passageEndDate: string; standbyDays: number }> = [];
            try {
                const hasApprovedAccess = selectedMemberData.accessRequest?.status === 'approved';
                let logs: StateLog[] = [];
                
                if (hasApprovedAccess && testimonial.data_source === 'crew') {
                    logs = await getVesselStateLogs(
                        supabase,
                        testimonial.vessel_id,
                        selectedMemberData.profile.id
                    );
                } else {
                    // For vessel logs, fetch the vessel's own logs (vessel_manager_id)
                    const vessel = getVesselDetails(testimonial.vessel_id);
                    const vesselManagerId = vessel ? (vessel as any).vessel_manager_id : null;
                    
                    // If vessel_manager_id is not set, use current user (vessel manager)
                    const targetUserId = vesselManagerId || currentUserProfile?.id;
                    
                    logs = await getVesselStateLogs(
                        supabase,
                        testimonial.vessel_id,
                        targetUserId // Fetch logs for the vessel manager's account
                    );
                }
                
                const filteredLogs = logs.filter(log => {
                    const logDate = log.date;
                    return logDate >= testimonial.start_date && logDate <= testimonial.end_date;
                });
                
                const partOfActivePassageDates = new Set<string>();
                filteredLogs.forEach(log => {
                    if (log.isPartOfActivePassage) {
                        partOfActivePassageDates.add(log.date);
                    }
                });
                
                let watchDates = new Set<string>();
                const position = (selectedMemberData.profile.position || '').toLowerCase();
                const role = (selectedMemberData.profile.role || '').toLowerCase();
                const officerPositions = [
                    'captain', 'master', 'chief officer', 'first officer', 'first mate', 
                    'second officer', 'third officer', 'officer of the watch', 'oow', 'deck officer',
                    'chief engineer', 'first engineer', 'second engineer', 'third engineer', 'fourth engineer'
                ];
                const isOfficer = role === 'captain' || role === 'admin' || officerPositions.some(op => position.includes(op));
                
                if (hasApprovedAccess && isOfficer && selectedMemberData.profile.id) {
                    const { data: watchLogs } = await supabase
                        .from('watch_logs')
                        .select('watch_start')
                        .eq('user_id', selectedMemberData.profile.id)
                        .eq('vessel_id', testimonial.vessel_id)
                        .gte('watch_start', `${testimonial.start_date}T00:00:00`)
                        .lte('watch_start', `${testimonial.end_date}T23:59:59`);
                    
                    if (watchLogs) {
                        watchLogs.forEach(log => {
                            const dateStr = formatDate(new Date(log.watch_start), 'yyyy-MM-dd');
                            watchDates.add(dateStr);
                        });
                    }
                }
                
                const { standbyPeriods: calculatedPeriods, voyages } = calculateStandbyDays(
                    filteredLogs,
                    watchDates.size > 0 ? watchDates : undefined,
                    partOfActivePassageDates.size > 0 ? partOfActivePassageDates : undefined
                );
                
                standbyPeriods = calculatedPeriods.map((period, index) => {
                    const voyage = voyages[index];
                    if (!voyage) {
                        const voyageEndDate = new Date(period.startDate);
                        voyageEndDate.setDate(voyageEndDate.getDate() - 1);
                        const voyageStartDate = new Date(voyageEndDate);
                        voyageStartDate.setDate(voyageStartDate.getDate() - (period.precedingVoyageDays || 0) + 1);
                        return {
                            passageStartDate: formatDate(voyageStartDate, 'yyyy-MM-dd'),
                            passageEndDate: formatDate(voyageEndDate, 'yyyy-MM-dd'),
                            standbyDays: period.countedDays,
                        };
                    }
                    const voyageStart = voyage.startDate instanceof Date ? voyage.startDate : new Date(voyage.startDate);
                    const voyageEnd = voyage.endDate instanceof Date ? voyage.endDate : new Date(voyage.endDate);
                    return {
                        passageStartDate: formatDate(voyageStart, 'yyyy-MM-dd'),
                        passageEndDate: formatDate(voyageEnd, 'yyyy-MM-dd'),
                        standbyDays: period.countedDays,
                    };
                });
            } catch (error) {
                console.error('[CREW PAGE] Error calculating standby periods:', error);
            }

            // Prepare testimonial data (simplified for vessel-generated testimonials)
            const testimonialData = {
                testimonial: {
                    id: testimonial.id,
                    start_date: testimonial.start_date,
                    end_date: testimonial.end_date,
                    total_days: testimonial.total_days,
                    at_sea_days: testimonial.at_sea_days,
                    standby_days: testimonial.standby_days,
                    yard_days: testimonial.yard_days,
                    leave_days: testimonial.leave_days,
                    captain_name: testimonial.generated_by_name,
                    captain_email: testimonial.generated_by_email,
                    captain_position: null,
                    captain_signature: null,
                    captain_comment_conduct: null,
                    captain_comment_ability: null,
                    captain_comment_general: null,
                    official_body: null,
                    official_reference: null,
                    notes: testimonial.notes,
                    testimonial_code: null, // Vessel-generated testimonials don't have verification codes
                    status: 'approved' as const,
                    signoff_used_at: null,
                    approved_at: testimonial.created_at,
                    created_at: testimonial.created_at,
                    updated_at: testimonial.updated_at,
                },
                userProfile: {
                    firstName: selectedMemberData.profile.firstName,
                    lastName: selectedMemberData.profile.lastName,
                    username: selectedMemberData.profile.username,
                    email: selectedMemberData.profile.email || '',
                    dateOfBirth: (selectedMemberData.profile as any).date_of_birth || (selectedMemberData.profile as any).dateOfBirth || null,
                    position: selectedMemberData.profile.position || null,
                    dischargeBookNumber: (selectedMemberData.profile as any).discharge_book_number || (selectedMemberData.profile as any).dischargeBookNumber || null,
                },
                vessel: {
                    name: vessel.name,
                    type: vessel.type || null,
                    officialNumber: vessel.officialNumber || vessel.imo || null,
                    flag_state: vessel.flag || vessel.flag_state || null,
                    length_m: vessel.length_m || null,
                    gross_tonnage: vessel.gross_tonnage || null,
                    call_sign: vessel.call_sign || null,
                },
                captainProfile: null,
                companyDetails: {
                    name: (vessel as any).management_company || null,
                    address: (vessel as any).company_address || null,
                    contactDetails: (vessel as any).company_contact || null,
                },
                standbyPeriods: standbyPeriods.length > 0 ? standbyPeriods : undefined,
            };

            // Generate PDF based on format
            if (format === 'mca') {
                const position = (selectedMemberData.profile.position || '').toLowerCase();
                const role = (selectedMemberData.profile.role || '').toLowerCase();
                const officerPositions = [
                    'captain', 'master', 'chief officer', 'first officer', 'first mate', 
                    'second officer', 'third officer', 'officer of the watch', 'oow', 'deck officer',
                    'chief engineer', 'first engineer', 'second engineer', 'third engineer', 'fourth engineer'
                ];
                const isOfficerUser = role === 'captain' || role === 'admin' || officerPositions.some(op => position.includes(op));
                
                const testimonialDataWithReceipt = {
                    ...testimonialData,
                    receiptData: {
                        documentId: testimonial.id,
                        sjCode: null, // No verification code for vessel-generated testimonials
                        documentType: 'testimonial' as const,
                        generatedAt: new Date().toISOString(),
                        generatedBy: {
                            userId: currentUserProfile?.id,
                            email: currentUserProfile?.email || undefined,
                            name: testimonial.generated_by_name,
                        },
                    },
                };
                
                if (isOfficerUser) {
                    await generateMCAOfficerTestimonial(testimonialDataWithReceipt, 'download');
                } else {
                    await generateMCADeckhandTestimonial(testimonialDataWithReceipt, 'download');
                }
            } else {
                await generateTestimonialPDF(testimonialData, format);
            }

            toast({
                title: 'Success',
                description: 'PDF generated successfully.',
            });
        } catch (error) {
            console.error('[CREW PAGE] Error generating PDF:', error);
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to generate PDF. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setGeneratingPDF(null);
        }
    };

    // Generate PDF for a testimonial
    const handleGeneratePDF = async (testimonial: Testimonial, format: TestimonialPDFFormat = 'seajourney') => {
        if (!selectedMemberData) {
            toast({
                title: 'Error',
                description: 'Crew member data not available.',
                variant: 'destructive',
            });
            return;
        }

        setGeneratingPDF(testimonial.id);
        
        try {
            const vessel = getVesselDetails(testimonial.vessel_id);
            if (!vessel) {
                toast({
                    title: 'Error',
                    description: 'Vessel details not found.',
                    variant: 'destructive',
                });
                return;
            }

            // Fetch approved testimonial snapshot if approved
            let captainSignature = testimonial.captain_signature || null;
            let captainCommentConduct = (testimonial as any).captain_comment_conduct || null;
            let captainCommentAbility = (testimonial as any).captain_comment_ability || null;
            let captainCommentGeneral = (testimonial as any).captain_comment_general || null;
            let approvedAt = null;
            
            if (testimonial.status === 'approved') {
                try {
                    const { data: approvedSnapshot } = await supabase
                        .from('approved_testimonials')
                        .select('captain_signature, captain_comment_conduct, captain_comment_ability, captain_comment_general, approved_at')
                        .eq('testimonial_id', testimonial.id)
                        .maybeSingle();

                    if (approvedSnapshot) {
                        captainSignature = approvedSnapshot.captain_signature || captainSignature;
                        captainCommentConduct = approvedSnapshot.captain_comment_conduct || captainCommentConduct;
                        captainCommentAbility = approvedSnapshot.captain_comment_ability || captainCommentAbility;
                        captainCommentGeneral = approvedSnapshot.captain_comment_general || captainCommentGeneral;
                        approvedAt = approvedSnapshot.approved_at || null;
                    }
                } catch (error) {
                    console.error('[CREW PAGE] Error fetching approved snapshot:', error);
                }
            }

            // Fetch captain profile if available
            let captainProfile = null;
            if (testimonial.captain_user_id) {
                try {
                    const { data: captainData } = await supabase
                        .from('users')
                        .select('first_name, last_name, position, email, signature')
                        .eq('id', testimonial.captain_user_id)
                        .maybeSingle();

                    if (captainData) {
                        captainProfile = {
                            firstName: captainData.first_name || undefined,
                            lastName: captainData.last_name || undefined,
                            position: captainData.position || null,
                            email: captainData.email || undefined,
                            signature: captainData.signature || null,
                        };
                    }
                } catch (error) {
                    console.error('[CREW PAGE] Error fetching captain profile:', error);
                }
            }

            // Filter out vessel manager notes
            const filteredNotes = testimonial.notes && (
                testimonial.notes.toLowerCase().includes('generated by vessel manager') ||
                testimonial.notes.toLowerCase().includes('awaiting captain approval')
            ) ? null : testimonial.notes;

            // Fetch logs and calculate standby periods
            let standbyPeriods: Array<{ passageStartDate: string; passageEndDate: string; standbyDays: number }> = [];
            try {
                const hasApprovedAccess = selectedMemberData.accessRequest?.status === 'approved';
                let logs: StateLog[] = [];
                
                if (hasApprovedAccess) {
                    logs = await getVesselStateLogs(
                        supabase,
                        testimonial.vessel_id,
                        selectedMemberData.profile.id
                    );
                } else {
                    logs = await getVesselStateLogs(
                        supabase,
                        testimonial.vessel_id
                    );
                }
                
                const filteredLogs = logs.filter(log => {
                    const logDate = log.date;
                    return logDate >= testimonial.start_date && logDate <= testimonial.end_date;
                });
                
                const partOfActivePassageDates = new Set<string>();
                filteredLogs.forEach(log => {
                    if (log.isPartOfActivePassage) {
                        partOfActivePassageDates.add(log.date);
                    }
                });
                
                let watchDates = new Set<string>();
                const position = (selectedMemberData.profile.position || '').toLowerCase();
                const role = (selectedMemberData.profile.role || '').toLowerCase();
                const officerPositions = [
                    'captain', 'master', 'chief officer', 'first officer', 'first mate', 
                    'second officer', 'third officer', 'officer of the watch', 'oow', 'deck officer',
                    'chief engineer', 'first engineer', 'second engineer', 'third engineer', 'fourth engineer'
                ];
                const isOfficer = role === 'captain' || role === 'admin' || officerPositions.some(op => position.includes(op));
                
                if (hasApprovedAccess && isOfficer && selectedMemberData.profile.id) {
                    const { data: watchLogs } = await supabase
                        .from('watch_logs')
                        .select('watch_start')
                        .eq('user_id', selectedMemberData.profile.id)
                        .eq('vessel_id', testimonial.vessel_id)
                        .gte('watch_start', `${testimonial.start_date}T00:00:00`)
                        .lte('watch_start', `${testimonial.end_date}T23:59:59`);
                    
                    if (watchLogs) {
                        watchLogs.forEach(log => {
                            const dateStr = formatDate(new Date(log.watch_start), 'yyyy-MM-dd');
                            watchDates.add(dateStr);
                        });
                    }
                }
                
                const { standbyPeriods: calculatedPeriods, voyages } = calculateStandbyDays(
                    filteredLogs,
                    watchDates.size > 0 ? watchDates : undefined,
                    partOfActivePassageDates.size > 0 ? partOfActivePassageDates : undefined
                );
                
                standbyPeriods = calculatedPeriods.map((period, index) => {
                    const voyage = voyages[index];
                    if (!voyage) {
                        const voyageEndDate = new Date(period.startDate);
                        voyageEndDate.setDate(voyageEndDate.getDate() - 1);
                        const voyageStartDate = new Date(voyageEndDate);
                        voyageStartDate.setDate(voyageStartDate.getDate() - (period.precedingVoyageDays || 0) + 1);
                        return {
                            passageStartDate: formatDate(voyageStartDate, 'yyyy-MM-dd'),
                            passageEndDate: formatDate(voyageEndDate, 'yyyy-MM-dd'),
                            standbyDays: period.countedDays,
                        };
                    }
                    const voyageStart = voyage.startDate instanceof Date ? voyage.startDate : new Date(voyage.startDate);
                    const voyageEnd = voyage.endDate instanceof Date ? voyage.endDate : new Date(voyage.endDate);
                    return {
                        passageStartDate: formatDate(voyageStart, 'yyyy-MM-dd'),
                        passageEndDate: formatDate(voyageEnd, 'yyyy-MM-dd'),
                        standbyDays: period.countedDays,
                    };
                });
            } catch (error) {
                console.error('[CREW PAGE] Error calculating standby periods:', error);
            }

            // Prepare testimonial data
            const testimonialData = {
                testimonial: {
                    id: testimonial.id,
                    start_date: testimonial.start_date,
                    end_date: testimonial.end_date,
                    total_days: testimonial.total_days,
                    at_sea_days: testimonial.at_sea_days,
                    standby_days: testimonial.standby_days,
                    yard_days: testimonial.yard_days,
                    leave_days: testimonial.leave_days,
                    captain_name: testimonial.captain_name,
                    captain_email: testimonial.captain_email,
                    captain_position: (testimonial as any).captain_position || null,
                    captain_signature: captainSignature,
                    captain_comment_conduct: captainCommentConduct,
                    captain_comment_ability: captainCommentAbility,
                    captain_comment_general: captainCommentGeneral,
                    official_body: testimonial.official_body,
                    official_reference: testimonial.official_reference,
                    notes: filteredNotes,
                    testimonial_code: testimonial.testimonial_code,
                    status: testimonial.status,
                    signoff_used_at: testimonial.signoff_used_at,
                    approved_at: approvedAt,
                    created_at: testimonial.created_at,
                    updated_at: testimonial.updated_at,
                },
                userProfile: {
                    firstName: selectedMemberData.profile.firstName,
                    lastName: selectedMemberData.profile.lastName,
                    username: selectedMemberData.profile.username,
                    email: selectedMemberData.profile.email || '',
                    dateOfBirth: (selectedMemberData.profile as any).date_of_birth || (selectedMemberData.profile as any).dateOfBirth || null,
                    position: selectedMemberData.profile.position || null,
                    dischargeBookNumber: (selectedMemberData.profile as any).discharge_book_number || (selectedMemberData.profile as any).dischargeBookNumber || null,
                },
                vessel: {
                    name: vessel.name,
                    type: vessel.type || null,
                    officialNumber: vessel.officialNumber || vessel.imo || null,
                    flag_state: vessel.flag || vessel.flag_state || null,
                    length_m: vessel.length_m || null,
                    gross_tonnage: vessel.gross_tonnage || null,
                    call_sign: vessel.call_sign || null,
                },
                captainProfile: captainProfile,
                companyDetails: {
                    name: (vessel as any).management_company || null,
                    address: (vessel as any).company_address || null,
                    contactDetails: (vessel as any).company_contact || null,
                },
                standbyPeriods: standbyPeriods.length > 0 ? standbyPeriods : undefined,
            };

            // Generate PDF based on format
            if (format === 'mca') {
                const position = (selectedMemberData.profile.position || '').toLowerCase();
                const role = (selectedMemberData.profile.role || '').toLowerCase();
                const officerPositions = [
                    'captain', 'master', 'chief officer', 'first officer', 'first mate', 
                    'second officer', 'third officer', 'officer of the watch', 'oow', 'deck officer',
                    'chief engineer', 'first engineer', 'second engineer', 'third engineer', 'fourth engineer'
                ];
                const isOfficerUser = role === 'captain' || role === 'admin' || officerPositions.some(op => position.includes(op));
                
                const testimonialDataWithReceipt = {
                    ...testimonialData,
                    receiptData: {
                        documentId: testimonial.id,
                        sjCode: testimonial.testimonial_code || null,
                        documentType: 'testimonial' as const,
                        generatedAt: new Date().toISOString(),
                        generatedBy: {
                            userId: user?.id,
                            email: currentUserProfile?.email || undefined,
                        },
                    },
                };
                
                if (isOfficerUser) {
                    await generateMCAOfficerTestimonial(testimonialDataWithReceipt, 'download');
                } else {
                    await generateMCADeckhandTestimonial(testimonialDataWithReceipt, 'download');
                }
            } else {
                await generateTestimonialPDF(testimonialData, format);
            }

            toast({
                title: 'Success',
                description: 'PDF generated successfully.',
            });
        } catch (error) {
            console.error('[CREW PAGE] Error generating PDF:', error);
            toast({
                title: 'Error',
                description: error instanceof Error ? error.message : 'Failed to generate PDF. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setGeneratingPDF(null);
        }
    };

    // Calculate sea time from vessel state logs for date range
    const handleCalculateSeaTime = async () => {
        if (!selectedMemberData || !currentUserProfile?.activeVesselId || !documentStartDate || !documentEndDate) {
            toast({
                title: 'Error',
                description: 'Please select a crew member and date range.',
                variant: 'destructive',
            });
            return;
        }

        if (documentStartDate > documentEndDate) {
            toast({
                title: 'Error',
                description: 'Start date must be before end date.',
                variant: 'destructive',
            });
            return;
        }

        setIsCalculatingSeaTime(true);
        try {
            const startDateStr = formatDate(documentStartDate, 'yyyy-MM-dd');
            const endDateStr = formatDate(documentEndDate, 'yyyy-MM-dd');
            
            const hasApprovedAccess = selectedMemberData.accessRequest?.status === 'approved';
            const useCrewLogs = hasApprovedAccess && (selectedDataSource === null || selectedDataSource === 'crew');
            
            let filteredLogs: StateLog[] = [];
            
            if (useCrewLogs) {
                const crewMemberLogs = await getVesselStateLogs(
                    supabase, 
                    currentUserProfile.activeVesselId, 
                    selectedMemberData.profile.id
                );
                filteredLogs = crewMemberLogs.filter(log => {
                    const logDate = log.date;
                    return logDate >= startDateStr && logDate <= endDateStr;
                });
            } else {
                // For vessel logs, fetch the vessel's own logs (where user_id = vessel_manager_id)
                // The vessel manager logs data on their own profile for the vessel
                console.log('[CREW PAGE] Fetching vessel logs for vessel:', currentUserProfile.activeVesselId);
                
                // Get the vessel to find vessel_manager_id
                const vessel = getVesselDetails(currentUserProfile.activeVesselId);
                if (!vessel) {
                    toast({
                        title: 'Error',
                        description: 'Vessel details not found.',
                        variant: 'destructive',
                    });
                    setIsCalculatingSeaTime(false);
                    return;
                }
                
                // Fetch vessel's own logs (vessel_manager_id logs)
                // If vessel_manager_id is not set, fall back to current user (vessel manager)
                const vesselManagerId = (vessel as any).vessel_manager_id || currentUserProfile.id;
                
                console.log('[CREW PAGE] Fetching vessel logs with vessel_manager_id:', vesselManagerId);
                
                const vesselLogs = await getVesselStateLogs(
                    supabase, 
                    currentUserProfile.activeVesselId,
                    vesselManagerId // Fetch logs for the vessel manager's account
                );
                
                console.log('[CREW PAGE] Vessel logs fetched:', {
                    totalLogs: vesselLogs.length,
                    vesselManagerId,
                    dateRange: { start: startDateStr, end: endDateStr },
                    sampleLogs: vesselLogs.slice(0, 5).map(l => ({ date: l.date, state: l.state, userId: l.userId }))
                });
                
                filteredLogs = vesselLogs.filter(log => {
                    const logDate = log.date;
                    return logDate >= startDateStr && logDate <= endDateStr;
                });
                
                console.log('[CREW PAGE] Filtered logs for date range:', {
                    filteredCount: filteredLogs.length,
                    dateRange: { start: startDateStr, end: endDateStr }
                });
            }

            if (filteredLogs.length === 0) {
                const errorMessage = hasApprovedAccess 
                    ? 'No sea time logs found for this crew member in the selected date range. Please check that logs exist for these dates.'
                    : `No vessel state logs found for the selected date range (${startDateStr} to ${endDateStr}). Please ensure vessel logs exist for this period.`;
                
                console.error('[CREW PAGE] No logs found:', {
                    hasApprovedAccess,
                    useCrewLogs,
                    dateRange: { start: startDateStr, end: endDateStr },
                    vesselId: currentUserProfile.activeVesselId,
                    crewUserId: selectedMemberData?.profile.id,
                });
                
                toast({
                    title: 'No Data',
                    description: errorMessage,
                    variant: 'destructive',
                });
                setIsCalculatingSeaTime(false);
                return;
            }

            const position = (selectedMemberData.profile.position || '').toLowerCase();
            const role = (selectedMemberData.profile.role || '').toLowerCase();
            const officerPositions = [
                'captain', 'master', 'chief officer', 'first officer', 'first mate', 
                'second officer', 'third officer', 'officer of the watch', 'oow', 'deck officer',
                'chief engineer', 'first engineer', 'second engineer', 'third engineer', 'fourth engineer'
            ];
            const isOfficer = role === 'captain' || role === 'admin' || officerPositions.some(op => position.includes(op));

            let watchDates = new Set<string>();
            if (isOfficer && selectedMemberData.profile.id && currentUserProfile.activeVesselId) {
                try {
                    const { data: watchLogs, error: watchError } = await supabase
                        .from('watch_logs')
                        .select('watch_start')
                        .eq('user_id', selectedMemberData.profile.id)
                        .eq('vessel_id', currentUserProfile.activeVesselId)
                        .gte('watch_start', `${startDateStr}T00:00:00`)
                        .lte('watch_start', `${endDateStr}T23:59:59`);

                    if (!watchError && watchLogs) {
                        watchLogs.forEach(log => {
                            const dateStr = formatDate(new Date(log.watch_start), 'yyyy-MM-dd');
                            watchDates.add(dateStr);
                        });
                    }
                } catch (error) {
                    console.error('[CREW PAGE] Error fetching watch logs:', error);
                }
            }

            const partOfActivePassageDates = new Set<string>();
            filteredLogs.forEach(log => {
                if (log.isPartOfActivePassage) {
                    partOfActivePassageDates.add(log.date);
                }
            });

            const { totalSeaDays, totalStandbyDays, voyages, standbyPeriods } = calculateStandbyDays(
                filteredLogs,
                watchDates.size > 0 ? watchDates : undefined,
                partOfActivePassageDates.size > 0 ? partOfActivePassageDates : undefined
            );

            const dateRangeSet = new Set<string>();
            const logMap = new Map<string, StateLog>();
            filteredLogs.forEach(log => {
                logMap.set(log.date, log);
            });
            
            const startDateObj = parse(startDateStr, 'yyyy-MM-dd', new Date());
            const endDateObj = parse(endDateStr, 'yyyy-MM-dd', new Date());
            let currentDate = new Date(startDateObj);
            while (currentDate <= endDateObj) {
                dateRangeSet.add(formatDate(currentDate, 'yyyy-MM-dd'));
                currentDate = addDays(currentDate, 1);
            }

            const voyageDatesSet = new Set<string>();
            voyages.forEach(voyage => {
                let date = new Date(voyage.startDate);
                const endDate = new Date(voyage.endDate);
                while (date <= endDate) {
                    voyageDatesSet.add(formatDate(date, 'yyyy-MM-dd'));
                    date = addDays(date, 1);
                }
            });

            const standbyDatesSet = new Set<string>();
            standbyPeriods.forEach(period => {
                let date = new Date(period.startDate);
                const endDate = new Date(period.endDate);
                let counted = 0;
                const maxCounted = period.countedDays;
                while (date <= endDate && counted < maxCounted) {
                    const dateStr = formatDate(date, 'yyyy-MM-dd');
                    const log = logMap.get(dateStr);
                    if (log && (log.state === 'in-port' || log.state === 'at-anchor')) {
                        const hasWatch = watchDates?.has(dateStr);
                        const isPartOfPassage = partOfActivePassageDates?.has(dateStr);
                        if (!hasWatch && !isPartOfPassage) {
                            standbyDatesSet.add(dateStr);
                            counted++;
                        }
                    }
                    date = addDays(date, 1);
                }
            });

            let finalSeaDays = 0;
            let finalStandbyDays = 0;
            let yardDays = 0;
            let leaveDays = 0;

            dateRangeSet.forEach(dateStr => {
                const log = logMap.get(dateStr);
                if (!log) return;

                if (log.state === 'in-yard') {
                    yardDays++;
                    return;
                }
                if (log.state === 'on-leave') {
                    leaveDays++;
                    return;
                }

                if (voyageDatesSet.has(dateStr)) {
                    finalSeaDays++;
                    return;
                }

                if (watchDates?.has(dateStr) && (log.state === 'in-port' || log.state === 'at-anchor')) {
                    finalSeaDays++;
                    return;
                }

                if (partOfActivePassageDates?.has(dateStr) && log.state !== 'underway') {
                    finalSeaDays++;
                    return;
                }

                if (standbyDatesSet.has(dateStr)) {
                    finalStandbyDays++;
                    return;
                }
            });
            
            const totalDays = finalSeaDays + finalStandbyDays + yardDays + leaveDays;

            setCalculatedSeaTime({
                totalDays,
                atSeaDays: finalSeaDays,
                standbyDays: finalStandbyDays,
                yardDays,
                leaveDays,
                isOfficer,
            });
        } catch (error) {
            console.error('[CREW PAGE] Error calculating sea time:', error);
            toast({
                title: 'Error',
                description: 'Failed to calculate sea time. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsCalculatingSeaTime(false);
        }
    };

    // Save testimonial without generating PDF
    const handleSaveTestimonial = async () => {
        if (!selectedMemberData || !currentUserProfile?.activeVesselId || !documentStartDate || !documentEndDate || !calculatedSeaTime) {
            toast({
                title: 'Error',
                description: 'Please select dates and calculate sea time first.',
                variant: 'destructive',
            });
            return;
        }

        setIsSavingTestimonial(true);
        try {
            const vessel = getVesselDetails(currentUserProfile.activeVesselId);
            if (!vessel) {
                toast({
                    title: 'Error',
                    description: 'Vessel details not found.',
                    variant: 'destructive',
                });
                return;
            }

            const startDateStr = formatDate(documentStartDate, 'yyyy-MM-dd');
            const endDateStr = formatDate(documentEndDate, 'yyyy-MM-dd');
            const calculatedTotal = calculatedSeaTime.atSeaDays + calculatedSeaTime.standbyDays + calculatedSeaTime.yardDays + calculatedSeaTime.leaveDays;
            const totalDays = calculatedTotal;
            
            // Verify access request exists in database (RLS policy requires it for vessel managers)
            const isAdmin = currentUserProfile?.role === 'admin';
            let hasApprovedAccess = false;

            if (!isAdmin) {
                const { data: accessRequest, error: accessError } = await supabase
                    .from('vessel_sea_time_access_requests')
                    .select('id, status')
                    .eq('vessel_user_id', currentUserProfile.id)
                    .eq('crew_user_id', selectedMemberData.profile.id)
                    .eq('vessel_id', currentUserProfile.activeVesselId)
                    .eq('status', 'approved')
                    .maybeSingle();

                if (accessError) {
                    console.error('[CREW PAGE] Error checking access request:', accessError);
                }

                hasApprovedAccess = !!accessRequest;
                
                if (!hasApprovedAccess) {
                    toast({
                        title: 'Permission Denied',
                        description: 'You need approved access from this crew member to save testimonials. Please request access first.',
                        variant: 'destructive',
                    });
                    setIsSavingTestimonial(false);
                    return;
                }
            } else {
                hasApprovedAccess = true;
            }

            const dataSource = hasApprovedAccess
                ? (selectedDataSource || 'crew') 
                : 'vessel';

            // Save to vessel_generated_testimonials table
            const testimonialToSave = {
                crew_user_id: selectedMemberData.profile.id,
                vessel_id: currentUserProfile.activeVesselId,
                vessel_user_id: currentUserProfile.id,
                start_date: startDateStr,
                end_date: endDateStr,
                total_days: totalDays,
                at_sea_days: calculatedSeaTime.atSeaDays,
                standby_days: calculatedSeaTime.standbyDays,
                yard_days: calculatedSeaTime.yardDays,
                leave_days: calculatedSeaTime.leaveDays,
                generated_by_name: currentUserProfile.firstName && currentUserProfile.lastName 
                    ? `${currentUserProfile.firstName} ${currentUserProfile.lastName}`
                    : currentUserProfile.email || 'Vessel Manager',
                generated_by_email: currentUserProfile.email || null,
                data_source: dataSource as 'crew' | 'vessel',
                notes: null, // No notes for vessel-generated testimonials
                pdf_format: 'seajourney', // Default format, can be changed when generating PDF later
            };

            const { data: savedTestimonial, error: saveError } = await supabase
                .from('vessel_generated_testimonials')
                .insert(testimonialToSave)
                .select()
                .single();

            if (saveError) {
                console.error('[CREW PAGE] Error saving testimonial:', {
                    message: saveError.message,
                    code: saveError.code,
                    details: saveError.details,
                    hint: saveError.hint,
                });
                
                let errorMessage = 'Failed to save testimonial. ';
                if (saveError.code === '42501' || saveError.message?.includes('permission') || saveError.message?.includes('policy')) {
                    errorMessage += 'You may not have permission to create testimonials for this crew member. Please ensure you have approved access.';
                } else if (saveError.message) {
                    errorMessage += saveError.message;
                } else {
                    errorMessage += 'Please try again.';
                }
                
                toast({
                    title: 'Error',
                    description: errorMessage,
                    variant: 'destructive',
                });
                return;
            }

            // Update crew members list with the new testimonial
            setCrewMembers(prev => prev.map(member => 
                member.profile.id === selectedMemberData.profile.id
                    ? { 
                        ...member, 
                        vesselGeneratedTestimonials: [
                            savedTestimonial as VesselGeneratedTestimonial,
                            ...(member.vesselGeneratedTestimonials || [])
                        ]
                    }
                    : member
            ));

            toast({
                title: 'Success',
                description: 'Testimonial saved successfully. You can generate PDFs from the table below.',
            });

            // Reset form
            setDocumentStartDate(undefined);
            setDocumentEndDate(undefined);
            setCalculatedSeaTime(null);
            setSelectedDataSource(null);
        } catch (error: any) {
            console.error('[CREW PAGE] Error saving testimonial:', error);
            toast({
                title: 'Error',
                description: error?.message || 'Failed to save testimonial. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsSavingTestimonial(false);
        }
    };

    // Generate PDF from calculated sea time
    const handleGenerateFromDateRange = async (pdfFormat: TestimonialPDFFormat = 'seajourney') => {
        if (!selectedMemberData || !currentUserProfile?.activeVesselId || !documentStartDate || !documentEndDate || !calculatedSeaTime) {
            toast({
                title: 'Error',
                description: 'Please select dates and calculate sea time first.',
                variant: 'destructive',
            });
            return;
        }

        setGeneratingPDF('date-range');
        try {
            const vessel = getVesselDetails(currentUserProfile.activeVesselId);
            if (!vessel) {
                toast({
                    title: 'Error',
                    description: 'Vessel details not found.',
                    variant: 'destructive',
                });
                return;
            }

            const startDateStr = formatDate(documentStartDate, 'yyyy-MM-dd');
            const endDateStr = formatDate(documentEndDate, 'yyyy-MM-dd');
            const calculatedTotal = calculatedSeaTime.atSeaDays + calculatedSeaTime.standbyDays + calculatedSeaTime.yardDays + calculatedSeaTime.leaveDays;
            const totalDays = calculatedTotal;
            
            // Verify access request exists in database (RLS policy requires it for vessel managers)
            // Admins can bypass this check as they have permission to create any testimonial
            const isAdmin = currentUserProfile?.role === 'admin';
            let hasApprovedAccess = false;

            if (!isAdmin) {
                // Always check database to ensure we have the latest status
                const { data: accessRequest, error: accessError } = await supabase
                    .from('vessel_sea_time_access_requests')
                    .select('id, status')
                    .eq('vessel_user_id', currentUserProfile.id)
                    .eq('crew_user_id', selectedMemberData.profile.id)
                    .eq('vessel_id', currentUserProfile.activeVesselId)
                    .eq('status', 'approved')
                    .maybeSingle();

                if (accessError) {
                    console.error('[CREW PAGE] Error checking access request:', accessError);
                }

                hasApprovedAccess = !!accessRequest;
                
                if (!hasApprovedAccess) {
                    console.error('[CREW PAGE] No approved access request found:', {
                        accessError,
                        accessRequest,
                        vesselUserId: currentUserProfile.id,
                        crewUserId: selectedMemberData.profile.id,
                        vesselId: currentUserProfile.activeVesselId,
                    });
                    toast({
                        title: 'Permission Denied',
                        description: 'You need approved access from this crew member to generate testimonials. Please request access first.',
                        variant: 'destructive',
                    });
                    setGeneratingPDF(null);
                    return;
                }
            } else {
                // Admins can use either data source
                hasApprovedAccess = true;
            }

            const dataSource = hasApprovedAccess
                ? (selectedDataSource || 'crew') 
                : 'vessel';

            // Save to vessel_generated_testimonials table (separate from main testimonials table)
            const testimonialToSave = {
                crew_user_id: selectedMemberData.profile.id,
                vessel_id: currentUserProfile.activeVesselId,
                vessel_user_id: currentUserProfile.id,
                start_date: startDateStr,
                end_date: endDateStr,
                total_days: totalDays,
                at_sea_days: calculatedSeaTime.atSeaDays,
                standby_days: calculatedSeaTime.standbyDays,
                yard_days: calculatedSeaTime.yardDays,
                leave_days: calculatedSeaTime.leaveDays,
                generated_by_name: currentUserProfile.firstName && currentUserProfile.lastName 
                    ? `${currentUserProfile.firstName} ${currentUserProfile.lastName}`
                    : currentUserProfile.email || 'Vessel Manager',
                generated_by_email: currentUserProfile.email || null,
                data_source: dataSource as 'crew' | 'vessel',
                notes: null, // No notes for vessel-generated testimonials
                pdf_format: pdfFormat,
            };

            // Insert into vessel_generated_testimonials table
            console.log('[CREW PAGE] Inserting vessel generated testimonial with data:', {
                crew_user_id: testimonialToSave.crew_user_id,
                vessel_id: testimonialToSave.vessel_id,
                vessel_user_id: testimonialToSave.vessel_user_id,
                start_date: testimonialToSave.start_date,
                end_date: testimonialToSave.end_date,
                data_source: testimonialToSave.data_source,
                pdf_format: testimonialToSave.pdf_format,
                hasApprovedAccess,
            });

            const { data: savedTestimonial, error: saveError } = await supabase
                .from('vessel_generated_testimonials')
                .insert(testimonialToSave)
                .select()
                .single();

            if (saveError) {
                console.error('[CREW PAGE] Error saving vessel generated testimonial:', {
                    message: saveError.message,
                    code: saveError.code,
                    details: saveError.details,
                    hint: saveError.hint,
                    fullError: JSON.stringify(saveError, Object.getOwnPropertyNames(saveError)),
                });
                
                // Provide user-friendly error message
                let errorMessage = 'Failed to save testimonial. ';
                if (saveError.code === '42501' || saveError.message?.includes('permission') || saveError.message?.includes('policy')) {
                    errorMessage += 'You may not have permission to create testimonials for this crew member. Please ensure you have approved access.';
                } else if (saveError.message) {
                    errorMessage += saveError.message;
                } else {
                    errorMessage += 'Please try again.';
                }
                
                toast({
                    title: 'Error',
                    description: errorMessage,
                    variant: 'destructive',
                });
                throw saveError;
            }

            // Update crew members list with the new testimonial
            setCrewMembers(prev => prev.map(member => 
                member.profile.id === selectedMemberData.profile.id
                    ? { 
                        ...member, 
                        vesselGeneratedTestimonials: [
                            savedTestimonial as VesselGeneratedTestimonial,
                            ...(member.vesselGeneratedTestimonials || [])
                        ]
                    }
                    : member
            ));

            // Now generate PDF from the saved testimonial
            await handleGenerateVesselTestimonialPDF(savedTestimonial as VesselGeneratedTestimonial, pdfFormat);

            toast({
                title: 'Success',
                description: 'PDF generated successfully and saved to testimonials.',
            });
        } catch (error: any) {
            console.error('[CREW PAGE] Error generating PDF:', error);
            toast({
                title: 'Error',
                description: error?.message || 'Failed to generate PDF. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setGeneratingPDF(null);
        }
    };

    // Send testimonial to captain for approval
    const handleSendToCaptain = async () => {
        if (!selectedMemberData || !currentUserProfile?.activeVesselId || !documentStartDate || !documentEndDate || !calculatedSeaTime || !activeCaptain) {
            toast({
                title: 'Error',
                description: 'Please select dates, calculate sea time, and ensure a captain is available.',
                variant: 'destructive',
            });
            return;
        }

        setIsSendingToCaptain(true);
        try {
            const vessel = getVesselDetails(currentUserProfile.activeVesselId);
            if (!vessel) {
                toast({
                    title: 'Error',
                    description: 'Vessel details not found.',
                    variant: 'destructive',
                });
                return;
            }

            const startDateStr = formatDate(documentStartDate, 'yyyy-MM-dd');
            const endDateStr = formatDate(documentEndDate, 'yyyy-MM-dd');
            const calculatedTotal = calculatedSeaTime.atSeaDays + calculatedSeaTime.standbyDays + calculatedSeaTime.yardDays + calculatedSeaTime.leaveDays;
            const totalDays = calculatedTotal;
            
            const dataSource = selectedMemberData.accessRequest?.status === 'approved' 
                ? (selectedDataSource || 'crew') 
                : 'vessel';

            const testimonialData = {
                user_id: selectedMemberData.profile.id,
                vessel_id: currentUserProfile.activeVesselId,
                start_date: startDateStr,
                end_date: endDateStr,
                total_days: totalDays,
                at_sea_days: calculatedSeaTime.atSeaDays,
                standby_days: calculatedSeaTime.standbyDays,
                yard_days: calculatedSeaTime.yardDays,
                leave_days: calculatedSeaTime.leaveDays,
                status: 'pending_captain' as const,
                captain_user_id: activeCaptain.id,
                captain_email: null,
                captain_name: null,
                captain_position: null,
                captain_signature: null,
                captain_comment_conduct: null,
                captain_comment_ability: null,
                captain_comment_general: null,
                official_body: null,
                official_reference: null,
                notes: `Generated by vessel manager on ${formatDate(new Date(), 'dd MMMM yyyy')}. Awaiting captain approval.`,
                testimonial_code: null,
                data_source: dataSource as 'crew' | 'vessel',
            };

            const { data: createdTestimonial, error: createError } = await supabase
                .from('testimonials')
                .insert(testimonialData)
                .select()
                .single();

            if (createError) {
                throw createError;
            }

            setCrewMembers(prev => prev.map(member => 
                member.profile.id === selectedMemberData.profile.id
                    ? { 
                        ...member, 
                        testimonials: [
                            createdTestimonial as Testimonial,
                            ...(member.testimonials || [])
                        ]
                    }
                    : member
            ));

            toast({
                title: 'Sent to Captain',
                description: `Testimonial request has been sent to ${activeCaptain.name}'s inbox. Once approved, it will receive a verification code (SJ-XXX) and appear in the testimonials list.`,
            });

            setDocumentStartDate(undefined);
            setDocumentEndDate(undefined);
            setCalculatedSeaTime(null);
            setShowGenerateForm(false);
        } catch (error: any) {
            console.error('[CREW PAGE] Error sending to captain:', error);
            toast({
                title: 'Error',
                description: error?.message || 'Failed to send testimonial to captain. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsSendingToCaptain(false);
        }
    };

    // Handler for going back to crew list
    const handleBackToCrewList = () => {
        setSelectedCrewMemberId(null);
        setIsLeavePeriodDialogOpen(false);
        setLeavePeriodStartDate(undefined);
        setLeavePeriodEndDate(undefined);
        setLeavePeriodNotes('');
        setShowGenerateForm(false);
        setDocumentStartDate(undefined);
        setDocumentEndDate(undefined);
        setCalculatedSeaTime(null);
        setSelectedDataSource(null);
    };

    // Handler for saving leave period
    const handleSaveLeavePeriod = async () => {
        if (!selectedCrewMemberId || !leavePeriodStartDate || !leavePeriodEndDate || !currentUserProfile?.activeVesselId || !user?.id) {
            toast({
                title: 'Error',
                description: 'Please select both start and end dates.',
                variant: 'destructive',
            });
            return;
        }

        if (leavePeriodEndDate < leavePeriodStartDate) {
            toast({
                title: 'Error',
                description: 'End date must be after start date.',
                variant: 'destructive',
            });
            return;
        }

        setIsSavingLeavePeriod(true);
        try {
            const response = await fetch('/api/crew-leave-periods', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    crewUserId: selectedCrewMemberId,
                    vesselId: currentUserProfile.activeVesselId,
                    vesselUserId: user.id,
                    startDate: format(leavePeriodStartDate, 'yyyy-MM-dd'),
                    endDate: format(leavePeriodEndDate, 'yyyy-MM-dd'),
                    notes: leavePeriodNotes || null,
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to save leave period');
            }

            toast({
                title: 'Success',
                description: 'Leave period has been logged.',
            });

            // Refresh leave periods
            const refreshResponse = await fetch(
                `/api/crew-leave-periods?crewUserId=${selectedCrewMemberId}&vesselId=${currentUserProfile.activeVesselId}`
            );
            if (refreshResponse.ok) {
                const { leavePeriods } = await refreshResponse.json();
                setCrewMembers(prev => prev.map(m => 
                    m.profile.id === selectedCrewMemberId
                        ? { ...m, leavePeriods }
                        : m
                ));
            }

            // Reset form
            setLeavePeriodStartDate(undefined);
            setLeavePeriodEndDate(undefined);
            setLeavePeriodNotes('');
        } catch (error: any) {
            console.error('[CREW PAGE] Error saving leave period:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to save leave period. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsSavingLeavePeriod(false);
        }
    };

    // Handler for deleting leave period
    const handleDeleteLeavePeriod = async (leavePeriodId: string) => {
        if (!selectedCrewMemberId || !currentUserProfile?.activeVesselId) return;

        setIsDeletingLeavePeriod(leavePeriodId);
        try {
            const response = await fetch(`/api/crew-leave-periods/${leavePeriodId}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const result = await response.json();
                throw new Error(result.error || 'Failed to delete leave period');
            }

            toast({
                title: 'Success',
                description: 'Leave period has been deleted.',
            });

            // Refresh leave periods
            const refreshResponse = await fetch(
                `/api/crew-leave-periods?crewUserId=${selectedCrewMemberId}&vesselId=${currentUserProfile.activeVesselId}`
            );
            if (refreshResponse.ok) {
                const { leavePeriods } = await refreshResponse.json();
                setCrewMembers(prev => prev.map(m => 
                    m.profile.id === selectedCrewMemberId
                        ? { ...m, leavePeriods }
                        : m
                ));
            }
        } catch (error: any) {
            console.error('[CREW PAGE] Error deleting leave period:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to delete leave period. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsDeletingLeavePeriod(null);
        }
    };

    // Handler for inviting crew members
    const handleInviteCrew = async (data: InviteCrewFormValues) => {
        if (!currentUserProfile?.activeVesselId || !allVessels) {
            toast({
                title: 'Error',
                description: 'No active vessel found. Please select a vessel first.',
                variant: 'destructive',
            });
            return;
        }

        const activeVessel = allVessels.find(v => v.id === currentUserProfile.activeVesselId);
        if (!activeVessel) {
            toast({
                title: 'Error',
                description: 'Active vessel not found.',
                variant: 'destructive',
            });
            return;
        }

        setIsInviting(true);
        try {
            const response = await fetch('/api/users/invite-crew', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName: data.firstName,
                    lastName: data.lastName,
                    email: data.email,
                    vesselId: currentUserProfile.activeVesselId,
                    vesselName: activeVessel.name,
                    vesselUserId: currentUserProfile.id, // Pass vessel user ID for crew limit check
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                console.error('[CREW PAGE] API error response:', result);
                // Use the message field if available (for crew limit errors), otherwise fall back to error/details
                const errorMessage = result.message 
                    ? result.message
                    : result.details 
                    ? `${result.error}: ${result.details}`
                    : result.error || 'Failed to invite crew member';
                throw new Error(errorMessage);
            }

            toast({
                title: 'Invitation Sent',
                description: `An invitation email has been sent to ${data.email}. They will receive instructions to set up their password.`,
            });

            inviteForm.reset();
            setIsInviteDialogOpen(false);
            
            // Refresh crew list after a short delay
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } catch (error: any) {
            console.error('[CREW PAGE] Error inviting crew member:', error);
            console.error('[CREW PAGE] Error details:', {
                message: error.message,
                name: error.name,
                stack: error.stack,
            });
            toast({
                title: 'Error',
                description: error.message || 'Failed to invite crew member. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsInviting(false);
        }
    };
    
    // Calculate summary statistics for vessel managers
    const totalCrew = useMemo(() => crewMembers.length, [crewMembers.length]);
    const totalOnboard = useMemo(() => {
        return crewMembers.filter(member => member.assignment.onboard === true).length;
    }, [crewMembers]);
    
    console.log('[CREW PAGE] Render state:', {
        isLoading,
        isLoadingProfile,
        isLoadingAssignments,
        crewMembersCount: crewMembers.length,
        filteredCrewMembersCount: filteredCrewMembers.length,
        hasActiveVessel: !!currentUserProfile?.activeVesselId,
        activeVesselId: currentUserProfile?.activeVesselId,
        isAuthorized,
        role: currentUserProfile?.role,
        subscriptionTier: currentUserProfile?.subscriptionTier,
        subscriptionStatus: currentUserProfile?.subscriptionStatus,
        crewLimit: crewLimit,
        shouldShowWarning: currentUserProfile?.role === 'vessel' && crewLimit !== Infinity && crewMembers.length > crewLimit
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

    // Show focused view if crew member is selected (for vessel managers only)
    if (selectedMemberData && currentUserProfile?.role === 'vessel') {
        const fullName = `${selectedMemberData.profile.firstName || ''} ${selectedMemberData.profile.lastName || ''}`.trim() || selectedMemberData.profile.username;
        
        return (
            <div className="flex flex-col gap-6">
                <Card className="rounded-xl border">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <Avatar className="h-12 w-12">
                                    <AvatarImage src={selectedMemberData.profile.profilePicture} alt={fullName} />
                                    <AvatarFallback className="bg-primary/20">
                                        {getInitials(fullName) || <UserIcon />}
                                    </AvatarFallback>
                                </Avatar>
                                <div>
                                    <CardTitle>{fullName}</CardTitle>
                                    <CardDescription>
                                        {selectedMemberData.profile.email}
                                        {selectedMemberData.assignment.position && ` • ${selectedMemberData.assignment.position}`}
                                    </CardDescription>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                onClick={handleBackToCrewList}
                                className="flex items-center gap-2 rounded-xl"
                            >
                                <Users className="h-4 w-4" />
                                Back to Crew List
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {/* Sea Time Summary Section - Only show if access is approved */}
                        {selectedMemberData.accessRequest?.status === 'approved' && (
                            <div className="mb-6 pb-6 border-b">
                                <h3 className="text-sm font-medium text-muted-foreground mb-3">Sea Time Summary</h3>
                                
                                {loadingSeaTime.has(selectedMemberData.profile.id) ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                        <span className="ml-2 text-muted-foreground">Loading sea time data...</span>
                                    </div>
                                ) : selectedMemberData.seaTimeData ? (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <Card className="p-3">
                                            <div className="text-xs text-muted-foreground mb-1">Total Days</div>
                                            <div className="text-xl font-bold">{selectedMemberData.seaTimeData.totalDays}</div>
                                        </Card>
                                        <Card className="p-3 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                                            <div className="text-xs text-muted-foreground mb-1">At Sea Days</div>
                                            <div className="text-xl font-bold text-blue-600 dark:text-blue-400">{selectedMemberData.seaTimeData.atSeaDays}</div>
                                        </Card>
                                        <Card className="p-3 border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
                                            <div className="text-xs text-muted-foreground mb-1">Standby Days</div>
                                            <div className="text-xl font-bold text-purple-600 dark:text-purple-400">{selectedMemberData.seaTimeData.standbyDays}</div>
                                        </Card>
                                        <Card className="p-3">
                                            <div className="text-xs text-muted-foreground mb-1">Underway Days</div>
                                            <div className="text-xl font-bold">{selectedMemberData.seaTimeData.underwayDays}</div>
                                        </Card>
                                        <Card className="p-3">
                                            <div className="text-xs text-muted-foreground mb-1">At Anchor Days</div>
                                            <div className="text-xl font-bold">{selectedMemberData.seaTimeData.atAnchorDays}</div>
                                        </Card>
                                        <Card className="p-3">
                                            <div className="text-xs text-muted-foreground mb-1">In Port Days</div>
                                            <div className="text-xl font-bold">{selectedMemberData.seaTimeData.inPortDays}</div>
                                        </Card>
                                        <Card className="p-3">
                                            <div className="text-xs text-muted-foreground mb-1">On Leave Days</div>
                                            <div className="text-xl font-bold">{selectedMemberData.seaTimeData.onLeaveDays}</div>
                                        </Card>
                                        <Card className="p-3">
                                            <div className="text-xs text-muted-foreground mb-1">In Yard Days</div>
                                            <div className="text-xl font-bold">{selectedMemberData.seaTimeData.inYardDays}</div>
                                        </Card>
                                    </div>
                                ) : (
                                    <div className="text-sm text-muted-foreground text-center py-8 border rounded-lg bg-muted/20">
                                        No sea time data available
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* Tabs for Leave Periods and Documents */}
                        <Tabs defaultValue="documents" className="w-full">
                            <TabsList className="grid w-full grid-cols-2 rounded-xl mb-6">
                                <TabsTrigger value="documents" className="rounded-lg" disabled={!hasProTier}>
                                    <FileText className="mr-2 h-4 w-4" />
                                    Documents
                                </TabsTrigger>
                                <TabsTrigger value="leave" className="rounded-lg">
                                    <CalendarDays className="mr-2 h-4 w-4" />
                                    Leave Periods
                                </TabsTrigger>
                            </TabsList>
                            
                            {/* Leave Periods Tab */}
                            <TabsContent value="leave" className="space-y-4 mt-0">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-lg font-semibold">Leave Periods</h3>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Track leave periods to exclude them from sea time calculations.
                                        </p>
                                    </div>
                                    <Button
                                        onClick={() => setIsLeavePeriodDialogOpen(true)}
                                        className="rounded-xl"
                                    >
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add Leave Period
                                    </Button>
                                </div>
                                
                                {/* Leave Periods from Crew Member's Logs (if access granted) */}
                                {selectedMemberData.accessRequest?.status === 'approved' && 
                                 selectedMemberData.leavePeriodsFromLogs && 
                                 selectedMemberData.leavePeriodsFromLogs.length > 0 && (
                                    <div className="space-y-3 mb-6">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Badge variant="outline" className="text-xs">
                                                <CalendarDays className="mr-1 h-3 w-3" />
                                                From Crew Member's Logs
                                            </Badge>
                                        </div>
                                        <div className="grid gap-3">
                                            {selectedMemberData.leavePeriodsFromLogs.map((period, index) => {
                                                const startDate = parse(period.startDate, 'yyyy-MM-dd', new Date());
                                                const endDate = parse(period.endDate, 'yyyy-MM-dd', new Date());
                                                const days = eachDayOfInterval({ start: startDate, end: endDate }).length;
                                                
                                                return (
                                                    <Card key={`log-${index}`} className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                                                        <CardContent className="p-4">
                                                            <div className="flex items-start justify-between">
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <CalendarDays className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                                        <span className="font-semibold">
                                                                            {format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')}
                                                                        </span>
                                                                        <Badge variant="outline" className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700">
                                                                            Auto-detected
                                                                        </Badge>
                                                                    </div>
                                                                    <div className="text-sm text-muted-foreground ml-6">
                                                                        {days} {days === 1 ? 'day' : 'days'}
                                                                        {period.notes && ` • ${period.notes}`}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                
                                {/* Manually Logged Leave Periods */}
                                {selectedMemberData.leavePeriods && selectedMemberData.leavePeriods.length > 0 ? (
                                    <div className="space-y-3">
                                        {(selectedMemberData.accessRequest?.status === 'approved' && 
                                          selectedMemberData.leavePeriodsFromLogs && 
                                          selectedMemberData.leavePeriodsFromLogs.length > 0) && (
                                            <div className="flex items-center gap-2 mb-2">
                                                <Badge variant="outline" className="text-xs">
                                                    Manually Logged
                                                </Badge>
                                            </div>
                                        )}
                                        <div className="grid gap-3">
                                            {selectedMemberData.leavePeriods.map((period) => {
                                                const startDate = parse(period.startDate, 'yyyy-MM-dd', new Date());
                                                const endDate = parse(period.endDate, 'yyyy-MM-dd', new Date());
                                                const days = eachDayOfInterval({ start: startDate, end: endDate }).length;
                                                
                                                return (
                                                    <Card key={period.id} className="hover:shadow-md transition-shadow">
                                                        <CardContent className="p-4">
                                                            <div className="flex items-start justify-between">
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                                                                        <span className="font-semibold">
                                                                            {format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')}
                                                                        </span>
                                                                    </div>
                                                                    <div className="text-sm text-muted-foreground ml-6">
                                                                        {days} {days === 1 ? 'day' : 'days'}
                                                                        {period.notes && ` • ${period.notes}`}
                                                                    </div>
                                                                </div>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => handleDeleteLeavePeriod(period.id)}
                                                                    disabled={isDeletingLeavePeriod === period.id}
                                                                    className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
                                                                >
                                                                    {isDeletingLeavePeriod === period.id ? (
                                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                                    ) : (
                                                                        <X className="h-4 w-4" />
                                                                    )}
                                                                </Button>
                                                            </div>
                                                        </CardContent>
                                                    </Card>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    (!selectedMemberData.leavePeriodsFromLogs || selectedMemberData.leavePeriodsFromLogs.length === 0) && (
                                        <Card className="border-dashed">
                                            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                                <CalendarDays className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                                                <h4 className="font-semibold mb-2">No Leave Periods</h4>
                                                <p className="text-sm text-muted-foreground mb-4">
                                                    No leave periods have been logged yet.
                                                </p>
                                                <Button
                                                    onClick={() => setIsLeavePeriodDialogOpen(true)}
                                                    className="rounded-xl"
                                                >
                                                    <Plus className="mr-2 h-4 w-4" />
                                                    Add Leave Period
                                                </Button>
                                            </CardContent>
                                        </Card>
                                    )
                                )}
                            </TabsContent>
                            
                            {/* Documents Tab */}
                            <TabsContent value="documents" className="space-y-4 mt-0">
                                {hasProTier ? (
                                    <>
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <h3 className="text-lg font-semibold">Document Generation</h3>
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    Generate PDF documents on behalf of this crew member.
                                                </p>
                                            </div>
                                            <Button
                                                variant={showGenerateForm ? "outline" : "default"}
                                                onClick={() => {
                                                    setShowGenerateForm(!showGenerateForm);
                                                    if (showGenerateForm) {
                                                        setDocumentStartDate(undefined);
                                                        setDocumentEndDate(undefined);
                                                        setCalculatedSeaTime(null);
                                                    }
                                                }}
                                                className="rounded-xl"
                                            >
                                                {showGenerateForm ? (
                                                    <>
                                                        <X className="mr-2 h-4 w-4" />
                                                        Cancel
                                                    </>
                                                ) : (
                                                    <>
                                                        <Plus className="mr-2 h-4 w-4" />
                                                        New Document
                                                    </>
                                                )}
                                            </Button>
                                        </div>

                                        {/* MCA Information Warning */}
                                        {!isMCAInfoComplete && (
                                            <Alert className="border-orange-500/50 bg-orange-50 dark:bg-orange-950/20">
                                                <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                                                <AlertTitle className="text-orange-900 dark:text-orange-100">MCA Information Required</AlertTitle>
                                                <AlertDescription className="text-orange-800 dark:text-orange-200">
                                                    {selectedMemberData.profile.firstName || selectedMemberData.profile.username} needs to complete their MCA application details in their profile to generate MCA documents. 
                                                    Please ask them to fill out their MCA information on their profile page.
                                                </AlertDescription>
                                            </Alert>
                                        )}

                                        {/* Existing Vessel-Generated Testimonials */}
                                        {isLoadingTestimonials ? (
                                            <div className="flex items-center justify-center py-12">
                                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                            </div>
                                        ) : selectedMemberData.vesselGeneratedTestimonials && selectedMemberData.vesselGeneratedTestimonials.length > 0 ? (
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="font-semibold">Generated Documents</h4>
                                                    <Badge variant="outline" className="text-xs">
                                                        {selectedMemberData.vesselGeneratedTestimonials.length} document{selectedMemberData.vesselGeneratedTestimonials.length !== 1 ? 's' : ''}
                                                    </Badge>
                                                </div>
                                                <div className="grid gap-3">
                                                    {selectedMemberData.vesselGeneratedTestimonials.map((testimonial) => {
                                                        const startDate = formatDate(new Date(testimonial.start_date), 'MMM dd, yyyy');
                                                        const endDate = formatDate(new Date(testimonial.end_date), 'MMM dd, yyyy');
                                                        
                                                        return (
                                                            <Card key={testimonial.id} className="hover:shadow-md transition-shadow">
                                                                <CardContent className="p-4">
                                                                    <div className="flex items-start justify-between">
                                                                        <div className="flex-1 space-y-2">
                                                                            <div className="flex items-center gap-2">
                                                                                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                                                                                <span className="font-semibold text-sm">
                                                                                    {startDate} - {endDate}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                <Badge variant="outline" className="text-xs border-blue-500 text-blue-700 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400">
                                                                                    {testimonial.data_source === 'crew' ? 'Crew Logs' : 'Vessel Logs'}
                                                                                </Badge>
                                                                                <Badge variant="outline" className="text-xs">
                                                                                    {testimonial.pdf_format === 'mca' ? 'MCA' : 'SeaJourney'}
                                                                                </Badge>
                                                                                <span className="text-sm text-muted-foreground">
                                                                                    {testimonial.total_days} days
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <Select
                                                                                onValueChange={(format) => handleGenerateVesselTestimonialPDF(testimonial, format as TestimonialPDFFormat)}
                                                                                disabled={generatingPDF === testimonial.id || deletingTestimonial === testimonial.id}
                                                                                defaultValue={testimonial.pdf_format}
                                                                            >
                                                                                <SelectTrigger className="w-[140px] rounded-xl">
                                                                                    <SelectValue placeholder="Format" />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    <SelectItem value="seajourney">SeaJourney</SelectItem>
                                                                                    <SelectItem value="mca">MCA</SelectItem>
                                                                                </SelectContent>
                                                                            </Select>
                                                                            {generatingPDF === testimonial.id && (
                                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                                            )}
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                onClick={() => {
                                                                                    setSendToCaptainDocId(testimonial.id);
                                                                                    setSendToCaptainEmail('');
                                                                                    setSendToCaptainDialogOpen(true);
                                                                                }}
                                                                                disabled={generatingPDF === testimonial.id || deletingTestimonial === testimonial.id}
                                                                                className="rounded-lg"
                                                                                title="Send to captain (one-time link)"
                                                                            >
                                                                                <Send className="h-4 w-4" />
                                                                            </Button>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                onClick={() => handleDeleteVesselTestimonial(testimonial.id)}
                                                                                disabled={deletingTestimonial === testimonial.id || generatingPDF === testimonial.id}
                                                                                className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
                                                                            >
                                                                                {deletingTestimonial === testimonial.id ? (
                                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                                ) : (
                                                                                    <Trash2 className="h-4 w-4" />
                                                                                )}
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                </CardContent>
                                                            </Card>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ) : (
                                            <Card className="border-dashed">
                                                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                                    <FileText className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                                                    <h4 className="font-semibold mb-2">No Documents Generated</h4>
                                                    <p className="text-sm text-muted-foreground mb-4">
                                                        No documents have been generated for this crew member yet.
                                                    </p>
                                                </CardContent>
                                            </Card>
                                        )}

                                        {/* Generate New Document Form */}
                                        {showGenerateForm && (
                                            <Card className="mt-6 border-2 border-dashed">
                                                <CardHeader>
                                                    <CardTitle className="text-lg">Create New Document</CardTitle>
                                                    <CardDescription>
                                                        {selectedMemberData.accessRequest?.status === 'approved' ? (
                                                            <>Select a date range and choose a data source to generate a document. You can use either the crew member's individual logs (includes watch days for officers) or vessel logs.</>
                                                        ) : (
                                                            <>Select a date range and generate a document using vessel state logs. <span className="text-orange-600 dark:text-orange-400 font-medium">Request access to use their individual logs with watch days.</span></>
                                                        )}
                                                    </CardDescription>
                                                </CardHeader>
                                                <CardContent className="space-y-6">
                                                    {/* Quick Select: Periods Between Leave */}
                                                    {availablePeriodsBetweenLeave.length > 0 && (
                                                        <div className="space-y-3">
                                                            <Label className="text-sm font-medium">Quick Select: Periods Between Leave</Label>
                                                            <div className="flex flex-wrap gap-2">
                                                                {availablePeriodsBetweenLeave.map((period, index) => (
                                                                    <Button
                                                                        key={index}
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => {
                                                                            setDocumentStartDate(period.startDate);
                                                                            setDocumentEndDate(period.endDate);
                                                                        }}
                                                                        className="rounded-xl text-xs h-auto py-2 px-3 whitespace-normal hover:bg-primary hover:text-primary-foreground"
                                                                    >
                                                                        {period.label}
                                                                    </Button>
                                                                ))}
                                                            </div>
                                                            <p className="text-xs text-muted-foreground">
                                                                Click a period above to automatically select the date range excluding leave periods.
                                                            </p>
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <Label className="text-sm font-medium">Start Date</Label>
                                                            <Popover>
                                                                <PopoverTrigger asChild>
                                                                    <Button
                                                                        variant="outline"
                                                                        className={cn(
                                                                            "w-full justify-start text-left font-normal rounded-xl h-11",
                                                                            !documentStartDate && "text-muted-foreground"
                                                                        )}
                                                                    >
                                                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                                                        {documentStartDate ? formatDate(documentStartDate, 'PPP') : 'Select start date'}
                                                                    </Button>
                                                                </PopoverTrigger>
                                                                <PopoverContent className="w-auto p-0" align="start">
                                                                    <CalendarComponent
                                                                        mode="single"
                                                                        selected={documentStartDate}
                                                                        onSelect={setDocumentStartDate}
                                                                        initialFocus
                                                                    />
                                                                </PopoverContent>
                                                            </Popover>
                                                        </div>
                                                        
                                                        <div className="space-y-2">
                                                            <Label className="text-sm font-medium">End Date</Label>
                                                            <Popover>
                                                                <PopoverTrigger asChild>
                                                                    <Button
                                                                        variant="outline"
                                                                        className={cn(
                                                                            "w-full justify-start text-left font-normal rounded-xl h-11",
                                                                            !documentEndDate && "text-muted-foreground"
                                                                        )}
                                                                    >
                                                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                                                        {documentEndDate ? formatDate(documentEndDate, 'PPP') : 'Select end date'}
                                                                    </Button>
                                                                </PopoverTrigger>
                                                                <PopoverContent className="w-auto p-0" align="start">
                                                                    <CalendarComponent
                                                                        mode="single"
                                                                        selected={documentEndDate}
                                                                        onSelect={setDocumentEndDate}
                                                                        initialFocus
                                                                    />
                                                                </PopoverContent>
                                                            </Popover>
                                                        </div>
                                                    </div>

                                                    {/* Data Source Selection (only if access approved) */}
                                                    {selectedMemberData.accessRequest?.status === 'approved' && (
                                                        <div className="space-y-2">
                                                            <Label className="text-sm font-medium">Data Source</Label>
                                                            <Select
                                                                value={selectedDataSource || 'crew'}
                                                                onValueChange={(value) => setSelectedDataSource(value as 'crew' | 'vessel')}
                                                            >
                                                                <SelectTrigger className="rounded-xl h-11">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="crew">Crew Member's Logs</SelectItem>
                                                                    <SelectItem value="vessel">Vessel Logs</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                            <p className="text-xs text-muted-foreground">
                                                                Crew member's logs include watch days for officers. Vessel logs use the vessel's general state logs.
                                                            </p>
                                                        </div>
                                                    )}

                                                    {/* Calculate Sea Time Button */}
                                                    <Button
                                                        onClick={handleCalculateSeaTime}
                                                        disabled={!documentStartDate || !documentEndDate || isCalculatingSeaTime}
                                                        className="w-full rounded-xl h-11"
                                                        size="lg"
                                                    >
                                                        {isCalculatingSeaTime ? (
                                                            <>
                                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                                Calculating...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Clock className="mr-2 h-4 w-4" />
                                                                Calculate Sea Time
                                                            </>
                                                        )}
                                                    </Button>

                                                    {/* Calculated Sea Time Results */}
                                                    {calculatedSeaTime && (
                                                        <Card className="bg-muted/50 border-2">
                                                            <CardHeader>
                                                                <CardTitle className="text-base">Calculated Sea Time</CardTitle>
                                                            </CardHeader>
                                                            <CardContent className="space-y-4">
                                                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                                                    <div className="space-y-1">
                                                                        <div className="text-xs text-muted-foreground">Total Days</div>
                                                                        <div className="text-2xl font-bold">{calculatedSeaTime.totalDays}</div>
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <div className="text-xs text-muted-foreground">At Sea Days</div>
                                                                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{calculatedSeaTime.atSeaDays}</div>
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <div className="text-xs text-muted-foreground">Standby Days</div>
                                                                        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{calculatedSeaTime.standbyDays}</div>
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <div className="text-xs text-muted-foreground">Yard Days</div>
                                                                        <div className="text-2xl font-bold">{calculatedSeaTime.yardDays}</div>
                                                                    </div>
                                                                    <div className="space-y-1">
                                                                        <div className="text-xs text-muted-foreground">Leave Days</div>
                                                                        <div className="text-2xl font-bold">{calculatedSeaTime.leaveDays}</div>
                                                                    </div>
                                                                </div>

                                                                {/* Action Buttons */}
                                                                <Separator />
                                                                <div className="flex flex-wrap gap-2">
                                                                    <Button
                                                                        onClick={handleSaveTestimonial}
                                                                        disabled={isSavingTestimonial || generatingPDF === 'date-range'}
                                                                        variant="outline"
                                                                        className="rounded-xl"
                                                                    >
                                                                        {isSavingTestimonial ? (
                                                                            <>
                                                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                                                Saving...
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <FileText className="mr-2 h-4 w-4" />
                                                                                Save Document
                                                                            </>
                                                                        )}
                                                                    </Button>

                                                                    <Select
                                                                        onValueChange={(format) => handleGenerateFromDateRange(format as TestimonialPDFFormat)}
                                                                        disabled={generatingPDF === 'date-range' || isSavingTestimonial}
                                                                    >
                                                                        <SelectTrigger className="w-[160px] rounded-xl">
                                                                            <SelectValue placeholder="Generate PDF" />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            <SelectItem value="seajourney">SeaJourney PDF</SelectItem>
                                                                            <SelectItem value="mca">MCA PDF</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                    
                                                                    {activeCaptain && (
                                                                        <Button
                                                                            onClick={handleSendToCaptain}
                                                                            disabled={isSendingToCaptain}
                                                                            className="rounded-xl"
                                                                        >
                                                                            {isSendingToCaptain ? (
                                                                                <>
                                                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                                                    Sending...
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                                                                    Send to Captain
                                                                                </>
                                                                            )}
                                                                        </Button>
                                                                    )}
                                                                    
                                                                    {generatingPDF === 'date-range' && (
                                                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                                            Generating PDF...
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </CardContent>
                                                        </Card>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        )}
                                    </>
                                ) : (
                                    <Card className="border-dashed">
                                        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                            <FileText className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                                            <h4 className="font-semibold mb-2">Pro Tier Required</h4>
                                            <p className="text-sm text-muted-foreground">
                                                Document generation is available for Pro tier subscribers.
                                            </p>
                                        </CardContent>
                                    </Card>
                                )}
                            </TabsContent>
                        </Tabs>
                    </CardContent>
                </Card>

                {/* Send document to captain (one-time link) */}
                <Dialog open={sendToCaptainDialogOpen} onOpenChange={(open) => { setSendToCaptainDialogOpen(open); if (!open) setSendToCaptainDocId(null); }}>
                    <DialogContent className="rounded-xl max-w-md">
                        <DialogHeader>
                            <DialogTitle>Send to Captain</DialogTitle>
                            <DialogDescription>
                                Enter the captain’s email. They will receive a one-time link to view or download this document. The link expires in 7 days.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="captain-email">Captain email</Label>
                                <Input
                                    id="captain-email"
                                    type="email"
                                    placeholder="captain@example.com"
                                    value={sendToCaptainEmail}
                                    onChange={(e) => setSendToCaptainEmail(e.target.value)}
                                    className="rounded-xl"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setSendToCaptainDialogOpen(false)} disabled={isSendingToCaptainDoc}>
                                    Cancel
                                </Button>
                                <Button onClick={handleSendDocumentToCaptain} disabled={isSendingToCaptainDoc}>
                                    {isSendingToCaptainDoc ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <>
                                            <Send className="h-4 w-4 mr-2" />
                                            Send link
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Leave Period Dialog */}
                <Dialog open={isLeavePeriodDialogOpen} onOpenChange={setIsLeavePeriodDialogOpen}>
                    <DialogContent className="rounded-xl max-w-md">
                        <DialogHeader>
                            <DialogTitle>Log Leave Period</DialogTitle>
                            <DialogDescription>
                                Select the date range for this leave period. These dates will be excluded from sea time calculations.
                            </DialogDescription>
                        </DialogHeader>
                        
                        <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Start Date</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                className={cn(
                                                    "w-full justify-start text-left font-normal rounded-xl",
                                                    !leavePeriodStartDate && "text-muted-foreground"
                                                )}
                                            >
                                                <CalendarDays className="mr-2 h-4 w-4" />
                                                {leavePeriodStartDate ? format(leavePeriodStartDate, 'PPP') : 'Select start date'}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <CalendarComponent
                                                mode="single"
                                                selected={leavePeriodStartDate}
                                                onSelect={setLeavePeriodStartDate}
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                                
                                <div className="space-y-2">
                                    <Label>End Date</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                className={cn(
                                                    "w-full justify-start text-left font-normal rounded-xl",
                                                    !leavePeriodEndDate && "text-muted-foreground"
                                                )}
                                            >
                                                <CalendarDays className="mr-2 h-4 w-4" />
                                                {leavePeriodEndDate ? format(leavePeriodEndDate, 'PPP') : 'Select end date'}
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <CalendarComponent
                                                mode="single"
                                                selected={leavePeriodEndDate}
                                                onSelect={setLeavePeriodEndDate}
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <Label>Notes (Optional)</Label>
                                <Textarea
                                    placeholder="Add any notes about this leave period..."
                                    value={leavePeriodNotes}
                                    onChange={(e) => setLeavePeriodNotes(e.target.value)}
                                    className="min-h-[80px] rounded-xl"
                                />
                            </div>
                            
                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setIsLeavePeriodDialogOpen(false);
                                        setLeavePeriodStartDate(undefined);
                                        setLeavePeriodEndDate(undefined);
                                        setLeavePeriodNotes('');
                                    }}
                                    className="rounded-xl"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={async () => {
                                        await handleSaveLeavePeriod();
                                        setIsLeavePeriodDialogOpen(false);
                                    }}
                                    disabled={!leavePeriodStartDate || !leavePeriodEndDate || isSavingLeavePeriod}
                                    className="rounded-xl"
                                >
                                    {isSavingLeavePeriod ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <CalendarDays className="mr-2 h-4 w-4" />
                                            Save Leave Period
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        );
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
                                    {filteredCrewMembers.length}
                                    {crewLimit !== Infinity && currentUserProfile?.role === 'vessel' && (
                                        <span className="text-muted-foreground"> / {crewLimit}</span>
                                    )}
                                    {crewLimit !== Infinity && currentUserProfile?.role === 'vessel' && crewMembers.length > crewLimit && (
                                        <span className="text-muted-foreground"> (of {crewMembers.length})</span>
                                    )}
                                    {' '}
                                    {filteredCrewMembers.length === 1 ? 'member' : 'members'}
                                </Badge>
                            )}
                        </div>
                        <p className="text-muted-foreground">
                            {currentUserProfile?.role === 'admin'
                                ? "View and manage all crew members across all vessels."
                                : currentUserProfile?.activeVesselId 
                                    ? currentUserProfile?.role === 'vessel' && crewLimit !== Infinity
                                        ? `View and manage crew members with active assignments on your vessel. Your plan allows up to ${crewLimit} crew members.`
                                        : "View and manage crew members with active assignments on your vessel."
                                    : "No active vessel found. Please select an active vessel to view crew members."}
                        </p>
                    </div>
                    <div className="flex gap-2 items-center">
                        <div className="relative w-full sm:max-w-xs">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name, username, or email..."
                                className="pl-8 rounded-xl"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        {currentUserProfile?.role === 'vessel' && currentUserProfile?.activeVesselId && (
                            <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button 
                                        className="rounded-xl"
                                        disabled={crewLimit !== Infinity && crewMembers.length >= crewLimit}
                                        title={
                                            crewLimit !== Infinity && crewMembers.length >= crewLimit
                                                ? `Crew limit reached. Your plan allows up to ${crewLimit} crew members.`
                                                : undefined
                                        }
                                    >
                                        <UserPlus className="h-4 w-4 mr-2" />
                                        Invite Crew Member
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="rounded-xl sm:max-w-[500px]">
                                    <DialogHeader>
                                        <DialogTitle>Invite Crew Member</DialogTitle>
                                        <DialogDescription>
                                            Invite a crew member to join your vessel. They will receive an email with instructions to set up their account.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <Form {...inviteForm}>
                                        <form onSubmit={inviteForm.handleSubmit(handleInviteCrew)} className="space-y-4">
                                            <FormField
                                                control={inviteForm.control}
                                                name="firstName"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>First Name</FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                placeholder="John"
                                                                {...field}
                                                                className="rounded-xl"
                                                                disabled={isInviting}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={inviteForm.control}
                                                name="lastName"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Last Name</FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                placeholder="Doe"
                                                                {...field}
                                                                className="rounded-xl"
                                                                disabled={isInviting}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={inviteForm.control}
                                                name="email"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Email Address</FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                type="email"
                                                                placeholder="john.doe@example.com"
                                                                {...field}
                                                                className="rounded-xl"
                                                                disabled={isInviting}
                                                            />
                                                        </FormControl>
                                                        <FormDescription>
                                                            The crew member will receive an invitation email at this address.
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <div className="flex justify-end gap-2 pt-4">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => {
                                                        inviteForm.reset();
                                                        setIsInviteDialogOpen(false);
                                                    }}
                                                    disabled={isInviting}
                                                    className="rounded-xl"
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    type="submit"
                                                    disabled={isInviting}
                                                    className="rounded-xl"
                                                >
                                                    {isInviting ? (
                                                        <>
                                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                            Sending Invitation...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <UserPlus className="mr-2 h-4 w-4" />
                                                            Send Invitation
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        </form>
                                    </Form>
                                </DialogContent>
                            </Dialog>
                        )}
                    </div>
                </div>
                <Separator />
            </div>

            {/* Summary Cards for Vessel Managers */}
            {currentUserProfile?.role === 'vessel' && !isLoading && crewMembers.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="rounded-xl border">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-muted-foreground">Total Crew</p>
                                    <p className="text-3xl font-bold">{totalCrew}</p>
                                </div>
                                <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                    <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="rounded-xl border">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-muted-foreground">Total Onboard</p>
                                    <p className="text-3xl font-bold">{totalOnboard}</p>
                                </div>
                                <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                    <UserCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Tier Limit Warning */}
            {currentUserProfile?.role === 'vessel' && crewLimit !== Infinity && crewMembers.length > crewLimit && (
                <div className="rounded-xl border border-orange-500/50 bg-orange-50 dark:bg-orange-950/20 p-4">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                        <div className="flex-1 space-y-2">
                            <h3 className="font-semibold text-orange-900 dark:text-orange-100">Crew Limit Reached</h3>
                            <p className="text-sm text-orange-800 dark:text-orange-200">
                                Your <strong>{currentUserProfile.subscriptionTier?.replace('vessel_', '').replace('_', ' ').toUpperCase() || 'current'}</strong> plan allows you to view up to <strong>{crewLimit} crew members</strong>. 
                                You currently have <strong>{crewMembers.length} crew members</strong> on your vessel. Only the first {crewLimit} are displayed.
                            </p>
                            <Button asChild variant="outline" size="sm" className="mt-2 border-orange-500 text-orange-700 hover:bg-orange-100 dark:border-orange-400 dark:text-orange-300 dark:hover:bg-orange-900/30">
                                <Link href="/offers">
                                    <ArrowUpCircle className="mr-2 h-4 w-4" />
                                    Upgrade Plan
                                </Link>
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* No Active Subscription Warning */}
            {currentUserProfile?.role === 'vessel' && crewLimit === 0 && (
                <div className="rounded-xl border border-red-500/50 bg-red-50 dark:bg-red-950/20 p-4">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                        <div className="flex-1 space-y-2">
                            <h3 className="font-semibold text-red-900 dark:text-red-100">Subscription Required</h3>
                            <p className="text-sm text-red-800 dark:text-red-200">
                                You need an active vessel subscription to view crew members. Please subscribe to a plan to access this feature.
                            </p>
                            <Button asChild variant="outline" size="sm" className="mt-2 border-red-500 text-red-700 hover:bg-red-100 dark:border-red-400 dark:text-red-300 dark:hover:bg-red-900/30">
                                <Link href="/offers">
                                    <ArrowUpCircle className="mr-2 h-4 w-4" />
                                    View Plans
                                </Link>
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                        >
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
                                {currentUserProfile?.role === 'vessel' && <TableHead>Onboard</TableHead>}
                                {currentUserProfile?.role === 'vessel' && <TableHead>Access Status</TableHead>}
                                {currentUserProfile?.role === 'vessel' && <TableHead className="w-[50px]"></TableHead>}
                                {currentUserProfile?.role !== 'vessel' && <TableHead className="w-[50px]"></TableHead>}
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
                                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                        No active vessel found. Please select an active vessel to view crew members.
                                    </TableCell>
                                </TableRow>
                            ) : filteredCrewMembers && filteredCrewMembers.length > 0 ? (
                                    <SortableContext
                                        items={filteredCrewMembers.map(m => m.profile.id)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        {filteredCrewMembers.map((member, index) => (
                                        <React.Fragment key={member.profile.id}>
                                            <SortableRow
                                                member={member}
                                                index={index}
                                                currentUserProfile={currentUserProfile}
                                                allVessels={allVessels || undefined}
                                                expandedRows={expandedRows}
                                                updatingOnboardStatus={updatingOnboardStatus}
                                                requestingAccess={requestingAccess}
                                                loadingSeaTime={loadingSeaTime}
                                                hasProTier={hasProTier}
                                                onToggleOnboard={handleToggleOnboard}
                                                onToggleRowExpansion={toggleRowExpansion}
                                                onRequestAccess={handleRequestAccess}
                                                onOpenLeavePeriodsDialog={(member) => handleSelectCrewMember(member.profile.id)}
                                            />
                                        </React.Fragment>
                                    ))}
                                    </SortableContext>
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
                        </DndContext>
                    </div>
                </CardContent>
            </Card>

        </div>
    );
}
