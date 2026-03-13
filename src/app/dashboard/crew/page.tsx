
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { MoreHorizontal, Loader2, Search, Users, User as UserIcon, Ship, Anchor, ChevronDown, ChevronUp, Clock, Calendar, UserCheck, UserPlus, GripVertical, Bug, CalendarDays, X, FileText, Download, CalendarIcon, CheckCircle2, Plus, ExternalLink, ChevronRight, Trash2, AlertCircle, AlertTriangle, ArrowUpCircle, Send, Eye, Pencil, Navigation, FileCheck, Copy, ShieldCheck } from 'lucide-react';
import { format, parse, eachDayOfInterval, format as formatDate, addDays, isWithinInterval, differenceInDays, startOfDay } from 'date-fns';
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import Link from 'next/link';
import type { UserProfile, VesselAssignment, Vessel, VesselSeaTimeAccessRequest, CrewLeavePeriod, Testimonial, VesselGeneratedTestimonial, StateLog, NavWatchApplication, ProofOfService } from '@/lib/types';
import { getActiveVesselAssignmentsByVessel, getAllVesselAssignmentsByVessel, getVesselStateLogs, updateVesselAssignment } from '@/supabase/database/queries';
import { useCollection } from '@/supabase/database';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { generateTestimonialPDF, generateMCADeckhandTestimonial, generateMCAOfficerTestimonial, generateMCAWatchRatingForm, generateProofOfServicePDF, type TestimonialPDFFormat, type TestimonialPDFOutput, type MCACertificateType } from '@/lib/pdf-generator';
import { calculateStandbyDays } from '@/lib/standby-calculation';
import { getVesselCalculationCategory, isAllDaysExceptLeaveCountAsSea } from '@/lib/vessel-calculation-categories';
import { requestCaptainSignoff } from '@/lib/testimonial-signoff';
import { buildAndGenerateNavWatchApplication, navWatchApplicationDefaultValues, navWatchApplicationSchema, type NavWatchApplicationFormValues } from '@/lib/nav-watch-application';
import { MCAApplicationDetailsCard } from '@/components/dashboard/mca-application-details';


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
    /** Other assignments on this vessel (e.g. previous periods if they left and rejoined). Used to show one row per user. */
    otherAssignments?: VesselAssignment[];
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
    navWatchApplications?: NavWatchApplication[];
    proofOfServiceEntries?: ProofOfService[];
    hasApprovedAccess?: boolean;
    /** True when seaTimeData was computed from vessel logs (no crew permission) */
    seaTimeDataFromVessel?: boolean;
    /** Admin only: all vessels this member is tracking (active + past) for dropdown display */
    allVesselsForUser?: { vesselName: string; startDate: string; endDate: string | null }[];
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
    onEditStartDate?: (member: CrewMemberWithAssignment) => void;
    onSetEndDate?: (member: CrewMemberWithAssignment) => void;
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
    onEditStartDate,
    onSetEndDate,
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
    } = useSortable({ id: assignment.id || profile.id });

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
    const isAdminWithVessels = currentUserProfile?.role === 'admin' && member.allVesselsForUser && member.allVesselsForUser.length > 0;
    const handleRowClick = () => {
        if (isDragging) return;
        if (isAdminWithVessels) {
            onToggleRowExpansion(member);
            return;
        }
        if (isVesselManager && hasProTier) {
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
                isVesselManager && !hasProTier ? 'cursor-default' : '',
                isAdminWithVessels ? 'cursor-pointer hover:bg-muted/30 transition-colors' : ''
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
                    {member.allVesselsForUser && member.allVesselsForUser.length > 0 ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto py-1 px-2 -ml-2 font-medium flex items-center gap-1"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleRowExpansion(member);
                            }}
                        >
                            <span>{vesselName}</span>
                            {expandedRows.has(profile.id) ? (
                                <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                            ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />
                            )}
                        </Button>
                    ) : (
                        <span className="font-medium">{vesselName}</span>
                    )}
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
                    <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                            {assignment.startDate 
                                ? format(new Date(assignment.startDate), 'dd MMM, yyyy')
                                : 'N/A'}
                            {currentUserProfile?.role === 'vessel' && onEditStartDate && assignment.id && !assignment.id.startsWith('placeholder-') && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEditStartDate(member);
                                    }}
                                    title="Change start date"
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        </div>
                        {member.otherAssignments && member.otherAssignments.length > 0 && (
                            <span
                                className="text-xs text-muted-foreground"
                                title={member.otherAssignments
                                    .map((a) => `${format(new Date(a.startDate), 'dd MMM yyyy')} – ${a.endDate ? format(new Date(a.endDate), 'dd MMM yyyy') : 'present'}`)
                                    .join('; ')}
                            >
                                {member.otherAssignments.length === 1
                                    ? `Previously: ${format(new Date(member.otherAssignments[0].startDate), 'dd MMM yyyy')} – ${member.otherAssignments[0].endDate ? format(new Date(member.otherAssignments[0].endDate), 'dd MMM yyyy') : 'present'}`
                                    : `${member.otherAssignments.length} previous periods`}
                            </span>
                        )}
                    </div>
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
            {currentUserProfile?.role === 'vessel' && (
                <TableCell className="w-[50px]" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                        {onSetEndDate && assignment.id && !assignment.id.startsWith('placeholder-') && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full">
                                        <span className="sr-only">Actions</span>
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => onSetEndDate(member)}>
                                        <CalendarDays className="h-4 w-4 mr-2" />
                                        Set end date (left vessel)
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                        {hasProTier && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onOpenLeavePeriodsDialog(member)}
                                className="h-8 w-8 p-0"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </TableCell>
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
    const [crewRefreshTrigger, setCrewRefreshTrigger] = useState(0);
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
    const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
    /** When member has multiple service periods: 'current' | assignmentId | 'all'. Controls which period's data is shown. */
    const [viewingServicePeriod, setViewingServicePeriod] = useState<'current' | string | 'all'>('current');
    const [isLeavePeriodDialogOpen, setIsLeavePeriodDialogOpen] = useState(false);
    const [leavePeriodStartDate, setLeavePeriodStartDate] = useState<Date | undefined>(undefined);
    const [leavePeriodEndDate, setLeavePeriodEndDate] = useState<Date | undefined>(undefined);
    const [leavePeriodNotes, setLeavePeriodNotes] = useState('');
    const [isSavingLeavePeriod, setIsSavingLeavePeriod] = useState(false);
    const [isDeletingLeavePeriod, setIsDeletingLeavePeriod] = useState<string | null>(null);
    const [isSyncingLeaveFromCrew, setIsSyncingLeaveFromCrew] = useState(false);
    const [isLoadingTestimonials, setIsLoadingTestimonials] = useState(false);
    const [generatingPDF, setGeneratingPDF] = useState<string | null>(null);
    const [downloadingNavWatchId, setDownloadingNavWatchId] = useState<string | null>(null);
    const [downloadingProofOfServiceId, setDownloadingProofOfServiceId] = useState<string | null>(null);
    const [previewingNavWatchId, setPreviewingNavWatchId] = useState<string | null>(null);
    const [deletingNavWatchId, setDeletingNavWatchId] = useState<string | null>(null);
    const [showGenerateForm, setShowGenerateForm] = useState(false);
    const [deletingTestimonial, setDeletingTestimonial] = useState<string | null>(null);
    const [vesselTestimonialToDeleteId, setVesselTestimonialToDeleteId] = useState<string | null>(null);
    const [crewTestimonialToDelete, setCrewTestimonialToDelete] = useState<Testimonial | null>(null);
    const [deleteCrewPassword, setDeleteCrewPassword] = useState('');
    const [deleteCrewPasswordError, setDeleteCrewPasswordError] = useState('');
    const [isDeletingCrewTestimonial, setIsDeletingCrewTestimonial] = useState(false);
    const isVerifyingCrewDeleteRef = React.useRef(false);
    const [sendToCaptainDocId, setSendToCaptainDocId] = useState<string | null>(null);
    const [sendToCaptainEmail, setSendToCaptainEmail] = useState('');
    const [isSendingToCaptainDoc, setIsSendingToCaptainDoc] = useState(false);
    const [sendToCaptainDialogOpen, setSendToCaptainDialogOpen] = useState(false);
    type DocumentBreakdownItem = Pick<VesselGeneratedTestimonial, 'id' | 'start_date' | 'end_date' | 'total_days' | 'at_sea_days' | 'standby_days' | 'yard_days' | 'leave_days' | 'data_source' | 'notes'> & { pdf_format?: string; generated_by_name?: string | null; generated_by_email?: string | null };
    const [viewDocumentBreakdown, setViewDocumentBreakdown] = useState<DocumentBreakdownItem | null>(null);
    const [documentStartDate, setDocumentStartDate] = useState<Date | undefined>(undefined);
    const [documentEndDate, setDocumentEndDate] = useState<Date | undefined>(undefined);
    const [isCalculatingSeaTime, setIsCalculatingSeaTime] = useState(false);
    const [calculatedSeaTime, setCalculatedSeaTime] = useState<{
        totalDays: number;
        atSeaDays: number;
        standbyDays: number;
        yardDays: number;
        leaveDays: number;
        otherDays?: number;
        isOfficer: boolean;
    } | null>(null);
    const [isSendingToCaptain, setIsSendingToCaptain] = useState(false);
    const [isSavingTestimonial, setIsSavingTestimonial] = useState(false);
    const [activeCaptain, setActiveCaptain] = useState<{ id: string; name: string } | null>(null);
    const [sendTestimonialByEmailOpen, setSendTestimonialByEmailOpen] = useState(false);
    const [sendTestimonialByEmailValue, setSendTestimonialByEmailValue] = useState('');
    const [isSendingTestimonialByEmail, setIsSendingTestimonialByEmail] = useState(false);
    const [vesselDocToSendToCaptain, setVesselDocToSendToCaptain] = useState<VesselGeneratedTestimonial | null>(null);
    const [editStartDateMember, setEditStartDateMember] = useState<CrewMemberWithAssignment | null>(null);
    const [editStartDateValue, setEditStartDateValue] = useState('');
    const [offerSeaTimeWithStartDate, setOfferSeaTimeWithStartDate] = useState(false);
    const [isSavingStartDate, setIsSavingStartDate] = useState(false);
    const [setEndDateMember, setSetEndDateMember] = useState<CrewMemberWithAssignment | null>(null);
    const [setEndDateValue, setSetEndDateValue] = useState('');
    const [isSavingEndDate, setIsSavingEndDate] = useState(false);
    const [selectedDataSource, setSelectedDataSource] = useState<'crew' | 'vessel' | null>(null);
    /** When crew has access: which source to show in Days breakdown. Vessel is default for vessel accounts. */
    const [breakdownViewSource, setBreakdownViewSource] = useState<'crew' | 'vessel'>('vessel');
    /** When crew has access: which source to show in Leave Periods tab. Vessel is default. */
    const [leavePeriodsViewSource, setLeavePeriodsViewSource] = useState<'vessel' | 'crew'>('vessel');
    const [vesselBreakdownForView, setVesselBreakdownForView] = useState<{
        memberId: string;
        startDate: string;
        endDate: string;
        data: NonNullable<CrewMemberWithAssignment['seaTimeData']>;
    } | null>(null);
    const [selectedTestimonialFormat, setSelectedTestimonialFormat] = useState<Record<string, TestimonialPDFFormat>>({});
    const [selectedVesselDocFormat, setSelectedVesselDocFormat] = useState<Record<string, TestimonialPDFFormat>>({});
    const [selectedNewDocFormat, setSelectedNewDocFormat] = useState<TestimonialPDFFormat>('mca');
    const [isNavWatchDialogOpen, setIsNavWatchDialogOpen] = useState(false);
    const [isSavingNavWatch, setIsSavingNavWatch] = useState(false);
    const [pastMembersExpanded, setPastMembersExpanded] = useState(false);

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

    // For vessel managers: load active captain (primary signing authority) for the active vessel
    useEffect(() => {
        const loadActiveCaptain = async () => {
            if (currentUserProfile?.role !== 'vessel' || !currentUserProfile?.activeVesselId || !supabase) {
                setActiveCaptain(null);
                return;
            }
            try {
                const { data: signingAuthorities, error } = await supabase
                    .from('vessel_signing_authorities')
                    .select('captain_user_id, is_primary')
                    .eq('vessel_id', currentUserProfile.activeVesselId)
                    .is('end_date', null)
                    .order('is_primary', { ascending: false })
                    .limit(1);
                if (error || !signingAuthorities?.length) {
                    setActiveCaptain(null);
                    return;
                }
                const captainId = signingAuthorities[0].captain_user_id;
                if (!captainId) {
                    setActiveCaptain(null);
                    return;
                }
                const { data: captainUser } = await supabase
                    .from('users')
                    .select('first_name, last_name')
                    .eq('id', captainId)
                    .maybeSingle();
                const name = captainUser
                    ? [captainUser.first_name, captainUser.last_name].filter(Boolean).join(' ').trim() || 'Captain'
                    : 'Captain';
                setActiveCaptain({ id: captainId, name });
            } catch {
                setActiveCaptain(null);
            }
        };
        loadActiveCaptain();
    }, [currentUserProfile?.role, currentUserProfile?.activeVesselId, supabase]);

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

                    // Step 4b: Build userId -> list of vessels (active + past) for dropdown
                    const vesselIdToName = new Map<string, string>();
                    (allVesselsData || []).forEach((v: any) => vesselIdToName.set(v.id, v.name || 'Unknown'));
                    const userToVessels = new Map<string, { vesselName: string; startDate: string; endDate: string | null }[]>();
                    allAssignments.forEach((a: any) => {
                        const list = userToVessels.get(a.user_id) || [];
                        list.push({
                            vesselName: vesselIdToName.get(a.vessel_id) || `Vessel (${(a.vessel_id || '').slice(0, 8)}…)`,
                            startDate: a.start_date,
                            endDate: a.end_date || null,
                        });
                        userToVessels.set(a.user_id, list);
                    });
                    // Sort each user's list by start_date desc (most recent first)
                    userToVessels.forEach((list) => {
                        list.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
                    });

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
                            ...(profile as any),
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

                        return {
                            profile: transformedProfile,
                            assignment,
                            allVesselsForUser: userToVessels.get(profile.id) || [],
                        };
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
                    const assignments = await getAllVesselAssignmentsByVessel(supabase, currentUserProfile.activeVesselId);
                    
                    console.log('[CREW PAGE] Found assignments:', assignments.length, assignments);
                    
                    if (assignments.length === 0) {
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
                                ...(profile as any),
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

                    // Group assignments by user so each person appears once; prefer active assignment, then most recent
                    const byUserId = new Map<string, VesselAssignment[]>();
                    for (const a of assignments) {
                        const list = byUserId.get(a.userId) || [];
                        list.push(a);
                        byUserId.set(a.userId, list);
                    }
                    const isActive = (a: VesselAssignment) => {
                        if (!a.endDate) return true;
                        const end = new Date(a.endDate);
                        const today = new Date();
                        end.setHours(0, 0, 0, 0);
                        today.setHours(0, 0, 0, 0);
                        return end >= today;
                    };
                    const crewWithProfiles: CrewMemberWithAssignment[] = [];
                    byUserId.forEach((userAssignments, userId) => {
                        const profile = profileMap.get(userId);
                        if (!profile) {
                            console.warn(`[CREW PAGE] No profile found for userId: ${userId}`);
                            return;
                        }
                        // Prefer active, then most recent by start_date
                        const sorted = [...userAssignments].sort((a, b) => {
                            const aActive = isActive(a);
                            const bActive = isActive(b);
                            if (aActive !== bActive) return aActive ? -1 : 1;
                            return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
                        });
                        const primary = sorted[0];
                        const otherAssignments = sorted.length > 1 ? sorted.slice(1) : undefined;
                        crewWithProfiles.push({
                            profile,
                            assignment: primary,
                            ...(otherAssignments?.length ? { otherAssignments } : {}),
                        });
                    });

                    console.log('[CREW PAGE] Final crew members (one per user):', crewWithProfiles.length);
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
    }, [supabase, currentUserProfile?.activeVesselId, isAuthorized, user?.id, currentUserProfile?.role, crewRefreshTrigger]);

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

    // Function to load sea time data for a crew member (crew logs + leavePeriodsFromLogs from API)
    const loadSeaTimeData = async (crewMember: CrewMemberWithAssignment) => {
        const alreadyHasCrewData = crewMember.seaTimeData && !crewMember.seaTimeDataFromVessel;
        if (alreadyHasCrewData || loadingSeaTime.has(crewMember.profile.id)) {
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

            const json = await response.json();
            const seaTimeData = json.seaTimeData ?? null;
            const leavePeriodsFromLogs = json.leavePeriodsFromLogs ?? undefined;

            setCrewMembers(prev => prev.map(m => 
                m.profile.id === crewMember.profile.id
                    ? { ...m, seaTimeData, leavePeriodsFromLogs, seaTimeDataFromVessel: false }
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

    // Load sea time breakdown from vessel data when crew has not granted permission (uses vessel state logs + vessel-added leave periods)
    const loadVesselBasedSeaTimeData = async (member: CrewMemberWithAssignment) => {
        if (!currentUserProfile?.activeVesselId || !user?.id || currentUserProfile?.role !== 'vessel') return;
        const vesselId = currentUserProfile.activeVesselId;
        const startStr = member.assignment.startDate;
        if (!startStr) return;
        const startDate = parse(startStr, 'yyyy-MM-dd', new Date());
        const endDate = member.assignment.endDate
            ? parse(member.assignment.endDate, 'yyyy-MM-dd', new Date())
            : new Date();
        const today = new Date();
        const effectiveEnd = endDate > today ? today : endDate;
        if (startDate > effectiveEnd) return;

        setLoadingSeaTime(prev => new Set(prev).add(member.profile.id));
        try {
            // Fetch vessel logs via API (server-side with admin) so all logs are visible regardless of RLS.
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`/api/vessel-logs?vesselId=${encodeURIComponent(vesselId)}`, {
                credentials: 'include',
                headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to fetch vessel logs');
            }
            const { logs: vesselLogs } = (await res.json()) as { logs: StateLog[] };
            const leavePeriods = member.leavePeriods || [];
            const isDateOnLeave = (dateStr: string) => {
                const d = parse(dateStr, 'yyyy-MM-dd', new Date());
                return leavePeriods.some(lp => {
                    const start = parse(lp.startDate, 'yyyy-MM-dd', new Date());
                    const end = parse(lp.endDate, 'yyyy-MM-dd', new Date());
                    return isWithinInterval(d, { start, end });
                });
            };

            // Only count days that have an actual vessel log (in assignment range). Do not fill missing days as in-port.
            const dateStr = (d: string) => d.includes('T') ? d.split('T')[0]! : d;
            const filtered = vesselLogs
                .filter(log => {
                    const d = parse(dateStr(log.date), 'yyyy-MM-dd', new Date());
                    return d >= startDate && d <= effectiveEnd;
                })
                .map(log => {
                    const onLeave = isDateOnLeave(dateStr(log.date));
                    const state = onLeave ? 'on-leave' : log.state;
                    return {
                        ...log,
                        date: dateStr(log.date),
                        state: state as StateLog['state'],
                    } as StateLog;
                })
                .sort((a, b) => {
                const d = a.date.localeCompare(b.date);
                if (d !== 0) return d;
                return (a.id || '').localeCompare(b.id || '');
            });
            // One log per date: keep first after stable sort so result is deterministic across refetches
            const byDate = new Map<string, StateLog>();
            filtered.forEach(log => { if (!byDate.has(log.date)) byDate.set(log.date, log); });
            const effectiveLogs = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

            const partOfActivePassageDates = new Set<string>();
            effectiveLogs.forEach(log => {
                if (log.isPartOfActivePassage) partOfActivePassageDates.add(log.date);
            });
            const { totalSeaDays, totalStandbyDays } = calculateStandbyDays(effectiveLogs, new Set(), partOfActivePassageDates);

            const seaTimeData = {
                totalDays: effectiveLogs.length,
                atSeaDays: totalSeaDays,
                standbyDays: totalStandbyDays,
                underwayDays: effectiveLogs.filter(l => l.state === 'underway').length,
                atAnchorDays: effectiveLogs.filter(l => l.state === 'at-anchor').length,
                inPortDays: effectiveLogs.filter(l => l.state === 'in-port').length,
                onLeaveDays: effectiveLogs.filter(l => l.state === 'on-leave').length,
                inYardDays: effectiveLogs.filter(l => l.state === 'in-yard').length,
            };

            setCrewMembers(prev => prev.map(m =>
                m.profile.id === member.profile.id
                    ? { ...m, seaTimeData, seaTimeDataFromVessel: true }
                    : m
            ));
        } catch (error: any) {
            console.error('[CREW PAGE] Error loading vessel-based sea time:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to load vessel data breakdown.',
                variant: 'destructive',
            });
        } finally {
            setLoadingSeaTime(prev => {
                const next = new Set(prev);
                next.delete(member.profile.id);
                return next;
            });
        }
    };

    // Load vessel-based breakdown into local state only (for toggle when crew has access). Not cached on member so refresh works.
    const loadVesselBreakdownForView = async (member: CrewMemberWithAssignment) => {
        if (!currentUserProfile?.activeVesselId || !user?.id || currentUserProfile?.role !== 'vessel') return;
        if (member.accessRequest?.status !== 'approved') return;
        const vesselId = currentUserProfile.activeVesselId;
        const startStr = member.assignment.startDate;
        if (!startStr) return;
        const startDate = parse(startStr, 'yyyy-MM-dd', new Date());
        const endDate = member.assignment.endDate
            ? parse(member.assignment.endDate, 'yyyy-MM-dd', new Date())
            : new Date();
        const today = new Date();
        const effectiveEnd = endDate > today ? today : endDate;
        if (startDate > effectiveEnd) return;

        setLoadingSeaTime(prev => new Set(prev).add(member.profile.id));
        try {
            // Fetch vessel logs via API (server-side with admin) so all logs are visible regardless of RLS.
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch(`/api/vessel-logs?vesselId=${encodeURIComponent(vesselId)}`, {
                credentials: 'include',
                headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to fetch vessel logs');
            }
            const { logs: vesselLogs } = (await res.json()) as { logs: StateLog[] };
            const leavePeriods = member.leavePeriods || [];
            const isDateOnLeave = (dateStr: string) => {
                const d = parse(dateStr, 'yyyy-MM-dd', new Date());
                return leavePeriods.some(lp => {
                    const start = parse(lp.startDate, 'yyyy-MM-dd', new Date());
                    const end = parse(lp.endDate, 'yyyy-MM-dd', new Date());
                    return isWithinInterval(d, { start, end });
                });
            };
            const dateStr = (d: string) => d.includes('T') ? d.split('T')[0]! : d;
            const filtered = vesselLogs
                .filter(log => {
                    const d = parse(dateStr(log.date), 'yyyy-MM-dd', new Date());
                    return d >= startDate && d <= effectiveEnd;
                })
                .map(log => {
                    const onLeave = isDateOnLeave(dateStr(log.date));
                    const state = onLeave ? 'on-leave' : log.state;
                    return { ...log, date: dateStr(log.date), state: state as StateLog['state'] } as StateLog;
                })
                .sort((a, b) => {
                    const d = a.date.localeCompare(b.date);
                    if (d !== 0) return d;
                    return (a.id || '').localeCompare(b.id || '');
                });
            const byDate = new Map<string, StateLog>();
            filtered.forEach(log => { if (!byDate.has(log.date)) byDate.set(log.date, log); });
            const effectiveLogs = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
            const partOfActivePassageDates = new Set<string>();
            effectiveLogs.forEach(log => { if (log.isPartOfActivePassage) partOfActivePassageDates.add(log.date); });
            const { totalSeaDays, totalStandbyDays } = calculateStandbyDays(effectiveLogs, new Set(), partOfActivePassageDates);
            const data = {
                totalDays: effectiveLogs.length,
                atSeaDays: totalSeaDays,
                standbyDays: totalStandbyDays,
                underwayDays: effectiveLogs.filter(l => l.state === 'underway').length,
                atAnchorDays: effectiveLogs.filter(l => l.state === 'at-anchor').length,
                inPortDays: effectiveLogs.filter(l => l.state === 'in-port').length,
                onLeaveDays: effectiveLogs.filter(l => l.state === 'on-leave').length,
                inYardDays: effectiveLogs.filter(l => l.state === 'in-yard').length,
            };
            const startDateStr = member.assignment.startDate;
            const endDateStr = member.assignment.endDate ?? new Date().toISOString().split('T')[0];
            setVesselBreakdownForView({ memberId: member.profile.id, startDate: startDateStr, endDate: endDateStr, data });
        } catch (error: any) {
            console.error('[CREW PAGE] Error loading vessel breakdown for view:', error);
            toast({ title: 'Error', description: error.message || 'Failed to load vessel data.', variant: 'destructive' });
        } finally {
            setLoadingSeaTime(prev => { const next = new Set(prev); next.delete(member.profile.id); return next; });
        }
    };

    // Toggle expanded row: for admin, expand/collapse vessel list; kept for compatibility for vessel view
    const toggleRowExpansion = (crewMember: CrewMemberWithAssignment) => {
        if (currentUserProfile?.role === 'admin') {
            setExpandedRows((prev) => {
                const key = crewMember.profile.id;
                const next = new Set(prev);
                if (next.has(key)) next.delete(key);
                else next.add(key);
                return next;
            });
        }
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

    const openEditStartDate = (member: CrewMemberWithAssignment) => {
        setEditStartDateMember(member);
        setEditStartDateValue(member.assignment.startDate || new Date().toISOString().split('T')[0]);
        setOfferSeaTimeWithStartDate(false);
    };

    const saveStartDate = async () => {
        if (!editStartDateMember || !editStartDateMember.assignment.id || editStartDateMember.assignment.id.startsWith('placeholder-')) return;
        setIsSavingStartDate(true);
        try {
            await updateVesselAssignment(supabase, editStartDateMember.assignment.id, {
                startDate: editStartDateValue,
            });
            setCrewMembers(prev => prev.map(m => {
                if (m.profile.id === editStartDateMember.profile.id && m.assignment.id === editStartDateMember.assignment.id) {
                    return { ...m, assignment: { ...m.assignment, startDate: editStartDateValue } };
                }
                return m;
            }));
            toast({ title: 'Start date updated', description: 'The crew member\'s start date has been updated.' });

            if (offerSeaTimeWithStartDate && session?.access_token) {
                const endDate = format(new Date(), 'yyyy-MM-dd');
                const res = await fetch('/api/vessel-sea-time-offers/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        crewUserId: editStartDateMember.profile.id,
                        startDate: editStartDateValue,
                        endDate,
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.success) {
                    toast({
                        title: 'Sea time offer sent',
                        description: 'The crew member will see a request in their Inbox. If they accept, sea time records from the start date to today will be copied to their account.',
                    });
                } else if (!res.ok) {
                    toast({
                        title: 'Offer could not be sent',
                        description: data.error || 'They may already have a pending offer. They can accept or reject it in their Inbox.',
                        variant: 'destructive',
                    });
                }
            }

            setEditStartDateMember(null);
        } catch (error: any) {
            console.error('[CREW PAGE] Error updating start date:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to update start date. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsSavingStartDate(false);
        }
    };

    const openSetEndDate = (member: CrewMemberWithAssignment) => {
        setSetEndDateMember(member);
        setSetEndDateValue(new Date().toISOString().split('T')[0]);
    };

    const saveEndDate = async () => {
        if (!setEndDateMember || !setEndDateMember.assignment.id || setEndDateMember.assignment.id.startsWith('placeholder-')) return;
        setIsSavingEndDate(true);
        try {
            await updateVesselAssignment(supabase, setEndDateMember.assignment.id, {
                endDate: setEndDateValue,
            });
            setCrewMembers(prev => prev.map(m => {
                if (m.profile.id === setEndDateMember.profile.id && m.assignment.id === setEndDateMember.assignment.id) {
                    return { ...m, assignment: { ...m.assignment, endDate: setEndDateValue } };
                }
                return m;
            }));
            toast({ title: 'End date set', description: 'The crew member has been moved to Past members. You can still access their documents.' });
            setSetEndDateMember(null);
        } catch (error: any) {
            console.error('[CREW PAGE] Error setting end date:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to set end date. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsSavingEndDate(false);
        }
    };
    
    // Active = no end date or end date in the future (still on vessel)
    const isAssignmentActive = (a: VesselAssignment) => {
        if (!a.endDate) return true;
        const end = new Date(a.endDate);
        const today = new Date();
        end.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        return end >= today;
    };

    // Initialize ordered crew members when crewMembers changes (vessel: active only; admin: all)
    useEffect(() => {
        if (currentUserProfile?.role === 'vessel') {
            setOrderedCrewMembers(crewMembers.filter((m) => isAssignmentActive(m.assignment)));
        } else {
            setOrderedCrewMembers(crewMembers);
        }
    }, [crewMembers, currentUserProfile?.role]);

    // Reload page when user returns to the browser tab so data is always fresh (keeps toggle working with up-to-date data)
    useEffect(() => {
        const handleVisibility = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                window.location.reload();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, []);

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
                const oldIndex = items.findIndex(item => (item.assignment.id || item.profile.id) === active.id);
                const newIndex = items.findIndex(item => (item.assignment.id || item.profile.id) === over.id);
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

    // Past members (vessel only): assignment has end_date and it's in the past
    const pastCrewMembers = useMemo(() => {
        if (currentUserProfile?.role !== 'vessel') return [];
        return crewMembers.filter((m) => !isAssignmentActive(m.assignment));
    }, [crewMembers, currentUserProfile?.role]);

    const filteredPastCrewMembers = useMemo(() => {
        if (!searchTerm) return pastCrewMembers;
        const term = searchTerm.toLowerCase();
        return pastCrewMembers.filter(({ profile }) => {
            const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.toLowerCase();
            return fullName.includes(term) || profile.username.toLowerCase().includes(term) || profile.email.toLowerCase().includes(term);
        });
    }, [pastCrewMembers, searchTerm]);

    const isLoading = isLoadingProfile || isLoadingAssignments || isCheckingCaptaincy;
    
    // Get selected crew member data (use assignment id when same user has multiple assignments, e.g. past + active)
    const selectedMemberData = useMemo(() => {
        if (!selectedCrewMemberId) return null;
        const member = crewMembers.find(m =>
            m.profile.id === selectedCrewMemberId &&
            (!selectedAssignmentId || m.assignment.id === selectedAssignmentId)
        );
        if (!member) return null;
        
        return {
            ...member,
            hasApprovedAccess: member.accessRequest?.status === 'approved' || false,
        };
    }, [selectedCrewMemberId, selectedAssignmentId, crewMembers]);

    // Effective member for viewing: same as selectedMemberData but assignment may be a chosen period (current, previous, or merged "all")
    const effectiveMember = useMemo(() => {
        if (!selectedMemberData) return null;
        const hasOther = (selectedMemberData.otherAssignments?.length ?? 0) > 0;
        if (!hasOther || viewingServicePeriod === 'current') {
            return selectedMemberData;
        }
        if (viewingServicePeriod === 'all') {
            const allAssignments = [selectedMemberData.assignment, ...(selectedMemberData.otherAssignments ?? [])];
            const starts = allAssignments.map((a) => a.startDate);
            const ends = allAssignments.map((a) => a.endDate ?? new Date().toISOString().split('T')[0]);
            const minStart = starts.sort()[0];
            const maxEnd = ends.sort()[ends.length - 1];
            return {
                ...selectedMemberData,
                assignment: {
                    ...selectedMemberData.assignment,
                    id: selectedMemberData.assignment.id,
                    startDate: minStart,
                    endDate: maxEnd,
                },
            };
        }
        // viewingServicePeriod is an assignment id
        if (selectedMemberData.assignment.id === viewingServicePeriod) {
            return selectedMemberData;
        }
        const prev = selectedMemberData.otherAssignments?.find((a) => a.id === viewingServicePeriod);
        if (!prev) return selectedMemberData;
        return {
            ...selectedMemberData,
            assignment: prev,
        };
    }, [selectedMemberData, viewingServicePeriod]);

    // When a crew member is selected without approved access, load breakdown from vessel data (vessel logs + vessel-added leave periods)
    useEffect(() => {
        if (!effectiveMember || currentUserProfile?.role !== 'vessel' || effectiveMember.accessRequest?.status === 'approved') return;
        if (!currentUserProfile?.activeVesselId || !supabase) return;
        loadVesselBasedSeaTimeData(effectiveMember);
    }, [effectiveMember?.profile.id, effectiveMember?.assignment?.startDate, effectiveMember?.assignment?.endDate, effectiveMember?.leavePeriods?.length, currentUserProfile?.role, currentUserProfile?.activeVesselId]);

    // When a crew member with approved access is selected, ensure we load crew sea time + leave from logs
    useEffect(() => {
        if (!effectiveMember || currentUserProfile?.role !== 'vessel' || !user?.id || !currentUserProfile?.activeVesselId) return;
        if (effectiveMember.accessRequest?.status !== 'approved') return;
        const needsCrewData = !effectiveMember.seaTimeData || effectiveMember.seaTimeDataFromVessel;
        if (!needsCrewData || loadingSeaTime.has(effectiveMember.profile.id)) return;

        loadSeaTimeData(effectiveMember);
    }, [effectiveMember?.profile.id, effectiveMember?.accessRequest?.status, effectiveMember?.seaTimeData, effectiveMember?.seaTimeDataFromVessel, effectiveMember?.assignment?.startDate, effectiveMember?.assignment?.endDate, currentUserProfile?.role, currentUserProfile?.activeVesselId, user?.id]);

    // When viewing period changes or user switches to vessel view: load vessel breakdown only if we don't have cached data for this member+period (avoids refetch when toggling Crew ↔ Vessel, so numbers stay consistent)
    useEffect(() => {
        if (!effectiveMember || currentUserProfile?.role !== 'vessel' || effectiveMember.accessRequest?.status !== 'approved') return;
        if (breakdownViewSource !== 'vessel') return;
        if (!currentUserProfile?.activeVesselId || !user?.id) return;
        const start = effectiveMember.assignment.startDate;
        const end = effectiveMember.assignment.endDate ?? new Date().toISOString().split('T')[0];
        const cached = vesselBreakdownForView?.memberId === effectiveMember.profile.id
            && vesselBreakdownForView?.startDate === start
            && vesselBreakdownForView?.endDate === end;
        if (cached) return;
        loadVesselBreakdownForView(effectiveMember);
    }, [effectiveMember?.profile.id, effectiveMember?.assignment?.startDate, effectiveMember?.assignment?.endDate, breakdownViewSource, currentUserProfile?.role, currentUserProfile?.activeVesselId, user?.id, vesselBreakdownForView?.memberId, vesselBreakdownForView?.startDate, vesselBreakdownForView?.endDate]);

    // When a crew member is selected, fetch vessel-added leave periods (for both approved and non-approved)
    useEffect(() => {
        if (!selectedCrewMemberId || !currentUserProfile?.activeVesselId || !user?.id) return;

        const fetchLeave = async () => {
            try {
                const response = await fetch(
                    `/api/crew-leave-periods?crewUserId=${selectedCrewMemberId}&vesselId=${currentUserProfile.activeVesselId}`
                );
                if (response.ok) {
                    const { leavePeriods } = await response.json();
                    setCrewMembers(prev => prev.map(m =>
                        m.profile.id === selectedCrewMemberId ? { ...m, leavePeriods } : m
                    ));
                }
            } catch (e) {
                console.error('[CREW PAGE] Error fetching leave periods:', e);
            }
        };
        fetchLeave();
    }, [selectedCrewMemberId, currentUserProfile?.activeVesselId, user?.id]);
    
    // Form for inviting crew members
    const inviteForm = useForm<InviteCrewFormValues>({
        resolver: zodResolver(inviteCrewSchema),
        defaultValues: {
            firstName: '',
            lastName: '',
            email: '',
        },
    });

    // Form for generating Nav Watch document for selected crew member
    const navWatchForm = useForm<NavWatchApplicationFormValues>({
        resolver: zodResolver(navWatchApplicationSchema),
        defaultValues: navWatchApplicationDefaultValues,
        mode: 'onChange',
    });

    // Handler for selecting a crew member (show focused view). Pass assignmentId when same user can have multiple rows (e.g. past + active).
    const handleSelectCrewMember = async (memberId: string, assignmentId?: string) => {
        setSelectedCrewMemberId(memberId);
        setSelectedAssignmentId(assignmentId ?? null);
        setViewingServicePeriod('current');
        
        const member = crewMembers.find(m =>
            m.profile.id === memberId &&
            (!assignmentId || m.assignment.id === assignmentId)
        );
        if (!member) return;

        setBreakdownViewSource('vessel');
        setLeavePeriodsViewSource('vessel');
        setVesselBreakdownForView(null);
        
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
        // Default view is vessel: load vessel breakdown when member has access so Days breakdown shows vessel data
        if (member.accessRequest?.status === 'approved') {
            loadVesselBreakdownForView(member);
        }

        // Fetch vessel-generated testimonials for this crew member (always, for vessel managers)
        if (currentUserProfile?.activeVesselId && (currentUserProfile?.role === 'vessel' || currentUserProfile?.role === 'admin')) {
            setIsLoadingTestimonials(true);
            try {
                const vesselId = currentUserProfile.role === 'vessel' ? currentUserProfile.activeVesselId : (member.assignment?.vesselId ?? currentUserProfile.activeVesselId);
                if (!vesselId) {
                    setIsLoadingTestimonials(false);
                    return;
                }

                const [vesselTestimonialsRes, navWatchRes, proofOfServiceRes] = await Promise.all([
                    supabase
                    .from('vessel_generated_testimonials')
                    .select('*')
                    .eq('crew_user_id', memberId)
                        .eq('vessel_id', vesselId)
                        .order('created_at', { ascending: false }),
                    supabase
                        .from('nav_watch_applications')
                        .select('*')
                        .eq('user_id', memberId)
                        .order('created_at', { ascending: false }),
                    supabase
                        .from('proof_of_service')
                        .select('*')
                        .eq('crew_user_id', memberId)
                        .eq('vessel_id', vesselId)
                        .order('created_at', { ascending: false }),
                ]);

                const { data: vesselTestimonials, error: testimonialsError } = vesselTestimonialsRes;
                const { data: navWatchApps, error: navWatchError } = navWatchRes;
                const { data: proofOfServiceRows, error: proofOfServiceError } = proofOfServiceRes;

                const updates: { vesselGeneratedTestimonials?: VesselGeneratedTestimonial[]; testimonials?: Testimonial[]; navWatchApplications?: NavWatchApplication[]; proofOfServiceEntries?: ProofOfService[] } = {};
                if (!testimonialsError && vesselTestimonials) {
                    updates.vesselGeneratedTestimonials = vesselTestimonials as VesselGeneratedTestimonial[];
                }
                if (!navWatchError && navWatchApps) {
                    updates.navWatchApplications = navWatchApps as NavWatchApplication[];
                }
                if (!proofOfServiceError && proofOfServiceRows) {
                    updates.proofOfServiceEntries = proofOfServiceRows.map((r: any) => ({
                        id: r.id,
                        crewUserId: r.crew_user_id,
                        vesselId: r.vessel_id,
                        vesselUserId: r.vessel_user_id,
                        startDate: r.start_date,
                        endDate: r.end_date,
                        totalDays: r.total_days,
                        atSeaDays: r.at_sea_days,
                        standbyDays: r.standby_days,
                        yardDays: r.yard_days,
                        leaveDays: r.leave_days,
                        vesselName: r.vessel_name,
                        vesselType: r.vessel_type ?? null,
                        vesselImo: r.vessel_imo ?? null,
                        crewName: r.crew_name,
                        crewPosition: r.crew_position ?? null,
                        generatedByName: r.generated_by_name,
                        generatedByEmail: r.generated_by_email ?? null,
                        dataSource: r.data_source,
                        notes: r.notes ?? null,
                        verificationCode: r.verification_code ?? '',
                        createdAt: r.created_at,
                        updatedAt: r.updated_at,
                    }));
                }

                // When crew has given permission (approved access), also fetch all testimonials for this member/vessel so vessel can view and print
                if (member.accessRequest?.status === 'approved') {
                    const { data: allTestimonials, error: allError } = await supabase
                        .from('testimonials')
                        .select('*')
                        .eq('user_id', memberId)
                        .eq('vessel_id', vesselId)
                        .order('created_at', { ascending: false });

                    if (!allError && allTestimonials) {
                        const approvedIds = (allTestimonials as { id: string; status: string }[]).filter(t => t.status === 'approved').map(t => t.id);
                        let approvedAtMap: Record<string, string> = {};
                        if (approvedIds.length > 0) {
                            const { data: approvedSnapshots } = await supabase
                                .from('approved_testimonials')
                                .select('testimonial_id, approved_at')
                                .in('testimonial_id', approvedIds);
                            if (approvedSnapshots) {
                                approvedAtMap = Object.fromEntries(
                                    approvedSnapshots.map((s: { testimonial_id: string; approved_at: string }) => [s.testimonial_id, s.approved_at])
                                );
                            }
                        }
                        updates.testimonials = (allTestimonials as Testimonial[]).map(t => ({
                            ...t,
                            approved_at: approvedAtMap[t.id] ?? t.approved_at ?? null,
                        }));
                    }
                }

                if (Object.keys(updates).length > 0) {
                    setCrewMembers(prev => prev.map(m => 
                        m.profile.id === memberId ? { ...m, ...updates } : m
                    ));
                }
            } catch (error) {
                console.error('[CREW PAGE] Error fetching testimonials:', error);
            } finally {
                setIsLoadingTestimonials(false);
            }
        }
    };


    // Get vessel details helper
    const getVesselDetails = (vesselId: string) => {
        return allVessels?.find(v => v.id === vesselId);
    };

    // When crew has granted access, vessel leave is source of truth. Otherwise merge both.
    const availablePeriodsBetweenLeave = useMemo(() => {
        if (!effectiveMember) return [];

        const allLeavePeriods: Array<{ startDate: string; endDate: string }> = [];
        const hasAccess = effectiveMember.accessRequest?.status === 'approved';

        if (hasAccess) {
            if (effectiveMember.leavePeriods) {
                effectiveMember.leavePeriods.forEach(period => {
                    allLeavePeriods.push({ startDate: period.startDate, endDate: period.endDate });
                });
            }
        } else {
            if (effectiveMember.leavePeriods) {
                effectiveMember.leavePeriods.forEach(period => {
                    allLeavePeriods.push({ startDate: period.startDate, endDate: period.endDate });
                });
            }
            if (effectiveMember.leavePeriodsFromLogs) {
                effectiveMember.leavePeriodsFromLogs.forEach(period => {
                    allLeavePeriods.push({ startDate: period.startDate, endDate: period.endDate });
                });
            }
        }

        if (allLeavePeriods.length === 0) return [];

        const normalizeDate = (dateStr: string): Date => {
            const date = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00');
            date.setHours(0, 0, 0, 0);
            return date;
        };
        const rangeStart = normalizeDate(effectiveMember.assignment.startDate);
        const rangeEnd = normalizeDate(effectiveMember.assignment.endDate ?? new Date().toISOString().split('T')[0]);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const effectiveEnd = rangeEnd > today ? today : rangeEnd;
        // Only leave periods overlapping the viewing period
        const overlappingLeave = allLeavePeriods.filter(lp => {
            const lpStart = normalizeDate(lp.startDate);
            const lpEnd = normalizeDate(lp.endDate);
            return lpStart <= effectiveEnd && lpEnd >= rangeStart;
        });

        const sortedLeavePeriods = [...overlappingLeave].sort((a, b) => 
            new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        );

        // Helper to normalize date to midnight (nullable for assignment end)
        const normalizeDateFull = (dateStr: string | null | undefined): Date => {
            if (!dateStr) return new Date(new Date().setHours(0, 0, 0, 0));
            const date = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00');
            date.setHours(0, 0, 0, 0);
            return date;
        };
        const assignmentStartDate = normalizeDateFull(effectiveMember.assignment.startDate);
        const assignmentEndDate = normalizeDateFull(effectiveMember.assignment.endDate);
        const todayMidnight = new Date(new Date().setHours(0, 0, 0, 0));
        const effectiveEndDate = assignmentEndDate > todayMidnight ? todayMidnight : assignmentEndDate;

        if (sortedLeavePeriods.length === 0) {
            return [{ startDate: assignmentStartDate, endDate: effectiveEndDate, label: `Full period (${formatDate(assignmentStartDate, 'MMM dd')} - ${formatDate(effectiveEndDate, 'MMM dd, yyyy')})` }];
        }

        const periods: Array<{ startDate: Date; endDate: Date; label: string }> = [];

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
    }, [effectiveMember]);

    // When crew has granted access: vessel leave is used for calculations. Detect conflict if crew's logs differ from vessel.
    const leaveConflictInfo = useMemo(() => {
        if (!effectiveMember || effectiveMember.accessRequest?.status !== 'approved') return null;
        const startStr = effectiveMember.assignment?.startDate;
        if (!startStr) return null;
        const startDate = parse(startStr, 'yyyy-MM-dd', new Date());
        const endDate = effectiveMember.assignment?.endDate
            ? parse(effectiveMember.assignment.endDate, 'yyyy-MM-dd', new Date())
            : new Date();
        const today = startOfDay(new Date());
        const effectiveEnd = endDate > today ? today : endDate;
        if (startDate > effectiveEnd) return null;

        const daysInRange = (periodStart: string, periodEnd: string) => {
            const s = parse(periodStart, 'yyyy-MM-dd', new Date());
            const e = parse(periodEnd, 'yyyy-MM-dd', new Date());
            const clampedStart = s < startDate ? startDate : s;
            const clampedEnd = e > effectiveEnd ? effectiveEnd : e;
            if (clampedStart > clampedEnd) return 0;
            return differenceInDays(clampedEnd, clampedStart) + 1;
        };

        let vesselLeaveDays = 0;
        (effectiveMember.leavePeriods || []).forEach(lp => {
            vesselLeaveDays += daysInRange(lp.startDate, lp.endDate);
        });
        let crewLeaveDays = 0;
        (effectiveMember.leavePeriodsFromLogs || []).forEach(lp => {
            crewLeaveDays += daysInRange(lp.startDate, lp.endDate);
        });

        const conflict = vesselLeaveDays !== crewLeaveDays;
        return { vesselLeaveDays, crewLeaveDays, conflict };
    }, [effectiveMember]);

    // Filter documents and leave to the effective viewing period (current, previous, or all)
    const effectivePeriodFiltered = useMemo(() => {
        if (!effectiveMember) return { vesselGeneratedTestimonials: [], testimonials: [], proofOfServiceEntries: [], leavePeriods: [], leavePeriodsFromLogs: [] };
        const toDateStr = (s: string | null | undefined) => (s ? String(s).split('T')[0] ?? s : '');
        const start = toDateStr(effectiveMember.assignment.startDate) || '';
        const end = toDateStr(effectiveMember.assignment.endDate) || toDateStr(new Date().toISOString());
        const overlaps = (itemStart: string, itemEnd: string) => {
            const a = toDateStr(itemStart);
            const b = toDateStr(itemEnd);
            return a <= end && b >= start;
        };

        const vg = (effectiveMember.vesselGeneratedTestimonials ?? []).filter((t: { start_date: string; end_date?: string | null }) =>
            overlaps(t.start_date, t.end_date ?? end)
        );
        const test = (effectiveMember.testimonials ?? []).filter((t: { start_date: string; end_date: string }) =>
            overlaps(t.start_date, t.end_date ?? end)
        );
        const pos = (effectiveMember.proofOfServiceEntries ?? []).filter((e: { startDate: string; endDate: string | null }) =>
            overlaps(e.startDate, e.endDate ?? end)
        );
        const lp = (effectiveMember.leavePeriods ?? []).filter((p: { startDate: string; endDate: string }) =>
            overlaps(toDateStr(p.startDate), toDateStr(p.endDate))
        );
        const lpLogs = (effectiveMember.leavePeriodsFromLogs ?? []).filter((p: { startDate: string; endDate: string }) =>
            overlaps(toDateStr(p.startDate), toDateStr(p.endDate))
        );
        return { vesselGeneratedTestimonials: vg, testimonials: test, proofOfServiceEntries: pos, leavePeriods: lp, leavePeriodsFromLogs: lpLogs };
    }, [effectiveMember]);

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

    // Generate Nav Watch (MCA Watch Rating) document for selected crew member — save and download
    const handleNavWatchSubmit = async (data: NavWatchApplicationFormValues) => {
        if (!selectedMemberData?.profile || !supabase || !allVessels) return;
        setIsSavingNavWatch(true);
        try {
            await buildAndGenerateNavWatchApplication(supabase, {
                userId: selectedMemberData.profile.id,
                userProfile: selectedMemberData.profile,
                formData: data,
                allVessels,
                vesselId: currentUserProfile?.activeVesselId ?? undefined,
                vesselUserId: user?.id ?? undefined,
            });
            toast({
                title: 'Success',
                description: 'Nav Watch document saved and downloaded. You can download it again anytime from the list below.',
            });
            setIsNavWatchDialogOpen(false);
            navWatchForm.reset(navWatchApplicationDefaultValues);
            // Refresh Nav Watch list for this crew member
            if (selectedCrewMemberId && currentUserProfile?.activeVesselId) {
                const { data: navWatchApps, error: navWatchError } = await supabase
                    .from('nav_watch_applications')
                    .select('*')
                    .eq('user_id', selectedMemberData.profile.id)
                    .order('created_at', { ascending: false });
                if (!navWatchError && navWatchApps) {
                    setCrewMembers(prev => prev.map(m =>
                        m.profile.id === selectedCrewMemberId
                            ? { ...m, navWatchApplications: navWatchApps as NavWatchApplication[] }
                            : m
                    ));
                }
            }
        } catch (error: any) {
            console.error('[CREW PAGE] Nav Watch generate error:', error);
            toast({
                title: 'Error',
                description: error?.message || 'Failed to generate PDF. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsSavingNavWatch(false);
        }
    };

    // Generate Nav Watch PDF for a saved application (preview opens in new tab, download triggers download)
    const handleNavWatchPdf = async (
        application: NavWatchApplication,
        output: 'download' | 'newtab'
    ) => {
        if (!selectedMemberData?.profile) return;
        if (output === 'download') setDownloadingNavWatchId(application.id);
        else setPreviewingNavWatchId(application.id);
        try {
            const pd = application.personal_details as any;
            const profile = selectedMemberData.profile as any;
            const getProfileField = (snake: string, camel: string): string | undefined => {
                const v = profile?.[snake] ?? profile?.[camel];
                return v && String(v).trim() ? String(v).trim() : undefined;
            };
            const personalDetails = {
                ...pd,
                title: getProfileField('title', 'title') || pd.title,
                placeOfBirth: getProfileField('place_of_birth', 'placeOfBirth') || pd.placeOfBirth,
                countryOfBirth: getProfileField('country_of_birth', 'countryOfBirth') || pd.countryOfBirth,
                nationality: getProfileField('nationality', 'nationality') || pd.nationality,
                telephone: getProfileField('telephone', 'telephone') || pd.telephone,
                mobile: getProfileField('mobile', 'mobile') || pd.mobile,
                address: {
                    line1: getProfileField('address_line1', 'addressLine1') || pd.address?.line1 || '',
                    line2: getProfileField('address_line2', 'addressLine2') || pd.address?.line2,
                    district: getProfileField('address_district', 'addressDistrict') || pd.address?.district,
                    townCity: getProfileField('address_town_city', 'addressTownCity') || pd.address?.townCity || '',
                    countyState: getProfileField('address_county_state', 'addressCountyState') || pd.address?.countyState,
                    postCode: getProfileField('address_post_code', 'addressPostCode') || pd.address?.postCode || '',
                    country: getProfileField('address_country', 'addressCountry') || pd.address?.country || '',
                },
                dateOfBirth: pd.dateOfBirth || '',
            };
            await generateMCAWatchRatingForm({
                personalDetails,
                certificateType: application.certificate_type,
                seaServiceRecords: Array.isArray(application.sea_service_records) ? application.sea_service_records : [],
                userProfile: {
                    firstName: selectedMemberData.profile.firstName,
                    lastName: selectedMemberData.profile.lastName,
                    username: selectedMemberData.profile.username || '',
                    email: selectedMemberData.profile.email || '',
                    dateOfBirth: (profile?.date_of_birth ?? profile?.dateOfBirth) || null,
                    position: selectedMemberData.profile.position || null,
                    dischargeBookNumber: (profile?.discharge_book_number ?? profile?.dischargeBookNumber) || null,
                },
                receiptData: {
                    documentId: application.id,
                    documentType: 'nav_watch',
                    generatedAt: application.created_at,
                    generatedBy: { userId: user?.id, email: currentUserProfile?.email || undefined },
                },
            }, output, { debug: false });
            if (output === 'download') {
                toast({ title: 'Success', description: 'PDF downloaded successfully.' });
            } else {
                toast({ title: 'Preview', description: 'PDF opened in a new tab.' });
            }
        } catch (error: any) {
            console.error('[CREW PAGE] Nav Watch PDF error:', error);
            toast({
                title: 'Error',
                description: error?.message || (output === 'download' ? 'Failed to download PDF.' : 'Failed to open preview.'),
                variant: 'destructive',
            });
        } finally {
            setDownloadingNavWatchId(null);
            setPreviewingNavWatchId(null);
        }
    };

    const handleDownloadNavWatch = (app: NavWatchApplication) => handleNavWatchPdf(app, 'download');
    const handlePreviewNavWatch = (app: NavWatchApplication) => handleNavWatchPdf(app, 'newtab');

    // Delete a saved Nav Watch document
    const handleDeleteNavWatch = async (application: NavWatchApplication) => {
        if (!user?.id || !selectedCrewMemberId) return;
        setDeletingNavWatchId(application.id);
        try {
            const { error } = await supabase
                .from('nav_watch_applications')
                .delete()
                .eq('id', application.id);

            if (error) throw error;
            toast({ title: 'Document deleted', description: 'Nav Watch document has been removed.' });
            const { data: navWatchApps, error: fetchErr } = await supabase
                .from('nav_watch_applications')
                .select('*')
                .eq('user_id', selectedMemberData!.profile.id)
                .order('created_at', { ascending: false });
            if (!fetchErr && navWatchApps) {
                setCrewMembers(prev => prev.map(m =>
                    m.profile.id === selectedCrewMemberId ? { ...m, navWatchApplications: navWatchApps as NavWatchApplication[] } : m
                ));
            }
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error?.message || 'Failed to delete document.',
                variant: 'destructive',
            });
        } finally {
            setDeletingNavWatchId(null);
        }
    };

    const handleDownloadProofOfService = async (entry: ProofOfService) => {
        setDownloadingProofOfServiceId(entry.id);
        try {
            await generateProofOfServicePDF({
                vesselName: entry.vesselName,
                vesselType: entry.vesselType,
                vesselImo: entry.vesselImo,
                crewName: entry.crewName,
                crewPosition: entry.crewPosition,
                startDate: entry.startDate,
                endDate: entry.endDate,
                totalDays: entry.totalDays,
                atSeaDays: entry.atSeaDays,
                standbyDays: entry.standbyDays,
                yardDays: entry.yardDays,
                leaveDays: entry.leaveDays,
                generatedByName: entry.generatedByName,
                generatedByEmail: entry.generatedByEmail,
                notes: entry.notes,
                verificationCode: entry.verificationCode,
            }, 'download');
            toast({ title: 'Downloaded', description: 'Proof of Service PDF saved.' });
        } catch (e: any) {
            toast({ title: 'Error', description: e?.message ?? 'Failed to generate PDF.', variant: 'destructive' });
        } finally {
            setDownloadingProofOfServiceId(null);
        }
    };

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

    // Verify vessel manager password and delete crew testimonial (for approved testimonials)
    const verifyPasswordAndDeleteCrewTestimonial = async (testimonial: Testimonial) => {
        const vesselManagerEmail = currentUserProfile?.email || (user as { email?: string } | null)?.email;
        if (!user?.id || !vesselManagerEmail || !deleteCrewPassword) {
            setDeleteCrewPasswordError('Password is required');
            return;
        }
        isVerifyingCrewDeleteRef.current = true;
        setDeleteCrewPasswordError('');
        try {
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: vesselManagerEmail,
                password: deleteCrewPassword,
            });
            if (signInError) {
                setDeleteCrewPasswordError('Incorrect password. Please try again.');
                return;
            }
            await handleDeleteCrewTestimonial(testimonial);
        } catch (err: unknown) {
            console.error('[CREW PAGE] Error verifying password for delete:', err);
            setDeleteCrewPasswordError('An error occurred. Please try again.');
        } finally {
            isVerifyingCrewDeleteRef.current = false;
        }
    };

    // Delete a crew testimonial (from testimonials table; vessel manager must have approved access – RLS)
    const handleDeleteCrewTestimonial = async (testimonial: Testimonial) => {
        if (!selectedCrewMemberId || !selectedMemberData) return;
        setIsDeletingCrewTestimonial(true);
        try {
            const { error } = await supabase
                .from('testimonials')
                .delete()
                .eq('id', testimonial.id);

            if (error) throw error;

            toast({
                title: 'Testimonial deleted',
                description: 'The testimonial has been removed.',
            });

            setCrewMembers(prev => prev.map(m =>
                m.profile.id === selectedCrewMemberId
                    ? { ...m, testimonials: (m.testimonials || []).filter(t => t.id !== testimonial.id) }
                    : m
            ));
            setCrewTestimonialToDelete(null);
            setDeleteCrewPassword('');
            setDeleteCrewPasswordError('');
        } catch (err: unknown) {
            console.error('[CREW PAGE] Error deleting crew testimonial:', err);
            toast({
                title: 'Error',
                description: err instanceof Error ? err.message : 'Failed to delete testimonial.',
                variant: 'destructive',
            });
        } finally {
            setIsDeletingCrewTestimonial(false);
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

    // Send a saved vessel-generated document to captain by email (same flow as document generator: create testimonial + sign-off link)
    const handleSendVesselDocToCaptainByEmail = async () => {
        const captainEmail = sendTestimonialByEmailValue?.trim();
        if (!captainEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(captainEmail)) {
            toast({
                title: 'Invalid email',
                description: 'Please enter a valid captain email address.',
                variant: 'destructive',
            });
            return;
        }
        if (!vesselDocToSendToCaptain || !selectedMemberData || !currentUserProfile?.activeVesselId) {
            toast({
                title: 'Error',
                description: 'Document or crew data not available.',
                variant: 'destructive',
            });
            return;
        }
        const vessel = getVesselDetails(currentUserProfile.activeVesselId);
        if (!vessel) {
            toast({
                title: 'Error',
                description: 'Vessel details not found.',
                variant: 'destructive',
            });
            return;
        }
        if (!session?.access_token) {
            toast({
                title: 'Error',
                description: 'Your session has expired. Please refresh and try again.',
                variant: 'destructive',
            });
            return;
        }
        setIsSendingTestimonialByEmail(true);
        try {
            const doc = vesselDocToSendToCaptain;
            const totalDays = doc.at_sea_days + doc.standby_days + doc.yard_days + doc.leave_days;
            const testimonialData = {
                user_id: doc.crew_user_id,
                vessel_id: doc.vessel_id,
                start_date: doc.start_date,
                end_date: doc.end_date,
                total_days: totalDays,
                at_sea_days: doc.at_sea_days,
                standby_days: doc.standby_days,
                yard_days: doc.yard_days,
                leave_days: doc.leave_days,
                status: 'pending_captain' as const,
                captain_user_id: null,
                captain_email: captainEmail,
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
                generated_by_user_id: user?.id ?? null,
            };
            const { data: createdTestimonial, error: createError } = await supabase
                .from('testimonials')
                .insert(testimonialData)
                .select()
                .single();
            if (createError) throw createError;

            const tokenRes = await fetch('/api/testimonials/create-signoff-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ testimonialId: createdTestimonial.id, captainEmail }),
            });
            const tokenData = await tokenRes.json().catch(() => ({}));
            if (!tokenRes.ok || !tokenData.token) {
                throw new Error(tokenData.error || 'Failed to create sign-off link');
            }

            await requestCaptainSignoff(
                supabase,
                {
                    ...(createdTestimonial as Testimonial),
                    vessel_name: vessel.name,
                    signoffToken: tokenData.token,
                },
                toast
            );

            const testimonialWithSource = { ...createdTestimonial, data_source: doc.data_source } as Testimonial;
            setCrewMembers(prev => prev.map(member =>
                member.profile.id === selectedMemberData.profile.id
                    ? {
                        ...member,
                        testimonials: [
                            testimonialWithSource,
                            ...(member.testimonials || []),
                        ],
                    }
                    : member
            ));

            setSendTestimonialByEmailOpen(false);
            setSendTestimonialByEmailValue('');
            setVesselDocToSendToCaptain(null);
            toast({
                title: 'Sent',
                description: 'Captain will receive an email with a secure link to approve the testimonial.',
            });
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error?.message || 'Failed to send. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsSendingTestimonialByEmail(false);
        }
    };

    // Generate PDF for a vessel-generated testimonial (output: 'download' | 'newtab' for preview)
    const handleGenerateVesselTestimonialPDF = async (testimonial: VesselGeneratedTestimonial, format: TestimonialPDFFormat = 'mca', output: TestimonialPDFOutput = 'download') => {
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
                    partOfActivePassageDates.size > 0 ? partOfActivePassageDates : undefined,
                    { rangeStart: testimonial.start_date, rangeEnd: testimonial.end_date }
                );

                const logMapByDate = new Map<string, string>();
                filteredLogs.forEach(log => {
                    logMapByDate.set(log.date, (log.state as string) || '');
                });

                const mapped = calculatedPeriods.map((period, index) => {
                    const voyage = voyages[index];
                    const standbyStartDate = formatDate(period.startDate, 'yyyy-MM-dd');
                    const standbyEndDate = period.countedDays > 0
                        ? formatDate(addDays(period.startDate, period.countedDays - 1), 'yyyy-MM-dd')
                        : standbyStartDate;
                    if (!voyage) {
                        const voyageEndDate = new Date(period.startDate);
                        voyageEndDate.setDate(voyageEndDate.getDate() - 1);
                        const voyageStartDate = new Date(voyageEndDate);
                        voyageStartDate.setDate(voyageStartDate.getDate() - (period.precedingVoyageDays || 0) + 1);
                        return {
                            passageStartDate: formatDate(voyageStartDate, 'yyyy-MM-dd'),
                            passageEndDate: formatDate(voyageEndDate, 'yyyy-MM-dd'),
                            standbyStartDate,
                            standbyEndDate,
                            standbyDays: period.countedDays,
                            period,
                        };
                    }
                    const voyageStart = voyage.startDate instanceof Date ? voyage.startDate : new Date(voyage.startDate);
                    const voyageEnd = voyage.endDate instanceof Date ? voyage.endDate : new Date(voyage.endDate);
                    return {
                        passageStartDate: formatDate(voyageStart, 'yyyy-MM-dd'),
                        passageEndDate: formatDate(voyageEnd, 'yyyy-MM-dd'),
                        standbyStartDate,
                        standbyEndDate,
                        standbyDays: period.countedDays,
                        period,
                    };
                });

                standbyPeriods = mapped
                    .filter(({ period }) => {
                        if (period.countedDays <= 0) return false;
                        for (let i = 0; i < period.countedDays; i++) {
                            const d = addDays(period.startDate, i);
                            const dateStr = formatDate(d, 'yyyy-MM-dd');
                            const state = logMapByDate.get(dateStr);
                            if (state === 'in-yard' || state === 'on-leave') {
                                return false;
                            }
                        }
                        return true;
                    })
                    .map(({ passageStartDate, passageEndDate, standbyStartDate, standbyEndDate, standbyDays }) => ({
                        passageStartDate,
                        passageEndDate,
                        standbyStartDate,
                        standbyEndDate,
                        standbyDays,
                    }));
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
                    await generateMCAOfficerTestimonial(testimonialDataWithReceipt, output);
                } else {
                    await generateMCADeckhandTestimonial(testimonialDataWithReceipt, output);
                }
            } else {
                await generateTestimonialPDF(testimonialData, format, output, {
                  debug: process.env.NEXT_PUBLIC_PDF_DEBUG === 'true',
                });
            }

            if (output === 'download') {
                toast({
                    title: 'Success',
                    description: 'PDF generated successfully.',
                });
            } else if (output === 'newtab') {
                toast({
                    title: 'Preview',
                    description: 'PDF opened in a new tab.',
                });
            }
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

    // Generate PDF for a testimonial (output: 'download' | 'newtab' for preview)
    const handleGeneratePDF = async (testimonial: Testimonial, format: TestimonialPDFFormat = 'mca', output: TestimonialPDFOutput = 'download') => {
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
                    partOfActivePassageDates.size > 0 ? partOfActivePassageDates : undefined,
                    { rangeStart: testimonial.start_date, rangeEnd: testimonial.end_date }
                );

                const logMapByDate = new Map<string, string>();
                filteredLogs.forEach(log => {
                    logMapByDate.set(log.date, (log.state as string) || '');
                });

                const mapped = calculatedPeriods.map((period, index) => {
                    const voyage = voyages[index];
                    const standbyStartDate = formatDate(period.startDate, 'yyyy-MM-dd');
                    const standbyEndDate = period.countedDays > 0
                        ? formatDate(addDays(period.startDate, period.countedDays - 1), 'yyyy-MM-dd')
                        : standbyStartDate;
                    if (!voyage) {
                        const voyageEndDate = new Date(period.startDate);
                        voyageEndDate.setDate(voyageEndDate.getDate() - 1);
                        const voyageStartDate = new Date(voyageEndDate);
                        voyageStartDate.setDate(voyageStartDate.getDate() - (period.precedingVoyageDays || 0) + 1);
                        return {
                            passageStartDate: formatDate(voyageStartDate, 'yyyy-MM-dd'),
                            passageEndDate: formatDate(voyageEndDate, 'yyyy-MM-dd'),
                            standbyStartDate,
                            standbyEndDate,
                            standbyDays: period.countedDays,
                            period,
                        };
                    }
                    const voyageStart = voyage.startDate instanceof Date ? voyage.startDate : new Date(voyage.startDate);
                    const voyageEnd = voyage.endDate instanceof Date ? voyage.endDate : new Date(voyage.endDate);
                    return {
                        passageStartDate: formatDate(voyageStart, 'yyyy-MM-dd'),
                        passageEndDate: formatDate(voyageEnd, 'yyyy-MM-dd'),
                        standbyStartDate,
                        standbyEndDate,
                        standbyDays: period.countedDays,
                        period,
                    };
                });

                standbyPeriods = mapped
                    .filter(({ period }) => {
                        if (period.countedDays <= 0) return false;
                        for (let i = 0; i < period.countedDays; i++) {
                            const d = addDays(period.startDate, i);
                            const dateStr = formatDate(d, 'yyyy-MM-dd');
                            const state = logMapByDate.get(dateStr);
                            if (state === 'in-yard' || state === 'on-leave') {
                                return false;
                            }
                        }
                        return true;
                    })
                    .map(({ passageStartDate, passageEndDate, standbyStartDate, standbyEndDate, standbyDays }) => ({
                        passageStartDate,
                        passageEndDate,
                        standbyStartDate,
                        standbyEndDate,
                        standbyDays,
                    }));
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
                    await generateMCAOfficerTestimonial(testimonialDataWithReceipt, output);
                } else {
                    await generateMCADeckhandTestimonial(testimonialDataWithReceipt, output);
                }
            } else {
                await generateTestimonialPDF(testimonialData, format, output, {
                  debug: process.env.NEXT_PUBLIC_PDF_DEBUG === 'true',
                });
            }

            if (output === 'download') {
                toast({
                    title: 'Success',
                    description: 'PDF generated successfully.',
                });
            } else if (output === 'newtab') {
                toast({
                    title: 'Preview',
                    description: 'PDF opened in a new tab.',
                });
            }
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

    // Preview PDF from Document breakdown dialog (finds full testimonial by id and opens in new tab)
    const handlePreviewFromBreakdown = async () => {
        if (!viewDocumentBreakdown || !selectedMemberData) return;
        const vesselGen = selectedMemberData.vesselGeneratedTestimonials?.find(t => t.id === viewDocumentBreakdown.id);
        const format = (viewDocumentBreakdown.pdf_format as TestimonialPDFFormat) || 'mca';
        if (vesselGen) {
            await handleGenerateVesselTestimonialPDF(vesselGen, format, 'newtab');
        } else {
            const crewTestimonial = selectedMemberData.testimonials?.find(t => t.id === viewDocumentBreakdown.id);
            if (crewTestimonial) {
                await handleGeneratePDF(crewTestimonial, format, 'newtab');
            } else {
                toast({
                    title: 'Preview unavailable',
                    description: 'Could not find testimonial data to preview.',
                    variant: 'destructive',
                });
            }
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
                partOfActivePassageDates.size > 0 ? partOfActivePassageDates : undefined,
                { rangeStart: startDateStr, rangeEnd: endDateStr }
            );

            const logMap = new Map<string, StateLog>();
            filteredLogs.forEach(log => {
                logMap.set(log.date, log);
            });
            
            const startDateObj = parse(startDateStr, 'yyyy-MM-dd', new Date());
            const endDateObj = parse(endDateStr, 'yyyy-MM-dd', new Date());
            const dateRangeSet = new Set<string>();
            let currentDate = new Date(startDateObj);
            while (currentDate <= endDateObj) {
                dateRangeSet.add(formatDate(currentDate, 'yyyy-MM-dd'));
                currentDate = addDays(currentDate, 1);
            }

            // Assign a state to every date in range: use log when present, else carry forward/backward so total days = calendar days
            const sortedDates = Array.from(dateRangeSet).sort();
            const firstDateWithLog = sortedDates.find(d => logMap.has(d));
            const firstState = firstDateWithLog ? (logMap.get(firstDateWithLog)!.state as string) : 'in-port';
            const effectiveState = new Map<string, string>();
            let lastState: string | null = null;
            for (const dateStr of sortedDates) {
                const log = logMap.get(dateStr);
                if (log) {
                    lastState = log.state as string;
                    effectiveState.set(dateStr, lastState);
                } else if (lastState !== null) {
                    effectiveState.set(dateStr, lastState);
                } else {
                    effectiveState.set(dateStr, firstState);
                }
            }

            const vessel = getVesselDetails(currentUserProfile.activeVesselId!);
            const category = getVesselCalculationCategory(vessel?.type ?? null);
            if (isAllDaysExceptLeaveCountAsSea(category)) {
                let leaveCount = 0;
                dateRangeSet.forEach((dateStr) => {
                    if (effectiveState.get(dateStr) === 'on-leave') leaveCount++;
                });
                const totalDays = dateRangeSet.size;
                setCalculatedSeaTime({
                    totalDays,
                    atSeaDays: totalDays - leaveCount,
                    standbyDays: 0,
                    yardDays: 0,
                    leaveDays: leaveCount,
                    otherDays: 0,
                    isOfficer,
                });
                toast({ title: 'Calculated', description: 'Sea time calculated (commercial rules: all days onboard count except leave).' });
                setIsCalculatingSeaTime(false);
                return;
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
                    if (!dateRangeSet.has(dateStr)) {
                        date = addDays(date, 1);
                        continue;
                    }
                    const state = effectiveState.get(dateStr) || logMap.get(dateStr)?.state;
                    // Only in-port and at-anchor count as standby; in-yard and on-leave never do
                    if (state === 'in-port' || state === 'at-anchor') {
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
            let otherDays = 0;

            dateRangeSet.forEach(dateStr => {
                const state = effectiveState.get(dateStr);
                if (!state) return;

                if (state === 'in-yard') {
                    yardDays++;
                    return;
                }
                if (state === 'on-leave') {
                    leaveDays++;
                    return;
                }

                if (voyageDatesSet.has(dateStr)) {
                    finalSeaDays++;
                    return;
                }

                if (watchDates?.has(dateStr) && (state === 'in-port' || state === 'at-anchor')) {
                    finalSeaDays++;
                    return;
                }

                if (partOfActivePassageDates?.has(dateStr) && state !== 'underway') {
                    finalSeaDays++;
                    return;
                }

                if (standbyDatesSet.has(dateStr)) {
                    finalStandbyDays++;
                    return;
                }

                // In-port/at-anchor not in voyage, watch, or standby (e.g. before first voyage or after standby cap) — do not count as standby (MCA: standby can never exceed at-sea days). Count as "other" so total = calendar days.
                if (state === 'in-port' || state === 'at-anchor') {
                    otherDays++;
                    return;
                }
                if (state === 'underway') {
                    finalSeaDays++;
                }
            });

            // MCA rule: standby days can never exceed at-sea days
            const cappedStandbyDays = Math.min(finalStandbyDays, finalSeaDays);

            const totalDays = dateRangeSet.size;

            setCalculatedSeaTime({
                totalDays,
                atSeaDays: finalSeaDays,
                standbyDays: cappedStandbyDays,
                yardDays,
                leaveDays,
                otherDays,
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
            // total_days = calendar days in range (calculatedSeaTime.totalDays is dateRangeSet.size)
            const totalDays = calculatedSeaTime.totalDays;
            // Cap standby_days so it never exceeds range or at_sea_days (MCA rule)
            const standbyDaysToSave = Math.min(
                calculatedSeaTime.standbyDays,
                totalDays,
                calculatedSeaTime.atSeaDays
            );
            
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
                // When no approved access we still allow saving: use vessel data (data_source: 'vessel')
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
                standby_days: standbyDaysToSave,
                yard_days: calculatedSeaTime.yardDays,
                leave_days: calculatedSeaTime.leaveDays,
                generated_by_name: currentUserProfile.firstName && currentUserProfile.lastName 
                    ? `${currentUserProfile.firstName} ${currentUserProfile.lastName}`
                    : currentUserProfile.email || 'Vessel Manager',
                generated_by_email: currentUserProfile.email || null,
                data_source: dataSource as 'crew' | 'vessel',
                notes: null, // No notes for vessel-generated testimonials
                pdf_format: 'mca', // Default format, can be changed when generating PDF later
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
    const handleGenerateFromDateRange = async (pdfFormat: TestimonialPDFFormat = 'mca') => {
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
            // total_days = calendar days in range (calculatedSeaTime.totalDays is dateRangeSet.size)
            const totalDays = calculatedSeaTime.totalDays;
            
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
                // When no approved access we still allow generation: use vessel data (data_source: 'vessel')
            } else {
                // Admins can use either data source
                hasApprovedAccess = true;
            }

            const dataSource = hasApprovedAccess
                ? (selectedDataSource || 'crew') 
                : 'vessel';

            const standbyCap = Math.min(calculatedSeaTime.standbyDays, totalDays, calculatedSeaTime.atSeaDays);

            // Save to vessel_generated_testimonials table (separate from main testimonials table)
            const testimonialToSave = {
                crew_user_id: selectedMemberData.profile.id,
                vessel_id: currentUserProfile.activeVesselId,
                vessel_user_id: currentUserProfile.id,
                start_date: startDateStr,
                end_date: endDateStr,
                total_days: totalDays,
                at_sea_days: calculatedSeaTime.atSeaDays,
                standby_days: standbyCap,
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
            const calendarDays = differenceInDays(documentEndDate, documentStartDate) + 1;
            const dataSource = selectedMemberData.accessRequest?.status === 'approved'
                ? (selectedDataSource || 'crew')
                : 'vessel';

            const standbyCap = Math.min(calculatedSeaTime.standbyDays, calendarDays, calculatedSeaTime.atSeaDays);
            const atSea = calculatedSeaTime.atSeaDays;
            const yard = calculatedSeaTime.yardDays;
            const leave = calculatedSeaTime.leaveDays;
            const totalDays = atSea + standbyCap + yard + leave;

            const testimonialData = {
                user_id: selectedMemberData.profile.id,
                vessel_id: currentUserProfile.activeVesselId,
                start_date: startDateStr,
                end_date: endDateStr,
                total_days: totalDays,
                at_sea_days: atSea,
                standby_days: standbyCap,
                yard_days: yard,
                leave_days: leave,
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
                generated_by_user_id: user?.id ?? null,
            };

            const { data: createdTestimonial, error: createError } = await supabase
                .from('testimonials')
                .insert(testimonialData)
                .select()
                .single();

            if (createError) {
                throw createError;
            }

            // Attach data_source locally for UI (column may not exist in DB yet)
            const testimonialWithSource = { ...createdTestimonial, data_source: dataSource } as Testimonial;

            setCrewMembers(prev => prev.map(member => 
                member.profile.id === selectedMemberData.profile.id
                    ? { 
                        ...member, 
                        testimonials: [
                            testimonialWithSource,
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

    // Send testimonial to captain by email (when vessel has no active SeaJourney captain)
    const handleSendTestimonialToCaptainByEmail = async () => {
        const captainEmail = sendTestimonialByEmailValue?.trim();
        if (!captainEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(captainEmail)) {
            toast({
                title: 'Invalid email',
                description: 'Please enter a valid captain email address.',
                variant: 'destructive',
            });
            return;
        }
        if (!selectedMemberData || !currentUserProfile?.activeVesselId || !documentStartDate || !documentEndDate || !calculatedSeaTime) {
            toast({
                title: 'Error',
                description: 'Please select dates and calculate sea time first.',
                variant: 'destructive',
            });
            return;
        }

        setIsSendingTestimonialByEmail(true);
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
            const calendarDays = differenceInDays(documentEndDate, documentStartDate) + 1;
            const dataSource = selectedMemberData.accessRequest?.status === 'approved'
                ? (selectedDataSource || 'crew')
                : 'vessel';

            const standbyCap = Math.min(calculatedSeaTime.standbyDays, calendarDays, calculatedSeaTime.atSeaDays);
            const atSea = calculatedSeaTime.atSeaDays;
            const yard = calculatedSeaTime.yardDays;
            const leave = calculatedSeaTime.leaveDays;
            const totalDays = atSea + standbyCap + yard + leave;

            const testimonialData = {
                user_id: selectedMemberData.profile.id,
                vessel_id: currentUserProfile.activeVesselId,
                start_date: startDateStr,
                end_date: endDateStr,
                total_days: totalDays,
                at_sea_days: atSea,
                standby_days: standbyCap,
                yard_days: yard,
                leave_days: leave,
                status: 'pending_captain' as const,
                captain_user_id: null,
                captain_email: captainEmail,
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
                generated_by_user_id: user?.id ?? null,
            };

            const { data: createdTestimonial, error: createError } = await supabase
                .from('testimonials')
                .insert(testimonialData)
                .select()
                .single();

            if (createError) {
                throw createError;
            }

            if (!session?.access_token) {
                throw new Error('Your session has expired. Please refresh and try again.');
            }

            const tokenRes = await fetch('/api/testimonials/create-signoff-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    testimonialId: createdTestimonial.id,
                    captainEmail: captainEmail,
                }),
            });
            const tokenData = await tokenRes.json().catch(() => ({}));
            if (!tokenRes.ok || !tokenData.token) {
                throw new Error(tokenData.error || 'Failed to create sign-off link');
            }

            await requestCaptainSignoff(
                supabase,
                {
                    ...(createdTestimonial as Testimonial),
                    vessel_name: vessel.name,
                    signoffToken: tokenData.token,
                },
                toast
            );

            const testimonialWithSource = { ...createdTestimonial, data_source: dataSource } as Testimonial;
            setCrewMembers(prev => prev.map(member =>
                member.profile.id === selectedMemberData.profile.id
                    ? {
                        ...member,
                        testimonials: [
                            testimonialWithSource,
                            ...(member.testimonials || []),
                        ],
                    }
                    : member
            ));

            setSendTestimonialByEmailOpen(false);
            setSendTestimonialByEmailValue('');
            setDocumentStartDate(undefined);
            setDocumentEndDate(undefined);
            setCalculatedSeaTime(null);
            setShowGenerateForm(false);
        } catch (error: any) {
            console.error('[CREW PAGE] Error sending testimonial to captain by email:', error);
            toast({
                title: 'Error',
                description: error?.message || 'Failed to send. Please try again.',
                variant: 'destructive',
            });
        } finally {
            setIsSendingTestimonialByEmail(false);
        }
    };

    // Handler for going back to crew list
    const handleBackToCrewList = () => {
        setSelectedCrewMemberId(null);
        setSelectedAssignmentId(null);
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

    // Replace vessel leave periods with crew's logged leave (from crew's logs) to resolve conflict
    const handleUpdateVesselLeaveFromCrewLogs = async () => {
        if (!selectedMemberData || !user?.id || !currentUserProfile?.activeVesselId) return;
        const crewUserId = selectedMemberData.profile.id;
        const vesselId = currentUserProfile.activeVesselId;
        const vesselUserId = user.id;
        const fromLogs = selectedMemberData.leavePeriodsFromLogs;
        if (!fromLogs || fromLogs.length === 0) return;

        setIsSyncingLeaveFromCrew(true);
        try {
            // Delete all existing vessel leave periods for this crew member
            const existing = selectedMemberData.leavePeriods || [];
            for (const period of existing) {
                const res = await fetch(`/api/crew-leave-periods/${period.id}`, { method: 'DELETE' });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error((err as { error?: string }).error || 'Failed to delete leave period');
                }
            }
            // Create vessel leave periods from crew's logs
            for (const period of fromLogs) {
                const res = await fetch('/api/crew-leave-periods', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        crewUserId,
                        vesselId,
                        vesselUserId,
                        startDate: period.startDate,
                        endDate: period.endDate,
                        notes: period.notes || null,
                    }),
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error((err as { error?: string }).error || 'Failed to create leave period');
                }
            }
            toast({
                title: 'Vessel leave updated',
                description: `Vessel leave periods have been replaced with ${fromLogs.length} period(s) from the crew member's logs.`,
            });
            // Refresh leave periods
            const refreshResponse = await fetch(
                `/api/crew-leave-periods?crewUserId=${crewUserId}&vesselId=${vesselId}`
            );
            if (refreshResponse.ok) {
                const { leavePeriods } = await refreshResponse.json();
                setCrewMembers(prev => prev.map(m =>
                    m.profile.id === crewUserId ? { ...m, leavePeriods } : m
                ));
            }
        } catch (error: any) {
            console.error('[CREW PAGE] Error updating vessel leave from crew logs:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to update vessel leave from crew logs.',
                variant: 'destructive',
            });
        } finally {
            setIsSyncingLeaveFromCrew(false);
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
            // Refetch crew list so the new invite appears (no full page reload)
            setTimeout(() => setCrewRefreshTrigger(t => t + 1), 1500);
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
    
    // Calculate summary statistics for vessel managers (active crew only)
    const totalCrew = useMemo(() => {
        return currentUserProfile?.role === 'vessel' ? orderedCrewMembers.length : crewMembers.length;
    }, [currentUserProfile?.role, orderedCrewMembers.length, crewMembers.length]);
    const totalOnboard = useMemo(() => {
        const base = currentUserProfile?.role === 'vessel' ? orderedCrewMembers : crewMembers;
        return base.filter(member => member.assignment.onboard === true).length;
    }, [currentUserProfile?.role, orderedCrewMembers, crewMembers]);
    
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
        shouldShowWarning: currentUserProfile?.role === 'vessel' && crewLimit !== Infinity && orderedCrewMembers.length > crewLimit
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
                        {/* Service history: current + previous periods; selector to view data for one period or all */}
                        {(selectedMemberData.otherAssignments?.length ?? 0) > 0 && (
                            <div className="mb-6 pb-4 border-b">
                                <h3 className="text-sm font-medium text-muted-foreground mb-2">Service on this vessel</h3>
                                <p className="text-xs text-muted-foreground mb-3">View data for a specific period or all combined.</p>
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        variant={viewingServicePeriod === 'current' ? 'secondary' : 'outline'}
                                        size="sm"
                                        className="rounded-xl"
                                        onClick={() => setViewingServicePeriod('current')}
                                    >
                                        Current
                                    </Button>
                                    {selectedMemberData.otherAssignments!.map((a) => (
                                        <Button
                                            key={a.id}
                                            variant={viewingServicePeriod === a.id ? 'secondary' : 'outline'}
                                            size="sm"
                                            className="rounded-xl text-left whitespace-nowrap"
                                            onClick={() => setViewingServicePeriod(a.id)}
                                        >
                                            {format(new Date(a.startDate), 'dd MMM yyyy')} – {a.endDate ? format(new Date(a.endDate), 'dd MMM yyyy') : 'present'}
                                        </Button>
                                    ))}
                                    <Button
                                        variant={viewingServicePeriod === 'all' ? 'secondary' : 'outline'}
                                        size="sm"
                                        className="rounded-xl"
                                        onClick={() => setViewingServicePeriod('all')}
                                    >
                                        All
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                    Showing: {viewingServicePeriod === 'current' && 'Current period'}
                                    {viewingServicePeriod === 'all' && 'All periods combined'}
                                    {viewingServicePeriod !== 'current' && viewingServicePeriod !== 'all' && effectiveMember && `${format(new Date(effectiveMember.assignment.startDate), 'dd MMM yyyy')} – ${effectiveMember.assignment.endDate ? format(new Date(effectiveMember.assignment.endDate), 'dd MMM yyyy') : 'present'}`}
                                </p>
                            </div>
                        )}
                        {/* Days breakdown - crew logs when access approved (can switch to vessel data); otherwise vessel data only. Vessel data for toggle is in local state only. */}
                            <div className="mb-6 pb-6 border-b">
                            <div className="flex flex-wrap items-center gap-2 mb-3">
                                <h3 className="text-sm font-medium text-muted-foreground">Days breakdown</h3>
                                {selectedMemberData.seaTimeDataFromVessel && (
                                    <Badge variant="outline" className="text-xs">
                                        From vessel data (crew has not shared access)
                                    </Badge>
                                )}
                                {selectedMemberData.accessRequest?.status === 'approved' && (
                                    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                                        <span>View:</span>
                                        <button
                                            type="button"
                                            onClick={() => setBreakdownViewSource('crew')}
                                            className={cn(
                                                'font-medium transition-colors hover:text-foreground',
                                                breakdownViewSource === 'crew' ? 'text-foreground underline underline-offset-4' : ''
                                            )}
                                        >
                                            Crew logs
                                        </button>
                                        <span className="text-muted-foreground/60">·</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setBreakdownViewSource('vessel');
                                                if (effectiveMember && !loadingSeaTime.has(effectiveMember.profile.id)) {
                                                    loadVesselBreakdownForView(effectiveMember);
                                                }
                                            }}
                                            className={cn(
                                                'font-medium transition-colors hover:text-foreground',
                                                breakdownViewSource === 'vessel' ? 'text-foreground underline underline-offset-4' : ''
                                            )}
                                        >
                                            Vessel data
                                        </button>
                                    </span>
                                )}
                            </div>
                            {(() => {
                                const hasAccess = selectedMemberData.accessRequest?.status === 'approved';
                                const useVessel = hasAccess ? breakdownViewSource === 'vessel' : true;
                                const vesselData = (() => {
                                    if (!vesselBreakdownForView || vesselBreakdownForView.memberId !== effectiveMember?.profile.id) return null;
                                    const start = effectiveMember.assignment.startDate;
                                    const end = effectiveMember.assignment.endDate ?? new Date().toISOString().split('T')[0];
                                    if (vesselBreakdownForView.startDate !== start || vesselBreakdownForView.endDate !== end) return null;
                                    return vesselBreakdownForView.data;
                                })();
                                // When crew has no access, vessel-based breakdown is stored on the member (loadVesselBasedSeaTimeData); use it. When they have access, use toggle: vesselData or crew seaTimeData.
                                const data = hasAccess ? (useVessel ? vesselData : selectedMemberData.seaTimeData) : selectedMemberData.seaTimeData;
                                const isLoading = loadingSeaTime.has(selectedMemberData.profile.id);
                                const waitingForVessel = hasAccess && breakdownViewSource === 'vessel' && !vesselData && isLoading;
                                if ((isLoading && !data) || waitingForVessel) {
                                    return (
                                        <div className="flex items-center justify-center py-8" key="loading">
                                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                            <span className="ml-2 text-muted-foreground">Loading breakdown...</span>
                                        </div>
                                    );
                                }
                                if (data) {
                                    const seaServiceDays = (data.underwayDays ?? 0) + (data.standbyDays ?? 0);
                                    // When crew has granted access, use vessel leave days for display (vessel is source of truth)
                                    const displayOnLeaveDays = hasAccess && leaveConflictInfo
                                        ? leaveConflictInfo.vesselLeaveDays
                                        : (data.onLeaveDays ?? 0);
                                    return (
                                        <div key={`breakdown-${breakdownViewSource}-${useVessel ? 'vessel' : 'crew'}`} className="space-y-5">
                                            {/* Sea service = Underway + Standby — primary metric */}
                                            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 dark:bg-primary/10 p-5">
                                                <div className="text-sm font-medium text-muted-foreground mb-1">Sea service</div>
                                                <div className="text-3xl font-bold text-primary">{seaServiceDays} days</div>
                                                <p className="text-xs text-muted-foreground mt-2">
                                                    Underway ({data.underwayDays ?? 0}) + Standby ({data.standbyDays ?? 0})
                                                </p>
                                            </div>
                                            {/* 4 main: Underway, In port, At anchor, Standby */}
                                            <div>
                                                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Breakdown</h4>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                    <Card className="p-3 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                                                        <div className="text-xs text-muted-foreground mb-1">Underway</div>
                                                        <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">{data.underwayDays ?? 0}</div>
                                                    </Card>
                                                    <Card className="p-3 border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
                                                        <div className="text-xs text-muted-foreground mb-1">In port</div>
                                                        <div className="text-lg font-semibold text-green-700 dark:text-green-400">{data.inPortDays ?? 0}</div>
                                                    </Card>
                                                    <Card className="p-3 border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20">
                                                        <div className="text-xs text-muted-foreground mb-1">At anchor</div>
                                                        <div className="text-lg font-semibold text-orange-700 dark:text-orange-400">{data.atAnchorDays ?? 0}</div>
                                                    </Card>
                                                    <Card className="p-3 border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
                                                        <div className="text-xs text-muted-foreground mb-1">Standby</div>
                                                        <div className="text-lg font-semibold text-purple-600 dark:text-purple-400">{data.standbyDays ?? 0}</div>
                                                    </Card>
                                                </div>
                                                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                                                    <span>In yard: {data.inYardDays ?? 0}</span>
                                                    <span>On leave: {displayOnLeaveDays}</span>
                                                    <span>Total days: {data.totalDays ?? 0}</span>
                                                    {data.atSeaDays != null && (
                                                        <span>At sea (voyage): {data.atSeaDays}</span>
                                                    )}
                                                </div>
                                                {hasAccess && (
                                                    <div className="mt-3 pt-3 border-t text-xs text-muted-foreground space-y-1">
                                                        <p>Leave days used for calculations are from vessel records.</p>
                                                        {leaveConflictInfo?.conflict && (
                                                            <p className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                                                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                                                Conflict: crew&apos;s logs show {leaveConflictInfo.crewLeaveDays} leave days; vessel has {leaveConflictInfo.vesselLeaveDays}.
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                }
                                return (
                                    <div className="text-sm text-muted-foreground text-center py-8 border rounded-lg bg-muted/20">
                                        {hasAccess
                                            ? (breakdownViewSource === 'vessel' ? 'No vessel logs in this period.' : 'No sea time data available')
                                            : 'No vessel logs in this period. Add vessel state logs or request sea time access from the crew member.'}
                                    </div>
                                );
                            })()}
                            </div>
                        
                        {/* Tabs for Leave Periods and Documents */}
                        <Tabs defaultValue="documents" className="w-full">
                            <TabsList className="grid w-full grid-cols-3 rounded-xl mb-6">
                                <TabsTrigger value="documents" className="rounded-lg" disabled={!hasProTier}>
                                    <FileText className="mr-2 h-4 w-4" />
                                    Documents
                                </TabsTrigger>
                                <TabsTrigger value="mca-details" className="rounded-lg">
                                    <FileCheck className="mr-2 h-4 w-4" />
                                    MCA Details
                                </TabsTrigger>
                                <TabsTrigger value="leave" className="rounded-lg">
                                    <CalendarDays className="mr-2 h-4 w-4" />
                                    Leave Periods
                                </TabsTrigger>
                            </TabsList>

                            {/* MCA Details Tab - vessel can add/edit crew member MCA info for documents */}
                            <TabsContent value="mca-details" className="space-y-4 mt-0">
                                <MCAApplicationDetailsCard
                                    targetUserId={selectedMemberData.profile.id}
                                    initialProfileRaw={selectedMemberData.profile}
                                    onSaved={(updatedProfile) => {
                                        if (!updatedProfile) return;
                                        const crewId = selectedMemberData.profile.id;
                                        setCrewMembers(prev => prev.map(m =>
                                            m.profile.id === crewId
                                                ? { ...m, profile: { ...m.profile, ...updatedProfile } }
                                                : m
                                        ));
                                    }}
                                />
                            </TabsContent>
                            
                            {/* Leave Periods Tab */}
                            <TabsContent value="leave" className="space-y-4 mt-0">
                                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                                    <div>
                                        <h3 className="text-lg font-semibold">Leave Periods</h3>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            Track leave periods to exclude them from sea time calculations.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {selectedMemberData?.accessRequest?.status === 'approved' && (
                                            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                                                <span>View:</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setLeavePeriodsViewSource('vessel')}
                                                    className={cn(
                                                        'font-medium transition-colors hover:text-foreground rounded-lg px-2 py-1',
                                                        leavePeriodsViewSource === 'vessel' ? 'text-foreground underline underline-offset-4' : ''
                                                    )}
                                                >
                                                    Vessel logs
                                                </button>
                                                <span className="text-muted-foreground/60">·</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setLeavePeriodsViewSource('crew')}
                                                    className={cn(
                                                        'font-medium transition-colors hover:text-foreground rounded-lg px-2 py-1',
                                                        leavePeriodsViewSource === 'crew' ? 'text-foreground underline underline-offset-4' : ''
                                                    )}
                                                >
                                                    Crew logs
                                                </button>
                                            </span>
                                        )}
                                        {leavePeriodsViewSource === 'vessel' && (
                                            <Button
                                                onClick={() => setIsLeavePeriodDialogOpen(true)}
                                                className="rounded-xl"
                                            >
                                                <Plus className="mr-2 h-4 w-4" />
                                                Add Leave Period
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {selectedMemberData?.accessRequest?.status === 'approved' && (
                                    <Alert className="border-primary/30 bg-primary/5 dark:bg-primary/10">
                                        <AlertCircle className="h-4 w-4 text-primary" />
                                        <AlertTitle>Vessel leave is used for calculations</AlertTitle>
                                        <AlertDescription>
                                            When the crew member has given access, vessel leave periods are used for all sea time calculations and document date ranges.
                                        </AlertDescription>
                                    </Alert>
                                )}

                                {leaveConflictInfo?.conflict && (
                                    <Alert variant="destructive" className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/30">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertTitle>Leave conflict</AlertTitle>
                                        <AlertDescription>
                                            <span className="block mb-3">
                                                Crew&apos;s logged leave ({leaveConflictInfo.crewLeaveDays} days) differs from vessel leave ({leaveConflictInfo.vesselLeaveDays} days). Vessel leave is used for calculations. Switch to Crew logs below to compare, or update vessel leave to match.
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-xl border-amber-600 text-amber-700 hover:bg-amber-100 dark:border-amber-500 dark:text-amber-400 dark:hover:bg-amber-900/40"
                                                onClick={handleUpdateVesselLeaveFromCrewLogs}
                                                disabled={isSyncingLeaveFromCrew || !selectedMemberData?.leavePeriodsFromLogs?.length}
                                            >
                                                {isSyncingLeaveFromCrew ? (
                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Copy className="mr-2 h-4 w-4" />
                                                )}
                                                Update vessel leave from crew&apos;s logs
                                            </Button>
                                        </AlertDescription>
                                    </Alert>
                                )}

                                {leavePeriodsViewSource === 'vessel' && (
                                    <>
                                        {effectivePeriodFiltered.leavePeriods.length > 0 ? (
                                            <div className="grid gap-3">
                                                {effectivePeriodFiltered.leavePeriods.map((period) => {
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
                                        ) : (
                                            <Card className="border-dashed">
                                                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                                    <CalendarDays className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                                                    <h4 className="font-semibold mb-2">No vessel leave periods</h4>
                                                    <p className="text-sm text-muted-foreground mb-4">
                                                        No leave periods have been logged for this crew member. Add periods to exclude them from sea time calculations.
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
                                        )}
                                    </>
                                )}

                                {leavePeriodsViewSource === 'crew' && (
                                    <>
                                        {effectivePeriodFiltered.leavePeriodsFromLogs.length > 0 ? (
                                            <div className="grid gap-3">
                                                <p className="text-xs text-muted-foreground mb-1">
                                                    Auto-detected from crew member&apos;s state logs (read-only).
                                                </p>
                                                {effectivePeriodFiltered.leavePeriodsFromLogs.map((period, index) => {
                                                    const startDate = parse(period.startDate, 'yyyy-MM-dd', new Date());
                                                    const endDate = parse(period.endDate, 'yyyy-MM-dd', new Date());
                                                    const days = eachDayOfInterval({ start: startDate, end: endDate }).length;
                                                    return (
                                                        <Card key={`log-${index}`} className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                                                            <CardContent className="p-4">
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
                                                            </CardContent>
                                                        </Card>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <Card className="border-dashed">
                                                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                                    <CalendarDays className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                                                    <h4 className="font-semibold mb-2">No crew leave from logs</h4>
                                                    <p className="text-sm text-muted-foreground">
                                                        No leave periods could be auto-detected from this crew member&apos;s logs. They may not have logged any &quot;on leave&quot; days, or access data may still be loading.
                                                    </p>
                                                </CardContent>
                                            </Card>
                                        )}
                                    </>
                                )}

                            </TabsContent>
                            
                            {/* Documents Tab */}
                            <TabsContent value="documents" className="space-y-4 mt-0">
                                {hasProTier ? (
                                    <>
                                        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                            <div>
                                                <h3 className="text-lg font-semibold">Documents</h3>
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    View and download documents for this crew member. Create testimonials or Proof of Service from <Link href="/dashboard/documents" className="text-primary underline underline-offset-2 font-medium">Generator → Documents</Link>.
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {currentUserProfile?.role !== 'vessel' && (
                                                <Dialog open={isNavWatchDialogOpen} onOpenChange={setIsNavWatchDialogOpen}>
                                                    <DialogTrigger asChild>
                                                        <Button variant="outline" className="rounded-xl" type="button">
                                                            <Navigation className="mr-2 h-4 w-4" />
                                                            Generate Nav Watch Document
                                                        </Button>
                                                    </DialogTrigger>
                                                    <DialogContent className="rounded-xl max-w-lg">
                                                        <DialogHeader>
                                                            <DialogTitle>Nav Watch Application</DialogTitle>
                                                            <DialogDescription>
                                                                Generate an MCA Watch Rating (Nav Watch) application PDF for {selectedMemberData.profile.firstName || selectedMemberData.profile.username}. Sea service will be taken from their approved testimonials and vessel assignments.
                                                            </DialogDescription>
                                                        </DialogHeader>
                                                        {isMCAInfoComplete ? (
                                                            <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
                                                                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                                                                <AlertTitle className="text-green-900 dark:text-green-100">Using vessel MCA details</AlertTitle>
                                                                <AlertDescription className="text-green-800 dark:text-green-200">
                                                                    MCA details are complete and will be used in this document.
                                                                </AlertDescription>
                                                            </Alert>
                                                        ) : null}
                                                        <Form {...navWatchForm}>
                                                            <form onSubmit={navWatchForm.handleSubmit(handleNavWatchSubmit)} className="space-y-4">
                                                                <FormField
                                                                    control={navWatchForm.control}
                                                                    name="certificate_type"
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel>Certificate type</FormLabel>
                                                                            <Select onValueChange={field.onChange} value={field.value}>
                                                                                <FormControl>
                                                                                    <SelectTrigger className="rounded-xl">
                                                                                        <SelectValue placeholder="Select certificate type" />
                                                                                    </SelectTrigger>
                                                                                </FormControl>
                                                                                <SelectContent>
                                                                                    <SelectItem value="navigational_ii4">Navigational Watch Rating Certificate II/4</SelectItem>
                                                                                    <SelectItem value="navigational_iii4">Engine Room Watch Rating Certificate III/4</SelectItem>
                                                                                    <SelectItem value="electro_technical">Electro-technical Rating III/7</SelectItem>
                                                                                </SelectContent>
                                                                            </Select>
                                                                            <FormMessage />
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                                <FormField
                                                                    control={navWatchForm.control}
                                                                    name="paymentRegion"
                                                                    render={({ field }) => (
                                                                        <FormItem>
                                                                            <FormLabel>Payment region (optional)</FormLabel>
                                                                            <Select onValueChange={field.onChange} value={field.value ?? ''}>
                                                                                <FormControl>
                                                                                    <SelectTrigger className="rounded-xl">
                                                                                        <SelectValue placeholder="Select region" />
                                                                                    </SelectTrigger>
                                                                                </FormControl>
                                                                                <SelectContent>
                                                                                    <SelectItem value="uk">UK</SelectItem>
                                                                                    <SelectItem value="eu">EU</SelectItem>
                                                                                    <SelectItem value="row">Rest of World</SelectItem>
                                                                                </SelectContent>
                                                                            </Select>
                                                                            <FormMessage />
                                                                        </FormItem>
                                                                    )}
                                                                />
                                                                <div className="flex justify-end gap-2 pt-2">
                                                                    <Button type="button" variant="outline" onClick={() => setIsNavWatchDialogOpen(false)} className="rounded-xl">
                                                                        Cancel
                                                                    </Button>
                                                                    <Button type="submit" disabled={isSavingNavWatch} className="rounded-xl">
                                                                        {isSavingNavWatch ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Navigation className="h-4 w-4 mr-2" />}
                                                                        Generate PDF
                                                                    </Button>
                                                                </div>
                                                            </form>
                                                        </Form>
                                                    </DialogContent>
                                                </Dialog>
                                                )}
                                            </div>
                                        </div>

                                        {/* MCA details status: show only when complete */}
                                        {isMCAInfoComplete ? (
                                            <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
                                                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                                                <AlertTitle className="text-green-900 dark:text-green-100">Using vessel MCA details</AlertTitle>
                                                <AlertDescription className="text-green-800 dark:text-green-200">
                                                    MCA details for this crew member are complete. These vessel-provided details will be used when you generate Nav Watch and other MCA documents.
                                                </AlertDescription>
                                            </Alert>
                                        ) : null}

                                        {/* Nav Watch documents - saved documents, download anytime (hidden for vessel accounts for now) */}
                                        {currentUserProfile?.role !== 'vessel' && (selectedMemberData.navWatchApplications?.length ?? 0) > 0 && (
                                            <div className="space-y-4 mb-6">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="font-semibold">Nav Watch documents</h4>
                                                    <Badge variant="outline" className="text-xs">
                                                        {selectedMemberData.navWatchApplications!.length} document{selectedMemberData.navWatchApplications!.length !== 1 ? 's' : ''}
                                                    </Badge>
                                                </div>
                                                <div className="grid gap-3">
                                                    {selectedMemberData.navWatchApplications!.map((app) => {
                                                        const certLabels: Record<string, string> = {
                                                            navigational: 'Navigational Watch Rating II/4',
                                                            engine_room: 'Engine Room Watch Rating III/4',
                                                            electro_technical: 'Electro-Technical Rating III/7',
                                                        };
                                                        const created = format(new Date(app.created_at), 'PPP');
                                                        return (
                                                            <Card key={app.id} className="hover:shadow-md transition-shadow">
                                                                <CardContent className="p-4">
                                                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                                                        <div className="space-y-1">
                                                                            <Badge variant="outline" className="font-semibold">
                                                                                {certLabels[app.certificate_type] || app.certificate_type}
                                                                            </Badge>
                                                                            <p className="text-sm text-muted-foreground">{created}</p>
                                                                            {Array.isArray(app.sea_service_records) && app.sea_service_records.length > 0 && (
                                                                                <p className="text-xs text-muted-foreground">
                                                                                    {app.sea_service_records.length} vessel(s) • {app.sea_service_records.reduce((s, r) => s + (r.daysAtSea ?? 0), 0)} days at sea
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                        <div className="flex items-center gap-2 shrink-0">
                                                                            <Button
                                                                                variant="outline"
                                                                                size="sm"
                                                                                onClick={() => handlePreviewNavWatch(app)}
                                                                                disabled={downloadingNavWatchId === app.id || previewingNavWatchId === app.id || deletingNavWatchId === app.id}
                                                                                className="rounded-xl"
                                                                                title="Preview PDF"
                                                                            >
                                                                                {previewingNavWatchId === app.id ? (
                                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                                ) : (
                                                                                    <Eye className="h-4 w-4" />
                                                                                )}
                                                                            </Button>
                                                                            <Button
                                                                                variant="outline"
                                                                                size="sm"
                                                                                onClick={() => handleDownloadNavWatch(app)}
                                                                                disabled={downloadingNavWatchId === app.id || previewingNavWatchId === app.id || deletingNavWatchId === app.id}
                                                                                className="rounded-xl"
                                                                                title="Download PDF"
                                                                            >
                                                                                {downloadingNavWatchId === app.id ? (
                                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                                ) : (
                                                                                    <Download className="h-4 w-4" />
                                                                                )}
                                                                            </Button>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                onClick={() => handleDeleteNavWatch(app)}
                                                                                disabled={downloadingNavWatchId === app.id || previewingNavWatchId === app.id || deletingNavWatchId === app.id}
                                                                                className="rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10"
                                                                                title="Delete"
                                                                            >
                                                                                {deletingNavWatchId === app.id ? (
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
                                        )}

                                        {/* Proof of Service - entries saved from Generator → Proof of Service */}
                                        {effectivePeriodFiltered.proofOfServiceEntries.length > 0 && (
                                            <div className="space-y-4 mb-6">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="font-semibold flex items-center gap-2">
                                                        <ShieldCheck className="h-4 w-4 text-primary" />
                                                        Proof of Service
                                                    </h4>
                                                    <Badge variant="outline" className="text-xs">
                                                        {effectivePeriodFiltered.proofOfServiceEntries.length} entry{effectivePeriodFiltered.proofOfServiceEntries.length !== 1 ? 's' : ''}
                                                    </Badge>
                                                </div>
                                                <div className="grid gap-3">
                                                    {effectivePeriodFiltered.proofOfServiceEntries.map((entry) => (
                                                        <Card key={entry.id} className="hover:shadow-md transition-shadow">
                                                            <CardContent className="p-4">
                                                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                                                    <div className="space-y-1">
                                                                        <p className="font-medium text-sm">{entry.vesselName}</p>
                                                                        <p className="text-sm text-muted-foreground">
                                                                            {format(new Date(entry.startDate), 'dd MMM yyyy')} – {format(new Date(entry.endDate), 'dd MMM yyyy')}
                                                                        </p>
                                                                        <p className="text-xs text-muted-foreground">
                                                                            {entry.totalDays} days total · {entry.atSeaDays} at sea
                                                                            {entry.createdAt && ` · Generated ${format(new Date(entry.createdAt), 'dd MMM yyyy')}`}
                                                                        </p>
                                                                    </div>
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => handleDownloadProofOfService(entry)}
                                                                        disabled={downloadingProofOfServiceId === entry.id}
                                                                        className="rounded-xl shrink-0"
                                                                    >
                                                                        {downloadingProofOfServiceId === entry.id ? (
                                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                                        ) : (
                                                                            <Download className="h-4 w-4 mr-2" />
                                                                        )}
                                                                        Download PDF
                                                                    </Button>
                                                                </div>
                                                            </CardContent>
                                                        </Card>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Testimonials (all) - only when crew has given permission */}
                                        {effectiveMember?.accessRequest?.status === 'approved' && effectivePeriodFiltered.testimonials.length > 0 && (
                                            <div className="space-y-4 mb-6">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="font-semibold">Testimonials</h4>
                                                    <Badge variant="outline" className="text-xs">
                                                        {effectivePeriodFiltered.testimonials.length} testimonial{effectivePeriodFiltered.testimonials.length !== 1 ? 's' : ''}
                                                    </Badge>
                                                </div>
                                                <div className="grid gap-3">
                                                    {effectivePeriodFiltered.testimonials.map((testimonial) => {
                                                        const startDate = formatDate(new Date(testimonial.start_date), 'MMM dd, yyyy');
                                                        const endDate = formatDate(new Date(testimonial.end_date), 'MMM dd, yyyy');
                                                        const statusLabel = testimonial.status === 'approved' ? 'Approved' : testimonial.status === 'pending_captain' ? 'Pending captain' : testimonial.status === 'rejected' ? 'Rejected' : testimonial.status === 'draft' ? 'Draft' : testimonial.status;
                                                        return (
                                                            <Card key={testimonial.id} className="hover:shadow-md transition-shadow">
                                                                <CardContent className="p-4">
                                                                    <div className="flex items-start justify-between">
                                                                        <div className="flex-1 space-y-2 min-w-0 cursor-pointer" onClick={() => setViewDocumentBreakdown(testimonial as any)}>
                                                                            <div className="flex items-center gap-2">
                                                                                <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                                                                                <span className="font-semibold text-sm">
                                                                                    {startDate} - {endDate}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                <Badge
                                                                                    variant={testimonial.status === 'approved' ? 'outline' : 'outline'}
                                                                                    className={cn(
                                                                                        'text-xs',
                                                                                        testimonial.status === 'approved' && 'border-green-500/40 bg-green-500/15 text-green-800 dark:text-green-200 dark:bg-green-500/20 dark:border-green-500/30'
                                                                                    )}
                                                                                >
                                                                                    {statusLabel}
                                                                                </Badge>
                                                                                {(testimonial as any).data_source && (
                                                                                    <Badge variant="outline" className="text-xs border-blue-500 text-blue-700 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400">
                                                                                        {(testimonial as any).data_source === 'crew' ? 'Crew Logs' : 'Vessel Logs'}
                                                                                    </Badge>
                                                                                )}
                                                                                {testimonial.testimonial_code && (
                                                                                    <Badge variant="secondary" className="text-xs">{testimonial.testimonial_code}</Badge>
                                                                                )}
                                                                                <span className="text-sm text-muted-foreground">
                                                                                    {testimonial.total_days} days
                                                                                </span>
                                                                                {testimonial.created_at && (
                                                                                    <span className="text-xs text-muted-foreground">
                                                                                        Generated {formatDate(new Date(testimonial.created_at), 'MMM d, yyyy')}
                                                                                    </span>
                                                                                )}
                                                                                {testimonial.status === 'approved' && testimonial.approved_at && (
                                                                                    <span className="text-xs text-muted-foreground">
                                                                                        Approved {formatDate(new Date(testimonial.approved_at), 'MMM d, yyyy')}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                onClick={() => setViewDocumentBreakdown({ ...testimonial, data_source: (testimonial as any).data_source, pdf_format: 'mca' })}
                                                                                className="rounded-lg"
                                                                                title="View breakdown"
                                                                            >
                                                                                <Eye className="h-4 w-4" />
                                                                            </Button>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                onClick={() => handleGeneratePDF(testimonial, selectedTestimonialFormat[testimonial.id] ?? 'mca', 'newtab')}
                                                                                disabled={generatingPDF === testimonial.id}
                                                                                className="rounded-lg"
                                                                                title="Preview PDF"
                                                                            >
                                                                                {generatingPDF === testimonial.id ? (
                                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                                ) : (
                                                                                    <FileText className="h-4 w-4" />
                                                                                )}
                                                                            </Button>
                                                                            <Select
                                                                                value={selectedTestimonialFormat[testimonial.id] ?? 'mca'}
                                                                                onValueChange={(format) => setSelectedTestimonialFormat(prev => ({ ...prev, [testimonial.id]: format as TestimonialPDFFormat }))}
                                                                                disabled={generatingPDF === testimonial.id}
                                                                            >
                                                                                <SelectTrigger className="w-[140px] rounded-xl">
                                                                                    <SelectValue placeholder="Version" />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    <SelectItem value="seajourney">SeaJourney PDF</SelectItem>
                                                                                    <SelectItem value="mca">MCA PDF</SelectItem>
                                                                                </SelectContent>
                                                                            </Select>
                                                                            <Button
                                                                                variant="outline"
                                                                                size="sm"
                                                                                onClick={() => handleGeneratePDF(testimonial, selectedTestimonialFormat[testimonial.id] ?? 'mca')}
                                                                                disabled={generatingPDF === testimonial.id}
                                                                                className="rounded-xl"
                                                                                title="Download"
                                                                            >
                                                                                {generatingPDF === testimonial.id ? (
                                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                                ) : (
                                                                                    <Download className="h-4 w-4" />
                                                                                )}
                                                                            </Button>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                onClick={() => setCrewTestimonialToDelete(testimonial)}
                                                                                disabled={generatingPDF === testimonial.id || isDeletingCrewTestimonial}
                                                                                className="rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                                                                                title="Delete testimonial"
                                                                            >
                                                                                <Trash2 className="h-4 w-4" />
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                </CardContent>
                                                            </Card>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Generated Documents (vessel-generated; when no approved access this is the only doc section) */}
                                        {isLoadingTestimonials ? (
                                            <div className="flex items-center justify-center py-12">
                                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                            </div>
                                        ) : effectivePeriodFiltered.vesselGeneratedTestimonials.length > 0 ? (
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <h4 className="font-semibold">Generated Documents</h4>
                                                    <Badge variant="outline" className="text-xs">
                                                        {effectivePeriodFiltered.vesselGeneratedTestimonials.length} document{effectivePeriodFiltered.vesselGeneratedTestimonials.length !== 1 ? 's' : ''}
                                                    </Badge>
                                                </div>
                                                <div className="grid gap-3">
                                                    {effectivePeriodFiltered.vesselGeneratedTestimonials.map((testimonial) => {
                                                        const startDate = formatDate(new Date(testimonial.start_date), 'MMM dd, yyyy');
                                                        const endDate = formatDate(new Date(testimonial.end_date), 'MMM dd, yyyy');
                                                        
                                                        return (
                                                            <Card key={testimonial.id} className="hover:shadow-md transition-shadow">
                                                                <CardContent className="p-4">
                                                                    <div className="flex items-start justify-between">
                                                                        <div className="flex-1 space-y-2 min-w-0 cursor-pointer" onClick={() => setViewDocumentBreakdown(testimonial)}>
                                                                            <div className="flex items-center gap-2">
                                                                                <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
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
                                                                                {testimonial.created_at && (
                                                                                    <span className="text-xs text-muted-foreground">
                                                                                        Generated {formatDate(new Date(testimonial.created_at), 'MMM d, yyyy')}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                onClick={() => setViewDocumentBreakdown(testimonial)}
                                                                                className="rounded-lg"
                                                                                title="View breakdown"
                                                                            >
                                                                                <Eye className="h-4 w-4" />
                                                                            </Button>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                onClick={() => handleGenerateVesselTestimonialPDF(testimonial, selectedVesselDocFormat[testimonial.id] ?? testimonial.pdf_format ?? 'mca', 'newtab')}
                                                                                disabled={generatingPDF === testimonial.id || deletingTestimonial === testimonial.id}
                                                                                className="rounded-lg"
                                                                                title="Preview PDF"
                                                                            >
                                                                                {generatingPDF === testimonial.id ? (
                                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                                ) : (
                                                                                    <FileText className="h-4 w-4" />
                                                                                )}
                                                                            </Button>
                                                                            <Select
                                                                                value={selectedVesselDocFormat[testimonial.id] ?? testimonial.pdf_format ?? 'mca'}
                                                                                onValueChange={(format) => setSelectedVesselDocFormat(prev => ({ ...prev, [testimonial.id]: format as TestimonialPDFFormat }))}
                                                                                disabled={generatingPDF === testimonial.id || deletingTestimonial === testimonial.id}
                                                                            >
                                                                                <SelectTrigger className="w-[140px] rounded-xl">
                                                                                    <SelectValue placeholder="Version" />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    <SelectItem value="seajourney">SeaJourney</SelectItem>
                                                                                    <SelectItem value="mca">MCA</SelectItem>
                                                                                </SelectContent>
                                                                            </Select>
                                                                            <Button
                                                                                variant="outline"
                                                                                size="sm"
                                                                                onClick={() => handleGenerateVesselTestimonialPDF(testimonial, selectedVesselDocFormat[testimonial.id] ?? testimonial.pdf_format ?? 'mca')}
                                                                                disabled={generatingPDF === testimonial.id || deletingTestimonial === testimonial.id}
                                                                                className="rounded-xl"
                                                                                title="Download"
                                                                            >
                                                                                {generatingPDF === testimonial.id ? (
                                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                                                ) : (
                                                                                    <Download className="h-4 w-4" />
                                                                                )}
                                                                            </Button>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                onClick={() => {
                                                                                    setVesselDocToSendToCaptain(testimonial);
                                                                                    setSendTestimonialByEmailValue('');
                                                                                    setSendTestimonialByEmailOpen(true);
                                                                                }}
                                                                                disabled={generatingPDF === testimonial.id || deletingTestimonial === testimonial.id}
                                                                                className="rounded-lg"
                                                                                title="Send to captain for approval"
                                                                            >
                                                                                <Send className="h-4 w-4" />
                                                                            </Button>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                onClick={() => setVesselTestimonialToDeleteId(testimonial.id)}
                                                                                disabled={deletingTestimonial === testimonial.id || generatingPDF === testimonial.id}
                                                                                className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg"
                                                                                title="Delete testimonial"
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
                                        ) : (() => {
                                            const hasVesselGenerated = effectivePeriodFiltered.vesselGeneratedTestimonials.length > 0;
                                            const hasTestimonials = effectiveMember?.accessRequest?.status === 'approved' && effectivePeriodFiltered.testimonials.length > 0;
                                            const hasProofOfService = effectivePeriodFiltered.proofOfServiceEntries.length > 0;
                                            const hasAnyDocuments = hasVesselGenerated || hasTestimonials || hasProofOfService;
                                            return !hasAnyDocuments ? (
                                            <Card className="border-dashed">
                                                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                                                    <FileText className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                                                    <h4 className="font-semibold mb-2">No Documents Generated</h4>
                                                    <p className="text-sm text-muted-foreground mb-4">
                                                        No documents have been generated for this crew member yet.
                                                    </p>
                                                </CardContent>
                                            </Card>
                                            ) : null;
                                        })()}
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

                {/* Send testimonial to captain by email (when no active captain) */}
                <Dialog open={sendTestimonialByEmailOpen} onOpenChange={(open) => { setSendTestimonialByEmailOpen(open); if (!open) { setSendTestimonialByEmailValue(''); setVesselDocToSendToCaptain(null); } }}>
                    <DialogContent className="rounded-xl max-w-md">
                        <DialogHeader>
                            <DialogTitle>Send testimonial to captain</DialogTitle>
                            <DialogDescription>
                                No active captain is assigned to this vessel. Enter the captain’s email to send this testimonial for approval. They will receive a secure link to view, add comments, and approve or reject—same as the crew-to-captain flow.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="testimonial-captain-email">Captain email</Label>
                                <Input
                                    id="testimonial-captain-email"
                                    type="email"
                                    placeholder="captain@example.com"
                                    value={sendTestimonialByEmailValue}
                                    onChange={(e) => setSendTestimonialByEmailValue(e.target.value)}
                                    className="rounded-xl"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" onClick={() => setSendTestimonialByEmailOpen(false)} disabled={isSendingTestimonialByEmail}>
                                    Cancel
                                </Button>
                                <Button onClick={() => vesselDocToSendToCaptain ? handleSendVesselDocToCaptainByEmail() : handleSendTestimonialToCaptainByEmail()} disabled={isSendingTestimonialByEmail}>
                                    {isSendingTestimonialByEmail ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <>
                                            <Send className="h-4 w-4 mr-2" />
                                            Send for approval
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Document breakdown view (no download needed) */}
                <Dialog open={!!viewDocumentBreakdown} onOpenChange={(open) => !open && setViewDocumentBreakdown(null)}>
                    <DialogContent className="rounded-xl max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Document breakdown</DialogTitle>
                            <DialogDescription>
                                Sea time breakdown for this period.
                            </DialogDescription>
                        </DialogHeader>
                        {viewDocumentBreakdown && (
                            <div className="space-y-4 py-4">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <CalendarIcon className="h-4 w-4 shrink-0" />
                                    <span>
                                        {formatDate(new Date(viewDocumentBreakdown.start_date), 'MMM d, yyyy')} – {formatDate(new Date(viewDocumentBreakdown.end_date), 'MMM d, yyyy')}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="rounded-lg border bg-muted/40 p-3">
                                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total days</div>
                                        <div className="text-lg font-semibold">{viewDocumentBreakdown.total_days}</div>
                                    </div>
                                    <div className="rounded-lg border bg-muted/40 p-3">
                                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">At sea</div>
                                        <div className="text-lg font-semibold">{viewDocumentBreakdown.at_sea_days}</div>
                                    </div>
                                    <div className="rounded-lg border bg-muted/40 p-3">
                                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Standby</div>
                                        <div className="text-lg font-semibold">{viewDocumentBreakdown.standby_days}</div>
                                    </div>
                                    <div className="rounded-lg border bg-muted/40 p-3">
                                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">In yard</div>
                                        <div className="text-lg font-semibold">{viewDocumentBreakdown.yard_days}</div>
                                    </div>
                                    <div className="rounded-lg border bg-muted/40 p-3">
                                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">On leave</div>
                                        <div className="text-lg font-semibold">{viewDocumentBreakdown.leave_days}</div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Badge variant="outline" className="border-blue-500 text-blue-700 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400">
                                        {viewDocumentBreakdown.data_source === 'crew' ? 'Crew Logs' : 'Vessel Logs'}
                                    </Badge>
                                    <Badge variant="outline">{viewDocumentBreakdown.pdf_format === 'mca' ? 'MCA' : 'SeaJourney'}</Badge>
                                </div>
                                {viewDocumentBreakdown.generated_by_name && (
                                    <div className="text-sm text-muted-foreground">
                                        Generated by {viewDocumentBreakdown.generated_by_name}
                                        {viewDocumentBreakdown.generated_by_email ? ` (${viewDocumentBreakdown.generated_by_email})` : ''}
                                    </div>
                                )}
                                {viewDocumentBreakdown.notes && (
                                    <div className="rounded-lg border p-3">
                                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</div>
                                        <p className="text-sm whitespace-pre-wrap">{viewDocumentBreakdown.notes}</p>
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-2 pt-2 border-t">
                                    <Button
                                        variant="default"
                                        size="sm"
                                        onClick={handlePreviewFromBreakdown}
                                        disabled={!selectedMemberData || generatingPDF === viewDocumentBreakdown.id}
                                        className="rounded-lg"
                                    >
                                        {generatingPDF === viewDocumentBreakdown.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        ) : (
                                            <Eye className="h-4 w-4 mr-2" />
                                        )}
                                        Preview PDF
                                    </Button>
                                </div>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

                {/* Delete vessel-generated testimonial confirmation */}
                <AlertDialog open={!!vesselTestimonialToDeleteId} onOpenChange={(open) => !open && setVesselTestimonialToDeleteId(null)}>
                    <AlertDialogContent className="rounded-xl">
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete testimonial?</AlertDialogTitle>
                            <AlertDialogDescription>
                                {vesselTestimonialToDeleteId && selectedMemberData?.vesselGeneratedTestimonials && (() => {
                                    const t = selectedMemberData.vesselGeneratedTestimonials.find(x => x.id === vesselTestimonialToDeleteId);
                                    if (!t) return 'This vessel-generated document will be permanently deleted.';
                                    return `Delete the testimonial for ${formatDate(new Date(t.start_date), 'MMM d, yyyy')} – ${formatDate(new Date(t.end_date), 'MMM d, yyyy')}? This cannot be undone.`;
                                })()}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => {
                                    if (vesselTestimonialToDeleteId) {
                                        handleDeleteVesselTestimonial(vesselTestimonialToDeleteId);
                                        setVesselTestimonialToDeleteId(null);
                                    }
                                }}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Delete crew testimonial confirmation (password required for approved) */}
                <AlertDialog
                    open={!!crewTestimonialToDelete}
                    onOpenChange={(open) => {
                        if (!open && !isVerifyingCrewDeleteRef.current && !isDeletingCrewTestimonial) {
                            setCrewTestimonialToDelete(null);
                            setDeleteCrewPassword('');
                            setDeleteCrewPasswordError('');
                        }
                    }}
                >
                    <AlertDialogContent className="rounded-xl max-w-xl">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                                <Trash2 className="h-5 w-5 text-destructive" />
                                Delete testimonial?
                            </AlertDialogTitle>
                            {crewTestimonialToDelete && (
                                <AlertDialogDescription>
                                    {crewTestimonialToDelete.status === 'approved'
                                        ? 'This approved testimonial will be permanently deleted. The crew member would need to request it again and have it signed off again.'
                                        : 'Are you sure you want to delete this testimonial? This action cannot be undone.'}
                                </AlertDialogDescription>
                            )}
                        </AlertDialogHeader>
                        {crewTestimonialToDelete && (
                            <div className="space-y-3 pt-2">
                                <div className="text-sm font-medium">
                                    {formatDate(new Date(crewTestimonialToDelete.start_date), 'MMM d, yyyy')} – {formatDate(new Date(crewTestimonialToDelete.end_date), 'MMM d, yyyy')}
                                    {crewTestimonialToDelete.testimonial_code && (
                                        <span className="text-muted-foreground ml-2">({crewTestimonialToDelete.testimonial_code})</span>
                                    )}
                                </div>
                                {crewTestimonialToDelete.status === 'approved' && (
                                    <>
                                        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-2">
                                            <div className="flex items-start gap-2">
                                                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                                <div className="text-sm text-amber-900 dark:text-amber-100 space-y-1">
                                                    <p className="font-semibold">Approved testimonial</p>
                                                    <p>Confirm your password to delete this approved testimonial.</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="delete-crew-testimonial-password" className="text-sm font-medium">
                                                Your password
                                            </Label>
                                            <Input
                                                id="delete-crew-testimonial-password"
                                                type="password"
                                                placeholder="Enter your password"
                                                value={deleteCrewPassword}
                                                onChange={(e) => {
                                                    setDeleteCrewPassword(e.target.value);
                                                    setDeleteCrewPasswordError('');
                                                }}
                                                className={cn('rounded-lg', deleteCrewPasswordError && 'border-destructive')}
                                                disabled={isDeletingCrewTestimonial}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && deleteCrewPassword && !isDeletingCrewTestimonial) {
                                                        verifyPasswordAndDeleteCrewTestimonial(crewTestimonialToDelete);
                                                    }
                                                }}
                                            />
                                            {deleteCrewPasswordError && (
                                                <p className="text-sm text-destructive">{deleteCrewPasswordError}</p>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        <AlertDialogFooter>
                            <AlertDialogCancel
                                disabled={isDeletingCrewTestimonial}
                                className="rounded-xl"
                                onClick={() => {
                                    setDeleteCrewPassword('');
                                    setDeleteCrewPasswordError('');
                                }}
                            >
                                Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => {
                                    if (crewTestimonialToDelete) {
                                        if (crewTestimonialToDelete.status === 'approved') {
                                            verifyPasswordAndDeleteCrewTestimonial(crewTestimonialToDelete);
                                        } else {
                                            handleDeleteCrewTestimonial(crewTestimonialToDelete);
                                        }
                                    }
                                }}
                                disabled={isDeletingCrewTestimonial || (crewTestimonialToDelete?.status === 'approved' && !deleteCrewPassword)}
                                className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                                {isDeletingCrewTestimonial ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Deleting...
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Delete
                                    </>
                                )}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

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
                                                defaultMonth={leavePeriodStartDate ?? undefined}
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
                                                defaultMonth={leavePeriodEndDate ?? leavePeriodStartDate ?? undefined}
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
                                    {crewLimit !== Infinity && currentUserProfile?.role === 'vessel' && orderedCrewMembers.length > crewLimit && (
                                        <span className="text-muted-foreground"> (of {orderedCrewMembers.length})</span>
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
                                        disabled={crewLimit !== Infinity && orderedCrewMembers.length >= crewLimit}
                                        title={
                                            crewLimit !== Infinity && orderedCrewMembers.length >= crewLimit
                                                ? `Crew limit reached. Your plan allows up to ${crewLimit} active crew members.`
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

                        {/* Edit start date dialog (vessel only) */}
                        {currentUserProfile?.role === 'vessel' && (
                            <Dialog open={!!editStartDateMember} onOpenChange={(open) => !open && setEditStartDateMember(null)}>
                                <DialogContent className="rounded-xl sm:max-w-[400px]">
                                    <DialogHeader>
                                        <DialogTitle>Change start date</DialogTitle>
                                        <DialogDescription>
                                            {editStartDateMember && (
                                                <>Set the official start date for {[editStartDateMember.profile.firstName, editStartDateMember.profile.lastName].filter(Boolean).join(' ').trim() || editStartDateMember.profile.username || 'this crew member'}.</>
                                            )}
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-2">
                                        <div className="space-y-2">
                                            <Label>Start date</Label>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        className={cn(
                                                            "w-full justify-start text-left font-normal rounded-xl",
                                                            !editStartDateValue && "text-muted-foreground"
                                                        )}
                                                    >
                                                        <CalendarDays className="mr-2 h-4 w-4" />
                                                        {editStartDateValue
                                                            ? format(parse(editStartDateValue, 'yyyy-MM-dd', new Date()), 'PPP')
                                                            : 'Select start date'}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0" align="start">
                                                    <CalendarComponent
                                                        mode="single"
                                                        selected={editStartDateValue ? parse(editStartDateValue, 'yyyy-MM-dd', new Date()) : undefined}
                                                        onSelect={(d) => d && setEditStartDateValue(format(d, 'yyyy-MM-dd'))}
                                                        disabled={{ after: startOfDay(new Date()) }}
                                                        defaultMonth={editStartDateValue ? parse(editStartDateValue, 'yyyy-MM-dd', new Date()) : undefined}
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <div className="flex items-start gap-3 rounded-lg border p-3">
                                            <Checkbox
                                                id="offer-sea-time"
                                                checked={offerSeaTimeWithStartDate}
                                                onCheckedChange={(checked) => setOfferSeaTimeWithStartDate(checked === true)}
                                            />
                                            <div className="grid gap-1.5 leading-none">
                                                <Label htmlFor="offer-sea-time" className="text-sm font-medium cursor-pointer">
                                                    Offer to send sea time records
                                                </Label>
                                                <p className="text-xs text-muted-foreground">
                                                    Send a request to this crew member for sea time from the start date above to today. They can accept or reject in their Inbox; if they accept, records are copied to their account.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="outline"
                                                className="rounded-xl"
                                                onClick={() => setEditStartDateMember(null)}
                                                disabled={isSavingStartDate}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                className="rounded-xl"
                                                onClick={saveStartDate}
                                                disabled={isSavingStartDate}
                                            >
                                                {isSavingStartDate ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        Saving...
                                                    </>
                                                ) : (
                                                    'Save'
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        )}

                        {/* Set end date dialog (vessel only) - mark crew member as left vessel */}
                        {currentUserProfile?.role === 'vessel' && (
                            <Dialog open={!!setEndDateMember} onOpenChange={(open) => !open && setSetEndDateMember(null)}>
                                <DialogContent className="rounded-xl sm:max-w-[400px]">
                                    <DialogHeader>
                                        <DialogTitle>Set end date</DialogTitle>
                                        <DialogDescription>
                                            {setEndDateMember && (
                                                <>Mark {[setEndDateMember.profile.firstName, setEndDateMember.profile.lastName].filter(Boolean).join(' ').trim() || setEndDateMember.profile.username || 'this crew member'} as having left the vessel. They will appear under Past members and you will still have access to all their documents and testimonials.</>
                                            )}
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-2">
                                        <div className="space-y-2">
                                            <Label>End date (last day on vessel)</Label>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        className={cn(
                                                            "w-full justify-start text-left font-normal rounded-xl",
                                                            !setEndDateValue && "text-muted-foreground"
                                                        )}
                                                    >
                                                        <CalendarDays className="mr-2 h-4 w-4" />
                                                        {setEndDateValue
                                                            ? format(parse(setEndDateValue, 'yyyy-MM-dd', new Date()), 'PPP')
                                                            : 'Select end date'}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0" align="start">
                                                    <CalendarComponent
                                                        mode="single"
                                                        selected={setEndDateValue ? parse(setEndDateValue, 'yyyy-MM-dd', new Date()) : undefined}
                                                        onSelect={(d) => d && setSetEndDateValue(format(d, 'yyyy-MM-dd'))}
                                                        disabled={{ after: startOfDay(new Date()) }}
                                                        defaultMonth={setEndDateValue ? parse(setEndDateValue, 'yyyy-MM-dd', new Date()) : undefined}
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="outline"
                                                className="rounded-xl"
                                                onClick={() => setSetEndDateMember(null)}
                                                disabled={isSavingEndDate}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                className="rounded-xl"
                                                onClick={saveEndDate}
                                                disabled={isSavingEndDate}
                                            >
                                                {isSavingEndDate ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        Saving...
                                                    </>
                                                ) : (
                                                    'Save'
                                                )}
                                            </Button>
                                        </div>
                                    </div>
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
            {currentUserProfile?.role === 'vessel' && crewLimit !== Infinity && orderedCrewMembers.length > crewLimit && (
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
                                        items={filteredCrewMembers.map(m => m.assignment.id || m.profile.id)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        {filteredCrewMembers.map((member, index) => (
                                        <React.Fragment key={member.assignment.id || member.profile.id}>
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
                                                onOpenLeavePeriodsDialog={(member) => handleSelectCrewMember(member.profile.id, member.assignment.id)}
                                                onEditStartDate={currentUserProfile?.role === 'vessel' ? openEditStartDate : undefined}
                                                onSetEndDate={currentUserProfile?.role === 'vessel' ? openSetEndDate : undefined}
                                            />
                                            {currentUserProfile?.role === 'admin' && expandedRows.has(member.profile.id) && member.allVesselsForUser && member.allVesselsForUser.length > 0 && (
                                                <TableRow className="bg-muted/30 hover:bg-muted/30">
                                                    <TableCell colSpan={7} className="py-3 px-4">
                                                        <div className="text-xs font-medium text-muted-foreground mb-2">Vessels ({member.allVesselsForUser.length}) — active & past</div>
                                                        <div className="flex flex-wrap gap-3">
                                                            {member.allVesselsForUser.map((v, i) => {
                                                                const isActive = !v.endDate || new Date(v.endDate) >= new Date();
                                                                return (
                                                                    <div key={i} className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 min-w-[200px]">
                                                                        <span className="font-medium text-foreground">{v.vesselName}</span>
                                                                        <span className="text-muted-foreground">
                                                                            {format(new Date(v.startDate), 'dd MMM yyyy')}
                                                                            {v.endDate ? ` – ${format(new Date(v.endDate), 'dd MMM yyyy')}` : ' – present'}
                                                                        </span>
                                                                        {isActive ? (
                                                                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">Active</Badge>
                                                                        ) : (
                                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">Past</Badge>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </React.Fragment>
                                    ))}
                                    </SortableContext>
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={currentUserProfile?.role === 'admin' ? 7 : 6} className="h-24 text-center">
                                        {currentUserProfile?.role === 'admin'
                                            ? 'No crew members found across all vessels.'
                                            : currentUserProfile?.activeVesselId 
                                                ? 'No active crew members on this vessel.'
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

            {/* Past members (vessel only) - collapsible, full access to documents/testimonials */}
            {currentUserProfile?.role === 'vessel' && (
                <Collapsible open={pastMembersExpanded} onOpenChange={setPastMembersExpanded}>
                    <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg mt-6">
                        <CollapsibleTrigger asChild>
                            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors rounded-b-none">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {pastMembersExpanded ? (
                                            <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                                        ) : (
                                            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                                        )}
                                        <CardTitle className="flex items-center gap-2">
                                            <Clock className="h-5 w-5 text-muted-foreground" />
                                            Past members
                                            {pastCrewMembers.length > 0 && (
                                                <Badge variant="secondary" className="text-xs font-normal">
                                                    {pastCrewMembers.length}
                                                </Badge>
                                            )}
                                        </CardTitle>
                                    </div>
                                    <CardDescription className="text-left mt-0">
                                        Crew who have left the vessel. You still have access to their documents and testimonials.
                                    </CardDescription>
                                </div>
                            </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <CardContent className="p-0 pt-0">
                                <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Position</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Joined</TableHead>
                                        <TableHead>Left</TableHead>
                                        {hasProTier && <TableHead className="w-[50px]"></TableHead>}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredPastCrewMembers.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={hasProTier ? 7 : 6} className="h-20 text-center text-muted-foreground">
                                                No past members. Set an end date on a crew member to move them here.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredPastCrewMembers.map((member) => {
                                            const { profile, assignment } = member;
                                            const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.username;
                                            return (
                                                <TableRow
                                                    key={member.assignment.id || member.profile.id}
                                                    className={hasProTier ? 'cursor-pointer hover:bg-muted/30' : ''}
                                                    onClick={() => hasProTier && handleSelectCrewMember(member.profile.id, member.assignment.id)}
                                                >
                                                    <TableCell className="font-medium">
                                                        <div className="flex items-center gap-3">
                                                            <Avatar className="h-9 w-9">
                                                                <AvatarImage src={profile.profilePicture ?? undefined} />
                                                                <AvatarFallback className="rounded-full bg-muted text-muted-foreground text-xs">
                                                                    {getInitials(fullName) || '?'}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <span>{fullName}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-sm">{profile.email}</TableCell>
                                                    <TableCell>{assignment.position || profile.position || '—'}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="secondary" className="rounded-full text-xs">
                                                            {profile.role === 'captain' ? 'Captain' : profile.role === 'vessel' ? 'Vessel Manager' : 'Crew'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-sm">
                                                        {assignment.startDate ? format(new Date(assignment.startDate), 'dd MMM, yyyy') : 'N/A'}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-sm">
                                                        {assignment.endDate ? format(new Date(assignment.endDate), 'dd MMM, yyyy') : '—'}
                                                    </TableCell>
                                                    {hasProTier && (
                                                        <TableCell onClick={(e) => e.stopPropagation()}>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleSelectCrewMember(member.profile.id, member.assignment.id)}
                                                                className="h-8 w-8 p-0"
                                                            >
                                                                <ChevronRight className="h-4 w-4" />
                                                            </Button>
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                                </div>
                            </CardContent>
                        </CollapsibleContent>
                    </Card>
                </Collapsible>
            )}

        </div>
    );
}
