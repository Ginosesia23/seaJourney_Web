
'use client';

import { useState, useMemo, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, differenceInDays, eachDayOfInterval, isSameDay, startOfDay, endOfDay, parse, isWithinInterval, startOfMonth, endOfMonth, getDaysInMonth, getDay, isSameMonth, isToday, isAfter, isBefore, addDays, subMonths, startOfYear, endOfYear } from 'date-fns';
import { CalendarIcon, MapPin, Briefcase, Info, PlusCircle, Loader2, Ship, Wrench, Clock, Waves, Anchor, Building, CalendarDays, Edit, MousePointer2, BoxSelect, Search, UserPlus, ChevronsUpDown, ChevronDown, Check, XCircle, User, Play, Square, ShieldCheck, Sparkles, ArrowRight } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { UnifiedVesselSearchPicker } from '@/components/dashboard/unified-vessel-search-picker';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { 
  createSeaServiceRecord, 
  updateStateLogsBatch, 
  deleteStateLogsForDates,
  updateUserProfile,
  getVesselStateLogs,
  getAllStateLogsForUser,
  createVesselAssignment,
  endVesselAssignment,
  getVesselAssignments,
  getPassageLogs,
  getPassageLogsByVessel,
  createPassageLog,
} from '@/supabase/database/queries';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { DateRange } from 'react-day-picker';
import type { UserProfile, Vessel, SeaServiceRecord, StateLog, DailyStatus, VesselAssignment, PassageLog } from '@/lib/types';
import { hasActiveSubscription, isVesselLinkedAccount } from '@/supabase/database/subscription-helpers';
import { vesselTypes, vesselTypeValues } from '@/lib/vessel-types';
import { calculateStandbyDays } from '@/lib/standby-calculation';
import { findMissingDays } from '@/lib/fill-missing-days';
import { calendarStateSolid, calendarStateWash } from '@/lib/calendar-state-colors';
import {
  MonthStateSummary,
  buildMonthSummaryItems,
} from '@/components/dashboard/month-state-summary';
import { AisTrackingCard } from '@/components/dashboard/ais-tracking-card';
import { CrewAisTrackingCard } from '@/components/dashboard/crew-ais-tracking-card';
import { CrewAisDebugPanel } from '@/components/dashboard/crew-ais-debug-panel';
import { AisDebugPanel } from '@/components/dashboard/ais-debug-panel';

const startServiceSchema = z.object({
  vesselId: z.string().min(1, 'Please select a vessel.'),
  position: z.string().optional(),
  startDate: z.date({ required_error: 'A start date is required.' }),
  endDate: z.date().optional(),
}).refine((data) => {
  if (data.endDate && data.endDate < data.startDate) {
    return false;
  }
  return true;
}, {
  message: "End date must be after start date",
  path: ["endDate"],
});

type StartServiceFormValues = z.infer<typeof startServiceSchema>;

// Maritime position options
const POSITION_OPTIONS = [
  // Deck Department - Senior
  'Captain / Master',
  'Chief Officer',
  'First Officer',
  'First Mate',
  'Second Officer',
  'Third Officer',
  'Officer of the Watch (OOW)',
  'Deck Officer',
  'Bosun',
  // Deck Department - Deckhands
  'Lead Deckhand',
  'Senior Deckhand',
  'Deckhand',
  'Junior Deckhand',
  'Able Seaman (AB)',
  'Quartermaster',
  // Deck Department - Cadets
  'Deck Cadet',
  'Cadet',
  // Engine Department - Senior
  'Chief Engineer',
  'First Engineer',
  'Second Engineer',
  'Third Engineer',
  'Fourth Engineer',
  'Engineer',
  'Electrician',
  // Engine Department - Junior
  'Motorman / Oiler',
  'Wiper',
  'Engine Cadet',
  // Interior/Service - Management
  'Purser',
  'Chief Purser',
  // Interior/Service - Galley
  'Head Chef',
  'Chef / Cook',
  'Sous Chef',
  'Galley Assistant',
  // Interior/Service - Housekeeping
  'Head Housekeeper',
  'Chief Steward / Stewardess',
  '2nd Steward / Stewardess',
  'Steward / Stewardess',
  'Laundry Attendant',
  'Interior Crew',
  // Other Specialized Roles
  'Medical Officer',
  'Security Officer',
  'Radio Officer',
  'Safety Officer',
  'Environmental Officer',
  'Masseuse / Masseur',
  'Spa Therapist',
  'Other',
] as const;

const vesselStates: { value: DailyStatus; label: string; color: string; icon: React.FC<any> }[] = [
  { value: 'underway', label: 'Underway', color: calendarStateSolid('underway'), icon: Waves },
  { value: 'at-anchor', label: 'At Anchor', color: calendarStateSolid('at-anchor'), icon: Anchor },
  { value: 'in-port', label: 'Moored', color: calendarStateSolid('in-port'), icon: Building },
  { value: 'on-leave', label: 'On Leave', color: calendarStateSolid('on-leave'), icon: Briefcase },
  { value: 'in-yard', label: 'In Yard', color: calendarStateSolid('in-yard'), icon: Wrench },
];

