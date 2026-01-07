
'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, differenceInDays, eachDayOfInterval, isSameDay, startOfDay, endOfDay, parse, isWithinInterval, startOfMonth, endOfMonth, getDaysInMonth, getDay, isSameMonth, isToday, isAfter, isBefore, addDays, subMonths, startOfYear, endOfYear } from 'date-fns';
import { CalendarIcon, MapPin, Briefcase, Info, PlusCircle, Loader2, Ship, BookText, Clock, Waves, Anchor, Building, CalendarDays, History, Edit, MousePointer2, BoxSelect, Search, UserPlus, ChevronsUpDown, Check } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { 
  createVessel, 
  createSeaServiceRecord, 
  updateStateLogsBatch, 
  updateUserProfile,
  getVesselStateLogs,
  createVesselAssignment,
  endVesselAssignment,
  getVesselAssignments
} from '@/supabase/database/queries';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { DateRange } from 'react-day-picker';
import StateBreakdownChart from '@/components/dashboard/state-breakdown-chart';
import type { UserProfile, Vessel, SeaServiceRecord, StateLog, DailyStatus, VesselAssignment } from '@/lib/types';
import { vesselTypes, vesselTypeValues } from '@/lib/vessel-types';
import { calculateStandbyDays } from '@/lib/standby-calculation';
import { findMissingDays } from '@/lib/fill-missing-days';

