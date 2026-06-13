'use client';

import { useState, useMemo, useEffect } from 'react';
import { format, parse, differenceInDays, isAfter, isBefore, startOfDay, isSameDay, eachDayOfInterval, getYear, getMonth, getDate, setYear, setMonth, setDate, isValid } from 'date-fns';
import { 
  Ship, 
  Loader2, 
  Plus,
  Trash2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { getVesselAssignments, createVesselAssignment, updateVesselAssignment, updateUserProfile, deleteVesselStateLogs, getVesselStateLogs } from '@/supabase/database/queries';
import type { Vessel, VesselAssignment, UserProfile } from '@/lib/types';
import { UnifiedVesselSearchPicker } from '@/components/dashboard/unified-vessel-search-picker';
import { VesselHistoryCard } from '@/components/dashboard/vessel-history-card';
import { useToast } from '@/hooks/use-toast';

export default function VesselHistoryPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();
  
  const [assignments, setAssignments] = useState<VesselAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<VesselAssignment | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState<VesselAssignment | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResuming, setIsResuming] = useState<string | null>(null); // Track which assignment is being resumed
  
  // Form state for adding new assignment
  const [newAssignmentVesselId, setNewAssignmentVesselId] = useState<string>('');
  const [newAssignmentStartDate, setNewAssignmentStartDate] = useState<string>('');
  const [newAssignmentEndDate, setNewAssignmentEndDate] = useState<string>('');
  const [newAssignmentPosition, setNewAssignmentPosition] = useState<string>('');
  
  // Separate date inputs for start date
  const [startYear, setStartYear] = useState<string>('');
  const [startMonth, setStartMonth] = useState<string>('');
  const [startDay, setStartDay] = useState<string>('');
  
  // Separate date inputs for end date
  const [endYear, setEndYear] = useState<string>('');
  const [endMonth, setEndMonth] = useState<string>('');
  const [endDay, setEndDay] = useState<string>('');
  
  // Separate date inputs for edit start date
  const [editStartYear, setEditStartYear] = useState<string>('');
  const [editStartMonth, setEditStartMonth] = useState<string>('');
  const [editStartDay, setEditStartDay] = useState<string>('');
  
  // Separate date inputs for edit end date
  const [editEndYear, setEditEndYear] = useState<string>('');
  const [editEndMonth, setEditEndMonth] = useState<string>('');
  const [editEndDay, setEditEndDay] = useState<string>('');
  
  // Form state for editing assignment
  const [editStartDate, setEditStartDate] = useState<string>('');
  const [editEndDate, setEditEndDate] = useState<string>('');
  const [editPosition, setEditPosition] = useState<string>('');

  // Fetch user profile
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    const activeVesselId = (userProfileRaw as any).active_vessel_id || (userProfileRaw as any).activeVesselId;
    const position = (userProfileRaw as any).position || (userProfileRaw as any).position || undefined;
    const role = (userProfileRaw as any).role || 'crew';
    return {
      ...userProfileRaw,
      activeVesselId: activeVesselId || undefined,
      position: position,
      role: role,
    } as UserProfile;
  }, [userProfileRaw]);

  // Check if user is a crew member (not vessel account)
  const isCrewMember = useMemo(() => {
    return userProfile?.role !== 'vessel';
  }, [userProfile?.role]);

  // Fetch all vessels
  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
    user?.id ? 'vessels' : null,
    user?.id ? { orderBy: 'name', ascending: true } : undefined
  );

  // Create vessel map for quick lookup
  const vesselMap = useMemo(() => {
    const map = new Map<string, Vessel>();
    vessels?.forEach(vessel => {
      map.set(vessel.id, vessel);
    });
    return map;
  }, [vessels]);

  // Fetch vessel assignments
  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    const fetchAssignments = async () => {
      setIsLoading(true);
      try {
        const assignmentsData = await getVesselAssignments(supabase, user.id);
        setAssignments(assignmentsData);
      } catch (error) {
        console.error('[VESSEL HISTORY] Error fetching assignments:', error);
        setAssignments([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAssignments();
  }, [user?.id, supabase]);

  // Calculate duration for each assignment
  const getAssignmentDuration = (assignment: VesselAssignment): number => {
    const start = parse(assignment.startDate, 'yyyy-MM-dd', new Date());
    const end = assignment.endDate 
      ? parse(assignment.endDate, 'yyyy-MM-dd', new Date())
      : new Date();
    return differenceInDays(end, start) + 1;
  };

  // Check if assignment is active
  const isActiveAssignment = (assignment: VesselAssignment): boolean => {
    return !assignment.endDate;
  };

  // Group assignments by vessel (showing most recent first per vessel)
  const groupedAssignments = useMemo(() => {
    const groups = new Map<string, VesselAssignment[]>();
    
    assignments.forEach(assignment => {
      const existing = groups.get(assignment.vesselId) || [];
      existing.push(assignment);
      groups.set(assignment.vesselId, existing);
    });

    // Sort assignments within each group by start date (most recent first)
    groups.forEach((groupAssignments, vesselId) => {
      groupAssignments.sort((a, b) => {
        const dateA = parse(a.startDate, 'yyyy-MM-dd', new Date());
        const dateB = parse(b.startDate, 'yyyy-MM-dd', new Date());
        return dateB.getTime() - dateA.getTime();
      });
    });

    return groups;
  }, [assignments]);

  // Sort vessels by most recent assignment date
  const sortedVesselIds = useMemo(() => {
    const vesselAssignments: Array<{ vesselId: string; latestStartDate: Date }> = [];
    
    groupedAssignments.forEach((groupAssignments, vesselId) => {
      const latestAssignment = groupAssignments[0]; // Already sorted, first is most recent
      const latestStartDate = parse(latestAssignment.startDate, 'yyyy-MM-dd', new Date());
      vesselAssignments.push({ vesselId, latestStartDate });
    });

    return vesselAssignments
      .sort((a, b) => b.latestStartDate.getTime() - a.latestStartDate.getTime())
      .map(v => v.vesselId);
  }, [groupedAssignments]);

  // Get all vessels user has been assigned to, plus all available vessels
  const availableVessels = useMemo(() => {
    if (!vessels) return [];
    const assignedVesselIds = new Set(assignments.map(a => a.vesselId));
    // Include all vessels (user might want to add a new assignment to a vessel they haven't been on)
    return vessels;
  }, [vessels, assignments]);

  // Helper to get days in month
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // Helper to build date string from separate inputs
  const buildDateString = (year: string, month: string, day: string): string | null => {
    if (!year || !month || !day) return null;
    const y = parseInt(year);
    const m = parseInt(month);
    const d = parseInt(day);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    
    try {
      const date = new Date(y, m, d);
      if (isValid(date) && getYear(date) === y && getMonth(date) === m && getDate(date) === d) {
        return format(date, 'yyyy-MM-dd');
      }
    } catch (e) {
      return null;
    }
    return null;
  };

  // Handle opening add dialog
  const handleOpenAddDialog = () => {
    setNewAssignmentVesselId('');
    setNewAssignmentStartDate('');
    setNewAssignmentEndDate('');
    // Auto-fill position with user's current position
    setNewAssignmentPosition(userProfile?.position || '');
    setStartYear('');
    setStartMonth('');
    setStartDay('');
    setEndYear('');
    setEndMonth('');
    setEndDay('');
    setIsAddDialogOpen(true);
  };

  // Handle opening edit dialog
  const handleOpenEditDialog = (assignment: VesselAssignment) => {
    setEditingAssignment(assignment);
    setEditStartDate(assignment.startDate);
    setEditEndDate(assignment.endDate || '');
    // Use assignment position if available, otherwise fall back to user's current position
    setEditPosition(assignment.position || userProfile?.position || '');
    
    // Parse start date into separate inputs
    const startDate = parse(assignment.startDate, 'yyyy-MM-dd', new Date());
    setEditStartYear(getYear(startDate).toString());
    setEditStartMonth(getMonth(startDate).toString());
    setEditStartDay(getDate(startDate).toString());
    
    // Parse end date into separate inputs if it exists
    if (assignment.endDate) {
      const endDate = parse(assignment.endDate, 'yyyy-MM-dd', new Date());
      setEditEndYear(getYear(endDate).toString());
      setEditEndMonth(getMonth(endDate).toString());
      setEditEndDay(getDate(endDate).toString());
    } else {
      setEditEndYear('');
      setEditEndMonth('');
      setEditEndDay('');
    }
    
    setIsEditDialogOpen(true);
  };

  // Handle closing dialogs
  const handleCloseAddDialog = () => {
    setIsAddDialogOpen(false);
    setNewAssignmentVesselId('');
    setNewAssignmentStartDate('');
    setNewAssignmentEndDate('');
    setNewAssignmentPosition('');
    setStartYear('');
    setStartMonth('');
    setStartDay('');
    setEndYear('');
    setEndMonth('');
    setEndDay('');
  };

  const handleCloseEditDialog = () => {
    setIsEditDialogOpen(false);
    setEditingAssignment(null);
    setEditStartDate('');
    setEditEndDate('');
    setEditPosition('');
    setEditStartYear('');
    setEditStartMonth('');
    setEditStartDay('');
    setEditEndYear('');
    setEditEndMonth('');
    setEditEndDay('');
  };

  // Handle opening delete dialog
  const handleOpenDeleteDialog = (assignment: VesselAssignment) => {
    // Only allow deleting past assignments (not current ones)
    if (!assignment.endDate) {
      toast({
        title: 'Cannot Delete',
        description: 'You cannot delete a current assignment. Please end the assignment first by setting an end date.',
        variant: 'destructive',
      });
      return;
    }
    setDeletingAssignment(assignment);
    setIsDeleteDialogOpen(true);
  };

  // Handle closing delete dialog
  const handleCloseDeleteDialog = () => {
    setIsDeleteDialogOpen(false);
    setDeletingAssignment(null);
  };

  // Handle deleting assignment
  const handleDeleteAssignment = async () => {
    if (!user?.id || !deletingAssignment) {
      return;
    }

    setIsDeleting(true);
    try {
      // Delete all state logs associated with this assignment first
      // This ensures no orphaned state logs remain that could cause overlap conflicts
      try {
        await deleteVesselStateLogs(supabase, user.id, deletingAssignment.vesselId);
        console.log('[VESSEL HISTORY] Deleted state logs for vessel:', deletingAssignment.vesselId);
      } catch (stateLogError: any) {
        console.warn('[VESSEL HISTORY] Error deleting state logs (continuing with assignment deletion):', stateLogError);
        // Continue with assignment deletion even if state log deletion fails
      }

      // Delete the assignment from the database
      const { error } = await supabase
        .from('vessel_assignments')
        .delete()
        .eq('id', deletingAssignment.id)
        .eq('user_id', user.id);

      if (error) throw error;

      const vessel = vesselMap.get(deletingAssignment.vesselId);
      toast({
        title: 'Assignment Deleted',
        description: `Vessel assignment and all associated state logs for "${vessel?.name || 'Unknown Vessel'}" have been successfully removed.`,
      });

      // Refresh assignments
      const assignmentsData = await getVesselAssignments(supabase, user.id);
      setAssignments(assignmentsData);
      handleCloseDeleteDialog();
    } catch (error: any) {
      console.error('[VESSEL HISTORY] Error deleting assignment:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete assignment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Validate date ranges don't overlap with existing assignments or state logs
  // Database uses '[)' range (start inclusive, end exclusive), allowing same-day changeovers
  // Two ranges [a, b) and [c, d) overlap if: a < d AND c < b
  const checkDateOverlap = async (startDate: Date, endDate: Date | null, excludeAssignmentId?: string, excludeVesselId?: string): Promise<{ overlaps: boolean; vesselName?: string; startDate?: string; endDate?: string }> => {
    // Normalize dates to start of day for comparison
    const newStart = startOfDay(startDate);
    // Use far future date if no end date (ongoing assignment)
    const newEnd = endDate ? startOfDay(endDate) : new Date('2099-12-31');
    
    // Check assignments first
    for (const assignment of assignments) {
      // Skip the assignment being edited
      if (excludeAssignmentId && assignment.id === excludeAssignmentId) continue;
      
      const assignmentStart = startOfDay(parse(assignment.startDate, 'yyyy-MM-dd', new Date()));
      // Use far future date if no end date (ongoing assignment)
      const assignmentEnd = assignment.endDate 
        ? startOfDay(parse(assignment.endDate, 'yyyy-MM-dd', new Date()))
        : new Date('2099-12-31');
      
      // Check if date ranges overlap using exclusive end date logic: [start, end)
      // Ranges [a, b) and [c, d) overlap if: a < d AND c < b
      // This allows same-day changeovers (e.g., end A on 2025-01-10, start B on 2025-01-10)
      if (isBefore(newStart, assignmentEnd) && isBefore(assignmentStart, newEnd)) {
        const vessel = vesselMap.get(assignment.vesselId);
        const assignmentEndDisplay = assignment.endDate 
          ? format(parse(assignment.endDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')
          : 'ongoing';
        return { 
          overlaps: true, 
          vesselName: vessel?.name || 'Unknown Vessel',
          startDate: format(assignmentStart, 'MMM d, yyyy'),
          endDate: assignmentEndDisplay
        };
      }
    }
    
    // Also check state logs from other vessels to prevent conflicts
    // This ensures we catch cases where an assignment was deleted but state logs remain
    // Note: We can't skip the vessel being added here because we don't know which vessel it is
    // The caller should handle skipping the current vessel if needed
    if (vessels && user?.id) {
      const newDateRange = eachDayOfInterval({ start: newStart, end: newEnd });
      const newDatesSet = new Set(newDateRange.map(d => format(d, 'yyyy-MM-dd')));
      
      for (const vessel of vessels) {
        // Skip the vessel being added/edited (allows updating same vessel)
        if (excludeVesselId && vessel.id === excludeVesselId) continue;
        
        const existingLogs = await getVesselStateLogs(supabase, vessel.id, user.id);
        
        // Check for overlaps with state logs
        const overlappingDates = existingLogs
          .filter(log => {
            // Handle both 'date' and 'logDate' field names for compatibility
            const logDate = (log as any).date || (log as any).logDate;
            return logDate && newDatesSet.has(logDate);
          })
          .map(log => {
            const logDate = (log as any).date || (log as any).logDate;
            return parse(logDate, 'yyyy-MM-dd', new Date());
          });
        
        if (overlappingDates.length > 0) {
          const vesselName = vessel.name;
          overlappingDates.sort((a, b) => a.getTime() - b.getTime());
          const firstOverlap = format(overlappingDates[0], 'MMM d, yyyy');
          const lastOverlap = format(overlappingDates[overlappingDates.length - 1], 'MMM d, yyyy');
          
          return {
            overlaps: true,
            vesselName: vesselName,
            startDate: firstOverlap,
            endDate: lastOverlap
          };
        }
      }
    }
    
    return { overlaps: false };
  };

  // Handle adding new assignment
  const handleAddAssignment = async () => {
    if (!user?.id || !newAssignmentVesselId || !startYear || !startMonth || !startDay) {
      toast({
        title: 'Missing Information',
        description: 'Please select a vessel and provide a complete start date (year, month, and day).',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      // Build date strings from separate inputs
      const startDateStr = buildDateString(startYear, startMonth, startDay);
      if (!startDateStr) {
        toast({
          title: 'Invalid Date',
          description: 'Please provide a valid start date.',
          variant: 'destructive',
        });
        setIsSaving(false);
        return;
      }
      
      const endDateStr = (endYear && endMonth && endDay) ? buildDateString(endYear, endMonth, endDay) : null;
      if (endYear || endMonth || endDay) {
        if (!endDateStr) {
          toast({
            title: 'Invalid Date',
            description: 'Please provide a valid end date or leave all end date fields empty.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
      }
      
      const startDate = parse(startDateStr, 'yyyy-MM-dd', new Date());
      const endDate = endDateStr ? parse(endDateStr, 'yyyy-MM-dd', new Date()) : null;
      
      // Validate dates
      if (isAfter(startDate, new Date())) {
        toast({
          title: 'Invalid Date',
          description: 'Start date cannot be in the future.',
          variant: 'destructive',
        });
        setIsSaving(false);
        return;
      }

      if (endDate && (isAfter(startDate, endDate) || isSameDay(startDate, endDate))) {
        toast({
          title: 'Invalid Date Range',
          description: 'End date must be after start date.',
          variant: 'destructive',
        });
        setIsSaving(false);
        return;
      }

      // Check for overlaps with other vessel assignments and state logs
      // Exclude the vessel being added to allow updating the same vessel
      const overlapCheck = await checkDateOverlap(startDate, endDate, undefined, newAssignmentVesselId);
      if (overlapCheck.overlaps) {
        const dateRangeText = endDate 
          ? `${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}`
          : `${format(startDate, 'MMM d, yyyy')} - ongoing`;
        const existingRangeText = overlapCheck.endDate === 'ongoing'
          ? `${overlapCheck.startDate} - ongoing`
          : `${overlapCheck.startDate} - ${overlapCheck.endDate}`;
        
        toast({
          title: 'Date Conflict',
          description: `The selected date range (${dateRangeText}) overlaps with your existing assignment on "${overlapCheck.vesselName}" (${existingRangeText}). You cannot be on two vessels at the same time. Please adjust your dates to avoid conflicts.`,
          variant: 'destructive',
        });
        setIsSaving(false);
        return;
      }

      // Create assignment
      await createVesselAssignment(supabase, {
        userId: user.id,
        vesselId: newAssignmentVesselId,
        startDate: startDateStr,
        endDate: endDateStr || null,
        position: newAssignmentPosition || null,
      });

      toast({
        title: 'Assignment Added',
        description: 'Vessel assignment has been successfully added.',
      });

      // Refresh assignments
      const assignmentsData = await getVesselAssignments(supabase, user.id);
      setAssignments(assignmentsData);
      handleCloseAddDialog();
    } catch (error: any) {
      console.error('[VESSEL HISTORY] Error adding assignment:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add assignment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle editing assignment
  const handleEditAssignment = async () => {
    if (!user?.id || !editingAssignment || !editStartYear || !editStartMonth || !editStartDay) {
      toast({
        title: 'Missing Information',
        description: 'Please provide a complete start date (year, month, and day).',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      // Build date strings from separate inputs
      const startDateStr = buildDateString(editStartYear, editStartMonth, editStartDay);
      if (!startDateStr) {
        toast({
          title: 'Invalid Date',
          description: 'Please provide a valid start date.',
          variant: 'destructive',
        });
        setIsSaving(false);
        return;
      }
      
      const endDateStr = (editEndYear && editEndMonth && editEndDay) ? buildDateString(editEndYear, editEndMonth, editEndDay) : null;
      if (editEndYear || editEndMonth || editEndDay) {
        if (!endDateStr) {
          toast({
            title: 'Invalid Date',
            description: 'Please provide a valid end date or leave all end date fields empty.',
            variant: 'destructive',
          });
          setIsSaving(false);
          return;
        }
      }
      
      const startDate = parse(startDateStr, 'yyyy-MM-dd', new Date());
      const endDate = endDateStr ? parse(endDateStr, 'yyyy-MM-dd', new Date()) : null;
      
      // Validate dates
      if (isAfter(startDate, new Date())) {
        toast({
          title: 'Invalid Date',
          description: 'Start date cannot be in the future.',
          variant: 'destructive',
        });
        setIsSaving(false);
        return;
      }

      if (endDate && (isAfter(startDate, endDate) || isSameDay(startDate, endDate))) {
        toast({
          title: 'Invalid Date Range',
          description: 'End date must be after start date.',
          variant: 'destructive',
        });
        setIsSaving(false);
        return;
      }

      // Check for overlaps with other vessel assignments (excluding current assignment)
      // Also exclude the vessel being edited to allow updating dates for the same vessel
      const overlapCheck = await checkDateOverlap(startDate, endDate, editingAssignment.id, editingAssignment.vesselId);
      if (overlapCheck.overlaps) {
        const dateRangeText = endDate 
          ? `${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}`
          : `${format(startDate, 'MMM d, yyyy')} - ongoing`;
        const existingRangeText = overlapCheck.endDate === 'ongoing'
          ? `${overlapCheck.startDate} - ongoing`
          : `${overlapCheck.startDate} - ${overlapCheck.endDate}`;
        
        toast({
          title: 'Date Conflict',
          description: `The selected date range (${dateRangeText}) overlaps with your existing assignment on "${overlapCheck.vesselName}" (${existingRangeText}). You cannot be on two vessels at the same time. Please adjust your dates to avoid conflicts.`,
          variant: 'destructive',
        });
        setIsSaving(false);
        return;
      }

      // Update assignment
      await updateVesselAssignment(supabase, editingAssignment.id, {
        startDate: startDateStr,
        endDate: endDateStr || null,
        position: editPosition || null,
      });

      toast({
        title: 'Assignment Updated',
        description: 'Vessel assignment has been successfully updated.',
      });

      // Refresh assignments
      const assignmentsData = await getVesselAssignments(supabase, user.id);
      setAssignments(assignmentsData);
      handleCloseEditDialog();
    } catch (error: any) {
      console.error('[VESSEL HISTORY] Error updating assignment:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update assignment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle resuming a vessel assignment
  const handleResumeVessel = async (assignment: VesselAssignment) => {
    if (!user?.id) return;

    setIsResuming(assignment.id);
    try {
      // First, end any other active assignments
      const activeAssignments = assignments.filter(a => isActiveAssignment(a));
      const today = new Date().toISOString().split('T')[0];
      
      for (const activeAssignment of activeAssignments) {
        if (activeAssignment.id !== assignment.id) {
          await updateVesselAssignment(supabase, activeAssignment.id, {
            endDate: today,
          });
        }
      }

      // Then, set the assignment's endDate to null to make it active (preserving original start date)
      // This preserves the original start date from the assignment
      await updateVesselAssignment(supabase, assignment.id, {
        endDate: null,
      });

      // Update the user's active_vessel_id directly without triggering syncVesselAssignmentForActiveVessel
      // We've already handled the assignment update manually, so we just need to update the profile
      const { error: updateError } = await supabase
        .from('users')
        .update({ active_vessel_id: assignment.vesselId })
        .eq('id', user.id);

      if (updateError) {
        throw updateError;
      }

      // Refresh assignments to show the updated state
      const refreshedAssignments = await getVesselAssignments(supabase, user.id);
      setAssignments(refreshedAssignments);

      toast({
        title: 'Vessel Resumed',
        description: `You have resumed your assignment on ${vesselMap.get(assignment.vesselId)?.name || 'this vessel'} starting from ${format(parse(assignment.startDate, 'yyyy-MM-dd', new Date()), 'MMMM d, yyyy')}.`,
      });
    } catch (error: any) {
      console.error('[VESSEL HISTORY] Error resuming vessel:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to resume vessel assignment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsResuming(null);
    }
  };

  // Check if user has any active assignment
  const hasActiveAssignment = useMemo(() => {
    return assignments.some(a => isActiveAssignment(a));
  }, [assignments]);

  const isLoadingData = isLoading || isLoadingProfile || isLoadingVessels;
  const hasAssignments = assignments.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/20 to-blue-600/10">
              <Ship className="h-6 w-6 text-sky-600 dark:text-sky-400" />
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">Vessel History</h1>
              <p className="max-w-xl text-muted-foreground">
                Your complete assignment timeline — current and past vessels, dates, and roles.
              </p>
            </div>
          </div>
          <Button onClick={handleOpenAddDialog} className="rounded-xl shrink-0">
            <Plus className="h-4 w-4 mr-2" />
            Add Assignment
          </Button>
        </div>
        <Separator />
      </div>

      {/* Vessel History List */}
      {isLoadingData ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !hasAssignments ? (
        <Card className="rounded-2xl border border-dashed shadow-none">
          <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <Ship className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-1 max-w-sm">
              <p className="font-semibold">No vessel history yet</p>
              <p className="text-sm text-muted-foreground">
                Add your first assignment to start building your sea-time record across vessels.
              </p>
            </div>
            <Button onClick={handleOpenAddDialog} className="rounded-xl mt-2">
              <Plus className="h-4 w-4 mr-2" />
              Add Assignment
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {sortedVesselIds.map((vesselId) => {
            const vessel = vesselMap.get(vesselId);
            const vesselAssignments = groupedAssignments.get(vesselId) || [];
            const currentAssignment = vesselAssignments.find(a => isActiveAssignment(a));
            const pastAssignments = vesselAssignments.filter(a => !isActiveAssignment(a));

            if (!vessel) return null;

            return (
              <VesselHistoryCard
                key={vesselId}
                vessel={vessel}
                vesselAssignments={vesselAssignments}
                currentAssignment={currentAssignment}
                pastAssignments={pastAssignments}
                isCrewMember={isCrewMember}
                hasActiveAssignment={hasActiveAssignment}
                isResuming={isResuming}
                onEdit={handleOpenEditDialog}
                onDelete={handleOpenDeleteDialog}
                onResume={handleResumeVessel}
                getAssignmentDuration={getAssignmentDuration}
              />
            );
          })}
        </div>
      )}

      {/* Add Assignment Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Add Vessel Assignment</DialogTitle>
            <DialogDescription>
              Add a new vessel assignment to your history. This can be a current or past assignment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="vessel">Vessel</Label>
              <UnifiedVesselSearchPicker
                value={newAssignmentVesselId}
                onChange={(id) => setNewAssignmentVesselId(id)}
                supabase={supabase}
                knownVessels={(vessels ?? []).map((v) => ({
                  id: v.id,
                  name: v.name,
                  type: v.type,
                }))}
                disabled={isLoadingVessels}
                triggerClassName="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Start Date</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="startYear" className="text-xs text-muted-foreground">Year</Label>
                  <Select value={startYear} onValueChange={setStartYear}>
                    <SelectTrigger id="startYear" className="rounded-xl">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {Array.from({ length: new Date().getFullYear() - 1999 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="startMonth" className="text-xs text-muted-foreground">Month</Label>
                  <Select value={startMonth} onValueChange={setStartMonth}>
                    <SelectTrigger id="startMonth" className="rounded-xl">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        { value: '0', label: 'January' },
                        { value: '1', label: 'February' },
                        { value: '2', label: 'March' },
                        { value: '3', label: 'April' },
                        { value: '4', label: 'May' },
                        { value: '5', label: 'June' },
                        { value: '6', label: 'July' },
                        { value: '7', label: 'August' },
                        { value: '8', label: 'September' },
                        { value: '9', label: 'October' },
                        { value: '10', label: 'November' },
                        { value: '11', label: 'December' },
                      ].map((month) => (
                        <SelectItem key={month.value} value={month.value}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="startDay" className="text-xs text-muted-foreground">Day</Label>
                  <Select 
                    value={startDay} 
                    onValueChange={setStartDay}
                    disabled={!startYear || !startMonth}
                  >
                    <SelectTrigger id="startDay" className="rounded-xl">
                      <SelectValue placeholder="Day" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {startYear && startMonth ? (
                        Array.from({ length: getDaysInMonth(parseInt(startYear), parseInt(startMonth)) }, (_, i) => i + 1).map((day) => (
                          <SelectItem key={day} value={day.toString()}>
                            {day}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                          Select year and month first
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>End Date (leave empty for current assignment)</Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="endYear" className="text-xs text-muted-foreground">Year</Label>
                  <Select value={endYear} onValueChange={setEndYear}>
                    <SelectTrigger id="endYear" className="rounded-xl">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {Array.from({ length: new Date().getFullYear() - 1999 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="endMonth" className="text-xs text-muted-foreground">Month</Label>
                  <Select value={endMonth} onValueChange={setEndMonth}>
                    <SelectTrigger id="endMonth" className="rounded-xl">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        { value: '0', label: 'January' },
                        { value: '1', label: 'February' },
                        { value: '2', label: 'March' },
                        { value: '3', label: 'April' },
                        { value: '4', label: 'May' },
                        { value: '5', label: 'June' },
                        { value: '6', label: 'July' },
                        { value: '7', label: 'August' },
                        { value: '8', label: 'September' },
                        { value: '9', label: 'October' },
                        { value: '10', label: 'November' },
                        { value: '11', label: 'December' },
                      ].map((month) => (
                        <SelectItem key={month.value} value={month.value}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="endDay" className="text-xs text-muted-foreground">Day</Label>
                  <Select 
                    value={endDay} 
                    onValueChange={setEndDay}
                    disabled={!endYear || !endMonth}
                  >
                    <SelectTrigger id="endDay" className="rounded-xl">
                      <SelectValue placeholder="Day" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {endYear && endMonth ? (
                        Array.from({ length: getDaysInMonth(parseInt(endYear), parseInt(endMonth)) }, (_, i) => i + 1).map((day) => (
                          <SelectItem key={day} value={day.toString()}>
                            {day}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                          Select year and month first
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="position">Position (optional)</Label>
              <Input
                id="position"
                type="text"
                value={newAssignmentPosition}
                onChange={(e) => setNewAssignmentPosition(e.target.value)}
                placeholder="e.g., Deck Officer, Engineer"
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseAddDialog} disabled={isSaving} className="rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleAddAssignment} disabled={isSaving} className="rounded-xl">
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Assignment'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Assignment Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Edit Vessel Assignment</DialogTitle>
            <DialogDescription>
              Update the details of this vessel assignment.
            </DialogDescription>
          </DialogHeader>
          {editingAssignment && (
            <>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Vessel</Label>
                  <div className="p-3 rounded-lg bg-muted/50 text-sm font-medium">
                    {vesselMap.get(editingAssignment.vesselId)?.name || 'Unknown Vessel'}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="editStartYear" className="text-xs text-muted-foreground">Year</Label>
                      <Select value={editStartYear} onValueChange={setEditStartYear}>
                        <SelectTrigger id="editStartYear" className="rounded-xl">
                          <SelectValue placeholder="Year" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          {Array.from({ length: new Date().getFullYear() - 1999 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                            <SelectItem key={year} value={year.toString()}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="editStartMonth" className="text-xs text-muted-foreground">Month</Label>
                      <Select value={editStartMonth} onValueChange={setEditStartMonth}>
                        <SelectTrigger id="editStartMonth" className="rounded-xl">
                          <SelectValue placeholder="Month" />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            { value: '0', label: 'January' },
                            { value: '1', label: 'February' },
                            { value: '2', label: 'March' },
                            { value: '3', label: 'April' },
                            { value: '4', label: 'May' },
                            { value: '5', label: 'June' },
                            { value: '6', label: 'July' },
                            { value: '7', label: 'August' },
                            { value: '8', label: 'September' },
                            { value: '9', label: 'October' },
                            { value: '10', label: 'November' },
                            { value: '11', label: 'December' },
                          ].map((month) => (
                            <SelectItem key={month.value} value={month.value}>
                              {month.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="editStartDay" className="text-xs text-muted-foreground">Day</Label>
                      <Select 
                        value={editStartDay} 
                        onValueChange={setEditStartDay}
                        disabled={!editStartYear || !editStartMonth}
                      >
                        <SelectTrigger id="editStartDay" className="rounded-xl">
                          <SelectValue placeholder="Day" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          {editStartYear && editStartMonth ? (
                            Array.from({ length: getDaysInMonth(parseInt(editStartYear), parseInt(editStartMonth)) }, (_, i) => i + 1).map((day) => (
                              <SelectItem key={day} value={day.toString()}>
                                {day}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                              Select year and month first
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>End Date (leave empty for current assignment)</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="editEndYear" className="text-xs text-muted-foreground">Year</Label>
                      <Select value={editEndYear} onValueChange={setEditEndYear}>
                        <SelectTrigger id="editEndYear" className="rounded-xl">
                          <SelectValue placeholder="Year" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          {Array.from({ length: new Date().getFullYear() - 1999 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                            <SelectItem key={year} value={year.toString()}>
                              {year}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="editEndMonth" className="text-xs text-muted-foreground">Month</Label>
                      <Select value={editEndMonth} onValueChange={setEditEndMonth}>
                        <SelectTrigger id="editEndMonth" className="rounded-xl">
                          <SelectValue placeholder="Month" />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            { value: '0', label: 'January' },
                            { value: '1', label: 'February' },
                            { value: '2', label: 'March' },
                            { value: '3', label: 'April' },
                            { value: '4', label: 'May' },
                            { value: '5', label: 'June' },
                            { value: '6', label: 'July' },
                            { value: '7', label: 'August' },
                            { value: '8', label: 'September' },
                            { value: '9', label: 'October' },
                            { value: '10', label: 'November' },
                            { value: '11', label: 'December' },
                          ].map((month) => (
                            <SelectItem key={month.value} value={month.value}>
                              {month.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="editEndDay" className="text-xs text-muted-foreground">Day</Label>
                      <Select 
                        value={editEndDay} 
                        onValueChange={setEditEndDay}
                        disabled={!editEndYear || !editEndMonth}
                      >
                        <SelectTrigger id="editEndDay" className="rounded-xl">
                          <SelectValue placeholder="Day" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[200px]">
                          {editEndYear && editEndMonth ? (
                            Array.from({ length: getDaysInMonth(parseInt(editEndYear), parseInt(editEndMonth)) }, (_, i) => i + 1).map((day) => (
                              <SelectItem key={day} value={day.toString()}>
                                {day}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                              Select year and month first
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editPosition">Position (optional)</Label>
                  <Input
                    id="editPosition"
                    type="text"
                    value={editPosition}
                    onChange={(e) => setEditPosition(e.target.value)}
                    placeholder="e.g., Deck Officer, Engineer"
                    className="rounded-xl"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseEditDialog} disabled={isSaving} className="rounded-xl">
                  Cancel
                </Button>
                <Button onClick={handleEditAssignment} disabled={isSaving} className="rounded-xl">
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update Assignment'
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Delete Vessel Assignment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this vessel assignment? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deletingAssignment && (
            <>
              <div className="py-4">
                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-sm font-medium mb-2">Assignment Details:</div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <div>
                        <span className="font-medium">Vessel:</span>{' '}
                        {vesselMap.get(deletingAssignment.vesselId)?.name || 'Unknown Vessel'}
                      </div>
                      <div>
                        <span className="font-medium">Period:</span>{' '}
                        {format(parse(deletingAssignment.startDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')} - {' '}
                        {deletingAssignment.endDate 
                          ? format(parse(deletingAssignment.endDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')
                          : 'Present'}
                      </div>
                      {deletingAssignment.position && (
                        <div>
                          <span className="font-medium">Position:</span> {deletingAssignment.position}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseDeleteDialog} disabled={isDeleting} className="rounded-xl">
                  Cancel
                </Button>
                <Button 
                  onClick={handleDeleteAssignment} 
                  disabled={isDeleting} 
                  variant="destructive"
                  className="rounded-xl"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Assignment
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
