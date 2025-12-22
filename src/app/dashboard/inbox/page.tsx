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
import { Loader2, CheckCircle2, XCircle, Ship, Calendar, User, Mail, AlertCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { UserProfile, Testimonial, Vessel, VesselClaimRequest } from '@/lib/types';

export default function InboxPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();
  const [testimonials, setTestimonials] = useState<(Testimonial & { user?: { email: string; first_name?: string; last_name?: string; username?: string } })[]>([]);
  const [captaincyRequests, setCaptaincyRequests] = useState<(VesselClaimRequest & { user?: { email: string; first_name?: string; last_name?: string; username?: string }, vessel?: { name: string } })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTestimonial, setSelectedTestimonial] = useState<(Testimonial & { user?: { email: string; first_name?: string; last_name?: string; username?: string } }) | null>(null);
  const [selectedCaptaincyRequest, setSelectedCaptaincyRequest] = useState<(VesselClaimRequest & { user?: { email: string; first_name?: string; last_name?: string; username?: string }, vessel?: { name: string } }) | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCaptaincyDialogOpen, setIsCaptaincyDialogOpen] = useState(false);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

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
        
        // For admins: only fetch captaincy requests (testimonials are vessel-specific)
        // For captains/vessel managers: only fetch testimonials addressed to them
        if (userIsAdmin) {
          // Admins only see captaincy requests
          console.log('[INBOX] Fetching captaincy requests for admin user:', user?.id);
          
          // First, fetch the captaincy requests without joins (to avoid RLS issues)
          const { data: captaincyData, error: captaincyError } = await supabase
            .from('vessel_claim_requests')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

          console.log('[INBOX] Captaincy requests query result:', { captaincyData, captaincyError });

          if (captaincyError) {
            console.error('[INBOX] Error fetching pending captaincy requests:', captaincyError);
            console.error('[INBOX] Error details:', {
              code: captaincyError.code,
              message: captaincyError.message,
              details: captaincyError.details,
              hint: captaincyError.hint,
            });
            toast({
              title: 'Error',
              description: `Failed to load pending requests: ${captaincyError.message || 'Unknown error'}`,
              variant: 'destructive',
            });
            setCaptaincyRequests([]);
          } else if (captaincyData && captaincyData.length > 0) {
            console.log('[INBOX] Found', captaincyData.length, 'captaincy requests, fetching user and vessel details...');
            
            // Fetch user profiles and vessel details separately
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

            console.log('[INBOX] Final captaincy requests with details:', captaincyRequestsWithDetails);
            setCaptaincyRequests(captaincyRequestsWithDetails as any);
          } else {
            console.log('[INBOX] No pending captaincy requests found');
            setCaptaincyRequests([]);
          }
          // Set testimonials to empty for admins
          setTestimonials([]);
        } else {
          // Captains/vessel managers see testimonials addressed to them
          let query = supabase
            .from('testimonials')
            .select('*')
            .eq('status', 'pending_captain');
          
          // Filter by captain_email matching user's email
          if (user?.email) {
            query = query.ilike('captain_email', user.email || '');
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

  const openActionDialog = (testimonial: typeof testimonials[0], actionType: 'approve' | 'reject') => {
    setSelectedTestimonial(testimonial);
    setAction(actionType);
    setRejectionReason('');
    setIsDialogOpen(true);
  };

  const openCaptaincyActionDialog = (request: typeof captaincyRequests[0], actionType: 'approve' | 'reject') => {
    setSelectedCaptaincyRequest(request);
    setAction(actionType);
    setRejectionReason('');
    setIsCaptaincyDialogOpen(true);
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
          {(testimonials.length > 0 || captaincyRequests.length > 0) && (
            <Badge variant="secondary" className="text-sm">
              {testimonials.length + captaincyRequests.length} pending request{(testimonials.length + captaincyRequests.length) !== 1 ? 's' : ''}
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
      ) : (isAdmin && captaincyRequests.length === 0) || (!isAdmin && testimonials.length === 0) ? (
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
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => openActionDialog(testimonial, 'approve')}
                            size="sm"
                            className="rounded-lg bg-green-600 hover:bg-green-700"
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Approve
                          </Button>
                          <Button
                            onClick={() => openActionDialog(testimonial, 'reject')}
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
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>
              {action === 'approve' ? 'Approve Testimonial' : 'Reject Testimonial'}
            </DialogTitle>
            <DialogDescription>
              {action === 'approve' 
                ? 'Are you sure you want to approve this testimonial request?'
                : 'Please provide a reason for rejecting this testimonial request.'}
            </DialogDescription>
          </DialogHeader>
          {selectedTestimonial && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Requested By:</span>
                  <span className="font-medium">{getUserName(selectedTestimonial)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Vessel:</span>
                  <span className="font-medium">{getVesselName(selectedTestimonial.vessel_id)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Date Range:</span>
                  <span className="font-medium">
                    {format(new Date(selectedTestimonial.start_date), 'MMM d, yyyy')} - {format(new Date(selectedTestimonial.end_date), 'MMM d, yyyy')}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Days:</span>
                  <span className="font-medium">{selectedTestimonial.total_days}</span>
                </div>
              </div>
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
            <Button
              onClick={action === 'approve' ? handleApprove : handleReject}
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
