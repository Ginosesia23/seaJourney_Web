'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc, useCollection } from '@/supabase/database';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, XCircle, Ship, Calendar, User, Mail, AlertCircle, Clock, FileText, Eye } from 'lucide-react';
import { format, parse, eachDayOfInterval, startOfDay, endOfDay, isAfter, isBefore, differenceInDays } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { getVesselStateLogs } from '@/supabase/database/queries';
import { DateComparisonView } from './date-comparison-view';
import type { UserProfile, Testimonial, Vessel, VesselClaimRequest, StateLog } from '@/lib/types';

export default function InboxPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();
  const [testimonials, setTestimonials] = useState<(Testimonial & { user?: { email: string; first_name?: string; last_name?: string; username?: string } })[]>([]);
  const [captaincyRequests, setCaptaincyRequests] = useState<(VesselClaimRequest & { user?: { email: string; first_name?: string; last_name?: string; username?: string }, vessel?: { name: string } })[]>([]);
  const [captainRoleApplications, setCaptainRoleApplications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTestimonial, setSelectedTestimonial] = useState<(Testimonial & { user?: { email: string; first_name?: string; last_name?: string; username?: string } }) | null>(null);
  const [selectedCaptaincyRequest, setSelectedCaptaincyRequest] = useState<(VesselClaimRequest & { user?: { email: string; first_name?: string; last_name?: string; username?: string }, vessel?: { name: string } }) | null>(null);
  const [selectedCaptainRoleApplication, setSelectedCaptainRoleApplication] = useState<any | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCaptaincyDialogOpen, setIsCaptaincyDialogOpen] = useState(false);
  const [isCaptainRoleDialogOpen, setIsCaptainRoleDialogOpen] = useState(false);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // State for date comparison
  const [vesselStateLogs, setVesselStateLogs] = useState<StateLog[]>([]); // Crew member's logs
  const [allVesselLogs, setAllVesselLogs] = useState<StateLog[]>([]); // All vessel logs (for comparison)
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Fetch user profile to get email
  const { data: userProfileRaw } = useDoc<UserProfile>('users', user?.id);
  
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    return {
      ...userProfileRaw,
      email: (userProfileRaw as any).email || user?.email || '',
      role: (userProfileRaw as any).role || userProfileRaw.role || 'crew',
    } as UserProfile;
  }, [userProfileRaw, user]);

  // Fetch all vessels for name lookup
  const { data: vessels } = useCollection<Vessel>('vessels');

  // Check if user is captain/admin (has captain, vessel, or admin role, or position contains captain)
  const isCaptain = useMemo(() => {
    if (!userProfile) return false;
    const role = userProfile.role?.toLowerCase() || '';
    const position = ((userProfileRaw as any)?.position || '').toLowerCase();
    // Captains, admins, and vessel managers can access, or users with captain in their position
    return role === 'captain' || role === 'vessel' || role === 'admin' || position.includes('captain');
  }, [userProfile, userProfileRaw]);

  // Check if user is admin
  const isAdmin = useMemo(() => {
    return userProfile?.role?.toLowerCase() === 'admin';
  }, [userProfile]);

  // Fetch pending testimonials and captaincy requests
  useEffect(() => {
    if (!isCaptain) {
      setIsLoading(false);
      return;
    }

    const fetchPendingData = async () => {
      setIsLoading(true);
      try {
        const userIsAdmin = userProfile?.role?.toLowerCase() === 'admin';
        
        // For admins: fetch captaincy requests and captain role applications (testimonials are vessel-specific)
        // For captains/vessel managers: only fetch testimonials addressed to them
        if (userIsAdmin) {
          // Admins see captaincy requests and captain role applications
          console.log('[INBOX] Fetching captaincy requests and captain role applications for admin user:', user?.id);
          
          // Fetch captaincy requests
          const { data: captaincyData, error: captaincyError } = await supabase
            .from('vessel_claim_requests')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

          console.log('[INBOX] Captaincy requests query result:', { captaincyData, captaincyError });

          if (captaincyError) {
            console.error('[INBOX] Error fetching pending captaincy requests:', captaincyError);
            setCaptaincyRequests([]);
          } else if (captaincyData && captaincyData.length > 0) {
            const captaincyRequestsWithDetails = await Promise.all(
              captaincyData.map(async (request) => {
                const [userResult, vesselResult] = await Promise.all([
                  supabase
                    .from('users')
                    .select('email, first_name, last_name, username')
                    .eq('id', request.requested_by)
                    .maybeSingle(),
                  supabase
                    .from('vessels')
                    .select('name')
                    .eq('id', request.vessel_id)
                    .maybeSingle(),
                ]);

                return {
                  ...request,
                  user: userResult.data || undefined,
                  vessel: vesselResult.data || undefined,
                };
              })
            );
            setCaptaincyRequests(captaincyRequestsWithDetails as any);
          } else {
            setCaptaincyRequests([]);
          }

          // Fetch captain role applications - explicitly select all fields including supporting_documents
          const { data: applicationsData, error: applicationsError } = await supabase
            .from('captain_role_applications')
            .select('id, user_id, status, supporting_documents, notes, reviewed_by, reviewed_at, rejection_reason, created_at, updated_at')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

          console.log('[INBOX] Captain role applications query result:', { applicationsData, applicationsError });

          if (applicationsError) {
            console.error('[INBOX] Error fetching captain role applications:', applicationsError);
            setCaptainRoleApplications([]);
          } else if (applicationsData && applicationsData.length > 0) {
            const applicationsWithDetails = await Promise.all(
              applicationsData.map(async (application) => {
                console.log('[INBOX] Processing application:', { id: application.id, supporting_documents: application.supporting_documents });
                
                const userResult = await supabase
                  .from('users')
                  .select('email, first_name, last_name, username, position')
                  .eq('id', application.user_id)
                  .maybeSingle();

                return {
                  ...application,
                  user: userResult.data || undefined,
                };
              })
            );
            console.log('[INBOX] Final applications with details:', applicationsWithDetails);
            setCaptainRoleApplications(applicationsWithDetails);
          } else {
            setCaptainRoleApplications([]);
          }

          // Set testimonials to empty for admins
          setTestimonials([]);
        } else {
          // Captains/vessel managers see testimonials addressed to them
          // First try to match by captain_user_id (SeaJourney users), then fall back to email matching
          let query = supabase
            .from('testimonials')
            .select('*')
            .eq('status', 'pending_captain');
          
          // Filter by captain_user_id first (preferred - SeaJourney users)
          // Also include testimonials where captain_email matches (for external captains)
          if (user?.id && user?.email) {
            // Match by either captain_user_id OR captain_email
            query = query.or(`captain_user_id.eq.${user.id},captain_email.ilike.${user.email}`);
          } else if (user?.id) {
            // Only match by captain_user_id
            query = query.eq('captain_user_id', user.id);
          } else if (user?.email) {
            // Fallback to email matching if user.id is not available
            query = query.ilike('captain_email', user.email);
          }
          
          const { data: testimonialsData, error: testimonialsError } = await query.order('created_at', { ascending: false });

          if (testimonialsError) {
            console.error('Error fetching pending testimonials:', testimonialsError);
            toast({
              title: 'Error',
              description: 'Failed to load pending requests. Please try again.',
              variant: 'destructive',
            });
          } else if (testimonialsData) {
            // Fetch user profiles for each testimonial separately
            const testimonialsWithUsers = await Promise.all(
              testimonialsData.map(async (testimonial) => {
                const { data: userData } = await supabase
                  .from('users')
                  .select('email, first_name, last_name, username')
                  .eq('id', testimonial.user_id)
                  .maybeSingle();
                
                return {
                  ...testimonial,
                  user: userData || undefined,
                };
              })
            );
            
            setTestimonials(testimonialsWithUsers as any);
          } else {
            setTestimonials([]);
          }
          // Set captaincy requests to empty for non-admins
          setCaptaincyRequests([]);
        }
      } catch (error: any) {
        console.error('Error fetching pending data:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to load pending requests.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchPendingData();
  }, [user?.email, isCaptain, userProfile, supabase, toast]);

  const getVesselName = (vesselId: string) => {
    return vessels?.find(v => v.id === vesselId)?.name || 'Unknown Vessel';
  };

  const getUserName = (item: typeof selectedTestimonial | typeof selectedCaptaincyRequest) => {
    if (!item?.user) return 'Unknown User';
    const firstName = (item.user as any).first_name || '';
    const lastName = (item.user as any).last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || (item.user as any).username || (item.user as any).email || 'Unknown User';
  };

  const handleApprove = async () => {
    if (!selectedTestimonial) return;

    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('testimonials')
        .update({
          status: 'approved',
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedTestimonial.id);

      if (error) {
        throw error;
      }

      toast({
        title: 'Testimonial Approved',
        description: 'The testimonial has been approved successfully.',
      });

      // Remove from list
      setTestimonials(prev => prev.filter(t => t.id !== selectedTestimonial.id));
      setIsDialogOpen(false);
      setSelectedTestimonial(null);
      setAction(null);
    } catch (error: any) {
      console.error('Error approving testimonial:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve testimonial. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedTestimonial) return;

    if (!rejectionReason.trim()) {
      toast({
        title: 'Rejection Reason Required',
        description: 'Please provide a reason for rejecting this testimonial.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    try {
      const currentNotes = selectedTestimonial.notes || '';
      const notes = currentNotes
        ? `${currentNotes}\n\nRejection reason: ${rejectionReason}`
        : `Rejection reason: ${rejectionReason}`;

      const { error } = await supabase
        .from('testimonials')
        .update({
          status: 'rejected',
          notes: notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedTestimonial.id);

      if (error) {
        throw error;
      }

      toast({
        title: 'Testimonial Rejected',
        description: 'The testimonial has been rejected.',
      });

      // Remove from list
      setTestimonials(prev => prev.filter(t => t.id !== selectedTestimonial.id));
      setIsDialogOpen(false);
      setSelectedTestimonial(null);
      setAction(null);
      setRejectionReason('');
    } catch (error: any) {
      console.error('Error rejecting testimonial:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject testimonial. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const openActionDialog = async (testimonial: typeof testimonials[0], actionType: 'approve' | 'reject') => {
    setSelectedTestimonial(testimonial);
    setAction(actionType);
    setRejectionReason('');
    setIsDialogOpen(true);
    
    // Fetch vessel state logs for date comparison
    // For captains: fetch both crew member's logs AND all vessel logs (captain has read permission for vessel)
    if (actionType === 'approve' && testimonial.vessel_id) {
      setIsLoadingLogs(true);
      try {
        console.log('[INBOX] Fetching logs for comparison:', {
          vesselId: testimonial.vessel_id,
          crewUserId: testimonial.user_id,
          currentUserId: user?.id,
          isCaptain: isCaptain
        });
        
        // Fetch crew member's logs (what they requested) - may be empty if RLS blocks
        let crewLogs: StateLog[] = [];
        try {
          if (testimonial.user_id) {
            crewLogs = await getVesselStateLogs(supabase, testimonial.vessel_id, testimonial.user_id);
          }
        } catch (error) {
          console.warn('[INBOX] Could not fetch crew logs (RLS may block), will use vessel logs:', error);
        }
        
        // Fetch ALL vessel logs (captain has permission to see all logs on their vessel)
        // This allows captain to compare what crew requested vs what actually happened on vessel
        const vesselLogs = await getVesselStateLogs(supabase, testimonial.vessel_id);
        
        console.log('[INBOX] Fetched logs:', {
          crewLogsCount: crewLogs.length,
          vesselLogsCount: vesselLogs.length,
          crewFirstFew: crewLogs.slice(0, 5),
          vesselFirstFew: vesselLogs.slice(0, 5),
        });
        
        // Store both sets of logs
        // Use crew logs if available, otherwise fall back to vessel logs filtered to date range
        setVesselStateLogs(crewLogs.length > 0 ? crewLogs : vesselLogs);
        setAllVesselLogs(vesselLogs); // Store all vessel logs for comparison
      } catch (error: any) {
        console.error('[INBOX] Error fetching vessel state logs:', {
          error,
          message: error?.message,
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
          vesselId: testimonial.vessel_id,
          userId: testimonial.user_id
        });
        setVesselStateLogs([]);
      } finally {
        setIsLoadingLogs(false);
      }
    } else {
      setVesselStateLogs([]);
    }
  };

  const openCaptaincyActionDialog = (request: typeof captaincyRequests[0], actionType: 'approve' | 'reject') => {
    setSelectedCaptaincyRequest(request);
    setAction(actionType);
    setRejectionReason('');
    setIsCaptaincyDialogOpen(true);
  };

  const openCaptainRoleActionDialog = (application: any, actionType: 'approve' | 'reject') => {
    console.log('[INBOX] Opening captain role dialog with application:', {
      id: application.id,
      supporting_documents: application.supporting_documents,
      supporting_documents_type: typeof application.supporting_documents,
      is_array: Array.isArray(application.supporting_documents),
      length: application.supporting_documents?.length,
      full_application: application,
    });
    setSelectedCaptainRoleApplication(application);
    setAction(actionType);
    setRejectionReason('');
    setIsCaptainRoleDialogOpen(true);
  };

  const handleApproveCaptainRole = async () => {
    if (!selectedCaptainRoleApplication || !userProfile?.id) return;

    setIsProcessing(true);
    try {
      const response = await fetch('/api/captain-role-applications/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: selectedCaptainRoleApplication.id,
          reviewedBy: userProfile.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve application');
      }

      toast({
        title: 'Application Approved',
        description: 'The captain role has been granted to the user.',
      });

      // Remove from list and refresh
      setCaptainRoleApplications(prev => prev.filter(a => a.id !== selectedCaptainRoleApplication.id));
      setIsCaptainRoleDialogOpen(false);
      setSelectedCaptainRoleApplication(null);
      setAction(null);
    } catch (error: any) {
      console.error('Error approving captain role application:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve application. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectCaptainRole = async () => {
    if (!selectedCaptainRoleApplication || !userProfile?.id) return;

    if (!rejectionReason.trim()) {
      toast({
        title: 'Rejection Reason Required',
        description: 'Please provide a reason for rejecting this application.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch('/api/captain-role-applications/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: selectedCaptainRoleApplication.id,
          reviewedBy: userProfile.id,
          rejectionReason: rejectionReason.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject application');
      }

      toast({
        title: 'Application Rejected',
        description: 'The application has been rejected.',
      });

      // Remove from list
      setCaptainRoleApplications(prev => prev.filter(a => a.id !== selectedCaptainRoleApplication.id));
      setIsCaptainRoleDialogOpen(false);
      setSelectedCaptainRoleApplication(null);
      setAction(null);
      setRejectionReason('');
    } catch (error: any) {
      console.error('Error rejecting captain role application:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject application. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveCaptaincy = async () => {
    if (!selectedCaptaincyRequest || !user?.id) return;

    setIsProcessing(true);
    try {
      // Call API route to approve captaincy request
      // This uses supabaseAdmin to bypass RLS and create vessel assignment
      const response = await fetch('/api/vessel-claim-requests/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selectedCaptaincyRequest.id,
          reviewedBy: user.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || 'Failed to approve captaincy request');
      }

      toast({
        title: 'Captaincy Request Approved',
        description: 'The captaincy request has been approved and the captain has been assigned to the vessel.',
      });

      // Remove from list
      setCaptaincyRequests(prev => prev.filter(r => r.id !== selectedCaptaincyRequest.id));
      setIsCaptaincyDialogOpen(false);
      setSelectedCaptaincyRequest(null);
      setAction(null);
    } catch (error: any) {
      console.error('Error approving captaincy request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to approve captaincy request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectCaptaincy = async () => {
    if (!selectedCaptaincyRequest || !user?.id) return;

    if (!rejectionReason.trim()) {
      toast({
        title: 'Rejection Reason Required',
        description: 'Please provide a reason for rejecting this request.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('vessel_claim_requests')
        .update({
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: rejectionReason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedCaptaincyRequest.id);

      if (error) {
        throw error;
      }

      toast({
        title: 'Captaincy Request Rejected',
        description: 'The captaincy request has been rejected.',
      });

      // Remove from list
      setCaptaincyRequests(prev => prev.filter(r => r.id !== selectedCaptaincyRequest.id));
      setIsCaptaincyDialogOpen(false);
      setSelectedCaptaincyRequest(null);
      setAction(null);
      setRejectionReason('');
    } catch (error: any) {
      console.error('Error rejecting captaincy request:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reject captaincy request. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isCaptain) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
          <p className="text-muted-foreground">View and respond to testimonial requests</p>
          <Separator />
        </div>
        <Card className="rounded-xl border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              This page is only accessible to captains and vessel managers. If you believe this is an error, please contact support.
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
            <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
            <p className="text-muted-foreground">
              {isAdmin 
                ? 'Review and approve captaincy requests for vessels'
                : 'Review and respond to testimonial sign-off requests from crew members'}
            </p>
          </div>
          {(testimonials.length > 0 || captaincyRequests.length > 0 || captainRoleApplications.length > 0) && (
            <Badge variant="secondary" className="text-sm">
              {testimonials.length + captaincyRequests.length + captainRoleApplications.length} pending request{(testimonials.length + captaincyRequests.length + captainRoleApplications.length) !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <Separator />
      </div>

      {/* Content */}
      {isLoading ? (
        <Card className="rounded-xl border">
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      ) : (isAdmin && captaincyRequests.length === 0 && captainRoleApplications.length === 0) || (!isAdmin && testimonials.length === 0) ? (
        <Card className="rounded-xl border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Mail className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Pending Requests</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {isAdmin 
                ? 'You don\'t have any pending captaincy requests at this time.'
                : 'You don\'t have any pending testimonial sign-off requests at this time.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Captain Role Applications Section (Admin only) */}
          {isAdmin && captainRoleApplications.length > 0 && (
            <Card className="rounded-xl border shadow-sm">
              <CardHeader>
                <CardTitle>Captain Role Applications</CardTitle>
                <CardDescription>Review and approve applications from users requesting the captain role</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Applicant</TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {captainRoleApplications.map((application) => (
                        <TableRow key={application.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <div>{getUserName(application)}</div>
                                {(application.user as any)?.email && (
                                  <div className="text-xs text-muted-foreground">
                                    {(application.user as any).email}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{(application.user as any)?.position || 'N/A'}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              {format(new Date(application.created_at || new Date()), 'MMM d, yyyy')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => openCaptainRoleActionDialog(application, 'approve')}
                                size="sm"
                                className="rounded-lg bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Approve
                              </Button>
                              <Button
                                onClick={() => openCaptainRoleActionDialog(application, 'reject')}
                                size="sm"
                                variant="destructive"
                                className="rounded-lg"
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Captaincy Requests Section (Admin only) */}
          {isAdmin && captaincyRequests.length > 0 && (
            <Card className="rounded-xl border shadow-sm">
              <CardHeader>
                <CardTitle>Vessel Captaincy Requests</CardTitle>
                <CardDescription>Review and approve captaincy requests for vessels</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Requested By</TableHead>
                        <TableHead>Vessel</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {captaincyRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <div>{getUserName(request as any)}</div>
                                {(request.user as any)?.email && (
                                  <div className="text-xs text-muted-foreground">
                                    {(request.user as any).email}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Ship className="h-4 w-4 text-muted-foreground" />
                              {(request.vessel as any)?.name || getVesselName(request.vessel_id)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{request.requested_role || 'captain'}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              {format(new Date(request.created_at || new Date()), 'MMM d, yyyy')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => openCaptaincyActionDialog(request, 'approve')}
                                size="sm"
                                className="rounded-lg bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Approve
                              </Button>
                              <Button
                                onClick={() => openCaptaincyActionDialog(request, 'reject')}
                                size="sm"
                                variant="destructive"
                                className="rounded-lg"
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Testimonials Section */}
          {testimonials.length > 0 && (
            <Card className="rounded-xl border shadow-sm">
              <CardHeader>
                <CardTitle>Testimonial Sign-off Requests</CardTitle>
                <CardDescription>Review and respond to testimonial sign-off requests from crew members</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Requested By</TableHead>
                        <TableHead>Vessel</TableHead>
                        <TableHead>Date Range</TableHead>
                        <TableHead>Days</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {testimonials.map((testimonial) => (
                    <TableRow key={testimonial.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div>{getUserName(testimonial)}</div>
                            {(testimonial.user as any)?.email && (
                              <div className="text-xs text-muted-foreground">
                                {(testimonial.user as any).email}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Ship className="h-4 w-4 text-muted-foreground" />
                          {getVesselName(testimonial.vessel_id)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <div className="text-sm">
                            {format(new Date(testimonial.start_date), 'MMM d, yyyy')} - {format(new Date(testimonial.end_date), 'MMM d, yyyy')}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5 text-sm">
                          <div className="font-medium">Total: {testimonial.total_days}</div>
                          <div className="text-xs text-muted-foreground">
                            At Sea: {testimonial.at_sea_days} | Standby: {testimonial.standby_days}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          {format(new Date(testimonial.created_at), 'MMM d, yyyy')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          onClick={() => openActionDialog(testimonial, 'approve')}
                          size="sm"
                          variant="outline"
                          className="rounded-lg"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Captaincy Requests Section (Admin only) */}
          {isAdmin && captaincyRequests.length > 0 && (
            <Card className="rounded-xl border shadow-sm">
              <CardHeader>
                <CardTitle>Captaincy Requests</CardTitle>
                <CardDescription>Review and respond to captaincy/claim requests from captains</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Requested By</TableHead>
                        <TableHead>Vessel</TableHead>
                        <TableHead>Requested Role</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {captaincyRequests.map((request) => (
                        <TableRow key={request.id} className="hover:bg-muted/50 transition-colors">
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <div>{getUserName(request as any)}</div>
                                {(request.user as any)?.email && (
                                  <div className="text-xs text-muted-foreground">
                                    {(request.user as any).email}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Ship className="h-4 w-4 text-muted-foreground" />
                              {(request.vessel as any)?.name || getVesselName(request.vessel_id)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{request.requested_role || 'captain'}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              {format(new Date(request.created_at || new Date()), 'MMM d, yyyy')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                onClick={() => openCaptaincyActionDialog(request, 'approve')}
                                size="sm"
                                className="rounded-lg bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Approve
                              </Button>
                              <Button
                                onClick={() => openCaptaincyActionDialog(request, 'reject')}
                                size="sm"
                                variant="destructive"
                                className="rounded-lg"
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Action Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="rounded-xl max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {action === 'approve' ? 'Review Testimonial Request' : 'Reject Testimonial'}
            </DialogTitle>
            <DialogDescription>
              {action === 'approve' 
                ? 'Review the requested dates and compare with actual vessel logs before approving.'
                : 'Please provide a reason for rejecting this testimonial request.'}
            </DialogDescription>
          </DialogHeader>
          {selectedTestimonial && (
            <div className="space-y-4 py-4">
              {/* Basic Info */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Requested By:</span>
                  <span className="font-medium">{getUserName(selectedTestimonial)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Vessel:</span>
                  <span className="font-medium">{getVesselName(selectedTestimonial.vessel_id)}</span>
                </div>
              </div>

              {/* Date Comparison - Show for approve action, but also allow rejection from this view */}
              {action === 'approve' && (
                <div className="space-y-4">
                  <Separator />
                  <div>
                    <h4 className="text-sm font-semibold mb-3">Date Range Comparison</h4>
                    
                    {/* Requested Dates */}
                    <Card className="mb-3">
                      <CardContent className="pt-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 mb-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Requested Date Range</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">From:</span>
                            <span className="font-medium">{format(new Date(selectedTestimonial.start_date), 'MMM d, yyyy')}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">To:</span>
                            <span className="font-medium">{format(new Date(selectedTestimonial.end_date), 'MMM d, yyyy')}</span>
                          </div>
                          <div className="flex justify-between text-sm pt-2 border-t">
                            <span className="text-muted-foreground">Total Days Requested:</span>
                            <span className="font-semibold">{selectedTestimonial.total_days} days</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Actual Logged Dates */}
                    {isLoadingLogs ? (
                      <Card>
                        <CardContent className="pt-4">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm text-muted-foreground">Loading vessel logs...</span>
                          </div>
                        </CardContent>
                      </Card>
                    ) : vesselStateLogs.length > 0 || allVesselLogs.length > 0 ? (
                      <DateComparisonView 
                        requestedStart={selectedTestimonial.start_date}
                        requestedEnd={selectedTestimonial.end_date}
                        requestedDays={selectedTestimonial.total_days}
                        actualLogs={vesselStateLogs}
                        vesselLogs={allVesselLogs}
                        testimonial={selectedTestimonial}
                      />
                    ) : (
                      <Card className="border-yellow-500/30 bg-yellow-500/5">
                        <CardContent className="pt-4">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">No Logs Found</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                No logged dates found for this user on this vessel. Please verify the date range before approving.
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Rejection Reason Field - Available when reviewing */}
                  <Separator />
                  <div className="space-y-2">
                    <Label htmlFor="rejection-reason-review">Rejection Reason (if rejecting)</Label>
                    <Textarea
                      id="rejection-reason-review"
                      placeholder="If you need to reject this request, please provide a reason..."
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      className="rounded-lg min-h-[100px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      If you find discrepancies or issues with the request, you can reject it and provide a reason above.
                    </p>
                  </div>
                </div>
              )}

              {action === 'reject' && (
                <div className="space-y-2">
                  <Label htmlFor="rejection-reason">Rejection Reason *</Label>
                  <Textarea
                    id="rejection-reason"
                    placeholder="Please provide a reason for rejecting this request..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="rounded-lg min-h-[100px]"
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                setSelectedTestimonial(null);
                setAction(null);
                setRejectionReason('');
              }}
              disabled={isProcessing}
              className="rounded-xl"
            >
              Cancel
            </Button>
            {action === 'approve' && (
              <>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={isProcessing || !rejectionReason.trim()}
                  className="rounded-xl"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={isProcessing}
                  className="rounded-xl bg-green-600 hover:bg-green-700"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Approve
                    </>
                  )}
                </Button>
              </>
            )}
            {action === 'reject' && (
              <Button
                onClick={handleReject}
                disabled={isProcessing || !rejectionReason.trim()}
                variant="destructive"
                className="rounded-xl"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Reject'
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Captain Role Application Action Dialog */}
      <Dialog open={isCaptainRoleDialogOpen} onOpenChange={setIsCaptainRoleDialogOpen}>
        <DialogContent className="rounded-xl max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {action === 'approve' ? 'Approve Captain Role Application' : 'Reject Captain Role Application'}
            </DialogTitle>
            <DialogDescription>
              {action === 'approve' 
                ? 'Are you sure you want to approve this application and grant the captain role?'
                : 'Please provide a reason for rejecting this application.'}
            </DialogDescription>
          </DialogHeader>
          {selectedCaptainRoleApplication && (
            <div className="space-y-4 py-4">
              {console.log('[INBOX] Rendering dialog with selectedCaptainRoleApplication:', {
                id: selectedCaptainRoleApplication.id,
                supporting_documents: selectedCaptainRoleApplication.supporting_documents,
                supporting_documents_type: typeof selectedCaptainRoleApplication.supporting_documents,
                is_array: Array.isArray(selectedCaptainRoleApplication.supporting_documents),
                length: selectedCaptainRoleApplication.supporting_documents?.length,
              })}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Applicant:</span>
                  <span className="font-medium">{getUserName(selectedCaptainRoleApplication)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{(selectedCaptainRoleApplication.user as any)?.email || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Position:</span>
                  <span className="font-medium">{(selectedCaptainRoleApplication.user as any)?.position || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Submitted:</span>
                  <span className="font-medium">
                    {format(new Date(selectedCaptainRoleApplication.created_at || new Date()), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>

              {/* Supporting Documents - Always show this section */}
              <div className="space-y-2">
                <Label>Supporting Documents</Label>
                {(() => {
                  // Handle both snake_case and camelCase field names, and ensure it's an array
                  const docs = (selectedCaptainRoleApplication.supporting_documents || 
                               (selectedCaptainRoleApplication as any).supportingDocuments) || [];
                  const documentsArray = Array.isArray(docs) ? docs : [];
                  
                  console.log('[INBOX] Supporting documents check:', {
                    raw: selectedCaptainRoleApplication.supporting_documents,
                    camelCase: (selectedCaptainRoleApplication as any).supportingDocuments,
                    docs,
                    documentsArray,
                    length: documentsArray.length,
                    isArray: Array.isArray(docs),
                  });
                  
                  if (documentsArray.length > 0) {
                    return (
                      <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-4 bg-muted/30">
                        {documentsArray.map((doc: string, index: number) => {
                          const docUrl = typeof doc === 'string' ? doc : String(doc);
                          return (
                            <div key={index} className="flex items-start gap-2 p-2 rounded-lg bg-background border hover:bg-muted/50 transition-colors">
                              <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <a 
                                href={docUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 hover:underline break-all text-sm flex-1"
                              >
                                {docUrl}
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    );
                  } else {
                    return (
                      <div className="border rounded-lg p-4 bg-muted/30 text-sm text-muted-foreground italic">
                        No supporting documents provided
                      </div>
                    );
                  }
                })()}
              </div>

              {/* Notes */}
              {selectedCaptainRoleApplication.notes && (
                <div className="space-y-2">
                  <Label>Additional Notes</Label>
                  <div className="text-sm text-muted-foreground border rounded-lg p-3 bg-muted/50">
                    {selectedCaptainRoleApplication.notes}
                  </div>
                </div>
              )}

              {action === 'reject' && (
                <div className="space-y-2">
                  <Label htmlFor="captain-role-rejection-reason">Rejection Reason *</Label>
                  <Textarea
                    id="captain-role-rejection-reason"
                    placeholder="Please provide a reason for rejecting this application..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="rounded-lg min-h-[100px]"
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCaptainRoleDialogOpen(false);
                setSelectedCaptainRoleApplication(null);
                setAction(null);
                setRejectionReason('');
              }}
              disabled={isProcessing}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={action === 'approve' ? handleApproveCaptainRole : handleRejectCaptainRole}
              disabled={isProcessing}
              className={action === 'approve' ? 'rounded-xl bg-green-600 hover:bg-green-700' : 'rounded-xl'}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                action === 'approve' ? 'Approve' : 'Reject'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Captaincy Action Dialog */}
      <Dialog open={isCaptaincyDialogOpen} onOpenChange={setIsCaptaincyDialogOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>
              {action === 'approve' ? 'Approve Captaincy Request' : 'Reject Captaincy Request'}
            </DialogTitle>
            <DialogDescription>
              {action === 'approve' 
                ? 'Are you sure you want to approve this captaincy request?'
                : 'Please provide a reason for rejecting this captaincy request.'}
            </DialogDescription>
          </DialogHeader>
          {selectedCaptaincyRequest && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Requested By:</span>
                  <span className="font-medium">{getUserName(selectedCaptaincyRequest as any)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Vessel:</span>
                  <span className="font-medium">{(selectedCaptaincyRequest.vessel as any)?.name || getVesselName(selectedCaptaincyRequest.vessel_id)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Requested Role:</span>
                  <span className="font-medium">{selectedCaptaincyRequest.requested_role || 'captain'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Requested:</span>
                  <span className="font-medium">
                    {format(new Date(selectedCaptaincyRequest.created_at || new Date()), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>
              {action === 'reject' && (
                <div className="space-y-2">
                  <Label htmlFor="captaincy-rejection-reason">Rejection Reason *</Label>
                  <Textarea
                    id="captaincy-rejection-reason"
                    placeholder="Please provide a reason for rejecting this request..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="rounded-lg min-h-[100px]"
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCaptaincyDialogOpen(false);
                setSelectedCaptaincyRequest(null);
                setAction(null);
                setRejectionReason('');
              }}
              disabled={isProcessing}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              onClick={action === 'approve' ? handleApproveCaptaincy : handleRejectCaptaincy}
              disabled={isProcessing}
              className={action === 'approve' ? 'rounded-xl bg-green-600 hover:bg-green-700' : 'rounded-xl'}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                action === 'approve' ? 'Approve' : 'Reject'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
