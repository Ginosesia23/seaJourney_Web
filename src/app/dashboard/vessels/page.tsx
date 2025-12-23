'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PlusCircle, Loader2, Ship, ChevronDown, Search, LayoutGrid, List, PlayCircle, Trash2, CalendarIcon, ShieldCheck, ChevronsUpDown, Check } from 'lucide-react';
import { format, eachDayOfInterval, startOfDay, endOfDay, parse } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { createVessel, getVesselStateLogs, getVesselSeaService, updateUserProfile, deleteVesselStateLogs, updateStateLogsBatch } from '@/supabase/database/queries';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import type { Vessel, StateLog, UserProfile, SeaServiceRecord, DailyStatus } from '@/lib/types';
import { vesselTypes, vesselTypeValues } from '@/lib/vessel-types';
import { cn } from '@/lib/utils';
import { VesselSummaryCard, VesselSummarySkeleton } from '@/components/dashboard/vessel-summary-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const vesselSchema = z.object({
  name: z.string().min(2, 'Vessel name is required.'),
  type: z.enum(vesselTypeValues, {
    required_error: 'Please select a vessel type.',
  }),
  officialNumber: z.string().optional(),
});
type VesselFormValues = z.infer<typeof vesselSchema>;

const pastVesselSchema = z.object({
  vesselId: z.string().min(1, 'Please select a vessel.'),
  startDate: z.date({ required_error: 'A start date is required.' }),
  endDate: z.date({ required_error: 'An end date is required.' }),
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

type PastVesselFormValues = z.infer<typeof pastVesselSchema>;

const vesselStates: { value: DailyStatus; label: string; color: string }[] = [
  { value: 'underway', label: 'Underway', color: 'hsl(var(--chart-blue))' },
  { value: 'at-anchor', label: 'At Anchor', color: 'hsl(var(--chart-orange))' },
  { value: 'in-port', label: 'In Port', color: 'hsl(var(--chart-green))' },
  { value: 'on-leave', label: 'On Leave', color: 'hsl(var(--chart-gray))' },
  { value: 'in-yard', label: 'In Yard', color: 'hsl(var(--chart-red))' },
];

export default function VesselsPage() {
  const router = useRouter();
  const [vesselStateLogs, setVesselStateLogs] = useState<Map<string, StateLog[]>>(new Map());
  const [allSeaService, setAllSeaService] = useState<SeaServiceRecord[]>([]);
  const [expandedVesselId, setExpandedVesselId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [layout, setLayout] = useState<'card' | 'table'>('table');
  const [resumingVesselId, setResumingVesselId] = useState<string | null>(null);
  const [vesselToDelete, setVesselToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddPastVesselDialogOpen, setIsAddPastVesselDialogOpen] = useState(false);
  const [isSavingPastVessel, setIsSavingPastVessel] = useState(false);
  const [requestingCaptaincyVesselId, setRequestingCaptaincyVesselId] = useState<string | null>(null);
  const [isRequestingCaptaincy, setIsRequestingCaptaincy] = useState(false);
  const [captaincyRequests, setCaptaincyRequests] = useState<Map<string, { id: string; status: string; created_at?: string }>>(new Map());
  const [vesselSearchTerm, setVesselSearchTerm] = useState('');
  const [vesselSearchResults, setVesselSearchResults] = useState<Array<{ id: string; name: string; type: string }>>([]);
  const [isSearchingVessels, setIsSearchingVessels] = useState(false);
  const [isVesselSearchOpen, setIsVesselSearchOpen] = useState(false);
  const [isAddVesselDialogOpen, setIsAddVesselDialogOpen] = useState(false);
  const [isSavingVessel, setIsSavingVessel] = useState(false);
  const [vesselSigningAuthorities, setVesselSigningAuthorities] = useState<Map<string, boolean>>(new Map()); // vesselId -> hasActiveCaptain

  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();

  const pastVesselForm = useForm<PastVesselFormValues>({
    resolver: zodResolver(pastVesselSchema),
    defaultValues: { 
      vesselId: '', 
      startDate: undefined, 
      endDate: undefined, 
      initialState: 'underway' 
    },
  });

  const addVesselForm = useForm<VesselFormValues>({
    resolver: zodResolver(vesselSchema),
    defaultValues: {
      name: '',
      type: undefined,
      officialNumber: '',
    },
  });

  // Handler to create new vessel from search
  async function handleCreateVesselFromSearch(data: VesselFormValues) {
    if (!user?.id) return;
    setIsSavingVessel(true);

    try {
      const newVessel = await createVessel(supabase, {
        name: data.name,
        type: data.type,
        officialNumber: data.officialNumber,
      });
      
      // Set the newly created vessel as selected in the form
      pastVesselForm.setValue('vesselId', newVessel.id);
      
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

  // Query all vessels (vessels are shared, not owned by users)
  const { data: allVessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
    user?.id ? 'vessels' : null,
    user?.id ? { orderBy: 'created_at', ascending: false } : undefined
  );
  
  // Fetch user profile to get activeVesselId
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  
  // Transform user profile to handle both snake_case (from DB) and camelCase (from types)
  const currentUserProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    
    const activeVesselId = (userProfileRaw as any).active_vessel_id || (userProfileRaw as any).activeVesselId;
    const position = (userProfileRaw as any).position || (userProfileRaw as any).position || '';
    const role = (userProfileRaw as any).role || userProfileRaw.role || 'crew';
    
    return {
      ...userProfileRaw,
      activeVesselId: activeVesselId || undefined,
      position: position,
      role: role,
      subscriptionTier: (userProfileRaw as any).subscription_tier || userProfileRaw.subscriptionTier || 'free',
      subscriptionStatus: (userProfileRaw as any).subscription_status || userProfileRaw.subscriptionStatus || 'inactive',
    } as UserProfile;
  }, [userProfileRaw]);

  // Check if user is a captain (has captain role, or position contains "captain", or role is "vessel"/"admin")
  const isCaptain = useMemo(() => {
    if (!currentUserProfile) return false;
    const position = currentUserProfile.position?.toLowerCase() || '';
    const role = currentUserProfile.role?.toLowerCase() || '';
    return role === 'captain' || position.includes('captain') || role === 'vessel' || role === 'admin';
  }, [currentUserProfile]);

  // Fetch state logs and sea service for each vessel
  // For admins, we don't need to fetch logs for all vessels (they see all vessels regardless)
  // For non-admins, fetch logs to filter which vessels to show
  useEffect(() => {
    if (allVessels && user?.id) {
      const fetchData = async () => {
        const newLogs = new Map<string, StateLog[]>();
        const serviceRecords: SeaServiceRecord[] = [];
        
        // For admins, we can skip fetching logs (they see all vessels anyway)
        // But we still fetch for display purposes if needed
        // For now, let's still fetch but it's optional for admins
        await Promise.all(allVessels.map(async (vessel) => {
          const [logs, seaService] = await Promise.all([
            getVesselStateLogs(supabase, vessel.id, user.id),
            getVesselSeaService(supabase, user.id, vessel.id)
          ]);
          
          if (logs && logs.length > 0) {
            newLogs.set(vessel.id, logs);
          }
          if (seaService && seaService.length > 0) {
            serviceRecords.push(...seaService);
          }
        }));
        
        setVesselStateLogs(newLogs);
        setAllSeaService(serviceRecords);
      };
      fetchData();
    }
  }, [allVessels, user?.id, supabase]);

  // Fetch captaincy requests for vessels (if user is captain)
  // Fetch ALL requests for this captain, not just for vessels they've logged time on
  const fetchCaptaincyRequests = useCallback(async () => {
    if (!isCaptain || !user?.id) {
      console.log('[CAPTAINCY REQUESTS] Skipping fetch:', { isCaptain, userId: user?.id });
      setCaptaincyRequests(new Map());
      return;
    }
    
    console.log('[CAPTAINCY REQUESTS] Fetching all requests for captain user:', user.id);
    
    // Query ALL requests for this captain user - RLS will ensure they only see their own
    const { data: allRequests, error } = await supabase
      .from('vessel_claim_requests')
      .select('id, vessel_id, status, created_at')
      .eq('requested_by', user.id)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('[CAPTAINCY REQUESTS] Error fetching requests:', error);
      setCaptaincyRequests(new Map());
      return;
    }
    
    // Create a map of vessel_id -> { id, status }
    // For each vessel, keep only the most recent request
    const requestsMap = new Map<string, { id: string; status: string; created_at?: string }>();
    
    if (allRequests && allRequests.length > 0) {
      console.log('[CAPTAINCY REQUESTS] Raw requests from DB:', allRequests);
      // Group by vessel_id and keep the most recent one for each vessel
      const vesselRequestMap = new Map<string, typeof allRequests[0]>();
      for (const request of allRequests) {
        console.log('[CAPTAINCY REQUESTS] Processing request:', request);
        const existing = vesselRequestMap.get(request.vessel_id);
        if (!existing || new Date(request.created_at || 0) > new Date(existing.created_at || 0)) {
          vesselRequestMap.set(request.vessel_id, request);
        }
      }
      
      console.log('[CAPTAINCY REQUESTS] Grouped by vessel:', Array.from(vesselRequestMap.entries()));
      
      // Convert to the format expected by the component
      for (const [vesselId, request] of vesselRequestMap.entries()) {
        requestsMap.set(vesselId, { 
          id: request.id, 
          status: request.status,
          created_at: request.created_at 
        });
      }
    } else {
      console.log('[CAPTAINCY REQUESTS] No requests found in database');
    }
    
    console.log('[CAPTAINCY REQUESTS] Final requests map:', Array.from(requestsMap.entries()));
    console.log('[CAPTAINCY REQUESTS] Total requests found:', requestsMap.size);
    setCaptaincyRequests(requestsMap);
  }, [isCaptain, user?.id, supabase]);

  useEffect(() => {
    fetchCaptaincyRequests();
  }, [fetchCaptaincyRequests]);

  // Refetch requests when allVessels changes (to catch new vessels)
  useEffect(() => {
    if (isCaptain && allVessels && allVessels.length > 0) {
      fetchCaptaincyRequests();
    }
  }, [allVessels, isCaptain, fetchCaptaincyRequests]);

  // For vessel role users, check for active signing authorities (approved captains) for their active vessel
  useEffect(() => {
    const checkActiveCaptains = async () => {
      if (!allVessels || !user?.id || currentUserProfile?.role !== 'vessel' || !currentUserProfile?.activeVesselId) {
        return;
      }

      const activeVesselId = currentUserProfile.activeVesselId;
      const activeVessel = allVessels.find(v => v.id === activeVesselId);
      
      if (!activeVessel) return;

      try {
        // Check if vessel has an active signing authority (approved captain)
        const { data: signingAuthority, error } = await supabase
          .from('vessel_signing_authorities')
          .select('id')
          .eq('vessel_id', activeVesselId)
          .eq('is_primary', true)
          .is('end_date', null)
          .limit(1)
          .maybeSingle();

        if (!error) {
          const hasActiveCaptain = !!signingAuthority;
          setVesselSigningAuthorities(prev => {
            const newMap = new Map(prev);
            newMap.set(activeVesselId, hasActiveCaptain);
            return newMap;
          });
        }
      } catch (error) {
        console.error('[VESSELS PAGE] Error checking signing authorities:', error);
      }
    };

    checkActiveCaptains();
  }, [allVessels, user?.id, currentUserProfile?.role, currentUserProfile?.activeVesselId, supabase]);

  // Search vessels when search term changes
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

  // Check if user is admin
  const isAdmin = useMemo(() => {
    return currentUserProfile?.role === 'admin';
  }, [currentUserProfile?.role]);

  // Filter vessels to only show ones the user has logged time on (except for admins who see all, and captains who also see vessels with requests)
  // Sort to show current vessel first
  const vessels = useMemo(() => {
    if (!allVessels) {
      console.log('[VESSELS PAGE] No allVessels yet');
      return [];
    }
    
    console.log('[VESSELS PAGE] Filtering vessels:', {
      isAdmin,
      isCaptain,
      allVesselsCount: allVessels.length,
      vesselStateLogsSize: vesselStateLogs.size,
      captaincyRequestsSize: captaincyRequests.size,
      role: currentUserProfile?.role
    });
    
    let filtered: Vessel[];
    if (isAdmin) {
      // Admins see all vessels
      console.log('[VESSELS PAGE] Admin user - showing all vessels:', allVessels.length);
      filtered = allVessels;
    } else if (isCaptain) {
      // Captains: show vessels with logged days OR vessels with captaincy requests
      filtered = allVessels.filter(vessel => {
        const logs = vesselStateLogs.get(vessel.id) || [];
        const hasLogs = logs.length > 0;
        const hasRequest = captaincyRequests.has(vessel.id);
        return hasLogs || hasRequest;
      });
      console.log('[VESSELS PAGE] Captain - filtered to vessels with logs or requests:', filtered.length);
    } else {
      // Other roles: only show vessels with logged days
      filtered = allVessels.filter(vessel => {
        const logs = vesselStateLogs.get(vessel.id) || [];
        return logs.length > 0;
      });
      console.log('[VESSELS PAGE] Non-admin/captain - filtered to vessels with logs:', filtered.length);
    }
    
    // Sort to show current/active vessel at the top
    const sorted = filtered.sort((a, b) => {
      const aIsCurrent = currentUserProfile?.activeVesselId === a.id;
      const bIsCurrent = currentUserProfile?.activeVesselId === b.id;
      
      // Current vessel should come first
      if (aIsCurrent && !bIsCurrent) return -1;
      if (!aIsCurrent && bIsCurrent) return 1;
      
      // If both are current or both are not, maintain original order (most recent first based on created_at)
      return 0;
    });
    
    console.log('[VESSELS PAGE] Final vessels count:', sorted.length);
    
    // Debug: Log vessels with captaincy requests
    if (isCaptain && captaincyRequests.size > 0) {
      console.log('[VESSELS PAGE] Vessels with captaincy requests:', Array.from(captaincyRequests.keys()));
      console.log('[VESSELS PAGE] Filtered vessels IDs:', sorted.map(v => v.id));
      
      // Check if any vessels with requests are missing from filtered list
      for (const [vesselId, request] of captaincyRequests.entries()) {
        const vesselInFiltered = sorted.some(v => v.id === vesselId);
        if (!vesselInFiltered) {
          const vesselInAll = allVessels?.some(v => v.id === vesselId);
          console.warn(`[VESSELS PAGE] Vessel ${vesselId} (request status: ${request.status}) not in filtered list. In allVessels: ${vesselInAll}`);
        }
      }
    }
    
    return sorted;
  }, [allVessels, vesselStateLogs, currentUserProfile, isAdmin, isCaptain, captaincyRequests]);

  const filteredVessels = useMemo(() => {
    if (!searchTerm) return vessels;
    return vessels.filter(vessel => 
      vessel.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [vessels, searchTerm]);

  // Create vessel summaries for card view
  const vesselSummaries = useMemo(() => {
    return filteredVessels.map(vessel => {
      const vesselServices = allSeaService.filter(s => s.vesselId === vessel.id);
      const vesselLogs = vesselStateLogs.get(vessel.id) || [];
      
      const totalDays = vesselLogs.length;

      const dayCountByState = vesselLogs.reduce((acc, log) => {
        acc[log.state] = (acc[log.state] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const isCurrent = vessel.id === currentUserProfile?.activeVesselId;

      return {
        ...vessel,
        totalDays,
        tripCount: vesselServices.length,
        dayCountByState,
        isCurrent
      };
    });
  }, [filteredVessels, allSeaService, vesselStateLogs, currentUserProfile]);

  // Count vessels user has logged time on (or all vessels for admins)
  const vesselCount = useMemo(() => {
    if (isAdmin && allVessels) {
      return allVessels.length;
    }
    return vesselStateLogs.size;
  }, [vesselStateLogs, isAdmin, allVessels]);

  // Check vessel limit based on subscription tier
  const hasUnlimitedVessels = useMemo(() => {
    if (!currentUserProfile) return false;
    const tier = currentUserProfile.subscriptionTier?.toLowerCase() || 'free';
    const status = currentUserProfile.subscriptionStatus?.toLowerCase() || 'inactive';
    return (tier === 'premium' || tier === 'pro') && status === 'active';
  }, [currentUserProfile]);

  const vesselLimit = hasUnlimitedVessels ? Infinity : 3;
  const canAddVessel = hasUnlimitedVessels || vesselCount < vesselLimit;

  // Check if user can resume a vessel (only if no active vessel)
  const canResumeVessel = !currentUserProfile?.activeVesselId;

  // Loading state: for admins, only wait for vessels and profile to load (not state logs)
  // For non-admins, wait for state logs to determine which vessels to show
  // For captains, we show vessels with requests even if they don't have logs, so don't wait for logs
  const isLoading = isLoadingVessels || isLoadingProfile || 
    (!isAdmin && !isCaptain && allVessels && allVessels.length > 0 && vesselStateLogs.size === 0);
  
  console.log('[VESSELS PAGE] Loading state:', {
    isLoading,
    isLoadingVessels,
    isLoadingProfile,
    isAdmin,
    isCaptain,
    allVesselsLength: allVessels?.length,
    vesselStateLogsSize: vesselStateLogs.size,
    vesselsLength: vessels?.length,
    filteredVesselsLength: filteredVessels?.length
  });
  

  // Handler to resume a past vessel
  const handleResumeVessel = useCallback(async (vesselId: string) => {
    if (!user?.id || !currentUserProfile) return;
    
    setResumingVesselId(vesselId);
    try {
      await updateUserProfile(supabase, user.id, {
        activeVesselId: vesselId,
      });
      
      toast({
        title: 'Vessel Resumed',
        description: 'This vessel is now your active vessel. You can start logging new service.',
      });
      
      router.refresh();
    } catch (error: any) {
      console.error('Error resuming vessel:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to resume vessel. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setResumingVesselId(null);
    }
  }, [user?.id, currentUserProfile, supabase, toast, router]);

  // Handler to delete vessel data
  const handleDeleteVessel = useCallback(async (vesselId: string, vesselName: string) => {
    if (!user?.id) return;
    
    setIsDeleting(true);
    try {
      // Delete all state logs for this user and vessel
      await deleteVesselStateLogs(supabase, user.id, vesselId);
      
      // If this is the active vessel, clear the activeVesselId
      if (currentUserProfile?.activeVesselId === vesselId) {
        await updateUserProfile(supabase, user.id, {
          activeVesselId: null,
        });
      }

      toast({
        title: 'Vessel Data Deleted',
        description: `All data for "${vesselName}" has been permanently deleted.`,
      });

      // Refresh the data
      if (allVessels && vessels.length > 0) {
        const newLogs = new Map<string, StateLog[]>();
        const serviceRecords: SeaServiceRecord[] = [];
        
        await Promise.all(allVessels.map(async (vessel) => {
          const [logs, seaService] = await Promise.all([
            getVesselStateLogs(supabase, vessel.id, user.id),
            getVesselSeaService(supabase, user.id, vessel.id)
          ]);
          
          if (logs && logs.length > 0) {
            newLogs.set(vessel.id, logs);
          }
          if (seaService && seaService.length > 0) {
            serviceRecords.push(...seaService);
          }
        }));

        setVesselStateLogs(newLogs);
        setAllSeaService(serviceRecords);
      }
    } catch (error: any) {
      console.error('Error deleting vessel data:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete vessel data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setVesselToDelete(null);
    }
  }, [user?.id, currentUserProfile, supabase, toast, allVessels, vessels, vesselStateLogs]);

  // Handler to add past vessel
  const handleAddPastVessel = useCallback(async (data: PastVesselFormValues) => {
    if (!user?.id || !allVessels) return;

    setIsSavingPastVessel(true);

    try {
      const startDate = startOfDay(data.startDate);
      const endDate = endOfDay(data.endDate);

      // Check for overlapping dates with other vessels
      const newDateRange = eachDayOfInterval({ start: startDate, end: endDate });
      const newDatesSet = new Set(newDateRange.map(d => format(d, 'yyyy-MM-dd')));
      
      // Check each vessel for overlaps
      for (const vessel of allVessels) {
        if (vessel.id === data.vesselId) continue; // Skip the vessel we're adding to
        
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
          setIsSavingPastVessel(false);
          return;
        }
      }

      // Create state logs for all dates from start to end
      const dateRange = eachDayOfInterval({ start: startDate, end: endDate });
      const logs = dateRange.map(day => ({
        date: format(day, 'yyyy-MM-dd'),
        state: data.initialState,
      }));
      
      await updateStateLogsBatch(supabase, user.id, data.vesselId, logs);
      
      toast({ 
        title: 'Past Vessel Added', 
        description: `Successfully logged ${logs.length} day(s) from ${format(startDate, 'PPP')} to ${format(endDate, 'PPP')}.` 
      });
      
      // Refresh data
      const newLogs = new Map<string, StateLog[]>();
      const serviceRecords: SeaServiceRecord[] = [];
      
      await Promise.all(allVessels.map(async (vessel) => {
        const [logs, seaService] = await Promise.all([
          getVesselStateLogs(supabase, vessel.id, user.id),
          getVesselSeaService(supabase, user.id, vessel.id)
        ]);
        
        if (logs && logs.length > 0) {
          newLogs.set(vessel.id, logs);
        }
        if (seaService && seaService.length > 0) {
          serviceRecords.push(...seaService);
        }
      }));

      setVesselStateLogs(newLogs);
      setAllSeaService(serviceRecords);

      // Reset form and close dialog
      pastVesselForm.reset();
      setIsAddPastVesselDialogOpen(false);
    } catch (error: any) {
      console.error('Error adding past vessel:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add past vessel. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingPastVessel(false);
    }
  }, [user?.id, allVessels, supabase, toast, pastVesselForm]);

  // Handler to request captaincy
  const handleRequestCaptaincy = useCallback(async (vesselId: string) => {
    if (!user?.id || !isCaptain) return;
    
    setRequestingCaptaincyVesselId(vesselId);
    setIsRequestingCaptaincy(true);
    
    try {
      // Use API route to bypass RLS and avoid recursion issues
      const response = await fetch('/api/vessel-claim-requests/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vesselId,
          requestedRole: 'captain',
          userId: user.id, // Pass userId from authenticated user
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
        const data = result.request;
        console.log('[CAPTAINCY REQUEST] Successfully created request:', data);
        console.log('[CAPTAINCY REQUEST] Request status:', data.status, 'vesselId:', vesselId);
        toast({
          title: 'Captaincy Request Submitted',
          description: 'Your request for vessel captaincy has been submitted and is pending approval.',
        });
        
        // Update local state immediately with the correct status
        setCaptaincyRequests(prev => {
          const newMap = new Map(prev);
          // Ensure status is lowercase to match our checks
          const status = (data.status || 'pending').toLowerCase();
          newMap.set(vesselId, { id: data.id, status });
          console.log('[CAPTAINCY REQUEST] Updated local state. Map now has:', Array.from(newMap.entries()));
          console.log('[CAPTAINCY REQUEST] For vessel', vesselId, 'status is:', status);
          return newMap;
        });
        
        // Refetch after a brief delay to ensure database is updated
        setTimeout(() => {
          console.log('[CAPTAINCY REQUEST] Refetching requests after creation...');
          fetchCaptaincyRequests();
        }, 300);
      }
    } catch (error: any) {
      console.error('Error requesting captaincy:', error);
      console.error('Error details:', {
        message: error.message,
        error,
      });
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit captaincy request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsRequestingCaptaincy(false);
      setRequestingCaptaincyVesselId(null);
    }
  }, [user?.id, isCaptain, toast, fetchCaptaincyRequests]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">My Vessels</h1>
            <p className="text-muted-foreground">
              Manage your vessels, view history, and track your service time.
            </p>
                </div>
          <div className="flex flex-wrap items-center gap-2">
            <Dialog open={isAddPastVesselDialogOpen} onOpenChange={(open) => {
              setIsAddPastVesselDialogOpen(open);
              if (!open) {
                setVesselSearchTerm('');
                setIsVesselSearchOpen(false);
              }
            }}>
              <DialogTrigger asChild>
                <Button className="rounded-xl">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Vessel Service
                </Button>
              </DialogTrigger>
            </Dialog>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Filter vessels..."
              className="pl-8 rounded-xl"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            <Button 
              variant={layout === 'table' ? 'secondary' : 'ghost'} 
              size="icon" 
              onClick={() => setLayout('table')} 
              className="h-8 w-8 rounded-xl"
            >
              <List className="h-4 w-4"/>
            </Button>
            <Button 
              variant={layout === 'card' ? 'secondary' : 'ghost'} 
              size="icon" 
              onClick={() => setLayout('card')} 
              className="h-8 w-8 rounded-xl"
            >
              <LayoutGrid className="h-4 w-4"/>
            </Button>
          </div>
        </div>
        <Separator />
      </div>

      {isLoading ? (
        layout === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => <VesselSummarySkeleton key={i} />)}
          </div>
        ) : (
          <Card className="rounded-xl border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]"></TableHead>
                      <TableHead>Vessel Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Official Number</TableHead>
                      <TableHead>Total Days Logged</TableHead>
                      <TableHead>Status</TableHead>
                      {isCaptain && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">
                        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )
      ) : (() => {
        console.log('[VESSELS PAGE RENDER] filteredVessels.length:', filteredVessels.length, 'filteredVessels:', filteredVessels);
        console.log('[VESSELS PAGE RENDER] isLoading:', isLoading, 'isLoadingVessels:', isLoadingVessels, 'isLoadingProfile:', isLoadingProfile);
        return filteredVessels.length > 0;
      })() ? (
        layout === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vesselSummaries.map(vessel => (
              <VesselSummaryCard 
                key={vessel.id} 
                vesselSummary={vessel}
                onResumeService={handleResumeVessel}
                showResumeButton={!isAdmin && !vessel.isCurrent && canResumeVessel}
                isResuming={resumingVesselId === vessel.id}
                onDelete={(vesselId, vesselName) => setVesselToDelete({ id: vesselId, name: vesselName })}
                showDeleteButton={true}
              />
            ))}
          </div>
        ) : (
      <Card className="rounded-xl border dark:shadow-md transition-shadow dark:hover:shadow-lg">
        <CardContent className="p-0">
                <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                                <TableHead className="w-[50px]"></TableHead>
                        <TableHead>Vessel Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Official Number</TableHead>
                                <TableHead>Total Days Logged</TableHead>
                        <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                    {(() => {
                      console.log('[VESSELS TABLE RENDER] About to map filteredVessels. Length:', filteredVessels.length);
                      console.log('[VESSELS TABLE RENDER] filteredVessels:', filteredVessels);
                      return filteredVessels.map((vessel) => {
                        console.log('[VESSELS TABLE RENDER] Mapping vessel:', vessel.id, vessel.name);
                            const isCurrent = currentUserProfile?.activeVesselId === vessel.id;
                                const logs = vesselStateLogs.get(vessel.id) || [];
                                const totalDays = logs.length;
                                const isExpanded = expandedVesselId === vessel.id;
                                const vesselRaw = allVessels?.find(v => v.id === vessel.id);
                      const vesselData = vesselRaw as any;
                      const request = captaincyRequests.get(vessel.id);
                      // Normalize status to lowercase for comparison (handle both string and null/undefined)
                      const requestStatus = request?.status ? String(request.status).toLowerCase().trim() : null;
                      const hasPendingRequest = requestStatus === 'pending';
                      const hasApprovedRequest = requestStatus === 'approved';
                      const hasRejectedRequest = requestStatus === 'rejected';
                      
                      // For vessel role users, check if vessel has an active signing authority (approved captain)
                      const isVesselRole = currentUserProfile?.role === 'vessel';
                      const hasActiveCaptain = isVesselRole ? vesselSigningAuthorities.get(vessel.id) || false : false;
                      
                      // Debug logging for captains - always log to help debug
                      if (isCaptain) {
                        console.log('[VESSEL ROW]', {
                          vesselName: vessel.name,
                          vesselId: vessel.id,
                          request: request,
                          requestStatus: requestStatus,
                          hasPendingRequest,
                          hasApprovedRequest,
                          hasRejectedRequest,
                          isCaptain: isCaptain,
                          allRequestsKeys: Array.from(captaincyRequests.keys()),
                          allRequestsEntries: Array.from(captaincyRequests.entries()),
                          requestForThisVessel: captaincyRequests.get(vessel.id)
                        });
                        
                        // Log specifically for the vessel with the approved request
                        if (vessel.id === '29b6fa31-08ed-41e1-81b9-999e59926a31') {
                          console.log('[VESSEL ROW DEBUG] Vessel with approved request:', {
                            vesselId: vessel.id,
                            vesselName: vessel.name,
                            requestFromMap: captaincyRequests.get(vessel.id),
                            requestStatus: requestStatus,
                            hasApprovedRequest,
                            willRenderBadge: isCaptain && hasApprovedRequest
                          });
                        }
                      }

                            return (
                                    <React.Fragment key={vessel.id}>
                                        <TableRow 
                                            className="hover:bg-muted/30 transition-colors cursor-pointer"
                                            onClick={() => setExpandedVesselId(isExpanded ? null : vessel.id)}
                                        >
                                            <TableCell className="w-[50px]">
                                                <ChevronDown 
                                                    className={cn(
                                                        "h-4 w-4 text-muted-foreground transition-transform duration-200",
                                                        isExpanded && "rotate-180"
                                                    )}
                                                />
                                            </TableCell>
                                    <TableCell className="font-medium">
                                                {vessel.name}
                                    </TableCell>
                                    <TableCell>
                                                <Badge variant="outline" className="font-normal">
                                        {vesselTypes.find(t => t.value === vessel.type)?.label || vessel.type}
                                                </Badge>
                                    </TableCell>
                                            <TableCell className="text-muted-foreground">{vessel.officialNumber || '—'}</TableCell>
                                            <TableCell className="font-medium">{totalDays || (isCaptain && request ? '0' : '—')}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-col gap-1">
                                          {(() => {
                                            // For vessel role: if active vessel and has approved captain, show "Active Captain"
                                            // For captain role: if active vessel and has approved request, show "Active Captain"
                                            if (isCurrent && ((isVesselRole && hasActiveCaptain) || (isCaptain && hasApprovedRequest))) {
                                              return (
                                                <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white border-0 w-fit">
                                                  <ShieldCheck className="mr-1 h-3 w-3" />
                                                  Active Captain
                                                </Badge>
                                              );
                                            }
                                            
                                            // Regular active status (no approved captain)
                                            if (isCurrent) {
                                              return (
                                                <Badge variant="default" className="bg-green-500/10 text-green-700 border-green-500/20 dark:bg-green-500/20 dark:text-green-400 w-fit">
                                                  Active
                                                </Badge>
                                              );
                                            }
                                            
                                            // Past status (no request)
                                            if (!request) {
                                              return (
                                                <Badge variant="secondary" className="font-normal w-fit">
                                                  Past
                                                </Badge>
                                              );
                                            }
                                            
                                            return null;
                                          })()}
                                          
                                          {/* Captain-specific request statuses */}
                                          {isCaptain && hasPendingRequest && (
                                            <Badge variant="secondary" className="text-xs w-fit">
                                              <ShieldCheck className="mr-1 h-3 w-3" />
                                              Request Pending
                                            </Badge>
                                          )}
                                          {isCaptain && hasApprovedRequest && !isCurrent && (
                                            // Only show "Captaincy Approved" if vessel is NOT active (to avoid duplicate with "Active Captain")
                                            <Badge variant="default" className="text-xs w-fit bg-green-600 hover:bg-green-700 text-white border-0">
                                              <ShieldCheck className="mr-1 h-3 w-3" />
                                              Captaincy Approved
                                            </Badge>
                                          )}
                                          {isCaptain && hasRejectedRequest && (
                                            <Badge variant="destructive" className="text-xs w-fit">
                                              <ShieldCheck className="mr-1 h-3 w-3" />
                                              Request Rejected
                                            </Badge>
                                          )}
                                          
                                          {/* Vessel role: show if vessel has active captain but vessel is not current */}
                                          {isVesselRole && !isCurrent && hasActiveCaptain && (
                                            <Badge variant="default" className="text-xs w-fit bg-blue-600 hover:bg-blue-700 text-white border-0">
                                              <ShieldCheck className="mr-1 h-3 w-3" />
                                              Has Active Captain
                                            </Badge>
                                          )}
                                        </div>
                                    </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-2">
                                {!isAdmin && !isCurrent && canResumeVessel && !request && (
                                  <Button
                                    onClick={() => handleResumeVessel(vessel.id)}
                                    disabled={resumingVesselId === vessel.id}
                                    variant="outline"
                                    size="sm"
                                    className="rounded-lg"
                                  >
                                    {resumingVesselId === vessel.id ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Resuming...
                                      </>
                                    ) : (
                                      <>
                                        <PlayCircle className="mr-2 h-4 w-4" />
                                        Resume
                                      </>
                                    )}
                                  </Button>
                                )}
                                {!isAdmin && isCaptain && !hasPendingRequest && !hasApprovedRequest && !hasRejectedRequest && (
                                  <Button
                                    onClick={() => handleRequestCaptaincy(vessel.id)}
                                    disabled={isRequestingCaptaincy && requestingCaptaincyVesselId === vessel.id}
                                    variant="outline"
                                    size="sm"
                                    className="rounded-lg"
                                    title="Request captaincy for this vessel"
                                  >
                                    {isRequestingCaptaincy && requestingCaptaincyVesselId === vessel.id ? (
                                      <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Requesting...
                                      </>
                                    ) : (
                                      <>
                                        <ShieldCheck className="mr-2 h-4 w-4" />
                                        Request Captaincy
                                      </>
                                    )}
                                  </Button>
                                )}
                                <Button
                                  onClick={() => setVesselToDelete({ id: vessel.id, name: vessel.name })}
                                  disabled={isDeleting}
                                  variant="destructive"
                                  size="sm"
                                  className="rounded-xl"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                                        </TableRow>
                                        {isExpanded && (
                                            <TableRow>
                              <TableCell colSpan={7} className="bg-background/40 p-0">
                                                    <div className="px-6 py-6">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                                            {/* Identification Section */}
                                                            <div className="space-y-4 pr-4 md:pr-6">
                                                                <h4 className="text-sm font-semibold text-foreground">Identification</h4>
                                                                <div className="space-y-3">
                                                                    <div className="flex justify-between items-center py-1">
                                                                        <span className="text-sm text-muted-foreground">IMO Number</span>
                                                                        <span className="text-sm font-medium">{vessel.officialNumber || vesselData?.imo || '—'}</span>
                                                                    </div>
                                                                    <div className="flex justify-between items-center py-1">
                                                                        <span className="text-sm text-muted-foreground">MMSI</span>
                                                                        <span className="text-sm font-medium">{vesselData?.mmsi || '—'}</span>
                                                                    </div>
                                                                    {vesselData?.call_sign && (
                                                                        <div className="flex justify-between items-center py-1">
                                                                            <span className="text-sm text-muted-foreground">Call Sign</span>
                                                                            <span className="text-sm font-medium">{vesselData.call_sign}</span>
                                                                        </div>
                                                                    )}
                                                                    {vesselData?.flag && (
                                                                        <div className="flex justify-between items-center py-1">
                                                                            <span className="text-sm text-muted-foreground">Flag</span>
                                                                            <span className="text-sm font-medium">{vesselData.flag}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Dimensions Section */}
                                                            <div className="space-y-4 pl-0 md:pl-4 md:border-l border-border/50 pr-4 md:pr-6 lg:pr-8">
                                                                <h4 className="text-sm font-semibold text-foreground">Dimensions</h4>
                                                                <div className="space-y-3">
                                                                    <div className="flex justify-between items-center py-1">
                                                                        <span className="text-sm text-muted-foreground">Length</span>
                                                                        <span className="text-sm font-medium">
                                                                            {vesselData?.length_m
                                                                                ? `${vesselData.length_m} m`
                                                                                : '—'}
                                                                        </span>
                                                                    </div>
                                                                    {vesselData?.beam && (
                                                                        <div className="flex justify-between items-center py-1">
                                                                            <span className="text-sm text-muted-foreground">Beam</span>
                                                                            <span className="text-sm font-medium">{vesselData.beam} m</span>
                                                                        </div>
                                                                    )}
                                                                    {vesselData?.draft && (
                                                                        <div className="flex justify-between items-center py-1">
                                                                            <span className="text-sm text-muted-foreground">Draft</span>
                                                                            <span className="text-sm font-medium">{vesselData.draft} m</span>
                                                                        </div>
                                                                    )}
                                                                    <div className="flex justify-between items-center py-1">
                                                                        <span className="text-sm text-muted-foreground">Gross Tonnage</span>
                                                                        <span className="text-sm font-medium">
                                                                            {vesselData?.gross_tonnage || vesselData?.grossTonnage 
                                                                                ? `${vesselData?.gross_tonnage || vesselData?.grossTonnage} GT`
                                                                                : '—'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Vessel Information Section */}
                                                            <div className="space-y-4 pl-0 md:pl-4 md:border-l border-border/50">
                                                                <h4 className="text-sm font-semibold text-foreground">Information</h4>
                                                                <div className="space-y-3">
                                                                    <div className="flex justify-between items-center py-1">
                                                                        <span className="text-sm text-muted-foreground">Vessel Type</span>
                                                                        <span className="text-sm font-medium">
                                                                            {vesselTypes.find(t => t.value === vessel.type)?.label || vessel.type}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between items-center py-1">
                                                                        <span className="text-sm text-muted-foreground">Added to System</span>
                                                                        <span className="text-sm font-medium">
                                                                            {vesselData?.created_at 
                                                                                ? format(new Date(vesselData.created_at), 'MMM d, yyyy')
                                                                                : '—'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                    </TableCell>
                                </TableRow>
                                        )}
                                    </React.Fragment>
                      );
                    });
                    })()}
                    </TableBody>
                </Table>
                </div>
            </CardContent>
        </Card>
        )
      ) : (
        <Card className="rounded-xl border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Ship className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No Vessels Found</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {searchTerm 
                ? `No vessels match "${searchTerm}". Try adjusting your search.`
                : isAdmin
                  ? "No vessels found in the system."
                  : "You haven't logged any vessel time yet. Start by adding a vessel and logging your first service."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Add Past Vessel Dialog */}
      <Dialog open={isAddPastVesselDialogOpen} onOpenChange={(open) => {
        setIsAddPastVesselDialogOpen(open);
        if (!open) {
          setVesselSearchTerm('');
          setIsVesselSearchOpen(false);
        }
      }}>
        <DialogContent className="sm:max-w-[600px] rounded-xl">
          <DialogHeader>
            <DialogTitle>Add Vessel Service</DialogTitle>
            <DialogDescription>
              Add vessel service by selecting a vessel, dates, and initial state. Leave end date empty for active service.
            </DialogDescription>
          </DialogHeader>
          <Form {...pastVesselForm}>
            <form onSubmit={pastVesselForm.handleSubmit(handleAddPastVessel)} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <FormField
                    control={pastVesselForm.control}
                    name="vesselId"
                    render={({ field }) => {
                      const selectedVessel = allVessels?.find(v => v.id === field.value);
                      return (
                        <FormItem>
                          <FormLabel>Vessel</FormLabel>
                          <FormControl>
                            <Popover open={isVesselSearchOpen} onOpenChange={setIsVesselSearchOpen}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  className={cn(
                                    "w-full justify-between rounded-lg",
                                    !field.value && "text-muted-foreground"
                                  )}
                                  disabled={isLoadingVessels}
                                >
                                  {field.value
                                    ? selectedVessel?.name || "Select vessel..."
                                    : "Search for a vessel..."}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                                <div className="p-2 border-b bg-muted/30">
                                  <Input
                                    placeholder="Search vessels..."
                                    value={vesselSearchTerm}
                                    onChange={(e) => {
                                      setVesselSearchTerm(e.target.value);
                                      setIsVesselSearchOpen(true);
                                    }}
                                    className="h-9 bg-background"
                                    autoFocus
                                  />
                                </div>
                                <div className="max-h-[300px] overflow-y-auto">
                                  {isSearchingVessels ? (
                                    <div className="px-2 py-6 text-center text-sm text-muted-foreground">
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
                                        className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            field.value === vessel.id ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        <div className="flex-1">
                                          <div className="font-medium">{vessel.name}</div>
                                          {vessel.type && (
                                            <div className="text-xs text-muted-foreground">{vessel.type}</div>
                                          )}
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
                                        <PlusCircle className="mr-2 h-4 w-4 text-primary" />
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
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                  <FormField
                    control={pastVesselForm.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Start Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal rounded-lg",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a start date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date > new Date()}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={pastVesselForm.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>End Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal rounded-lg",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick an end date</span>
                                )}
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
                                if (date > new Date()) return true;
                                const startDate = pastVesselForm.getValues('startDate');
                                return startDate ? date < startDate : false;
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="space-y-6">
                  <FormField
                    control={pastVesselForm.control}
                    name="initialState"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel>Initial State</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="flex flex-col space-y-3"
                          >
                            {vesselStates.map((state) => (
                              <div key={state.value} className="flex items-center space-x-3 space-y-0">
                                <RadioGroupItem value={state.value} id={state.value} className="rounded-lg" />
                                <label
                                  htmlFor={state.value}
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                  {state.label}
                                </label>
                              </div>
                            ))}
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              <DialogFooter className="pt-4 gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="ghost" className="rounded-xl">Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={isSavingPastVessel} className="rounded-lg">
                  {isSavingPastVessel && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Past Vessel
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Add Vessel Dialog (from search) */}
      <Dialog open={isAddVesselDialogOpen} onOpenChange={setIsAddVesselDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-xl">
          <DialogHeader>
            <DialogTitle>Create New Vessel</DialogTitle>
            <DialogDescription>
              Create a new vessel to add to your service history.
            </DialogDescription>
          </DialogHeader>
          <Form {...addVesselForm}>
            <form onSubmit={addVesselForm.handleSubmit(handleCreateVesselFromSearch)} className="space-y-4 py-4">
              <FormField
                control={addVesselForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vessel Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., M/Y Odyssey" {...field} className="rounded-lg" />
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
                      <Input placeholder="e.g., IMO 1234567" {...field} className="rounded-lg" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="pt-4 gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setIsAddVesselDialogOpen(false);
                    addVesselForm.reset();
                  }}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSavingVessel} className="rounded-xl">
                  {isSavingVessel && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Vessel
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!vesselToDelete} onOpenChange={(open) => !open && setVesselToDelete(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vessel Data?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete all data for <strong>{vesselToDelete?.name}</strong>? This action cannot be undone and will remove all logged days and states for this vessel.
              {vesselToDelete && currentUserProfile?.activeVesselId === vesselToDelete.id && (
                <span className="block mt-2 text-destructive font-medium">
                  Warning: This is your currently active vessel. Deleting it will also clear your active vessel status.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => vesselToDelete && handleDeleteVessel(vesselToDelete.id, vesselToDelete.name)}
              disabled={isDeleting}
              className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Permanently
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
    