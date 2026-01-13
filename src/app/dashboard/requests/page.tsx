'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useUser, useSupabase } from '@/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Ship, Clock, CheckCircle2, XCircle, AlertCircle, FileText, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { VesselClaimRequest, Vessel } from '@/lib/types';

export default function RequestsPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();
  const [requests, setRequests] = useState<(VesselClaimRequest & { vessel?: { name: string } })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<(VesselClaimRequest & { vessel?: { name: string } }) | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [vessels, setVessels] = useState<Vessel[]>([]);

  // Fetch user's requests
  useEffect(() => {
    const fetchRequests = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // Fetch vessel claim requests
        const { data: requestsData, error: requestsError } = await supabase
          .from('vessel_claim_requests')
          .select('*')
          .eq('requested_by', user.id)
          .order('created_at', { ascending: false });

        if (requestsError) {
          console.error('[REQUESTS PAGE] Error fetching requests:', requestsError);
          toast({
            title: 'Error',
            description: 'Failed to load requests. Please try again.',
            variant: 'destructive',
          });
          setIsLoading(false);
          return;
        }

        // Fetch all vessels for name lookup
        const { data: vesselsData, error: vesselsError } = await supabase
          .from('vessels')
          .select('id, name')
          .order('name', { ascending: true });

        if (vesselsError) {
          console.error('[REQUESTS PAGE] Error fetching vessels:', vesselsError);
        } else {
          setVessels(vesselsData || []);
        }

        // Combine requests with vessel names
        const requestsWithVessels = (requestsData || []).map((request) => {
          const vessel = vesselsData?.find(v => v.id === request.vessel_id);
          return {
            ...request,
            vessel: vessel ? { name: vessel.name } : undefined,
          };
        });

        setRequests(requestsWithVessels as any);
      } catch (error: any) {
        console.error('[REQUESTS PAGE] Unexpected error:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to load requests.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchRequests();
  }, [user?.id, supabase, toast]);

  // Group requests by status
  const groupedRequests = useMemo(() => {
    const groups = {
      pending: [] as typeof requests,
      vessel_approved: [] as typeof requests,
      admin_approved: [] as typeof requests,
      approved: [] as typeof requests,
      rejected: [] as typeof requests,
    };

    requests.forEach(request => {
      const status = request.status as keyof typeof groups;
      if (groups[status]) {
        groups[status].push(request);
      }
    });

    return groups;
  }, [requests]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'vessel_approved':
        return <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Vessel Approved</Badge>;
      case 'admin_approved':
        return <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Admin Approved</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getStatusDescription = (request: VesselClaimRequest) => {
    switch (request.status) {
      case 'pending':
        return 'Waiting for vessel and admin approval';
      case 'vessel_approved':
        return 'Vessel approved. Waiting for admin approval';
      case 'admin_approved':
        return 'Admin approved. Waiting for vessel approval';
      case 'approved':
        return 'Fully approved. You are now the captain of this vessel';
      case 'rejected':
        return request.review_notes || 'Request has been rejected';
      default:
        return '';
    }
  };

  const openRequestDialog = (request: typeof requests[0]) => {
    setSelectedRequest(request);
    setIsDialogOpen(true);
  };

  const totalActiveRequests = requests.filter(r => 
    r.status !== 'approved' && r.status !== 'rejected'
  ).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Requests</h1>
        <p className="text-muted-foreground mt-2">
          Track the status of your vessel captaincy requests
        </p>
      </div>

      {requests.length === 0 ? (
        <Card className="rounded-xl border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Ship className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Requests</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              You haven't submitted any vessel captaincy requests yet. Visit the Vessels or Current page to request captaincy of a vessel.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Active Requests */}
          {(groupedRequests.pending.length > 0 || 
            groupedRequests.vessel_approved.length > 0 || 
            groupedRequests.admin_approved.length > 0) && (
            <Card className="rounded-xl border shadow-sm">
              <CardHeader>
                <CardTitle>Active Requests ({totalActiveRequests})</CardTitle>
                <CardDescription>Requests that are pending or partially approved</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vessel</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...groupedRequests.pending, ...groupedRequests.vessel_approved, ...groupedRequests.admin_approved].map((request) => (
                        <TableRow key={request.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Ship className="h-4 w-4 text-muted-foreground" />
                              {request.vessel?.name || 'Unknown Vessel'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {getStatusBadge(request.status)}
                              <span className="text-xs text-muted-foreground">
                                {getStatusDescription(request)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              {format(new Date(request.created_at || new Date()), 'MMM d, yyyy')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openRequestDialog(request)}
                              className="rounded-lg"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
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

          {/* Approved Requests */}
          {groupedRequests.approved.length > 0 && (
            <Card className="rounded-xl border shadow-sm">
              <CardHeader>
                <CardTitle>Approved Requests ({groupedRequests.approved.length})</CardTitle>
                <CardDescription>Successfully approved captaincy requests</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vessel</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Approved</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedRequests.approved.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Ship className="h-4 w-4 text-muted-foreground" />
                              {request.vessel?.name || 'Unknown Vessel'}
                            </div>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(request.status)}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-muted-foreground">
                              {request.vessel_approved_at && request.admin_approved_at
                                ? format(new Date(request.vessel_approved_at > request.admin_approved_at ? request.vessel_approved_at : request.admin_approved_at), 'MMM d, yyyy')
                                : request.updated_at
                                ? format(new Date(request.updated_at), 'MMM d, yyyy')
                                : '—'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openRequestDialog(request)}
                              className="rounded-lg"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
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

          {/* Rejected Requests */}
          {groupedRequests.rejected.length > 0 && (
            <Card className="rounded-xl border shadow-sm">
              <CardHeader>
                <CardTitle>Rejected Requests ({groupedRequests.rejected.length})</CardTitle>
                <CardDescription>Requests that were rejected</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vessel</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Rejected</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedRequests.rejected.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Ship className="h-4 w-4 text-muted-foreground" />
                              {request.vessel?.name || 'Unknown Vessel'}
                            </div>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(request.status)}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm text-muted-foreground">
                              {request.updated_at
                                ? format(new Date(request.updated_at), 'MMM d, yyyy')
                                : '—'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openRequestDialog(request)}
                              className="rounded-lg"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
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
        </div>
      )}

      {/* Request Details Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="rounded-xl max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
            <DialogDescription>
              View detailed information about your captaincy request
            </DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Vessel</div>
                  <div className="flex items-center gap-2 font-medium">
                    <Ship className="h-4 w-4 text-muted-foreground" />
                    {selectedRequest.vessel?.name || 'Unknown Vessel'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Status</div>
                  <div>{getStatusBadge(selectedRequest.status)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Requested Role</div>
                  <div className="font-medium">{selectedRequest.requested_role || 'captain'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Submitted</div>
                  <div className="font-medium">
                    {format(new Date(selectedRequest.created_at || new Date()), 'MMM d, yyyy')}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Approval Status */}
              <div className="space-y-2">
                <div className="text-sm font-semibold">Approval Status</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className={`p-3 rounded-lg border ${selectedRequest.vessel_approved_by ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : 'bg-muted/30'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-muted-foreground">Vessel Approval</span>
                      {selectedRequest.vessel_approved_by ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    {selectedRequest.vessel_approved_at ? (
                      <div className="text-xs text-muted-foreground">
                        Approved {format(new Date(selectedRequest.vessel_approved_at), 'MMM d, yyyy')}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Pending</div>
                    )}
                  </div>
                  <div className={`p-3 rounded-lg border ${selectedRequest.admin_approved_by ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' : 'bg-muted/30'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-muted-foreground">Admin Approval</span>
                      {selectedRequest.admin_approved_by ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    {selectedRequest.admin_approved_at ? (
                      <div className="text-xs text-muted-foreground">
                        Approved {format(new Date(selectedRequest.admin_approved_at), 'MMM d, yyyy')}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Pending</div>
                    )}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  {getStatusDescription(selectedRequest)}
                </div>
              </div>

              {/* Supporting Documents */}
              <div className="space-y-2">
                <div className="text-sm font-semibold">Supporting Documents</div>
                {(() => {
                  const docs = (selectedRequest.supporting_documents || []) || [];
                  const documentsArray = Array.isArray(docs) ? docs : [];
                  
                  if (documentsArray.length > 0) {
                    return (
                      <div className="space-y-2">
                        {documentsArray.map((docUrl: string, index: number) => (
                          <div key={index} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <a 
                              href={docUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline flex-1 truncate"
                            >
                              {docUrl}
                            </a>
                          </div>
                        ))}
                      </div>
                    );
                  } else {
                    return (
                      <p className="text-sm text-muted-foreground italic">
                        No supporting documents provided
                      </p>
                    );
                  }
                })()}
              </div>

              {/* Rejection Reason */}
              {selectedRequest.status === 'rejected' && selectedRequest.review_notes && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Rejection Reason</div>
                  <div className="p-3 rounded-lg border bg-destructive/10 border-destructive/20">
                    <p className="text-sm text-destructive">{selectedRequest.review_notes}</p>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                setSelectedRequest(null);
              }}
              className="rounded-xl"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
