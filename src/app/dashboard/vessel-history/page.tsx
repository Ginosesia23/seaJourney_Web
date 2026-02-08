'use client';

import { useState, useMemo, useEffect } from 'react';
import { format, parse, differenceInDays, isAfter, isBefore, startOfDay, isSameDay, eachDayOfInterval, getYear, getMonth, getDate, setYear, setMonth, setDate, isValid } from 'date-fns';
import { 
  Ship, 
  Loader2, 
  Calendar,
  Clock,
  MapPin,
  ChevronRight,
  Briefcase,
  Plus,
  Edit,
  X,
  Trash2,
  ChevronsUpDown,
  Check
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { getVesselAssignments, createVesselAssignment, updateVesselAssignment } from '@/supabase/database/queries';
import type { Vessel, VesselAssignment, UserProfile } from '@/lib/types';
import { cn } from '@/lib/utils';
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
  
  // Vessel search state
  const [isVesselSearchOpen, setIsVesselSearchOpen] = useState(false);
  const [vesselSearchTerm, setVesselSearchTerm] = useState<string>('');
  const [vesselSearchResults, setVesselSearchResults] = useState<Vessel[]>([]);
  const [isSearchingVessels, setIsSearchingVessels] = useState(false);
  
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
    return {
      ...userProfileRaw,
      activeVesselId: activeVesselId || undefined,
      position: position,
    } as UserProfile;
  }, [userProfileRaw]);

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

  // Search vessels when user types
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
        console.error('[VESSEL HISTORY] Error searching vessels:', error);
        setVesselSearchResults([]);
      } finally {
        setIsSearchingVessels(false);
      }
    };

    const timeoutId = setTimeout(searchVessels, 300); // Debounce
    return () => clearTimeout(timeoutId);
  }, [vesselSearchTerm]);

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
    setVesselSearchTerm('');
    setVesselSearchResults([]);
    setIsVesselSearchOpen(false);
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
    setVesselSearchTerm('');
    setVesselSearchResults([]);
    setIsVesselSearchOpen(false);
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
        description: `Vessel assignment for "${vessel?.name || 'Unknown Vessel'}" has been successfully removed.`,
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

  // Validate date ranges don't overlap with existing assignments
  // Database uses '[)' range (start inclusive, end exclusive), allowing same-day changeovers
  // Two ranges [a, b) and [c, d) overlap if: a < d AND c < b
  const checkDateOverlap = (startDate: Date, endDate: Date | null, excludeAssignmentId?: string): { overlaps: boolean; vesselName?: string; startDate?: string; endDate?: string } => {
    // Normalize dates to start of day for comparison
    const newStart = startOfDay(startDate);
    // Use far future date if no end date (ongoing assignment)
    const newEnd = endDate ? startOfDay(endDate) : new Date('2099-12-31');
    
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

      // Check for overlaps with other vessel assignments
      const overlapCheck = checkDateOverlap(startDate, endDate);
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
      const overlapCheck = checkDateOverlap(startDate, endDate, editingAssignment.id);
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

  const isLoadingData = isLoading || isLoadingProfile || isLoadingVessels;
  const hasAssignments = assignments.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Vessel History</h1>
            <p className="text-muted-foreground">
              View and manage your complete vessel assignment history, including current and previous vessels.
            </p>
          </div>
          <Button onClick={handleOpenAddDialog} className="rounded-xl">
            <Plus className="h-4 w-4 mr-2" />
            Add Vessel Assignment
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
        <Card className="rounded-xl border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
              <Ship className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground mb-1">No vessel history</p>
            <p className="text-xs text-muted-foreground">You haven't been assigned to any vessels yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedVesselIds.map((vesselId) => {
            const vessel = vesselMap.get(vesselId);
            const vesselAssignments = groupedAssignments.get(vesselId) || [];
            const currentAssignment = vesselAssignments.find(a => isActiveAssignment(a));
            const pastAssignments = vesselAssignments.filter(a => !isActiveAssignment(a));

            if (!vessel) return null;

            return (
              <Card key={vesselId} className="rounded-xl border">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Ship className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-xl mb-1">{vessel.name}</CardTitle>
                        {vessel.type && (
                          <CardDescription className="text-sm">{vessel.type}</CardDescription>
                        )}
                      </div>
                    </div>
                    {currentAssignment && (
                      <Badge variant="default" className="bg-green-500/20 text-green-700 dark:text-green-400">
                        Current
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Current Assignment */}
                  {currentAssignment && (
                    <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                      <div className="flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                              Current Assignment
                            </span>
                            {currentAssignment.position && (
                              <Badge variant="outline" className="text-xs">
                                {currentAssignment.position}
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-1 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              <span>
                                Started: {format(parse(currentAssignment.startDate, 'yyyy-MM-dd', new Date()), 'MMMM d, yyyy')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              <span>
                                {getAssignmentDuration(currentAssignment)} {getAssignmentDuration(currentAssignment) === 1 ? 'day' : 'days'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEditDialog(currentAssignment)}
                          className="flex-shrink-0"
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Past Assignments */}
                  {pastAssignments.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Separator className="flex-1" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Previous Assignments
                        </span>
                        <Separator className="flex-1" />
                      </div>
                      {pastAssignments.map((assignment, index) => (
                        <div
                          key={assignment.id}
                          className={cn(
                            "p-4 rounded-lg border transition-colors",
                            index < pastAssignments.length - 1 ? "border-b" : "",
                            "hover:bg-accent/50"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <Briefcase className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                {assignment.position && (
                                  <Badge variant="outline" className="text-xs">
                                    {assignment.position}
                                  </Badge>
                                )}
                              </div>
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-4 w-4" />
                                  <span>
                                    {format(parse(assignment.startDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')} - {' '}
                                    {assignment.endDate 
                                      ? format(parse(assignment.endDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')
                                      : 'Present'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock className="h-4 w-4" />
                                  <span>
                                    {getAssignmentDuration(assignment)} {getAssignmentDuration(assignment) === 1 ? 'day' : 'days'}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenEditDialog(assignment)}
                                className="flex-shrink-0"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenDeleteDialog(assignment)}
                                className="flex-shrink-0 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Summary */}
                  {vesselAssignments.length > 1 && (
                    <div className="pt-3 border-t">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Total assignments on this vessel:</span>
                        <span className="font-semibold">{vesselAssignments.length}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm mt-1">
                        <span className="text-muted-foreground">Total days:</span>
                        <span className="font-semibold">
                          {vesselAssignments.reduce((sum, a) => sum + getAssignmentDuration(a), 0)} days
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
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
              <Popover open={isVesselSearchOpen} onOpenChange={setIsVesselSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      "w-full justify-between rounded-xl",
                      !newAssignmentVesselId && "text-muted-foreground"
                    )}
                    disabled={isLoadingVessels}
                  >
                    {newAssignmentVesselId
                      ? vesselMap.get(newAssignmentVesselId)?.name || "Select vessel..."
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
                      className="h-9 bg-background rounded-xl"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
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
                            setNewAssignmentVesselId(vessel.id);
                            setIsVesselSearchOpen(false);
                            setVesselSearchTerm('');
                          }}
                          className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground transition-colors"
                        >
                          <Check
                            className={cn(
                              "mr-3 h-4 w-4 shrink-0",
                              newAssignmentVesselId === vessel.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex-1 text-left">
                            <div className="font-medium">{vessel.name}</div>
                            {vessel.type && (
                              <div className="text-xs text-muted-foreground">{vessel.type}</div>
                            )}
                          </div>
                        </button>
                      ))
                    ) : vesselSearchTerm.length >= 2 ? (
                      <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                        No vessels found matching "{vesselSearchTerm}"
                      </div>
                    ) : (
                      <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                        Type at least 2 characters to search vessels
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
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