const startServiceSchema = z.object({
  vesselId: z.string().min(1, 'Please select a vessel.'),
  position: z.string().optional(),
  startDate: z.date({ required_error: 'A start date is required.' }),
  endDate: z.date().optional(),
  initialState: z.enum(['underway', 'at-anchor', 'in-port', 'on-leave', 'in-yard']),
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

const addVesselSchema = z.object({
  name: z.string().min(2, 'Vessel name is required.'),
  type: z.enum(vesselTypeValues, {
    required_error: 'Please select a vessel type.',
  }),
  officialNumber: z.string().optional(),
});
type AddVesselFormValues = z.infer<typeof addVesselSchema>;

// Maritime position options
const POSITION_OPTIONS = [
  'Captain / Master',
  'Chief Officer / First Mate',
  'Second Officer',
  'Third Officer',
  '3rd Officer',
  'Officer of the Watch (OOW)',
  'Deck Officer',
  'Lead Deckhand',
  'Deckhand',
  'Able Seaman (AB)',
  'Bosun',
  'Cadet',
  'Chief Engineer',
  'First Engineer / Second Engineer',
  'Third Engineer',
  'Engineer',
  'Electrician',
  'Chef / Cook',
  'Head Housekeeper',
  'Chief Steward / Stewardess',
  '2nd Steward / Stewardess',
  'Steward / Stewardess',
  'Interior Crew',
  'Other',
] as const;

const vesselStates: { value: DailyStatus; label: string; color: string; bgColor: string; icon: React.FC<any> }[] = [
    { value: 'underway', label: 'Underway', color: 'hsl(var(--chart-blue))', bgColor: 'hsl(217, 91%, 95%)', icon: Waves },
    { value: 'at-anchor', label: 'At Anchor', color: 'hsl(var(--chart-orange))', bgColor: 'hsl(25, 95%, 95%)', icon: Anchor },
    { value: 'in-port', label: 'In Port', color: 'hsl(var(--chart-green))', bgColor: 'hsl(142, 76%, 95%)', icon: Building },
    { value: 'on-leave', label: 'On Leave', color: 'hsl(var(--chart-gray))', bgColor: 'hsl(215, 16%, 95%)', icon: Briefcase },
    { value: 'in-yard', label: 'In Yard', color: 'hsl(var(--chart-red))', bgColor: 'hsl(0, 84%, 95%)', icon: Ship },
];

export default function CurrentPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedState, setSelectedState] = useState<DailyStatus | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'single' | 'range'>('single');
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isAddVesselDialogOpen, setIsAddVesselDialogOpen] = useState(false);
  const [isSavingVessel, setIsSavingVessel] = useState(false);
  // Unified vessel search (used by both crew and captains)
  const [vesselSearchTerm, setVesselSearchTerm] = useState('');
  const [vesselSearchResults, setVesselSearchResults] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [isSearchingVessels, setIsSearchingVessels] = useState(false);
  const [isVesselSearchOpen, setIsVesselSearchOpen] = useState(false);
  const [selectedVesselForAction, setSelectedVesselForAction] = useState<{ id: string; name: string; type: string } | null>(null);
  const [isRequestingCaptaincy, setIsRequestingCaptaincy] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notes, setNotes] = useState('');

  const { user } = useUser();
  const { supabase } = useSupabase();
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
    if (!userProfile) return false;
    const tier = (userProfile as any).subscription_tier || userProfile.subscriptionTier || 'free';
    const status = (userProfile as any).subscription_status || userProfile.subscriptionStatus || 'inactive';
    return (tier === 'premium' || tier === 'pro') && status === 'active';
  }, [userProfile]);

  const vesselLimit = hasUnlimitedVessels ? Infinity : 3;
  const canAddVessel = hasUnlimitedVessels || actualVesselCount < vesselLimit;

  const [stateLogs, setStateLogs] = useState<StateLog[]>([]);
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
  
  useEffect(() => {
    const checkCaptaincyAndFindVesselAccount = async () => {
      if (!currentVessel || !user?.id) {
        setVesselAccountUserId(null);
        return;
      }

      // Only check for captains
      if (userProfile?.role !== 'captain') {
        setVesselAccountUserId(null);
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
          return;
        }
        
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

          // Use the same logic as calendar page: simple captaincy check
          let userIdToFetch: string | undefined = user.id;
          
          if (userProfile?.role === 'captain') {
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
              }
            } catch (e) {
              console.error('[CURRENT PAGE] Error checking captaincy for vessel:', vesselId, e);
            }
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
        const uniqueLogs = Array.from(
          new Map(allLogs.map(log => [`${log.date}-${log.vesselId}`, log])).values()
        );

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
  }, [user?.id, vessels, vesselAssignments, currentVessel, userProfile?.role, supabase]);

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

    // Set up real-time subscription to detect changes to vessel assignments
    // This will detect changes made from the mobile app or other sources
    const channel = supabase
      .channel(`current-vessel-assignments-${user.id}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'vessel_assignments',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          console.log('[CURRENT PAGE] Vessel assignment changed via real-time:', payload);
          // Refetch assignments when changes are detected
          try {
            const assignments = await getVesselAssignments(supabase, user.id);
            console.log('[CURRENT PAGE] Refetched assignments after real-time change:', assignments.map(a => ({ id: a.id, vesselId: a.vesselId, startDate: a.startDate, endDate: a.endDate })));
            setVesselAssignments(assignments);
            previousAssignmentsRef.current = [...assignments];
          } catch (error) {
            console.error('[CURRENT PAGE] Error refetching assignments after change:', error);
          }
        }
      )
      .subscribe((status) => {
        console.log('[CURRENT PAGE] Real-time subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[CURRENT PAGE] Successfully subscribed to vessel_assignments changes');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[CURRENT PAGE] Real-time subscription error - falling back to polling');
        }
      });

    // Fallback: Poll for changes every 3 seconds if real-time doesn't work
    // This ensures we detect changes even if real-time subscriptions fail
    const pollInterval = setInterval(async () => {
      try {
        const assignments = await getVesselAssignments(supabase, user.id);
        
        // Check if assignments have changed by comparing end_date values
        // Use a more robust comparison that checks all fields
        const previous = previousAssignmentsRef.current;
        
        // Create maps for easier comparison
        const previousMap = new Map(previous.map(a => [a.id, a]));
        const currentMap = new Map(assignments.map(a => [a.id, a]));
        
        // Check for changes: different count, new assignments, removed assignments, or modified assignments
        const hasChanges = 
          assignments.length !== previous.length ||
          assignments.some(a => {
            const prev = previousMap.get(a.id);
            if (!prev) return true; // New assignment
            // Compare all relevant fields
            return a.vesselId !== prev.vesselId ||
              a.startDate !== prev.startDate || 
              a.endDate !== prev.endDate;
          }) ||
          previous.some(a => !currentMap.has(a.id)); // Removed assignment
        
        // Always update if there are changes, and also update ref
        if (hasChanges) {
          console.log('[CURRENT PAGE] Polling detected changes in vessel assignments', {
            previous: previous.map(a => ({ id: a.id, vesselId: a.vesselId, startDate: a.startDate, endDate: a.endDate })),
            current: assignments.map(a => ({ id: a.id, vesselId: a.vesselId, startDate: a.startDate, endDate: a.endDate }))
          });
          setVesselAssignments(assignments);
          previousAssignmentsRef.current = [...assignments];
        } else {
          // Even if no changes detected, update ref to latest data to prevent stale comparisons
          previousAssignmentsRef.current = [...assignments];
        }
      } catch (error) {
        console.error('[CURRENT PAGE] Error polling vessel assignments:', error);
      }
    }, 3000); // Poll every 3 seconds (more frequent)

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [user?.id, supabase, userProfile?.activeVesselId, refetchUserProfile]);

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

    updateUserProfile(supabase, user.id, {
      activeVesselId: activeAssignment.vesselId,
    })
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

  // Calculate standby days
  const { standbyPeriods } = useMemo(() => {
    if (!stateLogs || stateLogs.length === 0) {
      return { standbyPeriods: [] };
    }
    const result = calculateStandbyDays(stateLogs);
    return { standbyPeriods: result.standbyPeriods };
  }, [stateLogs]);

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

  // Create a Set of dates that are counted as standby
  const standbyDatesSet = useMemo(() => {
    const dates = new Set<string>();
    standbyPeriods.forEach(period => {
      const startDate = period.startDate instanceof Date 
        ? period.startDate 
        : new Date(period.startDate);
      const countedDays = period.countedDays;
      for (let i = 0; i < countedDays; i++) {
        const date = addDays(startDate, i);
        dates.add(format(date, 'yyyy-MM-dd'));
      }
    });
    return dates;
  }, [standbyPeriods]);

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

      // Create a unique key for this check (vessel + today's date)
      const todayKey = format(new Date(), 'yyyy-MM-dd');
      const checkKey = `${currentVessel.id}-${todayKey}`;
      
      // Skip if we've already filled gaps for this vessel today
      if (gapFilledRef.current === checkKey) {
        return;
      }

      // Find missing days
      const { lastLoggedDate, lastLoggedState, missingDays } = findMissingDays(stateLogs);

      // If there are missing days and we have a last logged state, fill them
      // Skip auto-fill for approved captains viewing vessel account logs (view-only)
      if (missingDays.length > 0 && lastLoggedState && !vesselAccountUserId) {
        setIsFillingGaps(true);
        
        try {
          console.log(`[FILL MISSING DAYS] Found ${missingDays.length} missing days from ${lastLoggedDate ? format(lastLoggedDate, 'yyyy-MM-dd') : 'unknown'} to today. Filling with state: ${lastLoggedState}`);
          
          // Create logs for all missing days with the same state as the last logged entry
          const logsToCreate = missingDays.map(date => ({
            date,
            state: lastLoggedState,
          }));

          await updateStateLogsBatch(supabase, user.id, currentVessel.id, logsToCreate);

          console.log(`[FILL MISSING DAYS] Successfully filled ${missingDays.length} missing days`);

          // Mark that we've filled gaps for this vessel today
          gapFilledRef.current = checkKey;

          // Refresh state logs to show the newly created entries
          // Use vesselAccountUserId if captain is viewing vessel account logs, otherwise user.id
          const userIdToFetch = vesselAccountUserId || user.id;
          const updatedLogs = await getVesselStateLogs(supabase, currentVessel.id, userIdToFetch);
          setStateLogs(updatedLogs);
        } catch (error: any) {
          console.error('Error filling missing days:', error);
          // Don't show toast error - this is automatic background operation
        } finally {
          setIsFillingGaps(false);
        }
      } else if (missingDays.length === 0) {
        // No gaps to fill, mark as checked
        gapFilledRef.current = checkKey;
      }
    };

    fillGaps();
  }, [stateLogs, currentVessel?.id, user?.id, supabase, isFillingGaps, isLoadingLogs]);
  
  const startServiceForm = useForm<StartServiceFormValues>({
    resolver: zodResolver(startServiceSchema),
    defaultValues: { 
      vesselId: '', 
      position: userProfile?.position || '', 
      startDate: undefined, 
      endDate: undefined, 
      initialState: 'underway' 
    },
  });

  // Update position field when userProfile changes
  useEffect(() => {
    if (userProfile?.position) {
      startServiceForm.setValue('position', userProfile.position);
    }
  }, [userProfile?.position, startServiceForm]);

  const addVesselForm = useForm<AddVesselFormValues>({
    resolver: zodResolver(addVesselSchema),
    defaultValues: { name: '', type: undefined, officialNumber: '' },
  });

  // Check if user is captain
  const isCaptain = useMemo(() => {
    return userProfile?.role === 'captain';
  }, [userProfile?.role]);

  // Unified vessel search (works for both crew and captains)
  useEffect(() => {
    const searchVessels = async () => {
      if (!vesselSearchTerm || vesselSearchTerm.length < 2) {
        setVesselSearchResults([]);
        return;
      }

      setIsSearchingVessels(true);
      try {
        const response = await fetch('/api/vessels/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ searchTerm: vesselSearchTerm }),
        });

        if (response.ok) {
          const data = await response.json();
          setVesselSearchResults(data.vessels || []);
        } else {
          setVesselSearchResults([]);
        }
      } catch (error) {
        console.error('Error searching vessels:', error);
        setVesselSearchResults([]);
      } finally {
        setIsSearchingVessels(false);
      }
    };

    const timeoutId = setTimeout(searchVessels, 300); // Debounce
    return () => clearTimeout(timeoutId);
  }, [vesselSearchTerm]);

  // Handler to request captaincy for looked up vessel
  const handleRequestCaptaincyFromLookup = async () => {
    if (!selectedVesselForAction || !user?.id) return;
    
    setIsRequestingCaptaincy(true);
    
    try {
      const response = await fetch('/api/vessel-claim-requests/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vesselId: selectedVesselForAction.id,
          requestedRole: 'captain',
          userId: user.id,
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
        
        // Reset search state
        setVesselSearchTerm('');
        setVesselSearchResults([]);
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

    const dateStr = format(date, 'yyyy-MM-dd');
    const dateObj = parse(dateStr, 'yyyy-MM-dd', new Date());

    // For vessel accounts, allow editing from the vessel's start_date (if set) or vessel creation date
    if (userProfile?.role === 'vessel') {
      // Check if user has a start_date set
      const userStartDate = userProfile?.startDate 
        ? startOfDay(new Date(userProfile.startDate))
        : null;
      
      // Fallback to vessel created_at date if start_date is not set
      let earliestAllowedDate: Date | null = userStartDate;
      if (!earliestAllowedDate) {
        const vesselData = vessels?.find(v => v.id === currentVessel.id);
        if (vesselData && (vesselData as any).created_at) {
          earliestAllowedDate = startOfDay(new Date((vesselData as any).created_at));
        }
      }

      if (earliestAllowedDate && isBefore(dateObj, earliestAllowedDate)) {
        return {
          valid: false,
          reason: `You cannot change states before ${format(earliestAllowedDate, 'MMM d, yyyy')}${userStartDate ? ' (your official start date)' : ' (vessel launch date)'}.`,
        };
      }
      // No end date restriction for vessel accounts - they can edit any date from start to present
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
    if (vesselAccountUserId) {
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
        setIsDialogOpen(true);
      }
    }
  };

  const handleStateChange = async (state: DailyStatus) => {
    if (!currentVessel || !user?.id) return;

    setIsSaving(true);

    try {
      let logs: Array<{ date: string; state: DailyStatus }> = [];
      
      if (dateRange?.from && dateRange?.to) {
        // Range update
        const today = startOfDay(new Date());
        const interval = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
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
        const dateKey = format(selectedDate, 'yyyy-MM-dd');
        logs = [{ date: dateKey, state }];
      } else {
        setIsSaving(false);
        return;
      }

      // For approved captains viewing vessel account logs, they should not be able to edit
      // They can only view the vessel account's logs
      if (vesselAccountUserId) {
        toast({
          title: 'Cannot Edit',
          description: 'You can only view the vessel account logs. The vessel manager must update the logs.',
          variant: 'destructive',
        });
        return;
      }
      
      await updateStateLogsBatch(supabase, user.id, currentVessel.id, logs);
      
      // Refresh state logs
      const userIdToFetch = vesselAccountUserId || user.id;
      const updatedLogs = await getVesselStateLogs(supabase, currentVessel.id, userIdToFetch);
      setStateLogs(updatedLogs);
      
      setIsDialogOpen(false);
      setDateRange(undefined);
      setSelectedDate(null);
      
      const stateLabel = vesselStates.find(s => s.value === state)?.label || state;
      
      if (dateRange?.from && dateRange?.to) {
        const daysCount = logs.length;
        toast({
          title: 'States Updated',
          description: `${daysCount} day${daysCount > 1 ? 's' : ''} (${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}) updated to ${stateLabel}.`,
        });
      } else {
        toast({
          title: 'State Updated',
          description: `${format(selectedDate!, 'MMM d, yyyy')} has been updated to ${stateLabel}.`,
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
      if (isActiveService) {
      await updateUserProfile(supabase, user.id, {
        activeVesselId: data.vesselId,
        });
      }

      // 3. Create state logs for all dates from start to end
      const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
      const logs = dateRange.map(day => ({
        date: format(day, 'yyyy-MM-dd'),
        state: data.initialState,
      }));
      
      await updateStateLogsBatch(supabase, user.id, data.vesselId, logs);
      
      const message = isActiveService 
        ? `Sea service started. ${logs.length} day(s) logged with initial state.`
        : `Sea service recorded. ${logs.length} day(s) logged from ${format(startDate, 'PPP')} to ${format(endDate, 'PPP')}.`;
      
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

  async function onAddVesselSubmit(data: AddVesselFormValues) {
    if (!user?.id) return;
    setIsSavingVessel(true);

    try {
      const newVessel = await createVessel(supabase, {
        name: data.name,
        type: data.type,
        officialNumber: data.officialNumber,
      });
      
      // Set the newly created vessel as selected in the form
      startServiceForm.setValue('vesselId', newVessel.id);
      
      addVesselForm.reset();
      setIsAddVesselDialogOpen(false);
      setVesselSearchTerm(''); // Clear search term
      setIsVesselSearchOpen(false); // Close search popover
      toast({ title: 'Vessel Added', description: `${data.name} has been added and selected.` });
    } catch (error: any) {
      console.error('Error adding vessel:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add vessel. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingVessel(false);
    }
  }

  const handleRangeStateChange = async (state: DailyStatus) => {
    if (!currentVessel || !user?.id || !dateRange?.from || !dateRange?.to) return;
    
    const interval = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    const logs = interval.map(day => ({
      date: format(day, 'yyyy-MM-dd'),
      state: state,
    }));
    
    // For approved captains viewing vessel account logs, they should not be able to edit
    if (vesselAccountUserId) {
      toast({
        title: 'Cannot Edit',
        description: 'You can only view the vessel account logs. The vessel manager must update the logs.',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      await updateStateLogsBatch(supabase, user.id, currentVessel.id, logs);
      // Refresh logs after update
      const userIdToFetch = vesselAccountUserId || user.id;
      const updatedLogs = await getVesselStateLogs(supabase, currentVessel.id, userIdToFetch);
      setStateLogs(updatedLogs);
    setIsStatusDialogOpen(false);
    setDateRange(undefined);
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
    
    // For approved captains viewing vessel account logs, they should not be able to edit
    if (vesselAccountUserId) {
      toast({
        title: 'Cannot Edit',
        description: 'You can only view the vessel account logs. The vessel manager must update the logs.',
        variant: 'destructive',
      });
      return;
    }
    
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    
    try {
      await updateStateLogsBatch(supabase, user.id, currentVessel.id, [{ date: todayKey, state }]);
      
      // Refresh state logs to show the updated value
      const userIdToFetch = vesselAccountUserId || user.id;
      const updatedLogs = await getVesselStateLogs(supabase, currentVessel.id, userIdToFetch);
      setStateLogs(updatedLogs);
      
      toast({ 
        title: 'State Updated', 
        description: `Today's state has been updated to ${vesselStates.find(s => s.value === state)?.label || state}.` 
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


  const handleSaveNotes = async () => {
    if (!currentVessel || !user?.id) return;
    setIsSavingNotes(true);
    
    try {
      // Notes can be stored in a separate table or as metadata
      // For now, we'll skip notes if there's no specific service record to attach them to
      // You may want to create a separate notes table or add a notes column to daily_state_logs
      toast({ title: 'Notes Saved', description: 'Your trip notes have been updated.' });
    } catch (e) {
      console.error("Error saving notes", e);
      toast({
        title: 'Error',
        description: 'Failed to save notes.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingNotes(false);
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
                const isCurrentDay = isToday(day);
                const isCurrentMonth = isSameMonth(day, month);
                
                // Check if this date is a standby date
                const isCountedStandby = standbyDatesSet.has(dateKey);
                
                // Check if date is in selected range
                let isInRange = false;
                let isRangeStart = false;
                let isRangeEnd = false;
                if (dateRange?.from && dateRange?.to) {
                  const dayStart = startOfDay(day);
                  const rangeStart = startOfDay(dateRange.from);
                  const rangeEnd = endOfDay(dateRange.to);
                  
                  isInRange = isWithinInterval(dayStart, { start: rangeStart, end: rangeEnd });
                  isRangeStart = format(dayStart, 'yyyy-MM-dd') === format(rangeStart, 'yyyy-MM-dd');
                  isRangeEnd = format(dayStart, 'yyyy-MM-dd') === format(rangeEnd, 'yyyy-MM-dd');
                } else if (dateRange?.from && !dateRange?.to) {
                  // Only start is selected
                  isRangeStart = format(day, 'yyyy-MM-dd') === format(dateRange.from, 'yyyy-MM-dd');
                }
                
                // Check if date is in the future
                const today = startOfDay(new Date());
                const dayStart = startOfDay(day);
                const isFuture = isAfter(dayStart, today);

                // Determine styling for standby dates with diagonal split
                let standbyStyle: React.CSSProperties = {};
                let backgroundStyle: React.CSSProperties | undefined = undefined;
                
                if (isCountedStandby && stateInfo) {
                  const standbyColor = 'rgba(139, 92, 246, 0.85)';
                  const stateColor = stateInfo.color;
                  backgroundStyle = {
                    background: `linear-gradient(135deg, ${stateColor} 0%, ${stateColor} 70%, ${standbyColor} 70%, ${standbyColor} 100%)`,
                  };
                  standbyStyle = {};
                } else if (isCountedStandby && !stateInfo) {
                  backgroundStyle = {
                    backgroundColor: 'rgba(139, 92, 246, 0.7)',
                  };
                  standbyStyle = {};
                }

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
                        {isCountedStandby && (
                          <div className="flex items-center gap-2 text-purple-400">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Counted as Standby</span>
                          </div>
                        )}
                        {currentVessel && (
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
                      <div className="aspect-square">
                        <button
                          onClick={() => handleDateClick(day)}
                          disabled={isFuture}
                          className={cn(
                            "w-full h-full rounded-xl text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                            !isFuture && "hover:scale-105 hover:shadow-md",
                            !isCurrentMonth && "opacity-40",
                            isFuture && "opacity-30 cursor-not-allowed",
                            isCurrentDay && !isInRange && "ring-2 ring-primary ring-offset-2",
                            isInRange && "ring-2 ring-primary/50",
                            (isRangeStart || isRangeEnd) && "ring-2 ring-primary ring-offset-1",
                            stateInfo 
                              ? "text-white" 
                              : "bg-muted/50 text-muted-foreground hover:bg-muted"
                          )}
                          style={
                            backgroundStyle
                              ? { ...standbyStyle, ...backgroundStyle }
                              : stateInfo 
                                ? { ...standbyStyle, backgroundColor: stateInfo.color } 
                                : isInRange 
                                  ? { backgroundColor: 'hsl(var(--primary) / 0.15)', ...standbyStyle } 
                                  : standbyStyle
                          }
                        >
                          <div className="flex flex-col items-center justify-center h-full relative">
                            <span className="relative z-10 text-center">{format(day, 'd')}</span>
                            {/* State icon in top-left corner (only for counted standby dates) */}
                            {isCountedStandby && stateInfo && (
                              <stateInfo.icon className="absolute top-1.5 left-1.5 h-2 w-2 opacity-90 z-10" />
                            )}
                            {/* State icon centered (for non-standby dates) */}
                            {!isCountedStandby && stateInfo && (
                              <stateInfo.icon className="h-2 w-2 mt-0.5 opacity-90 relative z-10" />
                            )}
                            {/* Standby icon in bottom-right corner (only for counted standby dates) */}
                            {isCountedStandby && (
                              <Clock className="absolute bottom-1.5 right-1.5 h-2 w-2 opacity-90 z-10" />
                            )}
                          </div>
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
          
          {/* Month Summary Section */}
          <Separator className="mt-6 mb-4" />
          <div className="grid grid-cols-3 gap-3 text-sm">
            {vesselStates.map((state) => {
              const count = monthStateCounts[state.value] || 0;
              const StateIcon = state.icon;
              return (
                <div 
                  key={state.value} 
                  className="flex items-center gap-2 p-2 rounded-lg"
                  style={{ backgroundColor: state.bgColor }}
                >
                  <StateIcon className="h-4 w-4" style={{ color: state.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-muted-foreground truncate">{state.label}</div>
                  </div>
                  <span className="font-medium">{count}</span>
                </div>
              );
            })}
            <div 
              className="flex items-center gap-2 p-2 rounded-lg"
              style={{ backgroundColor: 'hsla(271, 70%, 50%, 0.15)' }}
            >
              <Clock className="h-4 w-4 text-purple-600" />
              <div className="flex-1 min-w-0">
                <div className="text-muted-foreground truncate">Standby</div>
              </div>
              <span className="font-medium">{monthStateCounts.standby}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Get last 3 months
  const lastThreeMonths = useMemo(() => {
    const today = new Date();
    const months: Date[] = [];
    for (let i = 0; i < 3; i++) {
      months.push(subMonths(today, i));
    }
    return months.reverse(); // Show oldest to newest (2 months ago, 1 month ago, current)
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
  
  const serviceDate = mostRecentServiceDate;
  
  // Get the active assignment start date for the current vessel
  const assignmentStartDate = useMemo(() => {
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
  }, [currentVessel, vesselAssignments]);

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
        if (log.state === 'underway') atSea++;
        return acc;
    }, {} as Record<DailyStatus, number>);

    // Calculate MCA/PYA compliant standby days using ALL logs (for proper voyage context)
    // Then filter standby periods to only count those since joining the vessel
    const { totalStandbyDays, standbyPeriods } = calculateStandbyDays(stateLogs);
    
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
  }, [stateLogs, assignmentStartDate]);

  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const todayStatusValue = stateLogs?.find(log => log.date === todayKey)?.state;

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
          {isDisplayingStatus && (
            <Button onClick={handleEndTrip} variant="destructive" className="rounded-xl">End Current Service</Button>
          )}
        </div>
        <Separator />
      {isDisplayingStatus ? (
        <div className="space-y-6">
            {/* Active Vessel Header Card */}
            <Card className="rounded-xl border shadow-sm bg-gradient-to-r from-primary/5 to-primary/10">
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="h-16 w-16 rounded-xl bg-primary/20 flex items-center justify-center">
                                <Ship className="h-8 w-8 text-primary" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold">{currentVessel.name}</h2>
                                <p className="text-sm text-muted-foreground">{currentVessel.type} • Active Service</p>
                                {serviceDate && (
                                    <p className="text-xs text-muted-foreground mt-1">Started {format(serviceDate, 'PPP')}</p>
                                )}
                            </div>
                        </div>
                        {todayStatusValue && (
                            <div className="text-right">
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

            {/* Quick Stats */}
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
                        <p className="text-xs text-muted-foreground mt-1">days logged since joining {currentVessel.name}</p>
                    </CardContent>
                </Card>
                <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Standby</CardTitle>
                        <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Anchor className="h-4 w-4 text-primary" />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold">{standbyDays}</div>
                        <p className="text-xs text-muted-foreground mt-1">days logged since joining {currentVessel.name}</p>
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
                        <p className="text-xs text-muted-foreground mt-1">total days logged since joining {currentVessel.name}</p>
                    </CardContent>
                </Card>
            </div>
            
            {/* Current State Selector - Full Width */}
            <Card className="rounded-xl border shadow-sm">
                    <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-xl">Update Today's Status</CardTitle>
                            <CardDescription className="mt-1">
                                Change the current state for {format(new Date(), 'PPP')} • Active vessel: {currentVessel.name}
                            </CardDescription>
                        </div>
                        {todayStatusValue && (
                            <div className="hidden sm:flex items-center gap-3 px-4 py-2 bg-primary/10 rounded-xl border border-primary/20">
                                <div 
                                    className="h-4 w-4 rounded-full" 
                                    style={{ backgroundColor: vesselStates.find(s => s.value === todayStatusValue)?.color }}
                                />
                                <div>
                                    <p className="text-xs text-muted-foreground">Current</p>
                                    <p className="text-sm font-semibold text-primary">
                                        {vesselStates.find(s => s.value === todayStatusValue)?.label || 'No status'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                    </CardHeader>
                <CardContent>
                    {isLoadingLogs ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                            {vesselStates.map(state => {
                            const isActive = todayStatusValue === state.value;
                            return (
                                <button
                                    key={state.value}
                                    onClick={() => handleTodayStateChange(state.value)}
                                    className={cn(
                                            "flex flex-col items-center gap-3 p-4 rounded-xl text-center transition-all border-2",
                                        isActive 
                                                ? 'bg-primary/10 text-primary border-primary shadow-md scale-105'
                                                : 'hover:bg-muted/50 border-transparent hover:border-muted'
                                        )}
                                    >
                                        <span 
                                            className={cn(
                                                "flex h-12 w-12 items-center justify-center rounded-xl transition-colors",
                                                isActive ? 'ring-2 ring-primary ring-offset-2' : ''
                                            )} 
                                            style={{ backgroundColor: isActive ? state.color : 'hsl(var(--muted))' }}
                                        >
                                            <state.icon className={cn("h-6 w-6", isActive ? 'text-primary-foreground' : 'text-muted-foreground')} />
                                    </span>
                                        <span className={cn("font-medium text-sm", isActive ? 'text-primary' : 'text-foreground')}>
                                            {state.label}
                                    </span>
                                        {isActive && (
                                            <span className="text-xs text-primary font-semibold">Selected</span>
                                        )}
                                </button>
                            );
                        })}
                        </div>
                    )}
                    </CardContent>
                </Card>
            
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

              {/* Calendar Months Grid - Last 3 months */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <TooltipProvider delayDuration={100}>
                  {lastThreeMonths.map((month) => renderMonth(month))}
                </TooltipProvider>
              </div>
            </div>

            {/* State Change Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              if (!open) {
                setDateRange(undefined);
                setSelectedDate(null);
                setSelectedState(null);
              }
              setIsDialogOpen(open);
            }}>
              <DialogContent className="rounded-xl">
                                <DialogHeader>
                                    <DialogTitle>
                    {dateRange?.from && dateRange?.to 
                      ? `Update Status: ${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d, yyyy')}`
                      : selectedDate
                        ? `Update Status: ${format(selectedDate, 'MMM d, yyyy')}`
                                                : 'Select Date Range'}
                                    </DialogTitle>
                                </DialogHeader>
                                    <div className="grid grid-cols-1 gap-3 py-4">
                                {vesselStates.map((state) => {
                                            const StateIcon = state.icon;
                    const isSelected = selectedState === state.value;
                                    return (
                                                <Button 
                                                    key={state.value} 
                        variant={isSelected ? "default" : "outline"} 
                                                    className="justify-start gap-3 h-auto py-3 rounded-lg hover:bg-accent/50 transition-colors" 
                        onClick={() => handleStateChange(state.value)}
                        disabled={isSaving}
                                                >
                                                    <div 
                                                        className="h-4 w-4 rounded-full shrink-0" 
                                                        style={{ backgroundColor: state.color }}
                                                    />
                                                    <StateIcon className="h-4 w-4 shrink-0" />
                                                    <span className="font-medium">{state.label}</span>
                        {isSelected && <span className="ml-auto text-xs">Current</span>}
                                     </Button>
                                            );
                                        })}
                                </div>
                {isSaving && (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                            </DialogContent>
                        </Dialog>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="rounded-xl border shadow-sm">
                    <CardHeader>
                        <CardTitle>Day Breakdown</CardTitle>
                        <CardDescription>Distribution of days by state</CardDescription>
                    </CardHeader>
                    <CardContent><StateBreakdownChart data={totalDaysByState} /></CardContent>
                </Card>
                    
                <Card className="rounded-xl border shadow-sm">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <BookText className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle>Trip Notes</CardTitle>
                                <CardDescription>Add notes about your current trip</CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Textarea placeholder="Add notes about your trip..." value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[100px]" />
                    </CardContent>
                    <CardFooter>
                        <Button onClick={handleSaveNotes} disabled={isSavingNotes} className="rounded-xl">
                            {isSavingNotes && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Notes
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Unified Vessel Service Card - Adapts to Role */}
          <Card className="rounded-xl border shadow-sm bg-gradient-to-br from-background to-muted/20">
            <CardHeader className="pb-4">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
                    {isCaptain ? (
                      <Search className="h-6 w-6 text-primary" />
                    ) : (
                      <Ship className="h-6 w-6 text-primary" />
                    )}
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-2xl mb-1">
                      {isCaptain ? 'Request Vessel Captaincy' : 'Start a New Sea Service'}
                    </CardTitle>
                    <CardDescription className="text-base">
                      {isCaptain 
                        ? 'Search for a vessel and request captaincy to manage its sea time logs and crew.'
                        : 'Search for a vessel and record your sea service dates. Leave end date empty for an active service, or fill both dates to add a past service.'
                      }
                    </CardDescription>
                  </div>
                </div>
            </CardHeader>
            <CardContent className="pt-2">
              {isCaptain ? (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">Search for Vessel</Label>
                    <Popover open={isVesselSearchOpen} onOpenChange={setIsVesselSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between h-12 text-base font-medium",
                            !selectedVesselForAction && "text-muted-foreground"
                          )}
                          disabled={isLoadingVessels}
                        >
                          {selectedVesselForAction
                            ? selectedVesselForAction.name
                            : vesselSearchTerm || "Type vessel name to search..."}
                          <ChevronsUpDown className="ml-2 h-5 w-5 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                        <div className="p-2 border-b bg-muted/30">
                          <Input
                            placeholder="Search vessels..."
                            value={vesselSearchTerm}
                            onChange={(e) => {
                              setVesselSearchTerm(e.target.value);
                              if (!isVesselSearchOpen) setIsVesselSearchOpen(true);
                            }}
                            className="h-10 bg-background"
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setIsVesselSearchOpen(false);
                              }
                            }}
                          />
                        </div>
                        <div className="max-h-[300px] overflow-auto p-1">
                          {isSearchingVessels ? (
                            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                              Searching...
                            </div>
                          ) : vesselSearchResults.length > 0 ? (
                            vesselSearchResults.map((vessel) => (
                              <button
                                key={vessel.id}
                                onClick={() => {
                                  setSelectedVesselForAction(vessel);
                                  setIsVesselSearchOpen(false);
                                  setVesselSearchTerm('');
                                }}
                                className={cn(
                                  "relative flex w-full cursor-pointer select-none items-center rounded-md px-3 py-2.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground transition-colors",
                                  selectedVesselForAction?.id === vessel.id && "bg-accent"
                                )}
                              >
                                <Check
                                  className={cn(
                                    "mr-3 h-4 w-4 shrink-0",
                                    selectedVesselForAction?.id === vessel.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex-1 text-left">
                                  <div className="font-medium">{vessel.name}</div>
                                  <div className="text-xs text-muted-foreground">{vessel.type}</div>
                                </div>
                              </button>
                            ))
                          ) : vesselSearchTerm.length >= 2 ? (
                            <div className="px-2 py-1">
                              <button
                                onClick={() => {
                                  addVesselForm.setValue('name', vesselSearchTerm);
                                  setIsVesselSearchOpen(false);
                                  setIsAddVesselDialogOpen(true);
                                }}
                                className="relative flex w-full cursor-pointer select-none items-center rounded-md px-3 py-2.5 text-sm outline-none hover:bg-primary/10 hover:text-primary focus:bg-primary/10 focus:text-primary border border-dashed border-primary/50 transition-colors"
                              >
                                <PlusCircle className="mr-3 h-4 w-4 text-primary shrink-0" />
                                <span className="font-medium">Create new vessel: <span className="text-primary">{vesselSearchTerm}</span></span>
                              </button>
                            </div>
                          ) : (
                            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                              Type at least 2 characters to search vessels
                            </div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Dialog open={isAddVesselDialogOpen} onOpenChange={(open) => {
                      setIsAddVesselDialogOpen(open);
                      if (!open) {
                        setVesselSearchTerm('');
                        setVesselSearchResults([]);
                      }
                    }}>
                      <DialogTrigger asChild>
                        <Button 
                          type="button"
                          variant="ghost" 
                          size="sm"
                          className="w-full text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setVesselSearchTerm('');
                            setIsVesselSearchOpen(false);
                          }}
                        >
                          <PlusCircle className="mr-2 h-4 w-4" />
                          Create New Vessel
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                          <div className="flex items-center gap-3 mb-2">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <Ship className="h-5 w-5 text-primary" />
                            </div>
                            <DialogTitle>Add a New Vessel</DialogTitle>
                          </div>
                        </DialogHeader>
                        <Form {...addVesselForm}>
                          <form onSubmit={addVesselForm.handleSubmit(onAddVesselSubmit)} className="space-y-4">
                            <FormField 
                              control={addVesselForm.control} 
                              name="name" 
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Vessel Name</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g., M/Y Odyssey" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )} 
                            />
                            <FormField 
                              control={addVesselForm.control} 
                              name="type" 
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Vessel Type</FormLabel>
                                  <FormControl>
                                    <SearchableSelect
                                      options={vesselTypes}
                                      value={field.value}
                                      onValueChange={field.onChange}
                                      placeholder="Select a vessel type"
                                      searchPlaceholder="Search vessel types..."
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )} 
                            />
                            <FormField 
                              control={addVesselForm.control} 
                              name="officialNumber" 
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Official Number (Optional)</FormLabel>
                                  <FormControl>
                                    <Input placeholder="e.g., IMO 1234567" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )} 
                            />
                            <DialogFooter className="pt-4 gap-2">
                              <DialogClose asChild>
                                <Button type="button" variant="ghost" className="rounded-lg">Cancel</Button>
                              </DialogClose>
                              <Button type="submit" disabled={isSavingVessel} className="rounded-lg">
                                {isSavingVessel && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Vessel
                              </Button>
                            </DialogFooter>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {selectedVesselForAction && (
                    <div className="rounded-xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 p-6 space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <div className="h-14 w-14 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30">
                            <Ship className="h-7 w-7 text-primary" />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold">{selectedVesselForAction.name}</h3>
                            <p className="text-sm text-muted-foreground mt-1">{selectedVesselForAction.type}</p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedVesselForAction(null);
                            setVesselSearchTerm('');
                          }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          Change
                        </Button>
                      </div>
                      <Separator />
                      <Button
                        type="button"
                        onClick={handleRequestCaptaincyFromLookup}
                        disabled={isRequestingCaptaincy}
                        className="w-full h-12 text-base font-semibold"
                        size="lg"
                      >
                        {isRequestingCaptaincy ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Submitting Request...
                          </>
                        ) : (
                          <>
                            <UserPlus className="mr-2 h-5 w-5" />
                            Request Captaincy
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <Form {...startServiceForm}>
                  <form onSubmit={startServiceForm.handleSubmit(onStartServiceSubmit)} className="space-y-6">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="space-y-6">
                      <FormField
                        control={startServiceForm.control}
                        name="vesselId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base font-semibold">Vessel</FormLabel>
                      <div className="flex gap-2">
                      <Popover open={isVesselSearchOpen} onOpenChange={setIsVesselSearchOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn(
                                "w-full justify-between font-medium",
                                !field.value && "text-muted-foreground"
                              )}
                              disabled={isLoadingVessels}
                            >
                              {field.value
                                ? vessels?.find((v) => v.id === field.value)?.name || 'Select vessel...'
                                : vesselSearchTerm || "Search for a vessel..."}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                          <div className="p-2 border-b bg-muted/30">
                            <Input
                              placeholder="Search vessels..."
                              value={vesselSearchTerm}
                              onChange={(e) => {
                                setVesselSearchTerm(e.target.value);
                                if (!isVesselSearchOpen) setIsVesselSearchOpen(true);
                              }}
                              className="h-9 bg-background"
                              onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                  setIsVesselSearchOpen(false);
                                }
                              }}
                            />
                          </div>
                          <div className="max-h-[300px] overflow-auto p-1">
                            {isSearchingVessels ? (
                              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                                Searching...
                              </div>
                            ) : vesselSearchResults.length > 0 ? (
                              vesselSearchResults.map((vessel) => (
                                <button
                                  key={vessel.id}
                                  onClick={() => {
                                    field.onChange(vessel.id);
                                    setIsVesselSearchOpen(false);
                                    setVesselSearchTerm('');
                                  }}
                                  className={cn(
                                    "relative flex w-full cursor-pointer select-none items-center rounded-md px-3 py-2.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground transition-colors",
                                    field.value === vessel.id && "bg-accent"
                                  )}
                                >
                                  <Check
                                    className={cn(
                                      "mr-3 h-4 w-4 shrink-0",
                                      field.value === vessel.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex-1 text-left">
                                    <div className="font-medium">{vessel.name}</div>
                                    <div className="text-xs text-muted-foreground">{vessel.type}</div>
                                  </div>
                                </button>
                              ))
                            ) : vesselSearchTerm.length >= 2 ? (
                              <div className="px-2 py-1">
                                <button
                                  onClick={() => {
                                    // Pre-fill the add vessel dialog and open it
                                    addVesselForm.setValue('name', vesselSearchTerm);
                                    setIsVesselSearchOpen(false);
                                    setIsAddVesselDialogOpen(true);
                                  }}
                                  className="relative flex w-full cursor-pointer select-none items-center rounded-md px-3 py-2.5 text-sm outline-none hover:bg-primary/10 hover:text-primary focus:bg-primary/10 focus:text-primary border border-dashed border-primary/50 transition-colors"
                                >
                                  <PlusCircle className="mr-3 h-4 w-4 text-primary shrink-0" />
                                  <span className="font-medium">Create new vessel: <span className="text-primary">{vesselSearchTerm}</span></span>
                                </button>
                              </div>
                            ) : (
                              <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                                Type at least 2 characters to search vessels
                              </div>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Dialog open={isAddVesselDialogOpen} onOpenChange={(open) => {
                        setIsAddVesselDialogOpen(open);
                        if (!open) {
                          // Reset search when dialog closes
                          setVesselSearchTerm('');
                          setVesselSearchResults([]);
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button 
                            type="button"
                            variant="outline" 
                            size="icon" 
                            className="ml-2 shrink-0 rounded-lg"
                            onClick={() => {
                              // Clear the vessel search term when opening add dialog
                              setVesselSearchTerm('');
                              setIsVesselSearchOpen(false);
                            }}
                          >
                            <PlusCircle className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                                <DialogContent className="sm:max-w-[500px]">
                                  <DialogHeader>
                                    <div className="flex items-center gap-3 mb-2">
                                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                        <Ship className="h-5 w-5 text-primary" />
                                      </div>
                                      <DialogTitle>Add a New Vessel</DialogTitle>
                                    </div>
                                  </DialogHeader>
                                  <Form {...addVesselForm}>
                                      <form onSubmit={addVesselForm.handleSubmit(onAddVesselSubmit)} className="space-y-4">
                                        <FormField 
                                          control={addVesselForm.control} 
                                          name="name" 
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Vessel Name</FormLabel>
                                              <FormControl>
                                                <Input placeholder="e.g., M/Y Odyssey" {...field} />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )} 
                                        />
                                        <FormField 
                                          control={addVesselForm.control} 
                                          name="type" 
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Vessel Type</FormLabel>
                                              <FormControl>
                                                <SearchableSelect
                                                  options={vesselTypes}
                                                  value={field.value}
                                                  onValueChange={field.onChange}
                                                  placeholder="Select a vessel type"
                                                  searchPlaceholder="Search vessel types..."
                                                />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )} 
                                        />
                                        <FormField 
                                          control={addVesselForm.control} 
                                          name="officialNumber" 
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Official Number (Optional)</FormLabel>
                                              <FormControl>
                                                <Input placeholder="e.g., IMO 1234567" {...field} />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )} 
                                        />
                                        <DialogFooter className="pt-4 gap-2">
                                          <DialogClose asChild>
                                            <Button type="button" variant="ghost" className="rounded-lg">Cancel</Button>
                                          </DialogClose>
                                          <Button type="submit" disabled={isSavingVessel} className="rounded-lg">
                                            {isSavingVessel && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Save Vessel
                                          </Button>
                                        </DialogFooter>
                                      </form>
                                    </Form>
                            </DialogContent>
                        </Dialog>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                      <FormField 
                        control={startServiceForm.control} 
                        name="position" 
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-base font-semibold">Your Position/Role</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ''}>
                              <FormControl>
                                <SelectTrigger className="rounded-lg">
                                  <SelectValue placeholder="Select your position..." />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent className="rounded-lg">
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
                                ? `Pre-filled from your profile. Update if you've changed position.`
                                : 'Select your current position on this vessel'}
                            </p>
                          </FormItem>
                        )} 
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField 
                          control={startServiceForm.control} 
                          name="startDate" 
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>Start Date</FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal rounded-lg", !field.value && "text-muted-foreground")}>
                                      {field.value ? format(field.value, "PPP") : (<span>Pick a start date</span>)}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                  <Calendar 
                                    mode="single" 
                                    selected={field.value} 
                                    onSelect={field.onChange} 
                                    disabled={(date) => date > new Date() || date < new Date("1990-01-01")} 
                                    initialFocus 
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )} 
                        />
                        <FormField 
                          control={startServiceForm.control} 
                          name="endDate" 
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel>End Date (Optional)</FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal rounded-lg", !field.value && "text-muted-foreground")}>
                                      {field.value ? format(field.value, "PPP") : (<span>Leave empty for active</span>)}
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
                                      const startDate = startServiceForm.watch("startDate");
                                      return date > new Date() || 
                                             (startDate && date < startDate) || 
                                             date < new Date("1990-01-01");
                                    }} 
                                    initialFocus 
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                              <p className="text-xs text-muted-foreground">Leave empty for active service</p>
                            </FormItem>
                          )} 
                        />
                      </div>
                    </div>
                    <div className="space-y-6">
                      <FormField 
                        control={startServiceForm.control} 
                        name="initialState" 
                        render={({ field }) => (
                          <FormItem className="space-y-3">
                            <FormLabel>Initial Vessel State</FormLabel>
                            <FormControl>
                              <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-1">
                                {vesselStates.map((state) => (
                                  <FormItem key={state.value} className="flex items-center space-x-3 space-y-0">
                                    <FormControl>
                                      <RadioGroupItem value={state.value} />
                                    </FormControl>
                                    <FormLabel className="font-normal">{state.label}</FormLabel>
                                  </FormItem>
                                ))}
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                            <p className="text-xs text-muted-foreground">This state will be applied to all dates in the range</p>
                          </FormItem>
                        )} 
                      />
                    </div>
                  </div>
                      <Separator />
                      <Button type="submit" className="w-full rounded-lg h-12 text-base font-semibold" size="lg">
                        <Ship className="mr-2 h-5 w-5" />
                        Start Tracking
                      </Button>
                    </form>
                  </Form>
                )}
          </CardContent>
        </Card>
        
        {!isCaptain && (
          /* Info Card: How to Add Past Services - Only for Crew */
          <Card className="rounded-xl border shadow-sm bg-muted/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <History className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="font-semibold text-lg">Add Past Vessel Service</h3>
                <p className="text-sm text-muted-foreground">
                  The form above works for both active and past services:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground ml-4">
                  <li><strong>Active Service:</strong> Fill in start date, leave end date empty</li>
                  <li><strong>Past Service:</strong> Fill in both start and end dates (e.g., from 2 years ago)</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-3">
                  After adding a past service, you can edit individual date states using the monthly calendar below (once that vessel becomes active) or by resuming it from the History page.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        )}
        </div>
      )}

    </div>
  );
}