export default function CurrentPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedState, setSelectedState] = useState<DailyStatus | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'single' | 'range'>('single');
  const [isPartOfActivePassageInDialog, setIsPartOfActivePassageInDialog] = useState<boolean>(false);
  const [isWatchInDialog, setIsWatchInDialog] = useState<boolean>(false);
  const [notesInDialog, setNotesInDialog] = useState<string>('');
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [selectedVesselForAction, setSelectedVesselForAction] = useState<{ id: string; name: string; type: string } | null>(null);
  const [isRequestingCaptaincy, setIsRequestingCaptaincy] = useState(false);
  const [isCaptaincyDialogOpen, setIsCaptaincyDialogOpen] = useState(false);
  const [captaincyDocumentUrls, setCaptaincyDocumentUrls] = useState<string[]>(['']);
  
  // View mode for captains: 'personal' (their own sea time) or 'vessel' (vessel's sea time)
  const [captainViewMode, setCaptainViewMode] = useState<'personal' | 'vessel'>('personal');
  /** Month keys (yyyy-MM) with the day-count summary expanded. Collapsed by default. */
  const [expandedMonthSummaries, setExpandedMonthSummaries] = useState<Set<string>>(
    () => new Set(),
  );

  const { user } = useUser();
  const { supabase, session } = useSupabase();
  const { toast } = useToast();

  const { data: userProfileRaw, isLoading: isLoadingProfile, error: userProfileError, forceRefetch: refetchUserProfile } = useDoc<UserProfile>('users', user?.id);
  
  // Log user profile loading state and errors
  useEffect(() => {
    console.log('[CURRENT PAGE] User Profile State:', {
      userId: user?.id,
      isLoading: isLoadingProfile,
      hasData: !!userProfileRaw,
      error: userProfileError,
      userProfileRaw: userProfileRaw,
    });
    
    if (userProfileError) {
      console.error('[CURRENT PAGE] Error loading user profile:', {
        error: userProfileError,
        message: userProfileError.message,
        userId: user?.id,
      });
    }
  }, [user?.id, isLoadingProfile, userProfileRaw, userProfileError]);
  
  // Transform user profile to handle both snake_case (from DB) and camelCase (from types)
  const userProfile = useMemo(() => {
    if (!userProfileRaw) {
      console.log('[CURRENT PAGE] No userProfileRaw, returning null');
      return null;
    }
    
    const activeVesselId = (userProfileRaw as any).active_vessel_id || (userProfileRaw as any).activeVesselId;
    
    // Debug log to see what we're getting
    console.log('[CURRENT PAGE] User Profile Transform:', {
      raw: userProfileRaw,
      active_vessel_id: (userProfileRaw as any).active_vessel_id,
      activeVesselId: (userProfileRaw as any).activeVesselId,
      transformedActiveVesselId: activeVesselId,
      allKeys: Object.keys(userProfileRaw),
    });
    
    const startDate = (userProfileRaw as any).start_date || (userProfileRaw as any).startDate || null;
    return {
      ...userProfileRaw,
      id: userProfileRaw.id,
      email: (userProfileRaw as any).email || '',
      username: (userProfileRaw as any).username || '',
      activeVesselId: activeVesselId || undefined,
      firstName: (userProfileRaw as any).first_name || (userProfileRaw as any).firstName,
      lastName: (userProfileRaw as any).last_name || (userProfileRaw as any).lastName,
      position: (userProfileRaw as any).position || undefined,
      profilePicture: (userProfileRaw as any).profile_picture || (userProfileRaw as any).profilePicture,
      bio: (userProfileRaw as any).bio,
      registrationDate: (userProfileRaw as any).registration_date || (userProfileRaw as any).registrationDate,
      role: (userProfileRaw as any).role || 'crew',
      subscriptionTier: (userProfileRaw as any).subscription_tier || (userProfileRaw as any).subscriptionTier || 'free',
      subscriptionStatus: (userProfileRaw as any).subscription_status || (userProfileRaw as any).subscriptionStatus || 'inactive',
      startDate: startDate || undefined,
    } as UserProfile;
  }, [userProfileRaw]);

  // Vessel-roles secondary accounts belong to the vessel — they view the
  // vessel record and cannot keep a personal sea-time log.
  const isVesselLinked = useMemo(() => {
    return isVesselLinkedAccount(userProfileRaw);
  }, [userProfileRaw]);
  
  // Query all vessels (vessels are shared, not owned by users)
  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
    user?.id ? 'vessels' : null,
    user?.id ? { orderBy: 'created_at', ascending: false } : undefined
  );

  // Count vessels user has logged time on
  const [actualVesselCount, setActualVesselCount] = useState(0);
  
  useEffect(() => {
    if (!vessels || !user?.id) {
      setActualVesselCount(0);
      return;
    }

    const countVessels = async () => {
      let count = 0;
      for (const vessel of vessels) {
        const logs = await getVesselStateLogs(supabase, vessel.id, user.id);
        if (logs && logs.length > 0) {
          count++;
        }
      }
      setActualVesselCount(count);
    };

    countVessels();
  }, [vessels, user?.id, supabase]);

  // Check vessel limit based on subscription tier
  const hasUnlimitedVessels = useMemo(() => {
    if (!userProfile || !userProfileRaw) return false;
    const tier = (userProfile as any).subscription_tier || userProfile.subscriptionTier || 'free';
    return (tier === 'premium' || tier === 'pro') && hasActiveSubscription(userProfileRaw);
  }, [userProfile, userProfileRaw]);

  const vesselLimit = hasUnlimitedVessels ? Infinity : 3;
  const canAddVessel = hasUnlimitedVessels || actualVesselCount < vesselLimit;

  const [stateLogs, setStateLogs] = useState<StateLog[]>([]);
  const [stateLogsRefreshKey, setStateLogsRefreshKey] = useState(0);
  const [aisTrackingEnabled, setAisTrackingEnabled] = useState(false);
  const [passages, setPassages] = useState<PassageLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [vesselAssignments, setVesselAssignments] = useState<VesselAssignment[]>([]);

  const currentVessel = useMemo(() => {
    console.log('[CURRENT PAGE] Computing currentVessel:', {
      hasUserProfile: !!userProfile,
      hasVessels: !!vessels,
      vesselsCount: vessels?.length || 0,
      vesselAssignmentsCount: vesselAssignments?.length || 0,
      activeVesselId: userProfile?.activeVesselId,
      allAssignments: vesselAssignments.map(a => ({ 
        id: a.id, 
        vesselId: a.vesselId, 
        startDate: a.startDate, 
        endDate: a.endDate 
      })),
    });
    
    if (!userProfile || !vessels || vessels.length === 0) {
      console.log('[CURRENT PAGE] No user profile or vessels available');
      return undefined;
    }
    
    const activeVesselId = userProfile.activeVesselId;
    
    if (!activeVesselId) {
      console.log('[CURRENT PAGE] No activeVesselId set in user profile');
      return undefined;
    }
    
    const foundVessel = vessels.find(v => v.id === activeVesselId);
    
    // If no vessel found by activeVesselId, return undefined
    if (!foundVessel) {
      console.log('[CURRENT PAGE] No vessel found for activeVesselId:', activeVesselId, {
        availableVesselIds: vessels.map(v => v.id),
      });
      return undefined;
    }
    
    // Check if there's an active assignment (end_date IS NULL) for this vessel
    const allAssignmentsForVessel = vesselAssignments.filter(
      a => a.vesselId === activeVesselId
    );
    
    const activeAssignments = allAssignmentsForVessel.filter(
      a => !a.endDate
    );
    
    console.log('[CURRENT PAGE] Assignment check:', {
      vesselId: activeVesselId,
      vesselName: foundVessel.name,
      allAssignmentsForVessel: allAssignmentsForVessel.map(a => ({ 
        id: a.id, 
        startDate: a.startDate, 
        endDate: a.endDate 
      })),
      activeAssignmentsCount: activeAssignments.length,
      activeAssignments: activeAssignments.map(a => ({ 
        id: a.id, 
        startDate: a.startDate, 
        endDate: a.endDate 
      })),
    });
    
    // If there's no active assignment, the vessel is not actually active
    if (activeAssignments.length === 0) {
      console.log('[CURRENT PAGE] Vessel found but no active assignment:', {
        vesselId: activeVesselId,
        vesselName: foundVessel.name,
        allAssignmentsForVessel: allAssignmentsForVessel,
        totalAssignments: vesselAssignments.length,
      });
      return undefined;
    }
    
    console.log('[CURRENT PAGE] Active Vessel Found:', {
      userProfileId: userProfile.id,
      activeVesselId,
      vesselName: foundVessel.name,
      activeAssignmentsCount: activeAssignments.length,
      activeAssignments: activeAssignments.map(a => ({ id: a.id, startDate: a.startDate, endDate: a.endDate })),
    });
    
    return foundVessel;
  }, [vessels, userProfile, userProfileRaw, vesselAssignments]);

  // Determine if there's an active service based on active vessel
  const hasActiveService = !!currentVessel;

  const [isFillingGaps, setIsFillingGaps] = useState(false);
  const gapFilledRef = useRef<string | null>(null); // Track if we've already filled gaps for this vessel/date combo
  const previousAssignmentsRef = useRef<VesselAssignment[]>([]); // Track previous assignments for polling comparison

  // Check if captain has approved captaincy for current vessel and find vessel account user
  const [vesselAccountUserId, setVesselAccountUserId] = useState<string | null>(null);
  const [isApprovedCaptain, setIsApprovedCaptain] = useState(false);
  const [hasPendingCaptaincyRequest, setHasPendingCaptaincyRequest] = useState(false);
  
  useEffect(() => {
    const checkCaptaincyAndFindVesselAccount = async () => {
      if (!currentVessel || !user?.id) {
        setVesselAccountUserId(null);
        setIsApprovedCaptain(false);
        setHasPendingCaptaincyRequest(false);
        return;
      }

      // Only check for captains
      if (userProfile?.role !== 'captain') {
        setVesselAccountUserId(null);
        setIsApprovedCaptain(false);
        setHasPendingCaptaincyRequest(false);
        return;
      }

      try {
        // Check if captain has approved captaincy
        const { data: captaincyData, error: captaincyError } = await supabase
          .from('vessel_claim_requests')
          .select('id, status')
          .eq('requested_by', user.id)
          .eq('vessel_id', currentVessel.id)
          .eq('status', 'approved')
          .maybeSingle();

        if (captaincyError || !captaincyData) {
          console.log('[CURRENT PAGE] No approved captaincy found:', {
            captaincyError,
            captaincyData,
            vesselId: currentVessel.id,
            userId: user.id
          });
          setVesselAccountUserId(null);
          setIsApprovedCaptain(false);
          
          // Check for pending request
          const { data: pendingRequest } = await supabase
            .from('vessel_claim_requests')
            .select('id')
            .eq('requested_by', user.id)
            .eq('vessel_id', currentVessel.id)
            .eq('status', 'pending')
            .maybeSingle();
          
          setHasPendingCaptaincyRequest(!!pendingRequest);
          return;
        }
        
        // User is an approved captain
        setIsApprovedCaptain(true);
        setHasPendingCaptaincyRequest(false);
        
        console.log('[CURRENT PAGE] Approved captaincy found, searching for vessel account:', {
          vesselId: currentVessel.id,
          captaincyRequestId: captaincyData.id
        });

        // Use vessel_manager_id from the vessel record (preferred method)
        const vesselManagerId = (currentVessel as any).vessel_manager_id || (currentVessel as any).vesselManagerId;
        
        if (vesselManagerId) {
          console.log('[CURRENT PAGE] Found vessel_manager_id from vessel record:', vesselManagerId);
          setVesselAccountUserId(vesselManagerId);
        } else {
          // Fallback: Find the vessel account user (user with role='vessel' and active_vessel_id matching this vessel)
          console.log('[CURRENT PAGE] No vessel_manager_id found, searching for vessel account user with:', {
            role: 'vessel',
            active_vessel_id: currentVessel.id
          });
          
          const { data: vesselAccount, error: vesselAccountError } = await supabase
            .from('users')
            .select('id, role, active_vessel_id, email')
            .eq('role', 'vessel')
            .eq('active_vessel_id', currentVessel.id)
            .limit(1)
            .maybeSingle();

          if (vesselAccountError) {
            console.error('[CURRENT PAGE] Error finding vessel account:', vesselAccountError);
            setVesselAccountUserId(null);
          } else if (vesselAccount) {
            console.log('[CURRENT PAGE] Found vessel account user via fallback search:', {
              vesselAccountId: vesselAccount.id,
              vesselId: currentVessel.id,
              email: vesselAccount.email
            });
            setVesselAccountUserId(vesselAccount.id);
          } else {
            console.log('[CURRENT PAGE] No vessel account found for vessel:', currentVessel.id);
            setVesselAccountUserId(null);
          }
        }
      } catch (error) {
        console.error('[CURRENT PAGE] Exception checking captaincy/vessel account:', error);
        setVesselAccountUserId(null);
      }
    };

    checkCaptaincyAndFindVesselAccount();
  }, [currentVessel?.id, user?.id, userProfile?.role, supabase]);

  // Reset view mode to 'personal' if user is no longer an approved captain.
  // Vessel-linked accounts always stay on the vessel record.
  useEffect(() => {
    if (isVesselLinked) {
      if (captainViewMode !== 'vessel') setCaptainViewMode('vessel');
      return;
    }
    if (!isApprovedCaptain && captainViewMode === 'vessel') {
      setCaptainViewMode('personal');
    }
  }, [isVesselLinked, isApprovedCaptain, captainViewMode]);

  // Fetch state logs using the query function for proper transformation
  // For approved captains, fetch logs from vessel account user only (or all vessel logs if no account exists)
  // Fetch state logs from ALL vessels the user has assignments for (same as calendar page)
  // This ensures the calendar preview shows the same data as the calendar page
  useEffect(() => {
    if (!user?.id || !vessels || vessels.length === 0) {
      setStateLogs([]);
      setIsLoadingLogs(false);
      gapFilledRef.current = null;
      return;
    }

    setIsLoadingLogs(true);
    
    const fetchAllLogs = async () => {
      try {
        // Get all unique vessel IDs from assignments
        const vesselIdsFromAssignments = new Set<string>();
        vesselAssignments.forEach(assignment => {
          vesselIdsFromAssignments.add(assignment.vesselId);
        });

        // Also include current vessel if it exists
        if (currentVessel) {
          vesselIdsFromAssignments.add(currentVessel.id);
        }

        // Fetch logs from all vessels the user has assignments for
        const allLogs: StateLog[] = [];
        
        for (const vesselId of vesselIdsFromAssignments) {
          const vessel = vessels.find(v => v.id === vesselId);
          if (!vessel) continue;

          // For captains: check view mode to determine which logs to fetch
      let userIdToFetch: string | undefined = user.id;

      if (isVesselLinked) {
        const vesselManagerId = (vessel as any).vessel_manager_id || (vessel as any).vesselManagerId;
        userIdToFetch = vesselManagerId || undefined;
      } else if (userProfile?.role === 'captain' && captainViewMode === 'vessel') {
        // Captain wants to see vessel logs - check if they have approved captaincy
        try {
          const { data: captaincyData } = await supabase
            .from('vessel_claim_requests')
            .select('id')
            .eq('requested_by', user.id)
                .eq('vessel_id', vesselId)
            .eq('status', 'approved')
            .maybeSingle();
          
          if (captaincyData) {
                const vesselManagerId = (vessel as any).vessel_manager_id || (vessel as any).vesselManagerId;
            if (vesselManagerId) {
                  userIdToFetch = vesselManagerId;
            } else {
                  userIdToFetch = undefined; // Fetch all logs for vessel
            }
          } else {
            // No approved captaincy - fall back to personal logs
            userIdToFetch = user.id;
          }
        } catch (e) {
              console.error('[CURRENT PAGE] Error checking captaincy for vessel:', vesselId, e);
              // On error, fall back to personal logs
              userIdToFetch = user.id;
            }
      } else {
        // Personal view mode or not a captain - always fetch personal logs
        userIdToFetch = user.id;
      }
      
      try {
            const logs = await getVesselStateLogs(supabase, vesselId, userIdToFetch);
            console.log('[CURRENT PAGE] Fetched logs for vessel:', {
              vesselId,
              vesselName: vessel.name,
          logsCount: logs.length,
              userIdToFetch: userIdToFetch || 'ALL'
            });
            allLogs.push(...logs);
          } catch (error) {
            console.error(`[CURRENT PAGE] Error fetching logs for vessel ${vesselId}:`, error);
          }
        }

        // Remove duplicates (same date + vessel combination)
        let uniqueLogs = Array.from(
          new Map(allLogs.map(log => [`${log.date}-${log.vesselId}`, log])).values()
        );

        const isCaptainVesselView =
          isVesselLinked ||
          (userProfile?.role === 'captain' && captainViewMode === 'vessel');
        if (!isCaptainVesselView) {
          try {
            const userWide = await getAllStateLogsForUser(supabase, user.id);
            const seen = new Set(uniqueLogs.map(log => `${log.date}-${log.vesselId}`));
            for (const log of userWide) {
              const k = `${log.date}-${log.vesselId}`;
              if (!seen.has(k)) {
                seen.add(k);
                uniqueLogs.push(log);
              }
            }
          } catch (mergeErr) {
            console.error('[CURRENT PAGE] Error merging user-wide state logs:', mergeErr);
          }
        }

        console.log('[CURRENT PAGE] Total logs fetched from all vessels:', {
          totalLogs: uniqueLogs.length,
          vesselsCount: vesselIdsFromAssignments.size,
        });

        setStateLogs(uniqueLogs);
        setIsLoadingLogs(false);
        gapFilledRef.current = null; // Reset when new logs are loaded
      } catch (error) {
        console.error('[CURRENT PAGE] Error fetching all logs:', error);
        setStateLogs([]);
        setIsLoadingLogs(false);
        gapFilledRef.current = null;
      }
    };
    
    fetchAllLogs();
  }, [user?.id, vessels, vesselAssignments, currentVessel?.id, userProfile?.role, captainViewMode, supabase, stateLogsRefreshKey, isVesselLinked]);

  // Fetch vessel assignments for date validation
  useEffect(() => {
    if (!user?.id) {
      setVesselAssignments([]);
      previousAssignmentsRef.current = [];
      return;
    }

    const fetchAssignments = async () => {
      try {
        console.log('[CURRENT PAGE] Fetching vessel assignments for user:', user.id);
        const assignments = await getVesselAssignments(supabase, user.id);
        console.log('[CURRENT PAGE] Fetched vessel assignments:', {
          count: assignments.length,
          assignments: assignments.map(a => ({ 
            id: a.id, 
            vesselId: a.vesselId, 
            startDate: a.startDate, 
            endDate: a.endDate,
            isActive: !a.endDate 
          })),
          activeAssignments: assignments.filter(a => !a.endDate).map(a => ({
            id: a.id,
            vesselId: a.vesselId,
            startDate: a.startDate,
            endDate: a.endDate,
          })),
        });
        setVesselAssignments(assignments);
        previousAssignmentsRef.current = [...assignments];
      } catch (error) {
        console.error('[CURRENT PAGE] Error fetching vessel assignments:', error);
        setVesselAssignments([]);
        previousAssignmentsRef.current = [];
      }
    };

    fetchAssignments();

    // Real-time subscription for assignment changes (mobile / other tabs).
    // Stable channel name — remounting with Date.now() caused CHANNEL_ERROR on cleanup.
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    const startPollingFallback = () => {
      if (pollInterval) return;
      pollInterval = setInterval(async () => {
        try {
          const assignments = await getVesselAssignments(supabase, user.id);
          const previous = previousAssignmentsRef.current;
          const previousMap = new Map(previous.map((a) => [a.id, a]));
          const currentMap = new Map(assignments.map((a) => [a.id, a]));
          const hasChanges =
            assignments.length !== previous.length ||
            assignments.some((a) => {
              const prev = previousMap.get(a.id);
              if (!prev) return true;
              return (
                a.vesselId !== prev.vesselId ||
                a.startDate !== prev.startDate ||
                a.endDate !== prev.endDate
              );
            }) ||
            previous.some((a) => !currentMap.has(a.id));

          if (hasChanges) {
            setVesselAssignments(assignments);
            previousAssignmentsRef.current = [...assignments];
          } else {
            previousAssignmentsRef.current = [...assignments];
          }
        } catch (error) {
          console.error('[CURRENT PAGE] Error polling vessel assignments:', error);
        }
      }, 15000);
    };

    const channel = supabase
      .channel(`current-vessel-assignments-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vessel_assignments',
          filter: `user_id=eq.${user.id}`,
        },
        async () => {
          try {
            const assignments = await getVesselAssignments(supabase, user.id);
            setVesselAssignments(assignments);
            previousAssignmentsRef.current = [...assignments];
          } catch (error) {
            console.error('[CURRENT PAGE] Error refetching assignments after change:', error);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          return;
        }
        // Connection flaps / table not in realtime publication — soft fallback
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(
            '[CURRENT PAGE] Realtime unavailable for vessel_assignments; using polling fallback',
          );
          startPollingFallback();
        }
      });

    return () => {
      void supabase.removeChannel(channel);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [user?.id, supabase]);

  // Effect to automatically set activeVesselId when there's an active assignment but no activeVesselId
  useEffect(() => {
    if (!userProfile || !vesselAssignments.length || !user?.id || isLoadingProfile) {
      return;
    }

    // If user already has an activeVesselId, skip
    if (userProfile.activeVesselId) {
      return;
    }

    // Find active assignments (end_date IS NULL)
    const activeAssignments = vesselAssignments.filter(a => !a.endDate);

    if (activeAssignments.length === 0) {
      // No active assignments, nothing to do
      return;
    }

    // If there's exactly one active assignment, set it as the active vessel
    // If there are multiple, use the most recent one (first in the sorted list)
    const activeAssignment = activeAssignments[0];
    
    console.log('[CURRENT PAGE] Auto-setting activeVesselId from active assignment:', {
      vesselId: activeAssignment.vesselId,
      startDate: activeAssignment.startDate,
      activeAssignmentsCount: activeAssignments.length,
    });

    const profileUpdates: {
      activeVesselId: string;
      startDate?: string;
    } = {
      activeVesselId: activeAssignment.vesselId,
    };
    // Vessel accounts: use assignment start as official start_date when profile has none
    if (userProfile.role === 'vessel' && !userProfile.startDate && activeAssignment.startDate) {
      profileUpdates.startDate = activeAssignment.startDate;
    }

    updateUserProfile(supabase, user.id, profileUpdates)
      .then(() => {
        console.log('[CURRENT PAGE] Successfully set activeVesselId:', activeAssignment.vesselId);
        if (refetchUserProfile) {
          refetchUserProfile();
        }
      })
      .catch((error) => {
        console.error('[CURRENT PAGE] Error setting activeVesselId:', error);
      });
  }, [userProfile, vesselAssignments, user?.id, supabase, refetchUserProfile, isLoadingProfile]);

  // Vessel accounts with a linked vessel but no official start_date: seed from assignment
  useEffect(() => {
    if (
      !user?.id ||
      !userProfile ||
      isLoadingProfile ||
      userProfile.role !== 'vessel' ||
      userProfile.startDate ||
      !userProfile.activeVesselId ||
      !vesselAssignments.length
    ) {
      return;
    }

    const forActiveVessel = vesselAssignments.filter(
      (a) => a.vesselId === userProfile.activeVesselId
    );
    if (forActiveVessel.length === 0) return;

    // Prefer active assignment; otherwise earliest start among this vessel's assignments
    const active = forActiveVessel.find((a) => !a.endDate);
    const startDateStr =
      active?.startDate ||
      [...forActiveVessel]
        .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]?.startDate;

    if (!startDateStr) return;

    updateUserProfile(supabase, user.id, { startDate: startDateStr })
      .then(() => {
        if (refetchUserProfile) refetchUserProfile();
      })
      .catch((error) => {
        console.error('[CURRENT PAGE] Error seeding vessel start_date:', error);
      });
  }, [
    user?.id,
    userProfile,
    vesselAssignments,
    isLoadingProfile,
    supabase,
    refetchUserProfile,
  ]);

  // Effect to automatically clear activeVesselId when all assignments are ended
  useEffect(() => {
    if (!userProfile?.activeVesselId || !vesselAssignments.length || !user?.id) {
      return;
    }

    const activeAssignmentsForVessel = vesselAssignments.filter(
      a => a.vesselId === userProfile.activeVesselId && !a.endDate
    );

    if (activeAssignmentsForVessel.length === 0) {
      console.log('[CURRENT PAGE] No active assignment found for activeVesselId, clearing it');
      updateUserProfile(supabase, user.id, {
        activeVesselId: null,
      })
        .then(() => {
          if (refetchUserProfile) {
            refetchUserProfile();
          }
        })
        .catch((error) => {
          console.error('[CURRENT PAGE] Error clearing activeVesselId:', error);
        });
    }
  }, [vesselAssignments, userProfile?.activeVesselId, user?.id, supabase, refetchUserProfile]);

  // Helper function to find which vessel a date belongs to based on assignments
  const findVesselForDate = useCallback((date: Date): { vessel: Vessel | null; assignment: VesselAssignment | null } => {
    if (!vessels || !vesselAssignments.length) {
      return { vessel: null, assignment: null };
    }

    const dateStr = format(date, 'yyyy-MM-dd');
    const dateObj = parse(dateStr, 'yyyy-MM-dd', new Date());

    // Find the assignment that contains this date
    for (const assignment of vesselAssignments) {
      const assignmentStart = parse(assignment.startDate, 'yyyy-MM-dd', new Date());
      const assignmentEnd = assignment.endDate
        ? parse(assignment.endDate, 'yyyy-MM-dd', new Date())
        : null;

      // Check if date is within this assignment period [start_date, end_date)
      const isAfterOrEqualStart = !isBefore(dateObj, assignmentStart);
      const isBeforeEnd = !assignmentEnd || isBefore(dateObj, assignmentEnd);

      if (isAfterOrEqualStart && isBeforeEnd) {
        const vessel = vessels.find(v => v.id === assignment.vesselId);
        return { vessel: vessel || null, assignment };
      }
    }

    return { vessel: null, assignment: null };
  }, [vessels, vesselAssignments]);

  // Create a Map for quick state lookup by date
  // If multiple logs exist for the same date (from different vessels),
  // prioritize the log from the vessel that the date belongs to according to assignments
  const stateLogMap = useMemo(() => {
    const map = new Map<string, DailyStatus>();
    
    // Group logs by date
    const logsByDate = new Map<string, StateLog[]>();
    stateLogs.forEach(log => {
      if (!logsByDate.has(log.date)) {
        logsByDate.set(log.date, []);
      }
      logsByDate.get(log.date)!.push(log);
    });
    
    // For each date, determine which log to use
    logsByDate.forEach((logs, dateStr) => {
      if (logs.length === 1) {
        // Only one log for this date, use it
        map.set(dateStr, logs[0].state);
      } else {
        // Multiple logs for this date - find which vessel this date belongs to
        const dateObj = parse(dateStr, 'yyyy-MM-dd', new Date());
        const { vessel } = findVesselForDate(dateObj);
        
        if (vessel) {
          // Find the log from the correct vessel
          const correctLog = logs.find(log => log.vesselId === vessel.id);
          if (correctLog) {
            map.set(dateStr, correctLog.state);
          } else {
            // Fallback to first log if no match found
            map.set(dateStr, logs[0].state);
          }
        } else {
          // No vessel found for this date, use first log
          map.set(dateStr, logs[0].state);
        }
      }
    });
    
    return map;
  }, [stateLogs, vesselAssignments, vessels, findVesselForDate]);


  // Also create a set for all potential standby states (in-port, at-anchor) for visual indication
  const standbyStateDatesSet = useMemo(() => {
    const dates = new Set<string>();
    stateLogs.forEach(log => {
      if (log.state === 'in-port' || log.state === 'at-anchor') {
        dates.add(log.date);
      }
    });
    return dates;
  }, [stateLogs]);

  // Automatically fill missing days between last logged date and today
  useEffect(() => {
    const fillGaps = async () => {
      // Only run if we have an active vessel, state logs are loaded, and we're not already filling gaps
      if (!currentVessel || !user?.id || stateLogs.length === 0 || isFillingGaps || isLoadingLogs) {
        return;
      }

      // Skip auto-fill for approved captains viewing vessel account logs (view-only)
      if (vesselAccountUserId) {
        return;
      }

      // Create a unique key for this check (vessel + today's date)
      const todayKey = format(new Date(), 'yyyy-MM-dd');
      const checkKey = `${currentVessel.id}-${todayKey}`;
      
      // Skip if we've already filled gaps for this vessel today
      if (gapFilledRef.current === checkKey) {
        return;
      }

      // Filter state logs to only include logs for the current vessel
      const currentVesselLogs = stateLogs.filter(log => log.vesselId === currentVessel.id);

      // If no logs exist for this vessel, skip gap filling
      if (currentVesselLogs.length === 0) {
        gapFilledRef.current = checkKey;
        return;
      }

      // Find missing days for the current vessel only
      const { lastLoggedDate, lastLoggedState, missingDays } = findMissingDays(currentVesselLogs);

      // If there are missing days and we have a last logged state, fill them
      if (missingDays.length > 0 && lastLoggedState) {
        setIsFillingGaps(true);
        
        try {
          console.log(`[FILL MISSING DAYS] Found ${missingDays.length} missing days for vessel ${currentVessel.name} from ${lastLoggedDate ? format(lastLoggedDate, 'yyyy-MM-dd') : 'unknown'} to today. Filling with state: ${lastLoggedState}`);
          
          // Create logs for all missing days with the same state as the last logged entry
          const logsToCreate = missingDays.map(date => ({
            date,
            state: lastLoggedState,
          }));

          await updateStateLogsBatch(supabase, user.id, currentVessel.id, logsToCreate);

          console.log(`[FILL MISSING DAYS] Successfully filled ${missingDays.length} missing days for vessel ${currentVessel.name}`);

          // Mark that we've filled gaps for this vessel today
          gapFilledRef.current = checkKey;

          // Refresh state logs to show the newly created entries
          // Fetch logs from all vessels again to update the full list
          const updatedCurrentVesselLogs = await getVesselStateLogs(supabase, currentVessel.id, user.id);
          
          // Update stateLogs by replacing logs for this vessel with the updated ones
          setStateLogs(prevLogs => {
            const otherVesselLogs = prevLogs.filter(log => log.vesselId !== currentVessel.id);
            return [...otherVesselLogs, ...updatedCurrentVesselLogs];
          });
        } catch (error: any) {
          console.error('Error filling missing days:', error);
          // Don't show toast error - this is automatic background operation
        } finally {
          setIsFillingGaps(false);
        }
      } else {
        // No gaps to fill, mark as checked
        gapFilledRef.current = checkKey;
      }
    };

    fillGaps();
  }, [stateLogs, currentVessel?.id, currentVessel?.name, user?.id, supabase, isFillingGaps, isLoadingLogs, vesselAccountUserId]);
  
  const startServiceForm = useForm<StartServiceFormValues>({
    resolver: zodResolver(startServiceSchema),
    defaultValues: { 
      vesselId: '', 
      position: userProfile?.position || '', 
      startDate: undefined, 
      endDate: undefined
    },
  });

  // Update position field when userProfile changes
  useEffect(() => {
    if (userProfile?.position) {
      startServiceForm.setValue('position', userProfile.position);
    }
  }, [userProfile?.position, startServiceForm]);

  // Check if user is captain
  const isCaptain = useMemo(() => {
    return userProfile?.role === 'captain';
  }, [userProfile?.role]);

  // Check if user is an officer (rank or higher)
  const isOfficer = useMemo(() => {
    if (!userProfile) return false;
    const position = (userProfile.position || '').toLowerCase();
    const role = (userProfile.role || '').toLowerCase();
    
    // Officers include: Captain, Chief Officer, First Officer, First Mate, Second Officer, Third Officer, OOW, Deck Officer
    // Also Chief Engineer, First Engineer, Second Engineer, Third Engineer, Fourth Engineer
    const officerPositions = [
      'captain', 'master', 'chief officer', 'first officer', 'first mate', 
      'second officer', 'third officer', 'officer of the watch', 'oow', 'deck officer',
      'chief engineer', 'first engineer', 'second engineer', 'third engineer', 'fourth engineer'
    ];
    
    return role === 'captain' || role === 'admin' || officerPositions.some(op => position.includes(op));
  }, [userProfile]);

  // Check if user is a vessel account (vessel accounts don't log watches)
  const isVesselAccount = useMemo(() => {
    if (!userProfile) return false;
    const role = (userProfile.role || '').toLowerCase();
    return role === 'vessel';
  }, [userProfile]);

  // Fetch passage logs so the date hover tooltip can show passage details
  // (origin → destination, distance, type) on underway / part-of-passage days.
  useEffect(() => {
    if (!user?.id || !supabase) {
      setPassages([]);
      return;
    }

    const fetchPassages = async () => {
      try {
        const collected: PassageLog[] = [];

        const useVesselPassages =
          isVesselAccount ||
          isVesselLinked ||
          (userProfile?.role === 'captain' && captainViewMode === 'vessel');

        if (useVesselPassages) {
          const vesselIds = new Set<string>();
          for (const a of vesselAssignments) vesselIds.add(a.vesselId);
          if (currentVessel?.id) vesselIds.add(currentVessel.id);

          for (const vesselId of vesselIds) {
            try {
              const byVessel = await getPassageLogsByVessel(supabase, vesselId);
              collected.push(...byVessel);
            } catch (err) {
              console.error('[CURRENT PAGE] Error fetching vessel passages:', vesselId, err);
            }
          }
        } else {
          try {
            const own = await getPassageLogs(supabase, user.id);
            collected.push(...own);
          } catch (err) {
            console.error('[CURRENT PAGE] Error fetching personal passages:', err);
          }
        }

        const deduped = Array.from(
          new Map(collected.map((p) => [p.id, p])).values()
        );
        setPassages(deduped);
      } catch (err) {
        console.error('[CURRENT PAGE] Error fetching passages:', err);
        setPassages([]);
      }
    };

    fetchPassages();
  }, [
    user?.id,
    supabase,
    isVesselAccount,
    isVesselLinked,
    userProfile?.role,
    captainViewMode,
    currentVessel?.id,
    vesselAssignments,
  ]);

  // O(1) date → passages lookup for tooltip rendering.
  const passagesByDate = useMemo(() => {
    const map = new Map<string, PassageLog[]>();
    for (const p of passages) {
      if (!p.start_time || !p.end_time) continue;
      try {
        const start = startOfDay(new Date(p.start_time));
        const end = startOfDay(new Date(p.end_time));
        if (isAfter(start, end)) continue;
        const days = eachDayOfInterval({ start, end });
        for (const d of days) {
          const key = format(d, 'yyyy-MM-dd');
          const arr = map.get(key);
          if (arr) arr.push(p);
          else map.set(key, [p]);
        }
      } catch (err) {
        // Skip malformed passages rather than breaking the page.
      }
    }
    return map;
  }, [passages]);

  // For vessel accounts, automatically set their vessel if they have active_vessel_id
  // Skip if the user cleared the selection to pick a different vessel.
  const vesselSelectionClearedRef = useRef(false);
  useEffect(() => {
    if (
      isVesselAccount &&
      userProfile?.activeVesselId &&
      vessels &&
      !vesselSelectionClearedRef.current
    ) {
      const vessel = vessels.find(v => v.id === userProfile.activeVesselId);
      if (vessel) {
        startServiceForm.setValue('vesselId', vessel.id);
      }
    }
  }, [isVesselAccount, userProfile?.activeVesselId, vessels, startServiceForm]);

  // Fetch watch logs for the user (only for officers, not vessel accounts)
  useEffect(() => {
    const fetchWatchLogs = async () => {
      if (!user?.id || !isOfficer || isVesselAccount) {
        setWatchDates(new Set());
        return;
      }

      try {
        const { data, error } = await supabase
          .from('nav_watch_logs')
          .select('start_time')
          .eq('user_id', user.id);

        if (error) throw error;

        // Extract dates from watch logs (start_time timestamps)
        const dates = new Set<string>();
        if (data) {
          data.forEach((log: { start_time: string }) => {
            const date = format(new Date(log.start_time), 'yyyy-MM-dd');
            dates.add(date);
          });
        }
        setWatchDates(dates);
      } catch (error) {
        console.error('Error fetching watch logs:', error);
        setWatchDates(new Set());
      }
    };

    fetchWatchLogs();
  }, [user?.id, isOfficer, isVesselAccount, supabase]);

  // Extract part of active passage dates from state logs
  useEffect(() => {
    if (!stateLogs || stateLogs.length === 0) {
      setPartOfActivePassageDates(new Set());
      setIsPartOfActivePassageToday(false);
      return;
    }

    // Extract dates from state logs where isPartOfActivePassage is true
    const dates = new Set<string>();
    stateLogs.forEach(log => {
      if (log.isPartOfActivePassage) {
        dates.add(log.date);
      }
    });
    setPartOfActivePassageDates(dates);

    // Check if today is part of active passage
    const today = format(new Date(), 'yyyy-MM-dd');
    setIsPartOfActivePassageToday(dates.has(today));
  }, [stateLogs]);

  // Watch logging state - simple daily toggle (officers only)
  const [isOnWatchToday, setIsOnWatchToday] = useState<boolean>(false);
  const [isTogglingWatch, setIsTogglingWatch] = useState(false);
  const [lastCheckedDate, setLastCheckedDate] = useState<string>('');
  const [canLogWatch, setCanLogWatch] = useState<boolean>(false);
  const [watchDates, setWatchDates] = useState<Set<string>>(new Set());

  // Part of active passage logging state - simple daily toggle (all users)
  const [isPartOfActivePassageToday, setIsPartOfActivePassageToday] = useState<boolean>(false);
  const [isTogglingPartOfActivePassage, setIsTogglingPartOfActivePassage] = useState(false);
  const [partOfActivePassageDates, setPartOfActivePassageDates] = useState<Set<string>>(new Set());

  // Calculate standby days (excluding watch dates and part of active passage dates)
  const { standbyPeriods } = useMemo(() => {
    if (!stateLogs || stateLogs.length === 0) {
      return { standbyPeriods: [] };
    }
    const result = calculateStandbyDays(stateLogs, watchDates, partOfActivePassageDates, {
      vesselManagerSeaTime: isVesselAccount,
    });
    return { standbyPeriods: result.standbyPeriods };
  }, [stateLogs, watchDates, partOfActivePassageDates, isVesselAccount]);

  // Create a Set of dates that are counted as standby
  // Exclude watch dates and part of active passage dates (these count as "at sea", not standby)
  const standbyDatesSet = useMemo(() => {
    const dates = new Set<string>();
    standbyPeriods.forEach(period => {
      const startDate = period.startDate instanceof Date 
        ? period.startDate 
        : new Date(period.startDate);
      const periodEndDate = period.endDate instanceof Date
        ? period.endDate
        : new Date(period.endDate);
      
      // Iterate through all days in the period, but only count non-watch, non-passage days
      let currentDate = startDate;
      let counted = 0;
      const maxCounted = period.countedDays;
      
      while (currentDate <= periodEndDate && counted < maxCounted) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        const hasWatch = watchDates.has(dateStr);
        const isPartOfActivePassage = partOfActivePassageDates.has(dateStr);
        
        // Only add dates that are not watch days and not part of active passage
        if (!hasWatch && !isPartOfActivePassage) {
          dates.add(dateStr);
          counted++;
        }
        
        currentDate = addDays(currentDate, 1);
      }
    });
    return dates;
  }, [standbyPeriods, watchDates, partOfActivePassageDates]);


  // Handler to open captaincy request dialog for looked up vessel
  const handleOpenCaptaincyDialog = () => {
    if (!selectedVesselForAction) return;
    setCaptaincyDocumentUrls(['']);
    setIsCaptaincyDialogOpen(true);
  };

  // Handler to open captaincy request dialog for current vessel
  const handleOpenCurrentVesselCaptaincyDialog = () => {
    if (!currentVessel) return;
    setSelectedVesselForAction({ id: currentVessel.id, name: currentVessel.name, type: currentVessel.type });
    setCaptaincyDocumentUrls(['']);
    setIsCaptaincyDialogOpen(true);
  };

  // Handler to add document URL
  const handleAddCaptaincyDocumentUrl = () => {
    setCaptaincyDocumentUrls([...captaincyDocumentUrls, '']);
  };

  // Handler to remove document URL
  const handleRemoveCaptaincyDocumentUrl = (index: number) => {
    if (captaincyDocumentUrls.length > 1) {
      setCaptaincyDocumentUrls(captaincyDocumentUrls.filter((_, i) => i !== index));
    }
  };

  // Handler to update document URL
  const handleCaptaincyDocumentUrlChange = (index: number, value: string) => {
    const newUrls = [...captaincyDocumentUrls];
    newUrls[index] = value;
    setCaptaincyDocumentUrls(newUrls);
  };

  // Handler to request captaincy for looked up vessel
  const handleRequestCaptaincyFromLookup = async () => {
    if (!selectedVesselForAction || !user?.id) return;
    
    // Filter out empty URLs
    const validDocuments = captaincyDocumentUrls.filter(url => url.trim() !== '');

    if (validDocuments.length === 0) {
      toast({
        title: 'Documents Required',
        description: 'Please provide at least one supporting document URL to prove your captaincy of this vessel.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsRequestingCaptaincy(true);
    
    try {
      const response = await fetch('/api/vessel-claim-requests/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vesselId: selectedVesselForAction.id,
          requestedRole: 'captain',
          userId: user.id,
          supportingDocuments: validDocuments,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.code === '23505') { // Unique violation
          toast({
            title: 'Request Already Exists',
            description: 'You have already submitted a captaincy request for this vessel.',
            variant: 'destructive',
          });
        } else {
          throw new Error(result.message || result.error || 'Failed to submit captaincy request');
        }
      } else {
        toast({
          title: 'Captaincy Request Submitted',
          description: `Your request for captaincy of "${selectedVesselForAction.name}" has been submitted and is pending approval.`,
        });
        
        // Close dialog and reset state
        setIsCaptaincyDialogOpen(false);
        setCaptaincyDocumentUrls(['']);
        
        // If this was for the current vessel, refresh the pending request state
        if (currentVessel && selectedVesselForAction.id === currentVessel.id) {
          setHasPendingCaptaincyRequest(true);
        }
        
        setSelectedVesselForAction(null);
      }
    } catch (error: any) {
      console.error('Error requesting captaincy:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit captaincy request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsRequestingCaptaincy(false);
    }
  };

  // Check if officer is on watch today and if vessel is at anchor (required for watch logging)
  // Vessel accounts don't log watches - all days underway and at anchor count as at sea
  useEffect(() => {
    if (!user?.id || !currentVessel?.id || !isOfficer || isVesselAccount) {
      setIsOnWatchToday(false);
      setCanLogWatch(false);
      return;
    }

    const checkWatchStatus = async () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      const todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(today);
      todayEnd.setHours(23, 59, 59, 999);
      
      // Reset if it's a new day
      if (lastCheckedDate && lastCheckedDate !== today) {
        setIsOnWatchToday(false);
        setLastCheckedDate(today);
      }

      try {
        // Check if vessel is at anchor today (required for watch logging)
        const todayKey = format(new Date(), 'yyyy-MM-dd');
        const todayState = stateLogs?.find(
          (log) => log.date === todayKey && log.vesselId === currentVessel.id,
        )?.state;
        const isAtAnchor = todayState === 'at-anchor';
        setCanLogWatch(isAtAnchor);

        // Check if there's a watch log entry for today
        const { data, error } = await supabase
          .from('nav_watch_logs')
          .select('id')
          .eq('user_id', user.id)
          .eq('vessel_id', currentVessel.id)
          .gte('start_time', todayStart.toISOString())
          .lte('start_time', todayEnd.toISOString())
          .maybeSingle();

        if (error) throw error;
        
        setIsOnWatchToday(!!data);
        if (!lastCheckedDate || lastCheckedDate !== today) {
          setLastCheckedDate(today);
        }
        
        // Update watch dates set
        if (data) {
          setWatchDates(prev => new Set([...prev, today]));
        } else {
          setWatchDates(prev => {
            const newSet = new Set(prev);
            newSet.delete(today);
            return newSet;
          });
        }
      } catch (error) {
        console.error('Error checking watch status:', error);
      }
    };

    checkWatchStatus();

    // Set up interval to check at midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    const timeoutId = setTimeout(() => {
      checkWatchStatus();
      // Then check every hour to catch midnight
      const intervalId = setInterval(checkWatchStatus, 60 * 60 * 1000);
      return () => clearInterval(intervalId);
    }, msUntilMidnight);

    return () => clearTimeout(timeoutId);
  }, [user?.id, currentVessel?.id, isOfficer, isVesselAccount, supabase, stateLogs]);

  // Check if a date can be marked as part of active passage: previous day must be underway or part of passage
  const canMarkDateAsPartOfPassage = useCallback((dateStr: string): { allowed: boolean; reason?: string } => {
    const date = parse(dateStr, 'yyyy-MM-dd', new Date());
    const prevDate = addDays(date, -1);
    const prevStr = format(prevDate, 'yyyy-MM-dd');
    const prevLog = stateLogs?.find(l => l.vesselId === currentVessel?.id && l.date === prevStr);
    if (!prevLog) {
      return { allowed: false, reason: 'The previous day must be logged (and be Underway or Part of active passage) before marking this day as part of active passage.' };
    }
    if (prevLog.state === 'underway') return { allowed: true };
    if (partOfActivePassageDates.has(prevStr)) return { allowed: true };
    return { allowed: false, reason: 'The previous day must be "Underway" or "Part of active passage" to mark this day as part of active passage.' };
  }, [stateLogs, currentVessel?.id, partOfActivePassageDates]);

  // Toggle part of active passage for today (available for all users, any state)
  const handleTogglePartOfActivePassage = async () => {
    if (!user?.id || !currentVessel?.id) return;

    if (isVesselLinked || (isCaptain && captainViewMode === 'vessel')) {
      toast({
        title: 'Cannot Edit',
        description: 'You can only view the vessel account logs. The vessel manager must update the logs.',
        variant: 'destructive',
      });
      return;
    }

    setIsTogglingPartOfActivePassage(true);
    const today = format(new Date(), 'yyyy-MM-dd');

    try {
      // Get today's state log to update
      const todayLog = stateLogs?.find(log => log.vesselId === currentVessel.id && log.date === today);
      
      if (!todayLog) {
        toast({
          title: 'Error',
          description: 'Please set today\'s vessel state first before marking as part of active passage.',
          variant: 'destructive',
        });
        setIsTogglingPartOfActivePassage(false);
        return;
      }

      // Prevent marking as "part of active passage" if already marked as "underway"
      // Underway already means the vessel is at sea, so marking as part of passage is redundant
      if (!isPartOfActivePassageToday && todayLog.state === 'underway') {
        toast({
          title: 'Cannot Mark as Part of Passage',
          description: 'This day is already marked as "underway", which means the vessel is at sea. You cannot mark it as part of active passage.',
          variant: 'destructive',
        });
        setIsTogglingPartOfActivePassage(false);
        return;
      }

      // When adding part of passage: previous day must be underway or part of passage
      if (!isPartOfActivePassageToday) {
        const check = canMarkDateAsPartOfPassage(today);
        if (!check.allowed) {
          toast({
            title: 'Cannot Mark as Part of Passage',
            description: check.reason,
            variant: 'destructive',
          });
          setIsTogglingPartOfActivePassage(false);
          return;
        }
      }

      // Update the state log's is_part_of_active_passage column
      const { error } = await supabase
        .from('daily_state_logs')
        .update({ is_part_of_active_passage: !isPartOfActivePassageToday })
        .eq('user_id', user.id)
        .eq('vessel_id', currentVessel.id)
        .eq('date', today);

      if (error) throw error;
      
      // Refresh state logs to get updated data
      const updatedLogs = await getVesselStateLogs(supabase, currentVessel.id, user.id);
      setStateLogs(updatedLogs);
      
      toast({
        title: isPartOfActivePassageToday ? 'Part of Active Passage Removed' : 'Part of Active Passage Recorded',
        description: isPartOfActivePassageToday 
          ? 'This day is no longer marked as part of active passage.'
          : 'This day has been marked as part of active passage and counts as "at sea".',
      });
    } catch (error: any) {
      console.error('Error toggling part of active passage:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update part of active passage. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsTogglingPartOfActivePassage(false);
    }
  };

  // Toggle watch for today (only allowed when vessel is at anchor)
  const handleToggleWatch = async () => {
    if (!user?.id || !currentVessel?.id || !isOfficer) return;

    if (isVesselLinked || (isCaptain && captainViewMode === 'vessel')) {
      toast({
        title: 'Cannot Edit',
        description: 'You can only view the vessel account logs. The vessel manager must update the logs.',
        variant: 'destructive',
      });
      return;
    }

    // Check if vessel is at anchor today
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const todayState = stateLogs?.find(
      (log) => log.date === todayKey && log.vesselId === currentVessel.id,
    )?.state;
    if (todayState !== 'at-anchor') {
      toast({
        title: 'Watch Logging Not Available',
        description: 'Watch logging is only available when the vessel is at anchor.',
        variant: 'destructive',
      });
      return;
    }

    setIsTogglingWatch(true);
    const today = format(new Date(), 'yyyy-MM-dd');
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    try {
      if (isOnWatchToday) {
        // Remove watch - delete today's watch log entry
        const { error } = await supabase
          .from('nav_watch_logs')
          .delete()
          .eq('user_id', user.id)
          .eq('vessel_id', currentVessel.id)
          .gte('start_time', todayStart.toISOString())
          .lte('start_time', todayEnd.toISOString());

        if (error) throw error;
        
        setIsOnWatchToday(false);
        // Update watch dates set
        setWatchDates(prev => {
          const newSet = new Set(prev);
          newSet.delete(today);
          return newSet;
        });
        toast({
          title: 'Watch Removed',
          description: 'This day is no longer recorded as watch.',
        });
      } else {
        // Start watch - create a watch log entry for the full day
        const { error } = await supabase
          .from('nav_watch_logs')
          .insert({
            user_id: user.id,
            vessel_id: currentVessel.id,
            start_time: todayStart.toISOString(),
            end_time: todayEnd.toISOString(),
            watch_type: 'bridge', // Default type, can be changed if needed
          });

        if (error) throw error;
        
        setIsOnWatchToday(true);
        // Update watch dates set
        setWatchDates(prev => new Set([...prev, today]));
        toast({
          title: 'Watch Recorded',
          description: 'This day has been recorded as watch.',
        });
      }
    } catch (error: any) {
      console.error('Error toggling watch:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update watch status. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsTogglingWatch(false);
    }
  };

   // Find the most recent service record date for the current vessel only
  const mostRecentServiceDate = useMemo(() => {
    if (!stateLogs || stateLogs.length === 0 || !currentVessel) return null;
    // Filter logs to only current vessel, then get the most recent date
    const currentVesselLogs = stateLogs.filter(log => log.vesselId === currentVessel.id);
    if (currentVesselLogs.length === 0) return null;
    const sortedLogs = [...currentVesselLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sortedLogs[0] ? new Date(sortedLogs[0].date) : null;
  }, [stateLogs, currentVessel]);

  // Helper function to validate if a date is within valid vessel assignment period
  const isDateValidForStateChange = (date: Date): { valid: boolean; reason?: string } => {
    if (!currentVessel || !user?.id) {
      return { valid: false, reason: 'No vessel selected.' };
    }

    // Normalize the input date to start of day for comparison
    const dateObj = startOfDay(date);

    // For vessel accounts, allow editing from the vessel's official start_date (if set) or vessel creation date
    if (userProfile?.role === 'vessel') {
      // Check if user has a start_date set - this is the official start date for the vessel account
      let userStartDate: Date | null = null;
      if (userProfile?.startDate) {
        try {
          // Parse the start_date string (format: YYYY-MM-DD) and normalize to start of day
          userStartDate = startOfDay(parse(userProfile.startDate, 'yyyy-MM-dd', new Date()));
        } catch (e) {
          console.error('Error parsing start_date:', userProfile.startDate, e);
        }
      }
      
      // Use the official start_date as the earliest allowed date (priority over vessel creation date)
      let earliestAllowedDate: Date | null = userStartDate;
      
      // Fallback to vessel created_at date only if start_date is not set
      if (!earliestAllowedDate) {
        const vesselData = vessels?.find(v => v.id === currentVessel.id);
        if (vesselData && (vesselData as any).created_at) {
          earliestAllowedDate = startOfDay(new Date((vesselData as any).created_at));
        }
      }

      // Validate: date must be on or after the earliest allowed date
      // Use isBefore to check if date is BEFORE the earliest allowed date (invalid)
      // If date is equal to or after earliestAllowedDate, isBefore returns false (valid)
      if (earliestAllowedDate && isBefore(dateObj, earliestAllowedDate)) {
        return {
          valid: false,
          reason: `You cannot change states before ${format(earliestAllowedDate, 'MMM d, yyyy')}${userStartDate ? ' (your official start date)' : ' (vessel launch date)'}.`,
        };
      }

      // Check if date is in the future
      const today = startOfDay(new Date());
      if (isAfter(dateObj, today)) {
        return {
          valid: false,
          reason: 'You cannot change states for future dates.',
        };
      }

      // No end date restriction for vessel accounts - they can edit any date from start_date to present
      return { valid: true };
    }

    // For crew/captain accounts, use assignment-based validation
    // Find the earliest assignment across ALL vessels (when user first joined any vessel)
    let earliestAssignment: VesselAssignment | null = null;
    if (vesselAssignments.length > 0) {
      earliestAssignment = vesselAssignments.reduce((earliest, assignment) => {
        const assignmentStart = parse(assignment.startDate, 'yyyy-MM-dd', new Date());
        if (!earliest) return assignment;
        const earliestStart = parse(earliest.startDate, 'yyyy-MM-dd', new Date());
        return assignmentStart < earliestStart ? assignment : earliest;
      }, null as VesselAssignment | null);
    }

    // Check if date is before the earliest vessel assignment
    if (earliestAssignment) {
      const earliestStart = parse(earliestAssignment.startDate, 'yyyy-MM-dd', new Date());
      if (isBefore(dateObj, earliestStart)) {
        return {
          valid: false,
          reason: `You cannot change states before ${format(earliestStart, 'MMM d, yyyy')} (when you first joined a vessel).`,
        };
      }
    }

    // Find assignments for the current vessel (ordered by start date, most recent first)
    const currentVesselAssignments = vesselAssignments
      .filter(a => a.vesselId === currentVessel.id)
      .sort((a, b) => {
        const aStart = parse(a.startDate, 'yyyy-MM-dd', new Date());
        const bStart = parse(b.startDate, 'yyyy-MM-dd', new Date());
        return bStart.getTime() - aStart.getTime(); // Most recent first
      });

    // If no assignments for current vessel, check if it's active
    if (currentVesselAssignments.length === 0) {
      // If vessel is active but has no assignment record yet (edge case), allow from today
      if (userProfile?.activeVesselId === currentVessel.id) {
        const today = startOfDay(new Date());
        if (isBefore(dateObj, today)) {
          return {
            valid: false,
            reason: 'You cannot change states for dates before you joined this vessel.',
          };
        }
        return { valid: true };
      } else {
        return {
          valid: false,
          reason: 'You have no assignment record for this vessel. Please start a service first.',
        };
      }
    }

    // Check if date falls within any assignment period for this vessel
    // Note: end_date is exclusive '[)' - meaning if end_date = 2025-01-10, 
    // valid dates are < 2025-01-10 (through 2025-01-09 inclusive)
    let dateInAnyAssignment = false;
    for (const assignment of currentVesselAssignments) {
      const assignmentStart = parse(assignment.startDate, 'yyyy-MM-dd', new Date());
      const assignmentEnd = assignment.endDate
        ? parse(assignment.endDate, 'yyyy-MM-dd', new Date())
        : null;

      // Check if date is within this assignment period [start_date, end_date)
      // date >= start_date AND (end_date is null OR date < end_date)
      const isAfterOrEqualStart = !isBefore(dateObj, assignmentStart);
      const isBeforeEnd = !assignmentEnd || isBefore(dateObj, assignmentEnd);
      
      if (isAfterOrEqualStart && isBeforeEnd) {
        dateInAnyAssignment = true;
        break;
      }
    }

    if (!dateInAnyAssignment) {
      // Find the most recent assignment to show a helpful message
      const mostRecentAssignment = currentVesselAssignments[0];
      const assignmentStart = parse(mostRecentAssignment.startDate, 'yyyy-MM-dd', new Date());
      const assignmentEnd = mostRecentAssignment.endDate
        ? parse(mostRecentAssignment.endDate, 'yyyy-MM-dd', new Date())
        : null;

      if (isBefore(dateObj, assignmentStart)) {
        return {
          valid: false,
          reason: `You cannot change states before ${format(assignmentStart, 'MMM d, yyyy')} (when you joined this vessel).`,
        };
      }

      // end_date is exclusive, so if end_date = 2025-01-10, dates >= 2025-01-10 are invalid
      if (assignmentEnd && !isBefore(dateObj, assignmentEnd)) {
        return {
          valid: false,
          reason: `You cannot change states on or after ${format(assignmentEnd, 'MMM d, yyyy')} (when you left this vessel). Join a new vessel to continue logging.`,
        };
      }
    }

    return { valid: true };
  };

  const handleDateClick = (date: Date) => {
    if (!currentVessel) {
      toast({
        title: 'No Active Vessel',
        description: 'Please set an active vessel first.',
        variant: 'destructive',
      });
      return;
    }
    
    // For approved captains viewing vessel account logs, prevent editing
    if (isVesselLinked || (isCaptain && captainViewMode === 'vessel')) {
      toast({
        title: 'View Only',
        description: 'You can only view the vessel account logs. The vessel manager must update the logs.',
        variant: 'default',
      });
      return;
    }
    
    // Check if date is in the future
    const today = startOfDay(new Date());
    const clickedDate = startOfDay(date);
    
    if (isAfter(clickedDate, today)) {
      toast({
        title: 'Future Date',
        description: 'You cannot update future dates.',
        variant: 'destructive',
      });
      return;
    }

    // Validate date is within valid vessel assignment period
    const validation = isDateValidForStateChange(date);
    if (!validation.valid) {
      toast({
        title: 'Invalid Date',
        description: validation.reason || 'You cannot change the state for this date.',
        variant: 'destructive',
      });
      return;
    }
    
    if (selectionMode === 'single') {
      // Single date selection
      setSelectedDate(date);
      const dateKey = format(date, 'yyyy-MM-dd');
      const existingState = stateLogMap.get(dateKey);
      setSelectedState(existingState || null);
      // Check if this date is part of active passage (but not if state is underway)
      const isPartOfPassage = partOfActivePassageDates.has(dateKey);
      setIsPartOfActivePassageInDialog(existingState !== 'underway' && isPartOfPassage);
      // Check if this date has a watch log (officers only, not vessel accounts)
      setIsWatchInDialog(isOfficer && !isVesselAccount && watchDates.has(dateKey));
      // Load existing notes for this date
      const existingLog = stateLogs.find(log => log.date === dateKey);
      setNotesInDialog(existingLog?.notes || '');
      setDateRange(undefined);
      setIsDialogOpen(true);
    } else {
      // Range selection mode
      if (!dateRange?.from || (dateRange.from && dateRange.to)) {
        // Start new range
        setDateRange({ from: date, to: undefined });
      } else if (dateRange.from && !dateRange.to) {
        // Check if clicking the same date (cancel range selection)
        if (format(date, 'yyyy-MM-dd') === format(dateRange.from, 'yyyy-MM-dd')) {
          setDateRange(undefined);
          return;
        }
        
        // Complete the range
        const from = dateRange.from;
        const to = date;
        
        // Ensure from is before to
        let start = from < to ? from : to;
        let end = from < to ? to : from;
        
        // Restrict end date to today if it's in the future
        const today = startOfDay(new Date());
        if (isAfter(end, today)) {
          end = today;
          toast({
            title: 'Range Adjusted',
            description: 'The range end date has been adjusted to today. You cannot select future dates.',
            variant: 'default',
          });
        }
        
        // Validate both start and end dates are within valid vessel assignment period
        const startValidation = isDateValidForStateChange(start);
        if (!startValidation.valid) {
          toast({
            title: 'Invalid Range Start',
            description: startValidation.reason || 'The start date is not valid for state changes.',
            variant: 'destructive',
          });
          setDateRange({ from: start, to: undefined });
          return;
        }

        const endValidation = isDateValidForStateChange(end);
        if (!endValidation.valid) {
          toast({
            title: 'Invalid Range End',
            description: endValidation.reason || 'The end date is not valid for state changes.',
            variant: 'destructive',
          });
          setDateRange({ from: start, to: undefined });
          return;
        }
        
        setDateRange({ from: start, to: end });
        setSelectedDate(null);
        setSelectedState(null);
        setIsPartOfActivePassageInDialog(false); // Reset for range selection
        setIsWatchInDialog(false); // Reset for range selection (watch only applies to single dates)
        setNotesInDialog(''); // Reset notes for range selection
        setIsDialogOpen(true);
      }
    }
  };

  const handleStateChange = async (state: DailyStatus | null) => {
    if (!currentVessel || !user?.id) return;

    // If state is null, remove the state instead of setting it
    if (state === null) {
      await handleRemoveState();
      return;
    }

    setIsSaving(true);

    try {
      let logs: Array<{ date: string; state: DailyStatus; is_part_of_active_passage?: boolean; notes?: string }> = [];
      
      if (dateRange?.from && dateRange?.to) {
        // Range update
        // Prevent marking as "part of active passage" if state is "underway" or "in-yard"
        if (isPartOfActivePassageInDialog && (state === 'underway' || state === 'in-yard')) {
          toast({
            title: 'Cannot Mark as Part of Passage',
            description: state === 'underway' 
              ? 'Days marked as "underway" are already counted as at sea. You cannot also mark them as part of active passage.'
              : 'Days marked as "in yard" cannot be marked as part of active passage.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
        // Part of passage range: the day before the range start must be underway or part of passage
        if (isPartOfActivePassageInDialog) {
          const rangeStartStr = format(dateRange.from, 'yyyy-MM-dd');
          const check = canMarkDateAsPartOfPassage(rangeStartStr);
          if (!check.allowed) {
            toast({
              title: 'Cannot Mark as Part of Passage',
              description: check.reason,
              variant: 'destructive',
            });
            setIsSaving(false);
            return;
          }
        }
        
        const today = startOfDay(new Date());
        const interval = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
        // If state is 'underway' or 'in-yard', automatically set is_part_of_active_passage to false
        const isPartOfPassage =
          state === 'underway' || state === 'in-yard' || state === 'on-leave'
            ? false
            : isPartOfActivePassageInDialog;
        logs = interval
          .filter(day => {
            const dayStart = startOfDay(day);
            // Filter out future dates
            if (isAfter(dayStart, today)) return false;
            // Validate each date is within valid vessel assignment period
            const validation = isDateValidForStateChange(day);
            return validation.valid;
          })
          .map(day => ({
            date: format(day, 'yyyy-MM-dd'),
            state: state,
            is_part_of_active_passage: isPartOfPassage,
            notes: notesInDialog.trim() || undefined,
          }));
        
        if (logs.length === 0) {
          toast({
            title: 'Invalid Range',
            description: 'No valid dates in the selected range. Dates may be outside your vessel assignment period or in the future.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
      } else if (selectedDate) {
        // Single date update - validate one more time before saving
        const validation = isDateValidForStateChange(selectedDate);
        if (!validation.valid) {
          toast({
            title: 'Invalid Date',
            description: validation.reason || 'You cannot change the state for this date.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
        
        // Prevent marking as "part of active passage" if state is "underway" or "in-yard"
        if (isPartOfActivePassageInDialog && (state === 'underway' || state === 'in-yard')) {
          toast({
            title: 'Cannot Mark as Part of Passage',
            description: state === 'underway'
              ? 'Days marked as "underway" are already counted as at sea. You cannot also mark them as part of active passage.'
              : 'Days marked as "in yard" cannot be marked as part of active passage.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
        
        const dateKey = format(selectedDate, 'yyyy-MM-dd');
        // Part of passage: previous day must be underway or part of passage
        if (isPartOfActivePassageInDialog) {
          const check = canMarkDateAsPartOfPassage(dateKey);
          if (!check.allowed) {
            toast({
              title: 'Cannot Mark as Part of Passage',
              description: check.reason,
              variant: 'destructive',
            });
            setIsSaving(false);
            return;
          }
        }
        // If state is 'underway' or 'in-yard', automatically set is_part_of_active_passage to false
        const isPartOfPassage =
          state === 'underway' || state === 'in-yard' || state === 'on-leave'
            ? false
            : isPartOfActivePassageInDialog;
        logs = [{ date: dateKey, state, is_part_of_active_passage: isPartOfPassage, notes: notesInDialog.trim() || undefined }];
      } else {
        setIsSaving(false);
        return;
      }

      // For approved captains viewing vessel account logs, they should not be able to edit
      // They can only view the vessel account's logs
      // For captains viewing vessel logs (vessel view mode), they should not be able to edit
      if (isVesselLinked || (isCaptain && captainViewMode === 'vessel')) {
        toast({
          title: 'Cannot Edit',
          description: 'You can only view the vessel account logs. The vessel manager must update the logs.',
          variant: 'destructive',
        });
        return;
      }
      
      // Handle watch logs for officers (only for single date, only when state is at-anchor)
      if (isOfficer && selectedDate && !dateRange) {
        const dateKey = format(selectedDate, 'yyyy-MM-dd');
        const dateStart = new Date(dateKey);
        dateStart.setHours(0, 0, 0, 0);
        const dateEnd = new Date(dateKey);
        dateEnd.setHours(23, 59, 59, 999);
        
        if (isWatchInDialog && state === 'at-anchor') {
          // Create watch log if not exists
          if (!watchDates.has(dateKey)) {
            try {
              const { error: watchError } = await supabase
                .from('nav_watch_logs')
                .insert({
                  user_id: user.id,
                  vessel_id: currentVessel.id,
                  start_time: dateStart.toISOString(),
                  end_time: dateEnd.toISOString(),
                  watch_type: 'bridge', // Using 'bridge' for navigation watch
                });

              if (watchError) {
                console.error(`Error creating watch log for ${dateKey}:`, watchError);
              } else {
                // Update watch dates set
                setWatchDates(prev => new Set(prev).add(dateKey));
                
                // Update today's watch status if today was affected
                const todayKey = format(new Date(), 'yyyy-MM-dd');
                if (dateKey === todayKey) {
                  setIsOnWatchToday(true);
                }
              }
            } catch (watchError) {
              console.error('Error creating watch log:', watchError);
            }
          }
        } else {
          // Remove watch log if exists
          if (watchDates.has(dateKey)) {
            try {
              const { error: watchError } = await supabase
                .from('nav_watch_logs')
                .delete()
                .eq('user_id', user.id)
                .eq('vessel_id', currentVessel.id)
                .gte('start_time', dateStart.toISOString())
                .lte('start_time', dateEnd.toISOString());

              if (watchError) {
                console.error(`Error removing watch log for ${dateKey}:`, watchError);
              } else {
                // Update watch dates set
                setWatchDates(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(dateKey);
                  return newSet;
                });
                
                // Update today's watch status if today was affected
                const todayKey = format(new Date(), 'yyyy-MM-dd');
                if (dateKey === todayKey) {
                  setIsOnWatchToday(false);
                }
              }
            } catch (watchError) {
              console.error('Error removing watch log:', watchError);
            }
          }
        }
      }
      
      // If state is changing away from "at-anchor", remove watch logs for affected dates (for range updates)
      if (state !== 'at-anchor' && dateRange) {
        const datesToCheck = logs.map(log => log.date);
        const datesWithWatch = datesToCheck.filter(date => watchDates.has(date));
        
        if (datesWithWatch.length > 0) {
          try {
            // Delete watch logs for all affected dates
            for (const dateStr of datesWithWatch) {
              const dateStart = new Date(dateStr);
              dateStart.setHours(0, 0, 0, 0);
              const dateEnd = new Date(dateStr);
              dateEnd.setHours(23, 59, 59, 999);
              
              const { error: watchError } = await supabase
                .from('nav_watch_logs')
                .delete()
                .eq('user_id', user.id)
                .eq('vessel_id', currentVessel.id)
                .gte('start_time', dateStart.toISOString())
                .lte('start_time', dateEnd.toISOString());

              if (watchError) {
                console.error(`Error removing watch log for ${dateStr}:`, watchError);
              }
            }
            
            // Update watch dates set
            setWatchDates(prev => {
              const newSet = new Set(prev);
              datesWithWatch.forEach(date => newSet.delete(date));
              return newSet;
            });
            
            // Update today's watch status if today was affected
            const todayKey = format(new Date(), 'yyyy-MM-dd');
            if (datesWithWatch.includes(todayKey)) {
              setIsOnWatchToday(false);
            }
          } catch (watchError) {
            console.error('Error removing watch logs:', watchError);
          }
        }
      }
      
      await updateStateLogsBatch(supabase, user.id, currentVessel.id, logs);
      
      // When setting to Underway: ensure a passage exists so it shows in Passage Log Book
      let passageCreated = false;
      if (state === 'underway' && logs.length > 0) {
        try {
          const existingPassages = await getPassageLogs(supabase, user.id);
          const dates = logs.map((l) => l.date).sort();
          const rangeStart = startOfDay(parse(dates[0], 'yyyy-MM-dd', new Date()));
          const rangeEnd = endOfDay(parse(dates[dates.length - 1], 'yyyy-MM-dd', new Date()));
          const overlaps = existingPassages.some((p) => {
            if (p.vessel_id !== currentVessel.id) return false;
            const pStart = new Date(p.start_time);
            const pEnd = new Date(p.end_time);
            return pStart <= rangeEnd && pEnd >= rangeStart;
          });
          if (!overlaps) {
            await createPassageLog(supabase, {
              crewId: user.id,
              vesselId: currentVessel.id,
              startTime: rangeStart,
              endTime: rangeEnd,
              departurePort: 'To be confirmed',
              arrivalPort: 'To be confirmed',
              source: 'calendar',
            });
            passageCreated = true;
          }
        } catch (passageErr) {
          console.error('Error creating passage from current page:', passageErr);
        }
      }
      
      // Refresh state logs - use personal logs for refresh
      const updatedLogs = await getVesselStateLogs(supabase, currentVessel.id, user.id);
      setStateLogs(updatedLogs);
      
      setIsDialogOpen(false);
      setDateRange(undefined);
      setSelectedDate(null);
      setIsPartOfActivePassageInDialog(false);
      setIsWatchInDialog(false);
      
      const stateLabel = vesselStates.find(s => s.value === state)?.label || state;
      
      if (dateRange?.from && dateRange?.to) {
        const daysCount = logs.length;
        toast({
          title: 'States Updated',
          description: passageCreated
            ? `${daysCount} day${daysCount > 1 ? 's' : ''} updated to ${stateLabel}. A passage was added to the Passage Log Book—you can add ports and details there.`
            : `${daysCount} day${daysCount > 1 ? 's' : ''} (${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}) updated to ${stateLabel}.`,
        });
      } else {
        toast({
          title: 'State Updated',
          description: passageCreated
            ? `${format(selectedDate!, 'MMM d, yyyy')} updated to ${stateLabel}. A passage was added to the Passage Log Book—you can add ports and details there.`
            : `${format(selectedDate!, 'MMM d, yyyy')} has been updated to ${stateLabel}.`,
        });
      }
    } catch (error) {
      console.error('Error updating state:', error);
      toast({
        title: 'Error',
        description: 'Failed to update state.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  async function onStartServiceSubmit(data: StartServiceFormValues) {
    if (!user?.id) return;
    
    const today = startOfDay(new Date());
    const startDate = startOfDay(data.startDate);
    
    if(startDate > today) {
        toast({title: "Invalid Date", description: "Start date cannot be in the future.", variant: "destructive"});
        return;
    }

    // Determine end date: use provided endDate, or today if not provided (active service)
    const endDate = data.endDate ? startOfDay(data.endDate) : today;
    
    if(endDate > today) {
        toast({title: "Invalid Date", description: "End date cannot be in the future.", variant: "destructive"});
        return;
    }

    try {
      // Check for overlapping dates with other vessels
      if (vessels && vessels.length > 0) {
        const newDateRange = eachDayOfInterval({ start: startDate, end: endDate });
        const newDatesSet = new Set(newDateRange.map(d => format(d, 'yyyy-MM-dd')));
        
        // Check each vessel (except the one we're adding to)
        for (const vessel of vessels) {
          if (vessel.id === data.vesselId) continue; // Skip the current vessel (allows updating same vessel)
          
          const existingLogs = await getVesselStateLogs(supabase, vessel.id, user.id);
          
          // Check for overlaps
          const overlappingDates = existingLogs
            .filter(log => newDatesSet.has(log.date))
            .map(log => parse(log.date, 'yyyy-MM-dd', new Date()));
          
          if (overlappingDates.length > 0) {
            const vesselName = vessel.name;
            const overlapCount = overlappingDates.length;
            
            // Sort dates to get first and last
            overlappingDates.sort((a, b) => a.getTime() - b.getTime());
            const firstOverlap = format(overlappingDates[0], 'MMM d, yyyy');
            const lastOverlap = format(overlappingDates[overlappingDates.length - 1], 'MMM d, yyyy');
            
            const dateRangeText = overlapCount === 1 
              ? firstOverlap
              : overlapCount === 2
              ? `${firstOverlap} and ${lastOverlap}`
              : `${firstOverlap} through ${lastOverlap} (${overlapCount} days)`;
            
            toast({
              title: "Date Conflict Detected",
              description: `You cannot be on two vessels at the same time. The selected date range overlaps with ${overlapCount} day${overlapCount > 1 ? 's' : ''} you've already logged for "${vesselName}" (${dateRangeText}). Please adjust your dates to avoid conflicts.`,
              variant: "destructive",
            });
            return;
          }
        }
      }
      // 1. Create vessel assignment record
      const startDateStr = format(startDate, 'yyyy-MM-dd');
      const endDateStr = data.endDate ? format(endDate, 'yyyy-MM-dd') : null;
      const isActiveService = !data.endDate;
      
      await createVesselAssignment(supabase, {
        userId: user.id,
        vesselId: data.vesselId,
        startDate: startDateStr,
        endDate: endDateStr,
        position: data.position || null,
      });

      // 2. Update user profile to set active vessel (only if no end date, meaning it's still active)
      // For vessel accounts, the form start date becomes the official profile start_date
      // (used on Profile, export date ranges, and earliest editable daily-log day).
      if (isActiveService) {
        const profileUpdates: {
          activeVesselId: string;
          startDate?: string;
        } = {
          activeVesselId: data.vesselId,
        };
        if (isVesselAccount) {
          profileUpdates.startDate = startDateStr;
        }
        await updateUserProfile(supabase, user.id, profileUpdates);
      } else if (isVesselAccount && !userProfile?.startDate) {
        // Past service on a vessel account: still seed official start if unset
        await updateUserProfile(supabase, user.id, {
          startDate: startDateStr,
        });
      }

      // State logs are not created automatically - users will manually add them for specific dates
      const message = isActiveService 
        ? `Sea service started. You can now manually add state logs for specific dates.`
        : `Sea service recorded from ${format(startDate, 'PPP')} to ${format(endDate, 'PPP')}. You can manually add state logs for specific dates.`;
      
      toast({ 
        title: isActiveService ? 'Service Started' : 'Service Recorded', 
        description: message 
      });
      
      // Reset form on success
      startServiceForm.reset();
      
      // Force refresh user profile to get updated activeVesselId
      // This will trigger the page to show the active service UI instead of the form
      if (isActiveService) {
        // Small delay to ensure database write is committed
        setTimeout(() => {
          refetchUserProfile();
        }, 500);
      }
    } catch (error: any) {
      console.error('Error starting service:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to start service. Please try again.',
        variant: 'destructive',
      });
    }
  }

  const handleRangeStateChange = async (state: DailyStatus) => {
    if (!currentVessel || !user?.id || !dateRange?.from || !dateRange?.to) return;
    
    const interval = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    const logs = interval.map(day => ({
      date: format(day, 'yyyy-MM-dd'),
      state: state,
      notes: notesInDialog.trim() || undefined,
    }));
    
    // For captains viewing vessel logs (vessel view mode), they should not be able to edit
    if (isVesselLinked || (isCaptain && captainViewMode === 'vessel')) {
      toast({
        title: 'Cannot Edit',
        description: 'You can only view the vessel account logs. The vessel manager must update the logs.',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      await updateStateLogsBatch(supabase, user.id, currentVessel.id, logs);
      // When setting to Underway: ensure a passage exists so it shows in Passage Log Book
      let passageCreated = false;
      if (state === 'underway' && logs.length > 0) {
        try {
          const existingPassages = await getPassageLogs(supabase, user.id);
          const dates = logs.map((l) => l.date).sort();
          const rangeStart = startOfDay(parse(dates[0], 'yyyy-MM-dd', new Date()));
          const rangeEnd = endOfDay(parse(dates[dates.length - 1], 'yyyy-MM-dd', new Date()));
          const overlaps = existingPassages.some((p) => {
            if (p.vessel_id !== currentVessel.id) return false;
            const pStart = new Date(p.start_time);
            const pEnd = new Date(p.end_time);
            return pStart <= rangeEnd && pEnd >= rangeStart;
          });
          if (!overlaps) {
            await createPassageLog(supabase, {
              crewId: user.id,
              vesselId: currentVessel.id,
              startTime: rangeStart,
              endTime: rangeEnd,
              departurePort: 'To be confirmed',
              arrivalPort: 'To be confirmed',
              source: 'calendar',
            });
            passageCreated = true;
          }
        } catch (passageErr) {
          console.error('Error creating passage from current page:', passageErr);
        }
      }
      // Refresh logs after update - always refresh personal logs
      const updatedLogs = await getVesselStateLogs(supabase, currentVessel.id, user.id);
      setStateLogs(updatedLogs);
    setIsStatusDialogOpen(false);
    setDateRange(undefined);
      if (passageCreated) {
        toast({
          title: 'States Updated',
          description: `Range updated to Underway. A passage was added to the Passage Log Book—you can add ports and details there.`,
        });
      }
    } catch (error) {
      console.error('Error updating state logs:', error);
      toast({
        title: 'Error',
        description: 'Failed to update state logs.',
        variant: 'destructive',
      });
    }
  }

  const handleTodayStateChange = async (state: DailyStatus) => {
    if (!currentVessel || !user?.id) return;
    
    // For captains viewing vessel logs (vessel view mode), they should not be able to edit
    if (isVesselLinked || (isCaptain && captainViewMode === 'vessel')) {
      toast({
        title: 'Cannot Edit',
        description: 'You can only view the vessel account logs. The vessel manager must update the logs.',
        variant: 'destructive',
      });
      return;
    }
    
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const todayStart = new Date(todayKey);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayKey);
    todayEnd.setHours(23, 59, 59, 999);
    
    try {
      // If state is changing away from "at-anchor", remove watch log if it exists
      if (state !== 'at-anchor' && watchDates.has(todayKey)) {
        try {
          const { error: watchError } = await supabase
            .from('nav_watch_logs')
            .delete()
            .eq('user_id', user.id)
            .eq('vessel_id', currentVessel.id)
            .gte('start_time', todayStart.toISOString())
            .lte('start_time', todayEnd.toISOString());

          if (watchError) {
            console.error('Error removing watch log:', watchError);
          } else {
            // Update watch dates set
            setWatchDates(prev => {
              const newSet = new Set(prev);
              newSet.delete(todayKey);
              return newSet;
            });
            setIsOnWatchToday(false);
          }
        } catch (watchError) {
          console.error('Error removing watch log:', watchError);
        }
      }

      await updateStateLogsBatch(supabase, user.id, currentVessel.id, [{ date: todayKey, state }]);

      // On leave cannot be part of a passage — clear the flag if it was set
      if (state === 'on-leave' && isPartOfActivePassageToday) {
        try {
          await supabase
            .from('state_logs')
            .update({ is_part_of_active_passage: false })
            .eq('user_id', user.id)
            .eq('vessel_id', currentVessel.id)
            .eq('date', todayKey);
          setIsPartOfActivePassageToday(false);
        } catch (clearErr) {
          console.error('Error clearing part-of-passage on leave:', clearErr);
        }
      }
      
      // When setting to Underway: ensure a passage exists for today so it shows in Passage Log Book
      let passageCreated = false;
      if (state === 'underway') {
        try {
          const existingPassages = await getPassageLogs(supabase, user.id);
          const rangeStart = todayStart;
          const rangeEnd = todayEnd;
          const overlaps = existingPassages.some((p) => {
            if (p.vessel_id !== currentVessel.id) return false;
            const pStart = new Date(p.start_time);
            const pEnd = new Date(p.end_time);
            return pStart <= rangeEnd && pEnd >= rangeStart;
          });
          if (!overlaps) {
            await createPassageLog(supabase, {
              crewId: user.id,
              vesselId: currentVessel.id,
              startTime: rangeStart,
              endTime: rangeEnd,
              departurePort: 'To be confirmed',
              arrivalPort: 'To be confirmed',
              source: 'calendar',
            });
            passageCreated = true;
          }
        } catch (passageErr) {
          console.error('Error creating passage from current page:', passageErr);
        }
      }
      
      // Refresh state logs to show the updated value - always refresh personal logs
      const updatedLogs = await getVesselStateLogs(supabase, currentVessel.id, user.id);
      setStateLogs(updatedLogs);
      
      toast({ 
        title: 'State Updated', 
        description: passageCreated
          ? `Today's state updated to Underway. A passage was added to the Passage Log Book—you can add ports and details there.`
          : `Today's state has been updated to ${vesselStates.find(s => s.value === state)?.label || state}.` 
      });
    } catch (error) {
      console.error('Error updating today state:', error);
      toast({
        title: 'Error',
        description: 'Failed to update state.',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveState = async () => {
    if (!currentVessel || !user?.id) return;

    setIsSaving(true);

    try {
      let dates: string[] = [];
      
      if (dateRange?.from && dateRange?.to) {
        // Range removal
        const today = startOfDay(new Date());
        const interval = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
        dates = interval
          .filter(day => {
            const dayStart = startOfDay(day);
            // Filter out future dates
            if (isAfter(dayStart, today)) return false;
            // Validate each date is within valid vessel assignment period
            const validation = isDateValidForStateChange(day);
            return validation.valid;
          })
          .map(day => format(day, 'yyyy-MM-dd'));
        
        if (dates.length === 0) {
          toast({
            title: 'Invalid Range',
            description: 'No valid dates in the selected range. Dates may be outside your vessel assignment period or in the future.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
      } else if (selectedDate) {
        // Single date removal - validate one more time before deleting
        const validation = isDateValidForStateChange(selectedDate);
        if (!validation.valid) {
          toast({
            title: 'Invalid Date',
            description: validation.reason || 'You cannot remove the state for this date.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
        dates = [format(selectedDate, 'yyyy-MM-dd')];
      } else {
        setIsSaving(false);
        return;
      }

      // For captains viewing vessel logs (vessel view mode), they should not be able to edit
      if (isVesselLinked || (isCaptain && captainViewMode === 'vessel')) {
        toast({
          title: 'Cannot Edit',
          description: 'You can only view the vessel account logs. The vessel manager must update the logs.',
          variant: 'destructive',
        });
        setIsSaving(false);
        return;
      }

      // Remove watch logs for affected dates (if any)
      const datesWithWatch = dates.filter(date => watchDates.has(date));
      
      if (datesWithWatch.length > 0) {
        try {
          // Delete watch logs for all affected dates
          for (const dateStr of datesWithWatch) {
            const dateStart = new Date(dateStr);
            dateStart.setHours(0, 0, 0, 0);
            const dateEnd = new Date(dateStr);
            dateEnd.setHours(23, 59, 59, 999);
            
            const { error: watchError } = await supabase
              .from('nav_watch_logs')
              .delete()
              .eq('user_id', user.id)
              .eq('vessel_id', currentVessel.id)
              .gte('start_time', dateStart.toISOString())
              .lte('start_time', dateEnd.toISOString());

            if (watchError) {
              console.error(`Error removing watch log for ${dateStr}:`, watchError);
            }
          }
          
          // Update watch dates set
          setWatchDates(prev => {
            const newSet = new Set(prev);
            datesWithWatch.forEach(date => newSet.delete(date));
            return newSet;
          });
        } catch (watchError) {
          console.error('Error removing watch logs:', watchError);
        }
      }
      
      // Delete state logs
      await deleteStateLogsForDates(supabase, user.id, currentVessel.id, dates);
      
      // Refresh state logs
      const updatedLogs = await getVesselStateLogs(supabase, currentVessel.id, user.id);
      setStateLogs(updatedLogs);
      
      setIsStatusDialogOpen(false);
      setDateRange(undefined);
      setSelectedDate(null);
      setIsPartOfActivePassageInDialog(false);
      setIsWatchInDialog(false);
      setNotesInDialog('');
      
      if (dateRange?.from && dateRange?.to) {
        toast({
          title: 'States Removed',
          description: `${dates.length} day${dates.length > 1 ? 's' : ''} (${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}) state${dates.length > 1 ? 's' : ''} removed.`,
        });
      } else {
        toast({
          title: 'State Removed',
          description: `${format(selectedDate!, 'MMM d, yyyy')} state has been removed.`,
        });
      }
    } catch (error) {
      console.error('Error removing state:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove state.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveTodayState = async () => {
    if (!currentVessel || !user?.id) return;

    // For captains viewing vessel logs (vessel view mode), they should not be able to edit
    if (isVesselLinked || (isCaptain && captainViewMode === 'vessel')) {
      toast({
        title: 'Cannot Edit',
        description: 'You can only view the vessel account logs. The vessel manager must update the logs.',
        variant: 'destructive',
      });
      return;
    }

    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const todayStart = new Date(todayKey);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayKey);
    todayEnd.setHours(23, 59, 59, 999);

    try {
      // Remove watch log if it exists
      if (watchDates.has(todayKey)) {
        try {
          const { error: watchError } = await supabase
            .from('nav_watch_logs')
            .delete()
            .eq('user_id', user.id)
            .eq('vessel_id', currentVessel.id)
            .gte('start_time', todayStart.toISOString())
            .lte('start_time', todayEnd.toISOString());

          if (watchError) {
            console.error('Error removing watch log:', watchError);
          } else {
            // Update watch dates set
            setWatchDates(prev => {
              const newSet = new Set(prev);
              newSet.delete(todayKey);
              return newSet;
            });
            setIsOnWatchToday(false);
          }
        } catch (watchError) {
          console.error('Error removing watch log:', watchError);
        }
      }

      await deleteStateLogsForDates(supabase, user.id, currentVessel.id, [todayKey]);
      
      // Refresh state logs
      const updatedLogs = await getVesselStateLogs(supabase, currentVessel.id, user.id);
      setStateLogs(updatedLogs);
      
      toast({ 
        title: 'State Removed', 
        description: `Today's state has been removed.` 
      });
    } catch (error) {
      console.error('Error removing today state:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove state.',
        variant: 'destructive',
      });
    }
  };

  // Render month function similar to calendar page
  const renderMonth = (month: Date) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const firstDayOfMonth = getDay(monthStart);
    const daysInMonth = getDaysInMonth(month);
    
    // Calculate state counts for this month
    const monthStartStr = format(monthStart, 'yyyy-MM-dd');
    const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
    
    const monthStateCounts: Record<string, number> = {
      underway: 0,
      'at-anchor': 0,
      'in-port': 0,
      'on-leave': 0,
      'in-yard': 0,
      standby: 0,
    };
    
    // Count states for this month
    stateLogs.forEach(log => {
      if (log.date >= monthStartStr && log.date <= monthEndStr) {
        if (log.state in monthStateCounts) {
          monthStateCounts[log.state as keyof typeof monthStateCounts]++;
        }
      }
    });
    
    // Count standby days for this month
    standbyDatesSet.forEach(dateStr => {
      if (dateStr >= monthStartStr && dateStr <= monthEndStr) {
        monthStateCounts.standby++;
      }
    });

    let monthPartOfPassageCount = 0;
    partOfActivePassageDates.forEach((dateStr) => {
      if (dateStr >= monthStartStr && dateStr <= monthEndStr) monthPartOfPassageCount++;
    });
    
    // Generate calendar grid - start from Sunday
    const days: (Date | null)[] = [];
    
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    
    // Add all days in the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(month.getFullYear(), month.getMonth(), i));
    }

    return (
      <Card key={month.toISOString()} className="rounded-xl border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">
            {format(month, 'MMMM yyyy')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col pb-6">
          <div className="flex-1 space-y-1">
            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
                  {day}
                </div>
              ))}
            </div>
            
            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, idx) => {
                if (!day) {
                  return <div key={`empty-${idx}`} className="aspect-square" />;
                }
                
                const dateKey = format(day, 'yyyy-MM-dd');
                const state = stateLogMap.get(dateKey);
                const stateInfo = state ? vesselStates.find(s => s.value === state) : null;
                const existingLog = stateLogs.find(log => log.date === dateKey);
                const notes = existingLog?.notes;
                const isCurrentDay = isToday(day);
                const isCurrentMonth = isSameMonth(day, month);
                
                // Check if this date is a standby date (excluding watch dates and part of active passage dates)
                const hasWatch = watchDates.has(dateKey);
                const isPartOfActivePassage = partOfActivePassageDates.has(dateKey);
                const hasOverride = hasWatch || isPartOfActivePassage;
                const isCountedStandby = standbyDatesSet.has(dateKey) && !hasOverride;
                
                // Check if date is in selected range
                let isInRange = false;
                let isRangeStart = false;
                let isRangeEnd = false;
                let isRangeStartOnly = false; // When only start date is selected (no end date yet)
                if (dateRange?.from && dateRange?.to) {
                  const dayStart = startOfDay(day);
                  const rangeStart = startOfDay(dateRange.from);
                  const rangeEnd = endOfDay(dateRange.to);
                  
                  isInRange = isWithinInterval(dayStart, { start: rangeStart, end: rangeEnd });
                  isRangeStart = format(dayStart, 'yyyy-MM-dd') === format(rangeStart, 'yyyy-MM-dd');
                  isRangeEnd = format(dayStart, 'yyyy-MM-dd') === format(rangeEnd, 'yyyy-MM-dd');
                } else if (dateRange?.from && !dateRange?.to) {
                  // Only start is selected - show visual indication
                  isRangeStartOnly = format(day, 'yyyy-MM-dd') === format(dateRange.from, 'yyyy-MM-dd');
                  isRangeStart = isRangeStartOnly;
                }
                
                // Check if date is in the future
                const today = startOfDay(new Date());
                const dayStart = startOfDay(day);
                const isFuture = isAfter(dayStart, today);
                
                // Check if date is within assignment range but has no state
                const isInAssignmentRange = assignmentStartDate && !isFuture && 
                  isWithinInterval(dayStart, { start: assignmentStartDate, end: today });
                const hasNoState = !stateInfo;
                const shouldShowOutline = isInAssignmentRange && hasNoState && !isFuture;

                // Bottom strip for watch / passage / standby (watch > passage > standby)
                let secondaryIndicatorBar: 'watch' | 'passage' | 'standby' | null = null;
                if (!isRangeStartOnly) {
                  if (hasWatch) secondaryIndicatorBar = 'watch';
                  else if (isPartOfActivePassage) secondaryIndicatorBar = 'passage';
                  else if (isCountedStandby) secondaryIndicatorBar = 'standby';
                }

                // Determine styling for dates
                let backgroundStyle: React.CSSProperties | undefined = undefined;

                // Look up any recorded passages whose date range covers this
                // day. Surface them in the tooltip on underway / part-of-passage
                // days so the user can see *what* each at-sea day was for.
                const passagesForDay = passagesByDate.get(dateKey) || [];
                const shouldShowPassages =
                  passagesForDay.length > 0 &&
                  (stateInfo?.value === 'underway' || isPartOfActivePassage);

                // Build tooltip content
                const tooltipContent = (
                  <div className="space-y-1.5 text-sm">
                    <div className="font-semibold">{format(day, 'EEEE, MMMM d, yyyy')}</div>
                    {isFuture ? (
                      <div className="text-muted-foreground">Future date - cannot be updated</div>
                    ) : stateInfo ? (
                      <>
                        <div className="flex items-center gap-2">
                          <stateInfo.icon className="h-4 w-4" style={{ color: stateInfo.color }} />
                          <span className="font-medium">{stateInfo.label}</span>
                        </div>
                        {hasWatch && (
                          <div className="flex items-center gap-2 text-yellow-600">
                            <Clock className="h-3.5 w-3.5" />
                            <span>On Watch (Counts as At Sea)</span>
                          </div>
                        )}
                        {isPartOfActivePassage && !hasWatch && (
                          <div className="flex items-center gap-2 text-blue-800">
                            <Ship className="h-3.5 w-3.5" />
                            <span>Part of Active Passage (Counts as At Sea)</span>
                          </div>
                        )}
                        {isCountedStandby && (
                          <div className="flex items-center gap-2 text-purple-600">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Counted as Standby</span>
                          </div>
                        )}
                        {shouldShowPassages && (
                          <div className="pt-1.5 mt-1 border-t border-border/50 space-y-1.5">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {passagesForDay.length > 1 ? 'Passages' : 'Passage'}
                            </div>
                            {passagesForDay.map((p) => {
                              const startDate = new Date(p.start_time);
                              const endDate = new Date(p.end_time);
                              const from = p.departure_port?.trim();
                              const to = p.arrival_port?.trim();
                              const routeLabel = from || to
                                ? `${from || 'Unknown'} → ${to || 'Unknown'}`
                                : 'Route not recorded';
                              const ptype = p.passage_type
                                ? p.passage_type.replace(/_/g, ' ')
                                : null;
                              return (
                                <div key={p.id} className="space-y-0.5">
                                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                                    <Ship className="h-3.5 w-3.5 shrink-0" />
                                    <span className="font-medium truncate">{routeLabel}</span>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground pl-[22px]">
                                    {format(startDate, 'd MMM HH:mm')}
                                    <span className="mx-1">–</span>
                                    {format(endDate, 'd MMM HH:mm')}
                                  </div>
                                  {(p.distance_nm != null || ptype) && (
                                    <div className="text-[11px] text-muted-foreground pl-[22px] flex flex-wrap gap-x-2 capitalize">
                                      {p.distance_nm != null && (
                                        <span>{Math.round(p.distance_nm)} nm</span>
                                      )}
                                      {ptype && <span>· {ptype}</span>}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {notes && (
                          <div className="text-muted-foreground text-xs pt-1 border-t border-border/50">
                            <div className="font-medium mb-1">Notes:</div>
                            <div className="whitespace-pre-wrap">{notes}</div>
                          </div>
                        )}
                        {!isVesselAccount && currentVessel && (
                          <div className="text-muted-foreground text-xs pt-1 border-t border-border/50">
                            Vessel: {currentVessel.name}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-muted-foreground">No state logged</div>
                    )}
                    {isCurrentDay && (
                      <div className="text-xs text-primary font-medium pt-1 border-t border-border/50">Today</div>
                    )}
                  </div>
                );

                return (
                  <Tooltip key={dateKey}>
                    <TooltipTrigger asChild>
                      <div className="aspect-square rounded-[6px] overflow-hidden">
                        <button
                          onClick={() => handleDateClick(day)}
                          disabled={isFuture}
                          className={cn(
                            "w-full h-full rounded-[6px] text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                            secondaryIndicatorBar && "relative overflow-hidden",
                            !isFuture && "hover:scale-105 hover:shadow-md",
                            !isCurrentMonth && "opacity-40",
                            isFuture && "opacity-30 cursor-not-allowed",
                            // When only start date is selected (no end date yet) - show prominent blue border (highest priority for selection)
                            // Use important modifiers to ensure it overrides other border styles
                            isRangeStartOnly && "!border-2 !border-blue-600 !border-solid ring-2 ring-blue-500/50 ring-offset-1",
                            // Selected range styling - use a distinct color (blue) and solid border to differentiate from assignment outline
                            isInRange && !hasOverride && !isCountedStandby && !isRangeStartOnly && "border-2 border-blue-500 border-solid",
                            // Range start/end dates when both are selected
                            (isRangeStart || isRangeEnd) && !isRangeStartOnly && !hasOverride && !isCountedStandby && !hasWatch && !isPartOfActivePassage && "border-2 border-blue-600 border-solid ring-2 ring-blue-500/30 ring-offset-1",
                            isCurrentDay && !isInRange && !isRangeStartOnly && "ring-2 ring-primary ring-offset-2",
                            // Outline for dates in assignment range without state - only show if not in selected range or start
                            shouldShowOutline && !hasOverride && !isCountedStandby && !hasWatch && !isPartOfActivePassage && !isInRange && !isRangeStartOnly && "border-2 border-dashed border-muted-foreground/40",
                            stateInfo 
                              ? "text-white" 
                              : "bg-muted/50 text-muted-foreground hover:bg-muted"
                          )}
                          style={
                            // Primary state fill; watch/passage/standby use bottom strip
                            backgroundStyle
                              ? backgroundStyle
                              : stateInfo 
                                ? { 
                                    backgroundColor: stateInfo.color,
                                    // Ensure blue border shows even when date has a state
                                    ...(isRangeStartOnly ? { border: '2px solid hsl(217 91% 50%)', borderColor: 'hsl(217 91% 50%)' } : {})
                                  } 
                                : isInRange 
                                  ? { backgroundColor: 'hsl(var(--primary) / 0.15)' } 
                                  : isRangeStartOnly
                                    ? { backgroundColor: 'hsl(217 91% 60% / 0.2)', border: '2px solid hsl(217 91% 50%)', borderColor: 'hsl(217 91% 50%)' } // Blue tint and border for start date only
                                    : undefined
                          }
                        >
                          <div className="flex flex-col items-center justify-center h-full relative z-[1]">
                            <span className="relative z-10 text-center">{format(day, 'd')}</span>
                          </div>
                          {secondaryIndicatorBar === 'watch' && (
                            <div
                              className="pointer-events-none absolute bottom-0 left-0 right-0 z-0 h-[20%] min-h-[2px] rounded-b-[6px] bg-yellow-400"
                              aria-hidden
                            />
                          )}
                          {secondaryIndicatorBar === 'passage' && (
                            <div
                              className="pointer-events-none absolute bottom-0 left-0 right-0 z-0 h-[20%] min-h-[2px] rounded-b-[6px] bg-blue-600"
                              aria-hidden
                            />
                          )}
                          {secondaryIndicatorBar === 'standby' && (
                            <div
                              className="pointer-events-none absolute bottom-0 left-0 right-0 z-0 h-[20%] min-h-[2px] rounded-b-[6px] bg-purple-600"
                              aria-hidden
                            />
                          )}
                        </button>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      {tooltipContent}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
          
          {/* Month summary — same collapsible design as Calendar page */}
          <MonthStateSummary
            open={expandedMonthSummaries.has(format(month, 'yyyy-MM'))}
            onOpenChange={(next) => {
              const monthKey = format(month, 'yyyy-MM');
              setExpandedMonthSummaries((prev) => {
                const copy = new Set(prev);
                if (next) copy.add(monthKey);
                else copy.delete(monthKey);
                return copy;
              });
            }}
            items={buildMonthSummaryItems({
              counts: {
                ...monthStateCounts,
                passage: monthPartOfPassageCount,
              },
              includeOnLeave: !isVesselAccount,
              includePassage: isVesselAccount,
              includeStandby: true,
            })}
          />
        </CardContent>
      </Card>
    );
  };

  // Recent months for mini calendar strip (4th month fills row at min-width 1701px)
  const recentCalendarMonths = useMemo(() => {
    const today = new Date();
    const months: Date[] = [];
    for (let i = 0; i < 4; i++) {
      months.push(subMonths(today, i));
    }
    return months.reverse(); // Oldest → newest
  }, []);


  const handleEndTrip = async () => {
    if (!currentVessel || !user?.id) return;
    
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      
      // Try to end the vessel assignment if it exists
      try {
        await endVesselAssignment(supabase, user.id, currentVessel.id, today);
      } catch (assignmentError: any) {
        // If no assignment exists, that's okay - just clear the active vessel ID
        // This can happen if the assignment wasn't created properly or was already ended
        if (assignmentError.message?.includes('No active assignment')) {
          console.log('[CURRENT PAGE] No active assignment found, clearing active_vessel_id only');
        } else {
          // Re-throw if it's a different error
          throw assignmentError;
        }
      }
      
      // Update user profile to clear active vessel (always do this)
      await updateUserProfile(supabase, user.id, {
        activeVesselId: null,
      });

      toast({ title: 'Service Ended', description: 'Your active service has been ended.' });
    } catch (error: any) {
      console.error('Error ending trip:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to end service. Please try again.',
        variant: 'destructive',
      });
    }
  }
  
  // Use assignment start date for display (when user started on vessel), fallback to most recent service date
  // Get the start date for filtering logs
  // For vessel managers: use vessel's start_date (userProfile.startDate) or vessel creation date
  // For crew members: use assignment start date (when they joined the vessel)
  const assignmentStartDate = useMemo(() => {
    // For vessel managers, use the vessel's start date
    if (userProfile?.role === 'vessel') {
      let vesselStartDate: Date | null = null;
      
      // First priority: user's start_date (official vessel start date)
      if (userProfile?.startDate) {
        try {
          vesselStartDate = startOfDay(parse(userProfile.startDate, 'yyyy-MM-dd', new Date()));
        } catch (e) {
          console.error('[CURRENT PAGE] Error parsing start_date:', userProfile.startDate, e);
        }
      }
      
      // Fallback: vessel creation date
      if (!vesselStartDate && currentVessel) {
        const vesselData = vessels?.find(v => v.id === currentVessel.id);
        if (vesselData && (vesselData as any).created_at) {
          vesselStartDate = startOfDay(new Date((vesselData as any).created_at));
        }
      }
      
      if (vesselStartDate) {
        console.log('[CURRENT PAGE] Vessel manager start date calculated:', {
          vesselId: currentVessel?.id,
          vesselName: currentVessel?.name,
          startDate: format(vesselStartDate, 'yyyy-MM-dd'),
          source: userProfile?.startDate ? 'user start_date' : 'vessel created_at'
        });
        return vesselStartDate;
      }
      
      console.log('[CURRENT PAGE] No vessel start date found for vessel manager');
      return null;
    }
    
    // For crew members, use assignment start date
    if (!currentVessel || !vesselAssignments.length) {
      console.log('[CURRENT PAGE] No assignment start date - missing vessel or assignments:', {
        hasCurrentVessel: !!currentVessel,
        vesselAssignmentsCount: vesselAssignments.length
      });
      return null;
    }
    
    // Get all assignments for this vessel (not just active ones) to find when they first joined
    const allAssignmentsForVessel = vesselAssignments.filter(
      a => a.vesselId === currentVessel.id
    );
    
    if (allAssignmentsForVessel.length === 0) {
      console.log('[CURRENT PAGE] No assignments found for vessel:', currentVessel.id);
      return null;
    }
    
    // Get the earliest start date (when they first joined this vessel)
    const startDates = allAssignmentsForVessel.map(a => {
      const parsed = parse(a.startDate, 'yyyy-MM-dd', new Date());
      return parsed;
    });
    
    const earliestDate = startDates.reduce((earliest, date) => 
      date < earliest ? date : earliest
    );
    
    const result = startOfDay(earliestDate);
    console.log('[CURRENT PAGE] Assignment start date calculated:', {
      vesselId: currentVessel.id,
      vesselName: currentVessel.name,
      assignmentsCount: allAssignmentsForVessel.length,
      startDates: allAssignmentsForVessel.map(a => a.startDate),
      earliestDate: format(result, 'yyyy-MM-dd')
    });
    
    return result;
  }, [currentVessel, vesselAssignments, userProfile, vessels]);
  
  // Use assignment start date for display (when user started on vessel), fallback to most recent service date
  const serviceDate = assignmentStartDate || mostRecentServiceDate;
  
  const { totalDaysByState, atSeaDays, standbyDays } = useMemo(() => {
    console.log('[CURRENT PAGE] Calculating stats from stateLogs:', {
      stateLogsCount: stateLogs?.length || 0,
      stateLogs: stateLogs?.slice(0, 5) || [],
      assignmentStartDate: assignmentStartDate ? format(assignmentStartDate, 'yyyy-MM-dd') : null
    });
    
    if (!stateLogs || stateLogs.length === 0) {
      console.log('[CURRENT PAGE] No state logs available for stats calculation');
      return { totalDaysByState: [], atSeaDays: 0, standbyDays: 0 };
    }
    
    // Filter logs to since joining the vessel (assignment start date) or all logs if no assignment date
    let filteredLogs: StateLog[];
    
    if (assignmentStartDate) {
      const filterStartDate = assignmentStartDate;
      const filterEndDate = endOfDay(new Date());
      
      console.log('[CURRENT PAGE] Filtering logs since joining:', {
        totalLogs: stateLogs.length,
        filterStartDate: format(filterStartDate, 'yyyy-MM-dd'),
        filterEndDate: format(filterEndDate, 'yyyy-MM-dd'),
        firstFewLogDates: stateLogs.slice(0, 5).map(l => l.date)
      });
      
      filteredLogs = stateLogs.filter(log => {
      const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
        const isInRange = isWithinInterval(logDate, { start: filterStartDate, end: filterEndDate });
        return isInRange;
    });
    } else {
      // No assignment date - use all logs
      console.log('[CURRENT PAGE] No assignment date found - using all logs:', {
        totalLogs: stateLogs.length
      });
      filteredLogs = stateLogs;
    }
    
    console.log('[CURRENT PAGE] Filtered logs result:', {
      filteredLogsCount: filteredLogs.length,
      assignmentStartDate: assignmentStartDate ? format(assignmentStartDate, 'yyyy-MM-dd') : 'none',
      firstFewFilteredLogs: filteredLogs.slice(0, 5).map(l => ({ date: l.date, state: l.state }))
    });
    
    let atSea = 0;
    const stateCounts = filteredLogs.reduce((acc, log) => {
      acc[log.state] = (acc[log.state] || 0) + 1;
      return acc;
    }, {} as Record<DailyStatus, number>);

    const inServiceWindow = (dateStr: string) => {
      const d = parse(dateStr, 'yyyy-MM-dd', new Date());
      if (assignmentStartDate) {
        return isWithinInterval(d, { start: assignmentStartDate, end: endOfDay(new Date()) });
      }
      return true;
    };

    if (isVesselAccount) {
      // Vessel card: underway + at-anchor only (no passage / watch overlays)
      for (const log of filteredLogs) {
        if (log.state === 'underway' || log.state === 'at-anchor') {
          atSea++;
        }
      }
    } else {
      // Crew card: underway + part of active passage + watch (officers); at-anchor is standby, not this total
      const crewAtSeaDates = new Set<string>();
      for (const log of filteredLogs) {
        if (log.state === 'underway') {
          atSea++;
          crewAtSeaDates.add(log.date);
        }
      }
      for (const dateStr of partOfActivePassageDates) {
        if (!inServiceWindow(dateStr) || crewAtSeaDates.has(dateStr)) continue;
        atSea++;
        crewAtSeaDates.add(dateStr);
      }
      for (const dateStr of watchDates) {
        if (!inServiceWindow(dateStr) || crewAtSeaDates.has(dateStr)) continue;
        atSea++;
        crewAtSeaDates.add(dateStr);
      }
    }

    // Calculate MCA-compliant standby days using ALL logs (for proper voyage context)
    // Then filter standby periods to only count those since joining the vessel
    // Exclude watch dates and part of active passage dates from standby calculation (these count as "at sea")
    const { totalStandbyDays, standbyPeriods } = calculateStandbyDays(stateLogs, watchDates, partOfActivePassageDates, {
      vesselManagerSeaTime: isVesselAccount,
    });
    
    // Filter standby periods to only count days since joining the vessel
    let standby = 0;
    
    if (assignmentStartDate) {
      const filterStartDate = assignmentStartDate;
      const filterEndDate = endOfDay(new Date());
      
      for (const period of standbyPeriods) {
        const periodStart = period.startDate;
        const periodEnd = period.endDate;
        
        // Find the overlap between the standby period and the period since joining
        const overlapStart = periodStart > filterStartDate ? periodStart : filterStartDate;
        const overlapEnd = periodEnd < filterEndDate ? periodEnd : filterEndDate;
        
        if (overlapStart <= overlapEnd) {
          // Count how many of the counted days fall within the period since joining
          // The counted days are the first N days of the period (up to the limit)
          const countedDays = period.countedDays;
          const periodDays = period.days;
          
          // Calculate how many counted days are since joining
          let countedSinceJoining = 0;
          for (let i = 0; i < Math.min(countedDays, periodDays); i++) {
            const dayDate = addDays(periodStart, i);
            if (isWithinInterval(dayDate, { start: filterStartDate, end: filterEndDate })) {
              countedSinceJoining++;
            }
          }
          
          standby += countedSinceJoining;
        }
      }
    } else {
      // No assignment date - use all standby days
      standby = totalStandbyDays;
    }
    
    console.log('[CURRENT PAGE] Standby calculation:', {
      totalStandbyDaysFromAllLogs: totalStandbyDays,
      standbyPeriodsCount: standbyPeriods.length,
      standbyDaysSinceJoining: standby
    });

    const chartData = vesselStates.map(stateInfo => ({
        name: stateInfo.label,
        days: stateCounts[stateInfo.value] || 0,
        fill: stateInfo.color,
    })).filter(item => item.days > 0);

    return { totalDaysByState: chartData, atSeaDays: atSea, standbyDays: standby };
  }, [stateLogs, assignmentStartDate, watchDates, partOfActivePassageDates, isVesselAccount]);

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const todayStatusValue = useMemo(() => {
    if (!currentVessel?.id) return undefined;
    return stateLogs.find(
      (log) => log.date === todayKey && log.vesselId === currentVessel.id,
    )?.state;
  }, [stateLogs, todayKey, currentVessel?.id]);

  const handleAisStateUpdated = useCallback(() => {
    setStateLogsRefreshKey((k) => k + 1);
  }, []);

  const handleAisEnabledChange = useCallback((enabled: boolean) => {
    setAisTrackingEnabled(enabled);
  }, []);

  const watchedServiceVesselId = startServiceForm.watch('vesselId');
  const watchedServiceStartDate = startServiceForm.watch('startDate');
  const watchedServiceEndDate = startServiceForm.watch('endDate');

  const startServiceHero = isVesselAccount
    ? {
        eyebrow: 'Vessel account',
        title: 'Start managing your vessel',
        description:
          'Confirm the vessel and set the official start date. That date becomes the earliest day you can log vessel states.',
      }
    : isCaptain
      ? {
          eyebrow: 'Captain',
          title: 'Vessel service management',
          description:
            'Start personal sea service, or request captaincy to manage vessel logs for a vessel you command.',
        }
      : {
          eyebrow: 'Sea service',
          title: 'Start a new sea service',
          description:
            'Search for a vessel and record your dates. Leave the end date empty for an active tour, or fill both dates for a past service.',
        };

  const startServiceReady = Boolean(
    watchedServiceVesselId && watchedServiceStartDate
  );
  const startServiceFooterHint = !watchedServiceVesselId
    ? 'Select a vessel to continue.'
    : !watchedServiceStartDate
      ? 'Pick a start date to continue.'
      : watchedServiceEndDate
        ? `Past service · ${format(watchedServiceStartDate, 'd MMM yyyy')} → ${format(watchedServiceEndDate, 'd MMM yyyy')}`
        : isVesselAccount
          ? 'Ready · official start date will be saved to your profile'
          : 'Ready · active service (no end date)';

  const renderStartServiceFields = () => (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-5">
        <FormField
          control={startServiceForm.control}
          name="vesselId"
          render={({ field }) => {
            if (isVesselAccount && field.value) {
              const vessel = vessels?.find((v) => v.id === field.value);
              if (vessel) {
                return (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold">Vessel</FormLabel>
                    <div className="rounded-xl border border-sky-500/25 bg-gradient-to-br from-sky-500/[0.07] via-background to-blue-600/5 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10">
                            <Ship className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold tracking-tight">{vessel.name}</div>
                            <div className="text-sm text-muted-foreground">{vessel.type}</div>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge className="rounded-full border-sky-500/30 bg-sky-500/10 text-sky-700 hover:bg-sky-500/10 dark:text-sky-300">
                            Your vessel
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                            aria-label="Remove selected vessel"
                            onClick={() => {
                              vesselSelectionClearedRef.current = true;
                              field.onChange('');
                            }}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Wrong vessel? Clear it to search again, then set the official start date.
                      </p>
                    </div>
                    <FormMessage />
                  </FormItem>
                );
              }
            }

            return (
              <FormItem>
                <FormLabel className="text-sm font-semibold">Vessel</FormLabel>
                <FormControl>
                  <UnifiedVesselSearchPicker
                    value={field.value || ''}
                    onChange={(id) => field.onChange(id)}
                    supabase={supabase}
                    knownVessels={(vessels ?? []).map((v) => ({
                      id: v.id,
                      name: v.name,
                      type: v.type,
                    }))}
                    disabled={isLoadingVessels}
                    blockManagedVessels={isVesselAccount}
                    triggerClassName="h-11 rounded-xl"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }}
        />

        {!isVesselAccount && (
          <FormField
            control={startServiceForm.control}
            name="position"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold">Position / role</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue placeholder="Select your position..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="rounded-xl">
                    {POSITION_OPTIONS.map((position) => (
                      <SelectItem key={position} value={position}>
                        {position}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
                <p className="text-xs text-muted-foreground">
                  {userProfile?.position
                    ? 'Pre-filled from your profile. Update if your role changed.'
                    : 'Select your current position on this vessel.'}
                </p>
              </FormItem>
            )}
          />
        )}
      </div>

      <div className="space-y-5">
        <FormField
          control={startServiceForm.control}
          name="startDate"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel className="text-sm font-semibold">
                {isVesselAccount ? 'Official start date' : 'Start date'}
              </FormLabel>
              {isVesselAccount && (
                <p className="text-xs text-muted-foreground">
                  Saved to your profile as the earliest date you can log vessel states.
                </p>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      className={cn(
                        'h-11 w-full justify-start rounded-xl pl-3 text-left font-normal',
                        !field.value && 'text-muted-foreground'
                      )}
                    >
                      {field.value ? format(field.value, 'PPP') : <span>Pick a start date</span>}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={field.onChange}
                    disabled={(date) => {
                      if (watchedServiceEndDate && date > watchedServiceEndDate) return true;
                      return isAfter(date, new Date()) || date < new Date('1990-01-01');
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />

        {!isVesselAccount && (
          <FormField
            control={startServiceForm.control}
            name="endDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel className="text-sm font-semibold">End date (optional)</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          'h-11 w-full justify-start rounded-xl pl-3 text-left font-normal',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        {field.value ? format(field.value, 'PPP') : <span>Leave empty for active</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) => {
                        if (watchedServiceStartDate && date < watchedServiceStartDate) return true;
                        return isAfter(date, new Date()) || date < new Date('1990-01-01');
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
                <p className="text-xs text-muted-foreground">
                  Leave empty for an active service. Fill both dates to record a past tour.
                </p>
              </FormItem>
            )}
          />
        )}
      </div>
    </div>
  );

  const renderStartServiceFooter = (opts?: { formId?: string }) => (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-6 py-4">
      <div className="min-w-0 text-sm">
        {startServiceReady ? (
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {startServiceFooterHint}
          </span>
        ) : (
          <span className="text-muted-foreground">{startServiceFooterHint}</span>
        )}
      </div>
      <Button
        type="submit"
        form={opts?.formId}
        size="lg"
        disabled={!startServiceReady}
        className="h-11 shrink-0 gap-2 rounded-xl px-5"
      >
        <Ship className="h-4 w-4" />
        {isVesselAccount
          ? 'Start managing'
          : watchedServiceEndDate
            ? 'Record past service'
            : 'Start tracking'}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );

  if (isLoadingProfile || isLoadingVessels) {
    return (
        <div className="flex items-center justify-center h-full">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    )
  }
  
  const isDisplayingStatus = hasActiveService && currentVessel;

  return (
    <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Current Service</h1>
            <p className="text-muted-foreground">
              {isDisplayingStatus 
                ? `Tracking active service on ${currentVessel?.name || 'your vessel'}`
                : userProfile?.activeVesselId 
                  ? `Active vessel ID set (${userProfile.activeVesselId}) but vessel not found. Please select a vessel or start a service.`
                  : 'Track and manage your active sea service - Start a service to begin tracking'
              }
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Captain View Mode Toggle — personal captains only.
                Vessel-linked accounts belong to the vessel and stay on vessel sea time. */}
            {isApprovedCaptain && isDisplayingStatus && !isVesselLinked && (
              <div className="flex items-center gap-2 rounded-lg border bg-card p-1">
                <Button
                  variant={captainViewMode === 'personal' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setCaptainViewMode('personal')}
                  className={cn(
                    "rounded-md",
                    captainViewMode === 'personal' && "bg-primary text-primary-foreground"
                  )}
                >
                  <User className="h-4 w-4 mr-2" />
                  My Sea Time
                </Button>
                <Button
                  variant={captainViewMode === 'vessel' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setCaptainViewMode('vessel')}
                  className={cn(
                    "rounded-md",
                    captainViewMode === 'vessel' && "bg-primary text-primary-foreground"
                  )}
                >
                  <Ship className="h-4 w-4 mr-2" />
                  Vessel Sea Time
                </Button>
              </div>
            )}
            {isDisplayingStatus && !isVesselAccount && !isVesselLinked && (
              <Button onClick={handleEndTrip} variant="destructive" className="rounded-xl">End Current Service</Button>
            )}
          </div>
        </div>
        <Separator />
      {isDisplayingStatus ? (
        <div className="space-y-6">
            {/* Top Row: Vessel Info (crew/captain only — vessel accounts have a single vessel so no need) and Watch card */}
            {!isVesselAccount && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left: Vessel Info */}
                <Card className="rounded-xl border shadow-sm bg-gradient-to-r from-primary/5 to-primary/10">
                    <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                            <div className="flex items-start gap-4 flex-1 relative">
                                <div className="flex flex-col gap-4 flex-shrink-0 items-start">
                                    <div className="h-16 w-16 rounded-xl bg-primary/20 flex items-center justify-center">
                                        <Ship className="h-8 w-8 text-primary" />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h2 className="text-2xl font-bold">{currentVessel.name}</h2>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{currentVessel.type} • Active Service</p>
                                    {serviceDate && (
                                        <p className="text-xs text-muted-foreground mt-1">Started {format(serviceDate, 'PPP')}</p>
                                    )}
                                    
                                    {/* Captaincy Request Section — not for vessel-linked accounts */}
                                    {isCaptain && currentVessel && !isVesselLinked && (
                                        <div className="mt-6 pt-4 border-t border-border/50 relative">
                                            {/* Captaincy Request Icon - positioned in left column aligned with text */}
                                            {!isApprovedCaptain && (
                                                <div className="absolute -left-20 h-16 w-16 rounded-xl bg-primary/10 flex items-center justify-center">
                                                    {hasPendingCaptaincyRequest ? (
                                                        <Clock className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
                                                    ) : (
                                                        <ShieldCheck className="h-8 w-8 text-primary" />
                                                    )}
                                                </div>
                                            )}
                                            {!isApprovedCaptain && !hasPendingCaptaincyRequest ? (
                                                <div>
                                                    <h3 className="text-sm font-semibold mb-1">Request Captaincy</h3>
                                                    <p className="text-xs text-muted-foreground mb-3">
                                                        Request official captaincy status for this vessel to access vessel management features.
                                                    </p>
                                                    <Button
                                                        variant="default"
                                                        size="sm"
                                                        onClick={handleOpenCurrentVesselCaptaincyDialog}
                                                        className="rounded-lg"
                                                    >
                                                        <ShieldCheck className="h-4 w-4 mr-2" />
                                                        Request Captain
                                                    </Button>
                                                </div>
                                            ) : hasPendingCaptaincyRequest ? (
                                                <div>
                                                    <h3 className="text-sm font-semibold mb-1">Captaincy Request Pending</h3>
                                                    <p className="text-xs text-muted-foreground mb-2">
                                                        Your request is being reviewed by the vessel manager and administrator.
                                                    </p>
                                                    <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20">
                                                        <Clock className="h-3 w-3 mr-1" />
                                                        Request Pending
                                                    </Badge>
                                                </div>
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                            </div>
                            {todayStatusValue && (
                                <div className="text-right flex-shrink-0">
                                    <p className="text-xs text-muted-foreground mb-1">Today's Status</p>
                                    <div className="flex items-center gap-2">
                                        <div 
                                            className="h-3 w-3 rounded-full" 
                                            style={{ backgroundColor: vesselStates.find(s => s.value === todayStatusValue)?.color }}
                                        />
                                        <span className="text-lg font-semibold">
                                            {vesselStates.find(s => s.value === todayStatusValue)?.label || 'No status'}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Right: Watch today — same compact layout as Today's vessel state */}
                {isOfficer && (
                  <Card className="rounded-xl border shadow-sm">
                    <CardContent className="p-4 sm:p-5">
                      {(() => {
                        const canEditLogbookExtras = !isVesselLinked && !(isCaptain && captainViewMode === 'vessel');
                        return (
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                            <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-primary/10 border-primary/20">
                                <Clock className="h-6 w-6 text-primary" />
                              </div>
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2 gap-y-1">
                                  <h3 className="text-lg font-semibold tracking-tight">On watch today</h3>
                                  {!canEditLogbookExtras && (
                                    <Badge variant="secondary" className="text-[10px] font-medium uppercase">
                                      View only
                                    </Badge>
                                  )}
                                  {canEditLogbookExtras && !canLogWatch && (
                                    <Badge
                                      variant="secondary"
                                      className="border-orange-500/30 bg-orange-500/10 text-[10px] font-medium uppercase text-orange-800 dark:text-orange-300"
                                    >
                                      At anchor required
                                    </Badge>
                                  )}
                                  {canEditLogbookExtras && canLogWatch && isOnWatchToday && (
                                    <Badge
                                      variant="secondary"
                                      className="border-green-500/25 bg-green-500/10 text-[10px] font-medium uppercase text-green-800 dark:text-green-300"
                                    >
                                      On watch
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  <span className="font-medium text-foreground/80">
                                    {format(new Date(), 'EEEE')}
                                  </span>
                                  {' · '}
                                  {format(new Date(), 'MMMM d, yyyy')}
                                  <span className="text-muted-foreground/80"> · </span>
                                  {currentVessel.name}
                                </p>
                              </div>
                            </div>
                            <div className="w-full shrink-0 sm:w-auto sm:pt-1">
                              <Button
                                onClick={handleToggleWatch}
                                disabled={isTogglingWatch || !canLogWatch || !canEditLogbookExtras}
                                title={
                                  !canEditLogbookExtras
                                    ? 'You can only view vessel logs in this mode.'
                                    : !canLogWatch
                                      ? 'Set today’s vessel state to At Anchor to log watch.'
                                      : undefined
                                }
                                className={cn(
                                  'h-11 w-full justify-center gap-2 rounded-xl px-4 font-medium sm:min-w-[220px]',
                                  !canLogWatch || !canEditLogbookExtras
                                    ? 'cursor-not-allowed opacity-60'
                                    : isOnWatchToday
                                      ? 'bg-red-600 text-white hover:bg-red-700'
                                      : 'bg-blue-600 text-white hover:bg-blue-700'
                                )}
                              >
                                {isTogglingWatch ? (
                                  <>
                                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                    {isOnWatchToday ? 'Removing…' : 'Recording…'}
                                  </>
                                ) : !canLogWatch ? (
                                  <>
                                    <Anchor className="h-4 w-4 shrink-0" />
                                    Needs at anchor
                                  </>
                                ) : isOnWatchToday ? (
                                  <>
                                    <Square className="h-4 w-4 shrink-0" />
                                    Remove watch
                                  </>
                                ) : (
                                  <>
                                    <Play className="h-4 w-4 shrink-0" />
                                    Record watch
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>
                )}
            </div>
            )}

            {/* Second Row: Update Today's Status (half) and Part of Active Passage (half) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Left: Today's status — compact row + dropdown */}
                <Card className="rounded-xl border shadow-sm">
                  <CardContent className="p-4 sm:p-5">
                    {(() => {
                      const todayStatesForPicker = vesselStates.filter(
                        (s) => !isVesselAccount || s.value !== 'on-leave'
                      );
                      const cur = todayStatusValue
                        ? vesselStates.find((s) => s.value === todayStatusValue)
                        : undefined;
                      const TodayTriggerIcon = cur?.icon;
                      const canEditTodayState =
                        !isVesselLinked &&
                        !(isCaptain && captainViewMode === 'vessel') &&
                        !(isVesselAccount && aisTrackingEnabled);

                      return (
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                          <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border bg-primary/10 border-primary/20">
                              <CalendarDays className="h-6 w-6 text-primary" />
                            </div>
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2 gap-y-1">
                                <h3 className="text-lg font-semibold tracking-tight">
                                  Today&apos;s vessel state
                                </h3>
                                {!canEditTodayState && isVesselAccount && aisTrackingEnabled && (
                                  <Badge
                                    variant="secondary"
                                    className="border-sky-500/25 bg-sky-500/10 text-[10px] font-medium uppercase text-sky-800 dark:text-sky-300"
                                  >
                                    AIS auto
                                  </Badge>
                                )}
                                {!canEditTodayState && !(isVesselAccount && aisTrackingEnabled) && (
                                  <Badge variant="secondary" className="text-[10px] font-medium uppercase">
                                    View only
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                <span className="font-medium text-foreground/80">
                                  {format(new Date(), 'EEEE')}
                                </span>
                                {' · '}
                                {format(new Date(), 'MMMM d, yyyy')}
                                <span className="text-muted-foreground/80"> · </span>
                                {currentVessel.name}
                              </p>
                            </div>
                          </div>
                          {isLoadingLogs ? (
                            <div className="flex h-11 items-center justify-center sm:justify-end sm:min-w-[200px] sm:pt-1">
                              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                          ) : (
                            <div className="w-full shrink-0 sm:w-auto sm:pt-1">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild disabled={!canEditTodayState}>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    'h-11 w-full sm:w-auto sm:min-w-[220px] justify-between gap-2 rounded-xl border-2 px-3 font-medium shadow-none',
                                    !canEditTodayState && 'cursor-not-allowed opacity-60'
                                  )}
                                  style={
                                    cur
                                      ? {
                                          borderColor: cur.color,
                                          backgroundColor: calendarStateWash(cur.value, 14),
                                        }
                                      : undefined
                                  }
                                  title={
                                    !canEditTodayState
                                      ? isVesselAccount && aisTrackingEnabled
                                        ? 'Turn off AIS tracking to log state manually.'
                                        : 'You can only view vessel logs in this mode.'
                                      : undefined
                                  }
                                >
                                  <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                    {cur && TodayTriggerIcon ? (
                                      <>
                                        <span
                                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                                          style={{ backgroundColor: cur.color }}
                                        >
                                          <TodayTriggerIcon className="h-4 w-4 text-white" />
                                        </span>
                                        <span className="min-w-0 truncate" style={{ color: cur.color }}>
                                          {cur.label}
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted">
                                          <Ship className="h-4 w-4 text-muted-foreground" />
                                        </span>
                                        <span className="truncate text-muted-foreground">Set state for today</span>
                                      </>
                                    )}
                                  </span>
                                  <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-[min(100vw-2rem,var(--radix-dropdown-menu-trigger-width))] sm:min-w-[240px]"
                              >
                                {todayStatesForPicker.map((state) => {
                                  const StateIcon = state.icon;
                                  const isActive = todayStatusValue === state.value;
                                  return (
                                    <DropdownMenuItem
                                      key={state.value}
                                      className="gap-2 py-2.5"
                                      onSelect={() => {
                                        void handleTodayStateChange(state.value);
                                      }}
                                    >
                                      <StateIcon className="h-4 w-4 shrink-0" style={{ color: state.color }} />
                                      <span className="flex-1">{state.label}</span>
                                      {isActive && <Check className="h-4 w-4 shrink-0" style={{ color: state.color }} />}
                                    </DropdownMenuItem>
                                  );
                                })}
                                {todayStatusValue && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="gap-2 py-2.5 text-destructive focus:text-destructive"
                                      onSelect={() => {
                                        void handleRemoveTodayState();
                                      }}
                                    >
                                      <XCircle className="h-4 w-4 shrink-0" />
                                      <span>Remove today&apos;s state</span>
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* Right: Part of active passage — same compact layout */}
                {todayStatusValue !== 'on-leave' && (
                <Card className="rounded-xl border shadow-sm">
                  <CardContent className="p-4 sm:p-5">
                    {(() => {
                      const canEditLogbookExtras = !isVesselLinked && !(isCaptain && captainViewMode === 'vessel');
                      const hasTodayState = !!todayStatusValue;
                      const isUnderwayToday = todayStatusValue === 'underway';
                      const passageDisabled =
                        isTogglingPartOfActivePassage ||
                        !canEditLogbookExtras ||
                        !hasTodayState ||
                        (!isPartOfActivePassageToday && isUnderwayToday);

                      return (
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                          <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10">
                              <Ship className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2 gap-y-1">
                                <h3 className="text-lg font-semibold tracking-tight">Part of active passage</h3>
                                {!canEditLogbookExtras && (
                                  <Badge variant="secondary" className="text-[10px] font-medium uppercase">
                                    View only
                                  </Badge>
                                )}
                                {canEditLogbookExtras && isPartOfActivePassageToday && (
                                  <Badge
                                    variant="secondary"
                                    className="border-emerald-500/25 bg-emerald-500/10 text-[10px] font-medium uppercase text-emerald-800 dark:text-emerald-300"
                                  >
                                    Marked
                                  </Badge>
                                )}
                                {canEditLogbookExtras && hasTodayState && isUnderwayToday && !isPartOfActivePassageToday && (
                                  <Badge variant="secondary" className="text-[10px] font-medium uppercase">
                                    Underway — not needed
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                <span className="font-medium text-foreground/80">
                                  {format(new Date(), 'EEEE')}
                                </span>
                                {' · '}
                                {format(new Date(), 'MMMM d, yyyy')}
                                <span className="text-muted-foreground/80"> · </span>
                                {currentVessel.name}
                              </p>
                            </div>
                          </div>
                          <div className="w-full shrink-0 sm:w-auto sm:pt-1">
                            <Button
                              onClick={handleTogglePartOfActivePassage}
                              disabled={passageDisabled}
                              title={
                                !canEditLogbookExtras
                                  ? 'You can only view vessel logs in this mode.'
                                  : !hasTodayState
                                    ? 'Set today’s vessel state first.'
                                    : !isPartOfActivePassageToday && isUnderwayToday
                                      ? 'Underway already counts as at sea.'
                                      : undefined
                              }
                              className={cn(
                                'h-11 w-full justify-center gap-2 rounded-xl px-4 font-medium sm:min-w-[220px]',
                                passageDisabled && 'cursor-not-allowed opacity-60',
                                !passageDisabled &&
                                  (isPartOfActivePassageToday
                                    ? 'bg-red-600 text-white hover:bg-red-700'
                                    : 'bg-emerald-600 text-white hover:bg-emerald-700')
                              )}
                            >
                              {isTogglingPartOfActivePassage ? (
                                <>
                                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                                  {isPartOfActivePassageToday ? 'Removing…' : 'Recording…'}
                                </>
                              ) : !hasTodayState ? (
                                <>
                                  <Ship className="h-4 w-4 shrink-0" />
                                  Set state first
                                </>
                              ) : isPartOfActivePassageToday ? (
                                <>
                                  <Square className="h-4 w-4 shrink-0" />
                                  Remove passage mark
                                </>
                              ) : isUnderwayToday ? (
                                <>
                                  <Ship className="h-4 w-4 shrink-0" />
                                  Not applicable
                                </>
                              ) : (
                                <>
                                  <Play className="h-4 w-4 shrink-0" />
                                  Mark passage day
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
                )}
            </div>

            {isVesselAccount && currentVessel && (
              <AisTrackingCard
                vesselId={currentVessel.id}
                mmsi={currentVessel.mmsi}
                imo={currentVessel.imo ?? currentVessel.officialNumber}
                accessToken={session?.access_token ?? null}
                profileRaw={userProfileRaw}
                todayState={todayStatusValue}
                onEnabledChange={handleAisEnabledChange}
                onStateUpdated={handleAisStateUpdated}
              />
            )}

            {isVesselLinked && currentVessel && (
              <AisTrackingCard
                readOnly
                vesselId={currentVessel.id}
                mmsi={currentVessel.mmsi}
                imo={currentVessel.imo ?? currentVessel.officialNumber}
                accessToken={session?.access_token ?? null}
                profileRaw={userProfileRaw}
                todayState={todayStatusValue}
                onEnabledChange={handleAisEnabledChange}
                onStateUpdated={handleAisStateUpdated}
              />
            )}

            {!isVesselAccount && !isVesselLinked && currentVessel && (
              <CrewAisTrackingCard
                accessToken={session?.access_token ?? null}
                profileRaw={userProfileRaw}
                todayState={todayStatusValue}
                onStateUpdated={handleAisStateUpdated}
              />
            )}

            {!isVesselAccount && !isVesselLinked && currentVessel && (
              <CrewAisDebugPanel
                accessToken={session?.access_token ?? null}
                profileRaw={userProfileRaw}
              />
            )}

            {isVesselAccount && currentVessel && (
              <AisDebugPanel
                vesselId={currentVessel.id}
                accessToken={session?.access_token ?? null}
                profileRaw={userProfileRaw}
              />
            )}

            {/* Quick Stats — personal sea-time style; hide for vessel accounts */}
            {!isVesselAccount && (
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">At Sea</CardTitle>
                        <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Waves className="h-4 w-4 text-primary" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{atSeaDays}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {`Underway, passage, and watch days since joining ${currentVessel.name}`}
                        </p>
                    </CardContent>
                </Card>
                <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Standby</CardTitle>
                        <div className="h-8 w-8 rounded-xl bg-purple-500/10 flex items-center justify-center">
                            <Anchor className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-purple-700 dark:text-purple-300">{standbyDays}</div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {`days logged since joining ${currentVessel.name}`}
                        </p>
                    </CardContent>
                </Card>
                <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Total Days</CardTitle>
                        <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                            <CalendarDays className="h-4 w-4 text-primary" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">
                          {assignmentStartDate 
                            ? stateLogs.filter(log => {
                          const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
                                const filterEndDate = endOfDay(new Date());
                                return isWithinInterval(logDate, { start: assignmentStartDate, end: filterEndDate });
                              }).length
                            : stateLogs.length
                          }
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {`total days logged since joining ${currentVessel.name}`}
                        </p>
                    </CardContent>
                </Card>
            </div>
            )}
            
            {/* Monthly Calendar - Updated to match calendar page */}
            <div className="space-y-6">
              {/* Header */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-bold tracking-tight">Monthly Calendar</h2>
                    <p className="text-muted-foreground">
                      View and update your vessel status for {currentVessel.name}. Click dates to update states.
                    </p>
                            </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={selectionMode === 'single' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectionMode('single')}
                      className="rounded-xl"
                    >
                      <MousePointer2 className="h-4 w-4 mr-2" />
                      Single
                                    </Button>
                    <Button
                      variant={selectionMode === 'range' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setSelectionMode('range');
                        setDateRange(undefined);
                      }}
                      className="rounded-xl"
                    >
                      <CalendarDays className="h-4 w-4 mr-2" />
                      Range
                    </Button>
                        </div>
                                    </div>
                <Separator />
                        </div>

              {/* Calendar months: 3 cols up to 1700px, 4 cols when wider */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 min-[1701px]:grid-cols-4 gap-6">
                <TooltipProvider delayDuration={100}>
                  {recentCalendarMonths.map((month) => renderMonth(month))}
                </TooltipProvider>
              </div>
            </div>

            {/* State Change Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              if (!open) {
                setDateRange(undefined);
                setSelectedDate(null);
                setSelectedState(null);
                setIsPartOfActivePassageInDialog(false);
                setIsWatchInDialog(false);
                setNotesInDialog('');
              }
              setIsDialogOpen(open);
            }}>
              <DialogContent className="rounded-xl max-w-2xl">
                                <DialogHeader>
                                    <DialogTitle>
                    {dateRange?.from && dateRange?.to 
                      ? `Update Status: ${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}`
                      : selectedDate
                        ? `Update Status: ${format(selectedDate, 'MMM d, yyyy')}`
                                                : 'Select Date Range'}
                                    </DialogTitle>
                                </DialogHeader>
                                    <div className="grid grid-cols-2 gap-3 py-4">
                                {vesselStates
                                  .filter(state => !isVesselAccount || state.value !== 'on-leave')
                                  .map((state) => {
                                            const StateIcon = state.icon;
                    const isSelected = selectedState === state.value;
                                    return (
                                                <Button 
                                                    key={state.value} 
                        variant="outline"
                                                    className={cn(
                                                      "h-auto py-4 px-4 flex flex-col items-center gap-3 rounded-xl transition-all relative border-2 ring-offset-background",
                                                      isSelected 
                                                        ? "shadow-md scale-[1.02] focus-visible:ring-2 focus-visible:ring-offset-2" 
                                                        : "hover:scale-[1.01]"
                                                    )}
                                                    style={{
                                                      backgroundColor: isSelected 
                                                        ? calendarStateWash(state.value, 22) 
                                                        : calendarStateWash(state.value, 12),
                                                      borderColor: isSelected 
                                                        ? state.color 
                                                        : calendarStateWash(state.value, 52),
                                                      ...(isSelected
                                                        ? ({ '--tw-ring-color': state.color } as CSSProperties)
                                                        : {}),
                                                    }}
                        onClick={() => {
                          setSelectedState(state.value);
                          // Reset "part of active passage" if state is changed to "underway", "in-yard", or "on-leave"
                          if (
                            state.value === 'underway' ||
                            state.value === 'in-yard' ||
                            state.value === 'on-leave'
                          ) {
                            setIsPartOfActivePassageInDialog(false);
                          }
                          // Disable watch checkbox if state is not at-anchor
                          if (state.value !== 'at-anchor' && isWatchInDialog) {
                            setIsWatchInDialog(false);
                          }
                        }}
                        disabled={isSaving}
                                                >
                                                    <div 
                                                        className="h-12 w-12 rounded-xl flex items-center justify-center shadow-sm" 
                                                        style={{ backgroundColor: state.color }}
                                                    >
                                                      <StateIcon className="h-6 w-6 text-white" />
                                                    </div>
                                                    <span className="font-semibold text-sm">{state.label}</span>
                        {isSelected && (
                          <div className="absolute top-2 right-2">
                            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: state.color }}></div>
                          </div>
                        )}
                                     </Button>
                                            );
                                        })}
                                    {/* No State / Remove State tile */}
                                    {(() => {
                                      // Check if there are states to remove
                                      let hasStates = false;
                                      if (dateRange?.from && dateRange?.to) {
                                        const interval = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
                                        hasStates = interval.some(day => {
                                          const dateKey = format(day, 'yyyy-MM-dd');
                                          return stateLogMap.has(dateKey);
                                        });
                                      } else if (selectedDate) {
                                        const dateKey = format(selectedDate, 'yyyy-MM-dd');
                                        hasStates = stateLogMap.has(dateKey);
                                      }
                                      
                                      if (!hasStates) return null;
                                      
                                      return (
                                        <Button
                                          variant="outline"
                                          onClick={handleRemoveState}
                                          disabled={isSaving}
                                          className={cn(
                                            "h-auto py-4 px-4 flex flex-col items-center gap-3 rounded-xl transition-all relative border-2 hover:scale-[1.01]"
                                          )}
                                          style={{
                                            backgroundColor: 'hsl(var(--destructive) / 0.08)',
                                            borderColor: 'hsl(var(--destructive) / 0.3)',
                                          }}
                                        >
                                          <div
                                            className="h-12 w-12 rounded-xl flex items-center justify-center shadow-sm bg-destructive"
                                          >
                                            <XCircle className="h-6 w-6 text-white" />
                                          </div>
                                          <span className="font-semibold text-sm">Remove State</span>
                                        </Button>
                                      );
                                    })()}
                                </div>
                                <div className="border-t pt-4 px-1">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {selectedState !== 'underway' &&
                                      selectedState !== 'in-yard' &&
                                      selectedState !== 'on-leave' && (
                                      <div className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors">
                                        <Checkbox
                                          id="part-of-active-passage"
                                          checked={isPartOfActivePassageInDialog}
                                          onCheckedChange={(checked) => {
                                            setIsPartOfActivePassageInDialog(checked === true);
                                          }}
                                          disabled={isSaving}
                                          className="mt-0.5"
                                        />
                                        <Label
                                          htmlFor="part-of-active-passage"
                                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex flex-col gap-1.5 flex-1"
                                        >
                                          <div className="flex items-center gap-2">
                                            <Ship className="h-4 w-4 text-blue-600" />
                                            <span>Part of Active Passage</span>
                                          </div>
                                          <span className="text-xs text-muted-foreground">
                                            Counts as At Sea
                                          </span>
                                        </Label>
                                      </div>
                                    )}
                                    {isOfficer && !isVesselAccount && selectedDate && !dateRange && (
                                      <div className={cn(
                                        "flex items-start space-x-3 p-3 rounded-lg border transition-colors",
                                        selectedState === 'at-anchor' 
                                          ? "border-border hover:bg-accent/50" 
                                          : "border-border/50 bg-muted/30 opacity-60"
                                      )}>
                                        <Checkbox
                                          id="watch-log"
                                          checked={isWatchInDialog}
                                          onCheckedChange={(checked) => setIsWatchInDialog(checked === true)}
                                          disabled={isSaving || selectedState !== 'at-anchor'}
                                          className="mt-0.5"
                                        />
                                        <Label
                                          htmlFor="watch-log"
                                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex flex-col gap-1.5 flex-1"
                                        >
                                          <div className="flex items-center gap-2">
                                            <Clock className="h-4 w-4 text-yellow-600" />
                                            <span>Record Day as Watch</span>
                                          </div>
                                          <span className="text-xs text-muted-foreground">
                                            {selectedState === 'at-anchor' 
                                              ? "Only available when At Anchor" 
                                              : "Requires At Anchor state"}
                                          </span>
                                        </Label>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {selectedDate && !dateRange && (() => {
                                  const dateKey = format(selectedDate, 'yyyy-MM-dd');
                                  const isPartOfActivePassage = partOfActivePassageDates.has(dateKey);
                                  const hasWatch = watchDates.has(dateKey);
                                  const hasOverride = hasWatch || isPartOfActivePassage;
                                  const isCountedStandby = standbyDatesSet.has(dateKey) && !hasOverride;
                                  
                                  if (isCountedStandby) {
                                    return (
                                      <div className="border-t pt-4 px-1">
                                        <div className="flex items-start space-x-3 p-3 rounded-lg border border-purple-600/30 bg-purple-600/10">
                                          <Clock className="h-5 w-5 text-purple-600 mt-0.5 shrink-0" />
                                          <div className="flex-1">
                                            <div className="text-sm font-semibold text-purple-700 dark:text-purple-400">
                                              Counted as Standby
                                            </div>
                                            <div className="text-xs text-purple-600 dark:text-purple-500 mt-1">
                                              This date is counted as standby time and will be included in your standby calculations.
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                                <div className="border-t pt-4 px-1">
                                  <div className="space-y-2">
                                    <Label htmlFor="notes-current" className="text-sm font-medium">
                                      Notes (Optional)
                                    </Label>
                                    <Textarea
                                      id="notes-current"
                                      placeholder="Add any notes or reminders for this date..."
                                      value={notesInDialog}
                                      onChange={(e) => setNotesInDialog(e.target.value)}
                                      disabled={isSaving}
                                      className="min-h-[80px]"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                      Add any additional information or reminders you want to remember for this date.
                                    </p>
                                  </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                  <Button
                                    onClick={() => {
                                      if (selectedState) {
                                        handleStateChange(selectedState);
                                      }
                                    }}
                                    disabled={!selectedState || isSaving}
                                    className="rounded-xl"
                                  >
                                    {isSaving ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Saving...
                                      </>
                                    ) : (
                                      'Save Changes'
                                    )}
                                  </Button>
                                </div>
                {isSaving && (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                            </DialogContent>
                        </Dialog>
            
            <Card className="rounded-xl border shadow-sm">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-2xl">
                              {isVesselAccount ? 'State overview' : 'Day Breakdown'}
                            </CardTitle>
                            <CardDescription className="text-base mt-1">
                              {isVesselAccount
                                ? 'Breakdown of logged vessel states'
                                : 'Comprehensive overview of your sea service statistics'}
                            </CardDescription>
                        </div>
                        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                            <CalendarDays className="h-6 w-6 text-primary" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Key Statistics Cards — personal sea-time metrics; crew only */}
                    {!isVesselAccount && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-200 dark:border-blue-800">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground mb-1">At Sea Days</p>
                                        <p className="text-3xl font-bold text-blue-700 dark:text-blue-400">{atSeaDays}</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                          Underway + active passage + watch (when applicable)
                                        </p>
                                    </div>
                                    <div className="h-12 w-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                        <Waves className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        
                        <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20 border-purple-200 dark:border-purple-800">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground mb-1">Standby Days</p>
                                        <p className="text-3xl font-bold text-purple-700 dark:text-purple-400">{standbyDays}</p>
                                        <p className="text-xs text-muted-foreground mt-1">MCA-compliant calculation methods</p>
                                    </div>
                                    <div className="h-12 w-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                        <Clock className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        
                        <Card className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 border-green-200 dark:border-green-800">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-muted-foreground mb-1">Total Days</p>
                                        <p className="text-3xl font-bold text-green-700 dark:text-green-400">
                                            {stateLogs?.filter(log => {
                                                if (!assignmentStartDate) return true;
                                                const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
                                                return isWithinInterval(logDate, { start: assignmentStartDate, end: endOfDay(new Date()) });
                                            }).length || 0}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">Days since joining vessel</p>
                                    </div>
                                    <div className="h-12 w-12 rounded-lg bg-green-500/20 flex items-center justify-center">
                                        <CalendarDays className="h-6 w-6 text-green-600 dark:text-green-400" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    )}

                    {/* State Breakdown */}
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg font-semibold mb-2">State Details</h3>
                            <p className="text-sm text-muted-foreground">Breakdown of days by vessel state</p>
                        </div>
                        <div className="space-y-3">
                            {vesselStates
                              .filter(state => !isVesselAccount || state.value !== 'on-leave')
                              .map((stateInfo) => {
                                const days = totalDaysByState.find(d => d.name === stateInfo.label)?.days || 0;
                                const totalDays = stateLogs?.filter(log => {
                                    if (!assignmentStartDate) return true;
                                    const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
                                    return isWithinInterval(logDate, { start: assignmentStartDate, end: endOfDay(new Date()) });
                                }).length || 1;
                                const percentage = totalDays > 0 ? Math.round((days / totalDays) * 100) : 0;
                                
                                if (days === 0) return null;
                                
                                return (
                                    <div key={stateInfo.value} className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                                        <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${stateInfo.color}20`, color: stateInfo.color }}>
                                            <stateInfo.icon className="h-5 w-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <p className="font-medium text-sm">{stateInfo.label}</p>
                                                <p className="text-sm font-semibold">{days} {days === 1 ? 'day' : 'days'}</p>
                                            </div>
                                            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                                                <div 
                                                    className="h-2 rounded-full transition-all"
                                                    style={{ 
                                                        width: `${percentage}%`,
                                                        backgroundColor: stateInfo.color
                                                    }}
                                                />
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1">{percentage}% of total days</p>
                                        </div>
                                    </div>
                                );
                            })}
                            {totalDaysByState.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground">
                                    <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">No state data available yet</p>
                                </div>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
      ) : isVesselLinked ? (
        <Card className="overflow-hidden rounded-2xl border shadow-sm">
          <div className="relative border-b bg-gradient-to-br from-sky-500/10 via-primary/5 to-background px-6 py-6">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
                backgroundSize: '12px 12px',
              }}
            />
            <div className="relative">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-4 ring-primary/15">
                <Ship className="h-5 w-5" />
              </span>
              <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                Vessel-linked account
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">Vessel record</h2>
              <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
                This login belongs to the vessel and does not keep a personal sea-time log.
                Open the daily log once the vessel has an active service.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Start service — three-band CTA (hero / form / action footer) */}
          <Card className="overflow-hidden rounded-2xl border shadow-sm">
            <div className="relative border-b bg-gradient-to-br from-sky-500/10 via-primary/5 to-background px-6 py-6">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
                  backgroundSize: '12px 12px',
                }}
              />
              <div className="relative flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-4 ring-primary/15">
                    <Ship className="h-5 w-5" />
                  </span>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                    {startServiceHero.eyebrow}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                    {startServiceHero.title}
                  </h2>
                  <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
                    {startServiceHero.description}
                  </p>
                </div>
                {!isVesselAccount && (
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-md bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border">
                      Active = no end date
                    </span>
                    <span className="rounded-md bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border">
                      Past = start + end
                    </span>
                  </div>
                )}
              </div>
            </div>

            {isCaptain ? (
              <Tabs defaultValue="service" className="w-full">
                <div className="border-b bg-muted/20 px-6 pt-4">
                  <TabsList className="grid h-11 w-full max-w-md grid-cols-2 rounded-xl bg-muted/60 p-1">
                    <TabsTrigger value="service" className="rounded-lg gap-1.5">
                      <Ship className="h-3.5 w-3.5" />
                      Sea service
                    </TabsTrigger>
                    <TabsTrigger value="captaincy" className="rounded-lg gap-1.5">
                      <UserPlus className="h-3.5 w-3.5" />
                      Request captaincy
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="service" className="mt-0">
                  <Form {...startServiceForm}>
                    <form
                      id="start-service-form"
                      onSubmit={startServiceForm.handleSubmit(onStartServiceSubmit)}
                    >
                      <CardContent className="space-y-5 p-6">
                        {renderStartServiceFields()}
                      </CardContent>
                      {renderStartServiceFooter()}
                    </form>
                  </Form>
                </TabsContent>

                <TabsContent value="captaincy" className="mt-0">
                  <CardContent className="space-y-5 p-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Search for vessel</Label>
                      <UnifiedVesselSearchPicker
                        value={selectedVesselForAction?.id ?? ''}
                        onChange={(id, name, type) =>
                          setSelectedVesselForAction({ id, name, type: type || '' })
                        }
                        supabase={supabase}
                        knownVessels={(vessels ?? []).map((v) => ({
                          id: v.id,
                          name: v.name,
                          type: v.type,
                        }))}
                        disabled={isLoadingVessels}
                        triggerClassName="h-11 rounded-xl text-base"
                      />
                    </div>

                    {selectedVesselForAction && (
                      <div className="rounded-xl border border-sky-500/25 bg-gradient-to-br from-sky-500/[0.07] via-background to-blue-600/5 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10">
                              <Ship className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold tracking-tight">
                                {selectedVesselForAction.name}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                {selectedVesselForAction.type}
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedVesselForAction(null)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            Change
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 px-6 py-4">
                    <div className="min-w-0 text-sm text-muted-foreground">
                      {selectedVesselForAction
                        ? 'Ready to request captaincy for this vessel.'
                        : 'Select a vessel to request captaincy.'}
                    </div>
                    <Button
                      type="button"
                      onClick={handleOpenCaptaincyDialog}
                      size="lg"
                      disabled={!selectedVesselForAction || isRequestingCaptaincy}
                      className="h-11 shrink-0 gap-2 rounded-xl px-5"
                    >
                      {isRequestingCaptaincy ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Submitting…
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4" />
                          Request captaincy
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <Form {...startServiceForm}>
                <form onSubmit={startServiceForm.handleSubmit(onStartServiceSubmit)}>
                  <CardContent className="space-y-5 p-6">
                    {renderStartServiceFields()}
                  </CardContent>
                  {renderStartServiceFooter()}
                </form>
              </Form>
            )}
          </Card>
        </div>
      )}

      {/* Captaincy Request Dialog */}
      <Dialog open={isCaptaincyDialogOpen} onOpenChange={(open) => {
        setIsCaptaincyDialogOpen(open);
        if (!open) {
          setCaptaincyDocumentUrls(['']);
        }
      }}>
        <DialogContent className="sm:max-w-[600px] rounded-xl">
          <DialogHeader>
            <DialogTitle>Request Vessel Captaincy</DialogTitle>
            <DialogDescription>
              {selectedVesselForAction 
                ? `Provide supporting documents (URLs to certificates, licenses, contracts, or other relevant documents) to prove you are the captain of "${selectedVesselForAction.name}".`
                : 'Provide supporting documents (URLs to certificates, licenses, contracts, or other relevant documents) to prove you are the captain of this vessel.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Supporting Documents (URLs)</Label>
              {captaincyDocumentUrls.map((url, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    type="url"
                    placeholder="https://example.com/document.pdf"
                    value={url}
                    onChange={(e) => handleCaptaincyDocumentUrlChange(index, e.target.value)}
                    className="rounded-lg"
                  />
                  {captaincyDocumentUrls.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleRemoveCaptaincyDocumentUrl(index)}
                      className="rounded-lg"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddCaptaincyDocumentUrl}
                className="w-full rounded-lg"
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Another Document
              </Button>
              <p className="text-xs text-muted-foreground">
                Provide at least one document URL that proves you are the captain of this vessel (e.g., employment contract, captain's license, vessel registration).
              </p>
            </div>
            <DialogFooter className="pt-4 gap-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost" className="rounded-xl">Cancel</Button>
              </DialogClose>
              <Button 
                type="button" 
                onClick={handleRequestCaptaincyFromLookup} 
                disabled={isRequestingCaptaincy}
                className="rounded-lg"
              >
                {isRequestingCaptaincy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
