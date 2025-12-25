'use client';

import { useState, useEffect, useMemo } from 'react';
import { UserProfileCard } from '@/components/dashboard/user-profile';
import { SubscriptionCard } from '@/components/dashboard/subscription-card';
import { UserInfoCard } from '@/components/dashboard/user-info-card';
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
import { getVesselAssignments } from '@/supabase/database/queries';
import { format, parse, differenceInDays, isAfter, startOfDay, isBefore, getYear, getMonth, setMonth, setYear, startOfMonth } from 'date-fns';
import { Ship, Calendar, Briefcase, Loader2, User, Save, Edit, Shield, FileText, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { vesselTypes, vesselTypeValues } from '@/lib/vessel-types';
import type { VesselAssignment, Vessel, UserProfile } from '@/lib/types';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

function CareerTab({ userId }: { userId?: string }) {
  const { supabase } = useSupabase();
  const [assignments, setAssignments] = useState<VesselAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Fetch all vessels for name lookup
  const { data: vessels } = useCollection<Vessel>('vessels');
  
  const vesselMap = useMemo(() => {
    const map = new Map<string, Vessel>();
    vessels?.forEach(vessel => {
      map.set(vessel.id, vessel);
    });
    return map;
  }, [vessels]);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const fetchAssignments = async () => {
      setIsLoading(true);
      try {
        const data = await getVesselAssignments(supabase, userId);
        setAssignments(data);
      } catch (error) {
        console.error('Error fetching vessel assignments:', error);
        setAssignments([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAssignments();
  }, [userId, supabase]);

  // Calculate total days for each assignment
  const getAssignmentDuration = (assignment: VesselAssignment): number => {
    const start = parse(assignment.startDate, 'yyyy-MM-dd', new Date());
    const end = assignment.endDate 
      ? parse(assignment.endDate, 'yyyy-MM-dd', new Date())
      : new Date();
    return differenceInDays(end, start) + 1; // +1 to include both start and end days
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <Card className="rounded-xl border">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Ship className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Career History</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Your vessel assignments and position history will appear here once you start logging sea service.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Briefcase className="h-5 w-5" />
          Career History
        </CardTitle>
        <CardDescription>
          Your vessel assignments and position progression over time
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
        {assignments.length > 0 && (
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
        )}
      </CardContent>
    </Card>
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
      name: vessel?.name || '',
      type: (vessel?.type as any) || '',
      imo: vessel?.imo || vessel?.officialNumber || '',
      length_m: vessel?.length_m?.toString() || '',
      beam: vessel?.beam?.toString() || '',
      draft: vessel?.draft?.toString() || '',
      gross_tonnage: vessel?.gross_tonnage?.toString() || '',
      number_of_crew: vessel?.number_of_crew?.toString() || '',
      build_year: vessel?.build_year?.toString() || '',
      flag_state: vessel?.flag_state || '',
      call_sign: vessel?.call_sign || '',
      mmsi: vessel?.mmsi || '',
      description: vessel?.description || '',
    },
  });

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
      });
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
      };

      const response = await fetch('/api/vessels/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vesselId: vessel.id,
          updates,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update vessel');
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vessel Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ''} disabled={!isEditing}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select vessel type">
                              {field.value ? vesselTypes.find(t => t.value === field.value)?.label : 'Select vessel type'}
                            </SelectValue>
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
                  )}
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
    return {
      ...userProfileRaw,
      activeVesselId: activeVesselId || undefined,
      role: (userProfileRaw as any).role || userProfileRaw.role || 'crew',
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

        {/* Career Tab */}
        <TabsContent value="career" className="mt-6">
          <CareerTab userId={user?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}