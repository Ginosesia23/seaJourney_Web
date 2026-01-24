'use client';

import { useState, useEffect, useMemo } from 'react';
import { UserProfileCard } from '@/components/dashboard/user-profile';
import { SubscriptionCard } from '@/components/dashboard/subscription-card';
import { UserInfoCard } from '@/components/dashboard/user-info-card';
import { MCAApplicationDetailsCard } from '@/components/dashboard/mca-application-details';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useUser, useSupabase } from '@/supabase';
import { useCollection, useDoc } from '@/supabase/database';
import { getVesselAssignments, updateVesselAssignment } from '@/supabase/database/queries';
import { format, parse, differenceInDays, isAfter, startOfDay, isBefore, getYear, getMonth, setMonth, setYear, startOfMonth, addDays } from 'date-fns';
import { Ship, Calendar, Briefcase, Loader2, User, Save, Edit, Shield, FileText, CheckCircle2, XCircle, Clock, Plus, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { vesselTypes, vesselTypeValues } from '@/lib/vessel-types';
import { cn } from '@/lib/utils';
import type { VesselAssignment, Vessel, UserProfile, PositionHistory } from '@/lib/types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { updateUserProfile } from '@/supabase/database/queries';

function CaptainRoleApplicationCard({ userProfile, userId }: { userProfile: UserProfile | null; userId?: string }) {
  const { supabase } = useSupabase();
  const { toast } = useToast();
  const [isApplicationDialogOpen, setIsApplicationDialogOpen] = useState(false);
  const [existingApplication, setExistingApplication] = useState<any>(null);
  const [isLoadingApplication, setIsLoadingApplication] = useState(true);
  const [documentUrls, setDocumentUrls] = useState<string[]>(['']);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if user should see this card
  const shouldShowCard = useMemo(() => {
    if (!userProfile) return false;
    const position = ((userProfile as any).position || '').toLowerCase();
    const hasCaptainPosition = position.includes('captain');
    const isNotCaptain = userProfile.role !== 'captain';
    return hasCaptainPosition && isNotCaptain;
  }, [userProfile]);

  // Fetch existing application
  useEffect(() => {
    if (!shouldShowCard || !userId) {
      setIsLoadingApplication(false);
      return;
    }

    const fetchApplication = async () => {
      setIsLoadingApplication(true);
      try {
        const { data, error } = await supabase
          .from('captain_role_applications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('[CAPTAIN ROLE APPLICATION] Error fetching application:', error);
        } else {
          setExistingApplication(data || null);
        }
      } catch (error) {
        console.error('[CAPTAIN ROLE APPLICATION] Exception fetching application:', error);
      } finally {
        setIsLoadingApplication(false);
      }
    };

    fetchApplication();
  }, [shouldShowCard, userId, supabase]);

  const handleAddDocumentUrl = () => {
    setDocumentUrls([...documentUrls, '']);
  };

  const handleRemoveDocumentUrl = (index: number) => {
    setDocumentUrls(documentUrls.filter((_, i) => i !== index));
  };

  const handleDocumentUrlChange = (index: number, value: string) => {
    const newUrls = [...documentUrls];
    newUrls[index] = value;
    setDocumentUrls(newUrls);
  };

  const handleSubmitApplication = async () => {
    if (!userId) return;

    // Filter out empty URLs
    const validDocuments = documentUrls.filter(url => url.trim() !== '');

    if (validDocuments.length === 0) {
      toast({
        title: 'Documents Required',
        description: 'Please provide at least one supporting document URL.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/captain-role-applications/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          supportingDocuments: validDocuments,
          notes: notes.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit application');
      }

      toast({
        title: 'Application Submitted',
        description: 'Your captain role application has been submitted for review.',
      });

      // Refresh application status
      const { data: newApplication } = await supabase
        .from('captain_role_applications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setExistingApplication(newApplication);
      setIsApplicationDialogOpen(false);
      setDocumentUrls(['']);
      setNotes('');
    } catch (error: any) {
      console.error('[CAPTAIN ROLE APPLICATION] Error submitting:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit application. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!shouldShowCard || isLoadingApplication) {
    return null;
  }

  const hasPendingApplication = existingApplication?.status === 'pending';
  const hasApprovedApplication = existingApplication?.status === 'approved';
  const hasRejectedApplication = existingApplication?.status === 'rejected';

  return (
    <Card className="rounded-xl border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Captain Role Application
        </CardTitle>
        <CardDescription>
          Apply for the captain role to access vessel management features
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasPendingApplication && (
          <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <Clock className="h-5 w-5 text-yellow-600" />
            <div className="flex-1">
              <p className="font-medium text-yellow-900 dark:text-yellow-100">Application Pending Review</p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Your application is being reviewed by an administrator.
              </p>
            </div>
          </div>
        )}

        {hasApprovedApplication && (
          <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div className="flex-1">
              <p className="font-medium text-green-900 dark:text-green-100">Application Approved</p>
              <p className="text-sm text-green-700 dark:text-green-300">
                Your captain role has been approved. You now have access to captain features.
              </p>
            </div>
          </div>
        )}

        {hasRejectedApplication && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <XCircle className="h-5 w-5 text-red-600" />
              <div className="flex-1">
                <p className="font-medium text-red-900 dark:text-red-100">Application Rejected</p>
                {existingApplication.rejection_reason && (
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    Reason: {existingApplication.rejection_reason}
                  </p>
                )}
              </div>
            </div>
            {!hasPendingApplication && (
              <Button onClick={() => setIsApplicationDialogOpen(true)} variant="outline">
                Submit New Application
              </Button>
            )}
          </div>
        )}

        {!existingApplication && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Submit supporting documents (certificates, licenses, etc.) to apply for the captain role.
            </p>
            <Button onClick={() => setIsApplicationDialogOpen(true)}>
              <FileText className="h-4 w-4 mr-2" />
              Submit Application
            </Button>
          </div>
        )}

        <Dialog open={isApplicationDialogOpen} onOpenChange={setIsApplicationDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Captain Role Application</DialogTitle>
              <DialogDescription>
                Provide supporting documents (URLs to certificates, licenses, or other relevant documents) to apply for the captain role.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Supporting Documents (URLs)</Label>
                {documentUrls.map((url, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      type="url"
                      placeholder="https://example.com/document.pdf"
                      value={url}
                      onChange={(e) => handleDocumentUrlChange(index, e.target.value)}
                    />
                    {documentUrls.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => handleRemoveDocumentUrl(index)}
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
                  onClick={handleAddDocumentUrl}
                  className="w-full"
                >
                  Add Another Document
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional information you'd like to provide..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsApplicationDialogOpen(false);
                  setDocumentUrls(['']);
                  setNotes('');
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmitApplication} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Application'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// Position options (matching the ones used in current page)
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

const positionHistorySchema = z.object({
  position: z.string().min(1, 'Position is required'),
  startDate: z.date({ required_error: 'Start date is required' }),
  endDate: z.date().optional().nullable(),
  vesselId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).refine((data) => {
  if (data.endDate && data.endDate < data.startDate) {
    return false;
  }
  return true;
}, {
  message: "End date must be after start date",
  path: ["endDate"],
});

type PositionHistoryFormValues = z.infer<typeof positionHistorySchema>;

function CareerTab({ userId }: { userId?: string }) {
  const { supabase } = useSupabase();
  const { toast } = useToast();
  const [assignments, setAssignments] = useState<VesselAssignment[]>([]);
  const [positionHistory, setPositionHistory] = useState<PositionHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPositionDialogOpen, setIsPositionDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<PositionHistory | null>(null);
  const [deletePositionId, setDeletePositionId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Fetch all vessels for name lookup
  const { data: vessels } = useCollection<Vessel>('vessels');
  
  const vesselMap = useMemo(() => {
    const map = new Map<string, Vessel>();
    vessels?.forEach(vessel => {
      map.set(vessel.id, vessel);
    });
    return map;
  }, [vessels]);

  const positionForm = useForm<PositionHistoryFormValues>({
    resolver: zodResolver(positionHistorySchema),
    defaultValues: {
      position: '',
      startDate: new Date(),
      endDate: null,
      vesselId: null,
      notes: '',
    },
  });

  // Fetch assignments and position history
  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [assignmentsData, positionData] = await Promise.all([
          getVesselAssignments(supabase, userId),
          supabase
            .from('position_history')
            .select('*')
            .eq('user_id', userId)
            .order('start_date', { ascending: false })
        ]);

        setAssignments(assignmentsData);
        
        if (positionData.error) throw positionData.error;
        
        // Transform position history data
        const transformedPositions: PositionHistory[] = (positionData.data || []).map((pos: any) => ({
          id: pos.id,
          userId: pos.user_id,
          position: pos.position,
          startDate: pos.start_date,
          endDate: pos.end_date || null,
          vesselId: pos.vessel_id || null,
          notes: pos.notes || null,
          createdAt: pos.created_at,
          updatedAt: pos.updated_at,
        }));
        setPositionHistory(transformedPositions);
      } catch (error) {
        console.error('Error fetching career data:', error);
        setAssignments([]);
        setPositionHistory([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [userId, supabase]);

  // Calculate total days for each assignment
  const getAssignmentDuration = (assignment: VesselAssignment): number => {
    const start = parse(assignment.startDate, 'yyyy-MM-dd', new Date());
    const end = assignment.endDate 
      ? parse(assignment.endDate, 'yyyy-MM-dd', new Date())
      : new Date();
    return differenceInDays(end, start) + 1;
  };

  // Calculate duration for position
  const getPositionDuration = (position: PositionHistory): number => {
    const start = parse(position.startDate, 'yyyy-MM-dd', new Date());
    const end = position.endDate 
      ? parse(position.endDate, 'yyyy-MM-dd', new Date())
      : new Date();
    return differenceInDays(end, start) + 1;
  };

  const handleOpenPositionDialog = (position?: PositionHistory) => {
    if (position) {
      setEditingPosition(position);
      positionForm.reset({
        position: position.position,
        startDate: parse(position.startDate, 'yyyy-MM-dd', new Date()),
        endDate: position.endDate ? parse(position.endDate, 'yyyy-MM-dd', new Date()) : null,
        vesselId: position.vesselId || null,
        notes: position.notes || '',
      });
    } else {
      setEditingPosition(null);
      positionForm.reset({
        position: '',
        startDate: new Date(),
        endDate: null,
        vesselId: null,
        notes: '',
      });
    }
    setIsPositionDialogOpen(true);
  };

  const handleClosePositionDialog = () => {
    setIsPositionDialogOpen(false);
    setEditingPosition(null);
    positionForm.reset();
  };

  const handleSavePosition = async (data: PositionHistoryFormValues) => {
    if (!userId) return;

    setIsSaving(true);
    try {
      // If adding a new position and it's current (no end date), end the previous current position
      if (!editingPosition && !data.endDate) {
        const currentPosition = positionHistory.find(p => !p.endDate);
        if (currentPosition) {
          const dayBeforeNewStart = format(addDays(data.startDate, -1), 'yyyy-MM-dd');
          await supabase
            .from('position_history')
            .update({ end_date: dayBeforeNewStart })
            .eq('id', currentPosition.id);
        }
      }

      const positionData = {
        user_id: userId,
        position: data.position,
        start_date: format(data.startDate, 'yyyy-MM-dd'),
        end_date: data.endDate ? format(data.endDate, 'yyyy-MM-dd') : null,
        vessel_id: data.vesselId || null,
        notes: data.notes || null,
      };

      if (editingPosition) {
        // Update existing position
        const { error } = await supabase
          .from('position_history')
          .update(positionData)
          .eq('id', editingPosition.id);

        if (error) throw error;
        toast({
          title: 'Success',
          description: 'Position updated successfully.',
        });
      } else {
        // Create new position
        const { error } = await supabase
          .from('position_history')
          .insert(positionData);

        if (error) throw error;
        toast({
          title: 'Success',
          description: 'Position added successfully.',
        });
      }

      // Update vessel assignment if user has an active assignment
      // If the new position is current (no end date) and has a vesselId, update the assignment
      if (!data.endDate && data.vesselId) {
        const activeAssignment = assignments.find(a => !a.endDate && a.vesselId === data.vesselId);
        if (activeAssignment) {
          // Update the position in the vessel assignment
          try {
            await updateVesselAssignment(supabase, activeAssignment.id, {
              position: data.position,
            });
            // Refresh assignments to show updated position
            const refreshedAssignments = await getVesselAssignments(supabase, userId);
            setAssignments(refreshedAssignments);
          } catch (assignmentError) {
            console.error('Error updating vessel assignment:', assignmentError);
            // Don't fail the position save if assignment update fails
          }
        }
      } else if (!data.endDate) {
        // If it's a current position but no vesselId specified, check if user has any active assignment
        const activeAssignment = assignments.find(a => !a.endDate);
        if (activeAssignment) {
          // Update the position in the active vessel assignment
          try {
            await updateVesselAssignment(supabase, activeAssignment.id, {
              position: data.position,
            });
            // Refresh assignments to show updated position
            const refreshedAssignments = await getVesselAssignments(supabase, userId);
            setAssignments(refreshedAssignments);
          } catch (assignmentError) {
            console.error('Error updating vessel assignment:', assignmentError);
            // Don't fail the position save if assignment update fails
          }
        }
      }

      // Refresh position history
      const { data: refreshedPositionData, error: fetchError } = await supabase
        .from('position_history')
        .select('*')
        .eq('user_id', userId)
        .order('start_date', { ascending: false });

      if (!fetchError && refreshedPositionData) {
        const transformedPositions: PositionHistory[] = refreshedPositionData.map((pos: any) => ({
          id: pos.id,
          userId: pos.user_id,
          position: pos.position,
          startDate: pos.start_date,
          endDate: pos.end_date || null,
          vesselId: pos.vessel_id || null,
          notes: pos.notes || null,
          createdAt: pos.created_at,
          updatedAt: pos.updated_at,
        }));
        setPositionHistory(transformedPositions);

        // Update users table with the current position (the one without an end_date)
        const currentPosition = transformedPositions.find(p => !p.endDate);
        if (currentPosition) {
          try {
            const { error: userUpdateError } = await supabase
              .from('users')
              .update({ position: currentPosition.position })
              .eq('id', userId);

            if (userUpdateError) {
              console.error('Error updating user position:', userUpdateError);
              // Don't fail the position save if user update fails
            }
          } catch (userUpdateError) {
            console.error('Error updating user position:', userUpdateError);
            // Don't fail the position save if user update fails
          }
        } else {
          // If no current position exists, clear the position in users table
          try {
            const { error: userUpdateError } = await supabase
              .from('users')
              .update({ position: null })
              .eq('id', userId);

            if (userUpdateError) {
              console.error('Error clearing user position:', userUpdateError);
            }
          } catch (userUpdateError) {
            console.error('Error clearing user position:', userUpdateError);
          }
        }
      }

      handleClosePositionDialog();
    } catch (error: any) {
      console.error('Error saving position:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save position.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePosition = async () => {
    if (!deletePositionId || !userId) return;

    try {
      const { error } = await supabase
        .from('position_history')
        .delete()
        .eq('id', deletePositionId)
        .eq('user_id', userId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Position deleted successfully.',
      });

      setPositionHistory(positionHistory.filter(p => p.id !== deletePositionId));
      setDeletePositionId(null);
    } catch (error: any) {
      console.error('Error deleting position:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete position.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const currentPosition = positionHistory.find(p => !p.endDate);

  return (
    <div className="space-y-6">
      {/* Position History Section */}
      <Card className="rounded-xl border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Position History
              </CardTitle>
              <CardDescription className="mt-1">
                Track your position progression and promotions over time
              </CardDescription>
            </div>
            <Dialog open={isPositionDialogOpen} onOpenChange={setIsPositionDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenPositionDialog()} className="rounded-xl">
                  <Plus className="mr-2 h-4 w-4" />
                  {currentPosition ? 'Update Position' : 'Add Position'}
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-xl max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingPosition ? 'Edit Position' : currentPosition ? 'Update Current Position' : 'Add Position'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingPosition 
                      ? 'Update your position information below.'
                      : currentPosition
                      ? 'Adding a new position will automatically end your current position.'
                      : 'Add your current position to start tracking your career progression.'}
                  </DialogDescription>
                </DialogHeader>
                <Form {...positionForm}>
                  <form onSubmit={positionForm.handleSubmit(handleSavePosition)} className="space-y-4">
                    <FormField
                      control={positionForm.control}
                      name="position"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Position *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="rounded-xl">
                                <SelectValue placeholder="Select position" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {POSITION_OPTIONS.map((pos) => (
                                <SelectItem key={pos} value={pos}>
                                  {pos}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={positionForm.control}
                        name="startDate"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Start Date *</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      "w-full pl-3 text-left font-normal rounded-xl",
                                      !field.value && "text-muted-foreground"
                                    )}
                                  >
                                    {field.value ? (
                                      format(field.value, "PPP")
                                    ) : (
                                      <span>Pick a date</span>
                                    )}
                                    <Calendar className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <CalendarComponent
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={positionForm.control}
                        name="endDate"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>End Date (leave blank for current)</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      "w-full pl-3 text-left font-normal rounded-xl",
                                      !field.value && "text-muted-foreground"
                                    )}
                                  >
                                    {field.value ? (
                                      format(field.value, "PPP")
                                    ) : (
                                      <span>Current position</span>
                                    )}
                                    <Calendar className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <CalendarComponent
                                  mode="single"
                                  selected={field.value || undefined}
                                  onSelect={field.onChange}
                                  disabled={(date) => {
                                    const startDate = positionForm.watch('startDate');
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

                    <FormField
                      control={positionForm.control}
                      name="vesselId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vessel (Optional)</FormLabel>
                          <Select 
                            onValueChange={(value) => {
                              field.onChange(value === 'none' ? null : value);
                            }} 
                            value={field.value || 'none'}
                          >
                            <FormControl>
                              <SelectTrigger className="rounded-xl">
                                <SelectValue placeholder="Select vessel (optional)" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {vessels?.map((vessel) => (
                                <SelectItem key={vessel.id} value={vessel.id}>
                                  {vessel.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={positionForm.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notes (Optional)</FormLabel>
                          <FormControl>
                      <Textarea
                        placeholder="Add any notes about this position..."
                        className="rounded-xl"
                        {...field}
                        value={field.value || ''}
                      />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleClosePositionDialog}
                        disabled={isSaving}
                        className="rounded-xl"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={isSaving}
                        className="rounded-xl"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          editingPosition ? 'Update' : 'Add'
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {positionHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Briefcase className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Position History</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-4">
                Add your current position to start tracking your career progression.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Position</TableHead>
                    <TableHead>Vessel</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {positionHistory.map((position) => {
                    const duration = getPositionDuration(position);
                    const isCurrent = !position.endDate;
                    const vessel = position.vesselId ? vesselMap.get(position.vesselId) : null;
                    
                    return (
                      <TableRow key={position.id}>
                        <TableCell className="font-medium">
                          <Badge variant={isCurrent ? "default" : "outline"}>
                            {position.position}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {vessel ? (
                            <div className="flex items-center gap-2">
                              <Ship className="h-3 w-3 text-muted-foreground" />
                              {vessel.name}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {format(parse(position.startDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}
                          </div>
                        </TableCell>
                        <TableCell>
                          {position.endDate ? (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              {format(parse(position.endDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}
                            </div>
                          ) : (
                            <Badge className="bg-green-500/10 text-green-700 border-green-500/20 dark:bg-green-500/20 dark:text-green-400">
                              Current
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {duration} {duration === 1 ? 'day' : 'days'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenPositionDialog(position)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletePositionId(position.id)}
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Vessel Assignments Section */}
      {assignments.length > 0 && (
        <Card className="rounded-xl border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ship className="h-5 w-5" />
              Vessel Assignments
            </CardTitle>
            <CardDescription>
              Your vessel assignments and sea service history
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vessel</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((assignment) => {
                    const vessel = vesselMap.get(assignment.vesselId);
                    const duration = getAssignmentDuration(assignment);
                    const isActive = !assignment.endDate;
                    const endDate = assignment.endDate 
                      ? parse(assignment.endDate, 'yyyy-MM-dd', new Date())
                      : null;
                    
                    return (
                      <TableRow key={assignment.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Ship className="h-4 w-4 text-muted-foreground" />
                            {vessel?.name || 'Unknown Vessel'}
                          </div>
                        </TableCell>
                        <TableCell>
                          {assignment.position ? (
                            <Badge variant="outline">{assignment.position}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {format(parse(assignment.startDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}
                          </div>
                        </TableCell>
                        <TableCell>
                          {endDate ? (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              {format(endDate, 'MMM d, yyyy')}
                            </div>
                          ) : (
                            <Badge variant="secondary">Active</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {duration} {duration === 1 ? 'day' : 'days'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {isActive ? (
                            <Badge className="bg-green-500/10 text-green-700 border-green-500/20 dark:bg-green-500/20 dark:text-green-400">
                              Current
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Completed</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Career Summary */}
            <div className="mt-6 pt-6 border-t">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total Assignments</p>
                  <p className="text-2xl font-bold">{assignments.length}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Active Assignments</p>
                  <p className="text-2xl font-bold">
                    {assignments.filter(a => !a.endDate).length}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total Days at Sea</p>
                  <p className="text-2xl font-bold">
                    {assignments.reduce((sum, a) => sum + getAssignmentDuration(a), 0)}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletePositionId} onOpenChange={(open) => !open && setDeletePositionId(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Position</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this position entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePosition}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const vesselDetailsSchema = z.object({
  name: z.string().min(1, 'Vessel name is required'),
  type: z.enum(vesselTypeValues, { required_error: 'Vessel type is required' }),
  imo: z.string().optional().or(z.literal('')),
  length_m: z.string().optional().or(z.literal('')),
  beam: z.string().optional().or(z.literal('')),
  draft: z.string().optional().or(z.literal('')),
  gross_tonnage: z.string().optional().or(z.literal('')),
  number_of_crew: z.string().optional().or(z.literal('')),
  build_year: z.string().optional().or(z.literal('')),
  flag_state: z.string().optional().or(z.literal('')),
  call_sign: z.string().optional().or(z.literal('')),
  mmsi: z.string().optional().or(z.literal('')),
  description: z.string().optional().or(z.literal('')),
  management_company: z.string().optional().or(z.literal('')),
  company_address: z.string().optional().or(z.literal('')),
  company_contact: z.string().optional().or(z.literal('')),
});

type VesselDetailsFormValues = z.infer<typeof vesselDetailsSchema>;

function VesselStartDateCard({ userProfile }: { userProfile: UserProfile | null }) {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>(
    userProfile?.startDate ? new Date(userProfile.startDate) : undefined
  );
  const [isOpen, setIsOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(
    startDate ? startOfMonth(startDate) : startOfMonth(new Date())
  );

  useEffect(() => {
    if (userProfile?.startDate) {
      setStartDate(new Date(userProfile.startDate));
    }
  }, [userProfile?.startDate]);

  const handleSave = async () => {
    if (!user?.id) return;

    setIsSaving(true);
    try {
      await updateUserProfile(supabase, user.id, {
        startDate: startDate ? format(startDate, 'yyyy-MM-dd') : null,
      });

      toast({
        title: 'Start Date Updated',
        description: 'Your vessel start date has been saved successfully.',
      });

      setIsOpen(false);
    } catch (error: any) {
      console.error('Error updating start date:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update start date. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label>Official Start Date</Label>
          <p className="text-sm text-muted-foreground">
            This is the earliest date you can change vessel states. States can only be changed from this date to today.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setIsOpen(!isOpen)}
          disabled={isSaving}
        >
          {startDate ? 'Change Date' : 'Set Start Date'}
        </Button>
      </div>

      {startDate && (
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{format(startDate, 'MMMM d, yyyy')}</span>
        </div>
      )}

      {isOpen && (
        <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal"
              >
                <Calendar className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, 'PPP') : 'Pick a date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="p-3 space-y-3">
                {/* Year and Month Selectors */}
                <div className="flex gap-2">
                  <Select
                    value={getYear(calendarMonth).toString()}
                    onValueChange={(value) => {
                      const newYear = parseInt(value);
                      setCalendarMonth(setYear(calendarMonth, newYear));
                    }}
                  >
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {Array.from({ length: 50 }, (_, i) => {
                        const year = new Date().getFullYear() - i;
                        return (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <Select
                    value={getMonth(calendarMonth).toString()}
                    onValueChange={(value) => {
                      const newMonth = parseInt(value);
                      setCalendarMonth(setMonth(calendarMonth, newMonth));
                    }}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        'January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'
                      ].map((month, index) => (
                        <SelectItem key={index} value={index.toString()}>
                          {month}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <CalendarComponent
                  mode="single"
                  selected={startDate}
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  onSelect={(date) => {
                    if (date) {
                      const today = startOfDay(new Date());
                      const selected = startOfDay(date);
                      if (isAfter(selected, today)) {
                        toast({
                          title: 'Invalid Date',
                          description: 'Start date cannot be in the future.',
                          variant: 'destructive',
                        });
                        return;
                      }
                      setStartDate(date);
                      setCalendarMonth(startOfMonth(date));
                    }
                  }}
                  disabled={(date) => isAfter(date, new Date())}
                  initialFocus
                />
              </div>
            </PopoverContent>
          </Popover>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsOpen(false);
                setStartDate(userProfile?.startDate ? new Date(userProfile.startDate) : undefined);
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function VesselDetailsPage({ userProfile, vessel, vesselData }: { userProfile: UserProfile | null; vessel: Vessel | null; vesselData: any }) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const form = useForm<VesselDetailsFormValues>({
    resolver: zodResolver(vesselDetailsSchema),
    defaultValues: {
      name: vesselData?.name || '',
      type: (vesselData?.type as any) || '',
      imo: vesselData?.imo || vesselData?.officialNumber || '',
      length_m: vesselData?.length_m?.toString() || '',
      beam: vesselData?.beam?.toString() || '',
      draft: vesselData?.draft?.toString() || '',
      gross_tonnage: vesselData?.gross_tonnage?.toString() || '',
      number_of_crew: vesselData?.number_of_crew?.toString() || '',
      build_year: vesselData?.build_year?.toString() || '',
      flag_state: vesselData?.flag_state || '',
      call_sign: vesselData?.call_sign || '',
      mmsi: vesselData?.mmsi || '',
      description: vesselData?.description || '',
      management_company: vesselData?.management_company || '',
      company_address: vesselData?.company_address || '',
      company_contact: vesselData?.company_contact || '',
    },
  });

  // Watch the type value to ensure Select component updates
  const watchedType = form.watch('type');

  // Reset form when vessel data changes
  useEffect(() => {
    if (vesselData) {
      form.reset({
        name: vesselData.name || '',
        type: vesselData.type || '',
        imo: vesselData.imo || '',
        length_m: vesselData.length_m?.toString() || '',
        beam: vesselData.beam?.toString() || '',
        draft: vesselData.draft?.toString() || '',
        gross_tonnage: vesselData.gross_tonnage?.toString() || '',
        number_of_crew: vesselData.number_of_crew?.toString() || '',
        build_year: vesselData.build_year?.toString() || '',
        flag_state: vesselData.flag_state || '',
        call_sign: vesselData.call_sign || '',
        mmsi: vesselData.mmsi || '',
        description: vesselData.description || '',
        management_company: vesselData.management_company || '',
        company_address: vesselData.company_address || '',
        company_contact: vesselData.company_contact || '',
      }, { keepDefaultValues: false });
    }
  }, [vesselData, form]);

  const onSubmit = async (data: VesselDetailsFormValues) => {
    if (!vessel?.id) return;

    setIsSaving(true);
    try {
      // Transform empty strings to null for optional numeric fields
      const updates = {
        ...data,
        length_m: data.length_m === '' ? null : data.length_m,
        beam: data.beam === '' ? null : data.beam,
        draft: data.draft === '' ? null : data.draft,
        gross_tonnage: data.gross_tonnage === '' ? null : data.gross_tonnage,
        number_of_crew: data.number_of_crew === '' ? null : data.number_of_crew,
        build_year: data.build_year === '' ? null : data.build_year,
        imo: data.imo === '' ? null : data.imo,
        flag_state: data.flag_state === '' ? null : data.flag_state,
        call_sign: data.call_sign === '' ? null : data.call_sign,
        mmsi: data.mmsi === '' ? null : data.mmsi,
        description: data.description === '' ? null : data.description,
        management_company: data.management_company === '' ? null : data.management_company,
        company_address: data.company_address === '' ? null : data.company_address,
        company_contact: data.company_contact === '' ? null : data.company_contact,
      };

      console.log('[VESSEL PROFILE] Sending update request:', {
        vesselId: vessel.id,
        updates: {
          ...updates,
          management_company: updates.management_company,
          company_address: updates.company_address,
          company_contact: updates.company_contact,
        },
      });

      const response = await fetch('/api/vessels/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vesselId: vessel.id,
          updates,
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('[VESSEL PROFILE] Update failed:', responseData);
        throw new Error(responseData.message || responseData.error || 'Failed to update vessel');
      }

      console.log('[VESSEL PROFILE] Update successful:', responseData);

      // Verify company fields were saved (check if columns exist in database)
      if (updates.management_company !== null || updates.company_address !== null || updates.company_contact !== null) {
        const savedVessel = responseData.vessel;
        if (savedVessel) {
          const missingFields: string[] = [];
          if (updates.management_company !== null && savedVessel.management_company !== updates.management_company) {
            missingFields.push('management_company');
          }
          if (updates.company_address !== null && savedVessel.company_address !== updates.company_address) {
            missingFields.push('company_address');
          }
          if (updates.company_contact !== null && savedVessel.company_contact !== updates.company_contact) {
            missingFields.push('company_contact');
          }
          
          if (missingFields.length > 0) {
            console.warn('[VESSEL PROFILE] Some company fields may not have been saved. Missing columns?', missingFields);
            toast({
              title: 'Warning',
              description: `Some company fields may not have been saved. Please ensure the database columns exist: ${missingFields.join(', ')}`,
              variant: 'destructive',
            });
          }
        }
      }

      toast({
        title: 'Vessel Updated',
        description: 'Vessel details have been saved successfully.',
      });

      setIsEditing(false);
      // The page will refresh with new data via useDoc
    } catch (error: any) {
      console.error('Error updating vessel:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update vessel details. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!vessel) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Vessel Details</h1>
          <p className="text-muted-foreground">View and manage your vessel information</p>
          <Separator />
        </div>
        <Card className="rounded-xl border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Ship className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Vessel Found</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              You don't have an active vessel assigned. Please contact support to set up your vessel.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Vessel Details</h1>
            <p className="text-muted-foreground">
              View and manage your vessel information
            </p>
          </div>
          {!isEditing && (
            <Button onClick={() => setIsEditing(true)} variant="default">
              <Edit className="h-4 w-4 mr-2" />
              Edit Vessel Details
            </Button>
          )}
        </div>
        <Separator />
      </div>

      {/* Vessel Information Form */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" key={`vessel-form-${vesselData?.id}-${vesselData?.type || 'no-type'}`}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="rounded-xl border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ship className="h-5 w-5" />
                  Basic Information
                </CardTitle>
                <CardDescription>Essential vessel identification details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vessel Name</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => {
                    const currentValue = watchedType || field.value || '';
                    return (
                      <FormItem>
                        <FormLabel>Vessel Type</FormLabel>
                        <Select 
                          key={`type-select-${vesselData?.id || 'no-id'}-${currentValue || 'empty'}`}
                          onValueChange={field.onChange} 
                          value={currentValue} 
                          disabled={!isEditing}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select vessel type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {vesselTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <FormField
                  control={form.control}
                  name="imo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IMO Number</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="International Maritime Organization number" disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="call_sign"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Call Sign</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Radio call sign" disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mmsi"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>MMSI</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Maritime Mobile Service Identity" disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card className="rounded-xl border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Dimensions & Specifications
                </CardTitle>
                <CardDescription>Physical characteristics of the vessel</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="length_m"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Length (m)</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" step="0.01" placeholder="0.00" disabled={!isEditing} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="beam"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Beam (m)</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" step="0.01" placeholder="0.00" disabled={!isEditing} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="draft"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Draft (m)</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" step="0.01" placeholder="0.00" disabled={!isEditing} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="gross_tonnage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tonnage (tonnes)</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" step="0.01" placeholder="0.00" disabled={!isEditing} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="number_of_crew"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Number of Crew</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" placeholder="0" disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="build_year"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Year Built</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" placeholder="YYYY" min="1900" max={new Date().getFullYear()} disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="flag_state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Flag State</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Country of registration" disabled={!isEditing} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-xl border">
            <CardHeader>
              <CardTitle>Additional Information</CardTitle>
              <CardDescription>Additional notes and description</CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Additional vessel information, notes, or description..." disabled={!isEditing} rows={4} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="rounded-xl border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Company Details
              </CardTitle>
              <CardDescription>Company information for use in testimonials and official documents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="management_company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Company or management company name" disabled={!isEditing} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="company_address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Address</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Full company address" disabled={!isEditing} rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="company_contact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contact Details</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Phone, email, or other contact information" disabled={!isEditing} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {isEditing && (
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  form.reset();
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          )}
        </form>
      </Form>

      {/* Vessel Start Date Card */}
      <Card className="rounded-xl border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Official Start Date
          </CardTitle>
          <CardDescription>
            Set your vessel's official start date. You can only change states from this date onwards.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VesselStartDateCard userProfile={userProfile} />
        </CardContent>
      </Card>

      {/* Account Information Card */}
      <Card className="rounded-xl border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Account Information
          </CardTitle>
          <CardDescription>Your vessel management account</CardDescription>
        </CardHeader>
        <CardContent>
          <UserInfoCard userId={userProfile?.id} />
        </CardContent>
      </Card>

      {/* Subscription Card */}
      <SubscriptionCard />
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useUser();
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  
  // Transform user profile
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    const activeVesselId = (userProfileRaw as any).active_vessel_id || (userProfileRaw as any).activeVesselId;
    const startDate = (userProfileRaw as any).start_date || (userProfileRaw as any).startDate || null;
    return {
      ...userProfileRaw,
      activeVesselId: activeVesselId || undefined,
      startDate: startDate || undefined,
      role: (userProfileRaw as any).role || userProfileRaw.role || 'crew',
      // MCA Application fields
      title: (userProfileRaw as any).title || undefined,
      placeOfBirth: (userProfileRaw as any).place_of_birth || (userProfileRaw as any).placeOfBirth || undefined,
      countryOfBirth: (userProfileRaw as any).country_of_birth || (userProfileRaw as any).countryOfBirth || undefined,
      nationality: (userProfileRaw as any).nationality || undefined,
      telephone: (userProfileRaw as any).telephone || undefined,
      mobile: (userProfileRaw as any).mobile || undefined,
      addressLine1: (userProfileRaw as any).address_line1 || (userProfileRaw as any).addressLine1 || undefined,
      addressLine2: (userProfileRaw as any).address_line2 || (userProfileRaw as any).addressLine2 || undefined,
      addressDistrict: (userProfileRaw as any).address_district || (userProfileRaw as any).addressDistrict || undefined,
      addressTownCity: (userProfileRaw as any).address_town_city || (userProfileRaw as any).addressTownCity || undefined,
      addressCountyState: (userProfileRaw as any).address_county_state || (userProfileRaw as any).addressCountyState || undefined,
      addressPostCode: (userProfileRaw as any).address_post_code || (userProfileRaw as any).addressPostCode || undefined,
      addressCountry: (userProfileRaw as any).address_country || (userProfileRaw as any).addressCountry || undefined,
    } as UserProfile;
  }, [userProfileRaw]);

  // Fetch vessel details if user is vessel role (only fetch when we know the role)
  const isVesselRole = userProfile?.role === 'vessel';
  const { data: vesselData } = useDoc<any>('vessels', isVesselRole ? userProfile?.activeVesselId || null : null);
  
  const vessel = useMemo(() => {
    if (!vesselData) return null;
    return {
      id: vesselData.id,
      name: vesselData.name,
      type: vesselData.type,
      officialNumber: vesselData.imo || vesselData.officialNumber || null,
    } as Vessel;
  }, [vesselData]);

  // Show loading state while profile is loading
  if (isLoadingProfile) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-96" />
        </div>
        <Separator />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // If vessel role, show vessel details page
  if (isVesselRole) {
    return <VesselDetailsPage userProfile={userProfile} vessel={vessel} vesselData={vesselData} />;
  }

  // For crew/captain/admin roles, show regular profile page
  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
            <p className="text-muted-foreground">
              Manage your account information and subscription
            </p>
          </div>
        </div>
        <Separator />
      </div>

      {/* Tabs Section */}
      <Tabs defaultValue="information" className="w-full">
        <TabsList className="rounded-xl">
          <TabsTrigger value="information" className="!rounded-lg">Information</TabsTrigger>
          <TabsTrigger value="mca-details" className="!rounded-lg">MCA Application</TabsTrigger>
          <TabsTrigger value="career" className="!rounded-lg">Career</TabsTrigger>
        </TabsList>

        {/* Information Tab */}
        <TabsContent value="information" className="mt-6">
          <div className="space-y-6">
            {/* Captain Role Application Card - Full width at top for visibility */}
            <CaptainRoleApplicationCard userProfile={userProfile} userId={user?.id} />
            
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Left Column - User Info and Subscription Cards */}
              <div className="lg:col-span-1 space-y-6">
                <UserInfoCard userId={user?.id} />
                <SubscriptionCard />
              </div>
              
              {/* Right Column - User Profile Card - Takes 2/3 of width on large screens */}
              <div className="lg:col-span-2">
                <UserProfileCard />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* MCA Application Details Tab */}
        <TabsContent value="mca-details" className="mt-6">
          <MCAApplicationDetailsCard />
        </TabsContent>

        {/* Career Tab */}
        <TabsContent value="career" className="mt-6">
          <CareerTab userId={user?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}