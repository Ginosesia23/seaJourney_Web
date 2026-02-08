'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { 
  Ship, 
  Calendar,
  Loader2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  DollarSign,
  User
} from 'lucide-react';
import type { UserProfile, Vessel } from '@/lib/types';
import { format } from 'date-fns';
import React from 'react';

interface VesselSubscriptionData {
  vessel: Vessel & { isOfficial: boolean };
  vesselManager: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    subscriptionTier: string;
    subscriptionStatus: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean | null;
  };
  totalCrewCount: number; // All crew tracking the vessel
  crewCountTowardLimit: number; // Only crew that counts toward subscription limit
  restrictions: {
    crewLimit: number | null;
    vesselLimit: number | null;
    canGenerateDocuments: boolean;
  };
}

export default function VesselSubscriptionsPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const [vesselSubscriptions, setVesselSubscriptions] = useState<VesselSubscriptionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Fetch user profile to check if admin
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    const role = (userProfileRaw as any).role || userProfileRaw.role || 'crew';
    return {
      ...userProfileRaw,
      role: role,
    } as UserProfile;
  }, [userProfileRaw]);

  const isAdmin = userProfile?.role === 'admin';

  // Get crew limit based on subscription tier
  const getCrewLimit = (tier: string | undefined, status: string | undefined): number | null => {
    if (!tier || (status || '').toLowerCase() !== 'active') {
      return null;
    }
    
    const tierLower = tier.toLowerCase();
    switch (tierLower) {
      case 'vessel_lite':
        return 15;
      case 'vessel_basic':
        return 30;
      case 'vessel_pro':
      case 'vessel_fleet':
        return null; // Unlimited
      default:
        return null;
    }
  };

  // Get vessel limit for fleet tier
  const getVesselLimit = (tier: string | undefined, status: string | undefined): number | null => {
    if (!tier || (status || '').toLowerCase() !== 'active') {
      return null;
    }
    
    const tierLower = tier.toLowerCase();
    if (tierLower === 'vessel_fleet') {
      return 3; // Fleet includes 3 vessels
    }
    return null;
  };

  // Check if can generate documents (Pro tier or higher)
  const canGenerateDocuments = (tier: string | undefined, status: string | undefined): boolean => {
    if (!tier || (status || '').toLowerCase() !== 'active') {
      return false;
    }
    const tierLower = tier.toLowerCase();
    return tierLower === 'vessel_pro' || tierLower === 'vessel_fleet';
  };

  // Format subscription tier for display
  const formatTierName = (tier: string) => {
    if (!tier || tier === 'free') return 'Free';
    const cleaned = tier.replace(/^(sj_|sea_journey_)/i, '').trim();
    return cleaned
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  // Format next billing date
  const formatBillingDate = (currentPeriodEnd: string | null): string => {
    if (!currentPeriodEnd) return 'N/A';
    try {
      return format(new Date(currentPeriodEnd), 'dd MMM yyyy');
    } catch {
      return 'Invalid date';
    }
  };

  // Toggle row expansion
  const toggleRow = (vesselId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(vesselId)) {
        newSet.delete(vesselId);
      } else {
        newSet.add(vesselId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    if (!isAdmin || !user?.id || isLoadingProfile) {
      setIsLoading(false);
      return;
    }

    const fetchVesselSubscriptions = async () => {
      setIsLoading(true);
      try {
        // Fetch all vessels
        const { data: allVessels, error: vesselsError } = await supabase
          .from('vessels')
          .select('*')
          .order('name', { ascending: true });

        if (vesselsError) {
          console.error('[VESSEL SUBSCRIPTIONS] Error fetching vessels:', vesselsError);
          setIsLoading(false);
          return;
        }

        // Fetch all vessel managers (users with role 'vessel')
        const { data: vesselManagers, error: managersError } = await supabase
          .from('users')
          .select('id, email, first_name, last_name, subscription_tier, subscription_status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end, active_vessel_id')
          .eq('role', 'vessel');

        if (managersError) {
          console.error('[VESSEL SUBSCRIPTIONS] Error fetching vessel managers:', managersError);
          setIsLoading(false);
          return;
        }

        // Fetch active crew counts per vessel
        const { data: allAssignments, error: assignmentsError } = await supabase
          .from('vessel_assignments')
          .select('vessel_id, user_id')
          .is('end_date', null);

        if (assignmentsError) {
          console.error('[VESSEL SUBSCRIPTIONS] Error fetching assignments:', assignmentsError);
        }

        // Fetch approved sea time access requests (these count toward limit for non-official vessels)
        const { data: approvedRequests, error: requestsError } = await supabase
          .from('vessel_sea_time_access_requests')
          .select('vessel_id, crew_user_id')
          .eq('status', 'approved');

        if (requestsError) {
          console.error('[VESSEL SUBSCRIPTIONS] Error fetching approved requests:', requestsError);
        }

        // Count total crew per vessel (all crew tracking the vessel)
        const totalCrewCounts = new Map<string, number>();
        // Count crew that counts toward limit
        const crewCountsTowardLimit = new Map<string, Set<string>>(); // vessel_id -> Set of user_ids

        if (allAssignments) {
          // Get user IDs to filter out vessel accounts
          const userIds = [...new Set(allAssignments.map(a => a.user_id))];
          const { data: usersData } = await supabase
            .from('users')
            .select('id, role')
            .in('id', userIds);

          const userRoleMap = new Map<string, string>();
          usersData?.forEach(u => userRoleMap.set(u.id, u.role));

          // Create a map of vessel_id -> Set of approved crew_user_ids
          const approvedCrewByVessel = new Map<string, Set<string>>();
          approvedRequests?.forEach(req => {
            if (!approvedCrewByVessel.has(req.vessel_id)) {
              approvedCrewByVessel.set(req.vessel_id, new Set());
            }
            approvedCrewByVessel.get(req.vessel_id)!.add(req.crew_user_id);
          });

          allAssignments.forEach(assignment => {
            const userRole = userRoleMap.get(assignment.user_id);
            if (userRole !== 'vessel') {
              // Count total crew
              totalCrewCounts.set(assignment.vessel_id, (totalCrewCounts.get(assignment.vessel_id) || 0) + 1);
              
              // Count toward limit if vessel is official OR crew member has approved request
              const vessel = allVessels?.find(v => v.id === assignment.vessel_id);
              const isOfficial = vessel && ((vessel as any).is_official === true || (vessel as any).is_official === 'true');
              const hasApprovedRequest = approvedCrewByVessel.get(assignment.vessel_id)?.has(assignment.user_id);
              
              if (isOfficial || hasApprovedRequest) {
                if (!crewCountsTowardLimit.has(assignment.vessel_id)) {
                  crewCountsTowardLimit.set(assignment.vessel_id, new Set());
                }
                crewCountsTowardLimit.get(assignment.vessel_id)!.add(assignment.user_id);
              }
            }
          });
        }

        // Match vessels with their managers
        const vesselSubscriptionData: VesselSubscriptionData[] = (allVessels || []).map(vessel => {
          const manager = vesselManagers?.find(m => m.active_vessel_id === vessel.id);
          
          const subscriptionTier = manager?.subscription_tier || 'free';
          const subscriptionStatus = manager?.subscription_status || 'inactive';
          const isOfficial = (vessel as any).is_official === true || (vessel as any).is_official === 'true';
          
          return {
            vessel: {
              id: vessel.id,
              name: vessel.name,
              type: vessel.type,
              officialNumber: vessel.imo || vessel.official_number,
              isOfficial,
            },
            vesselManager: {
              id: manager?.id || '',
              email: manager?.email || 'No manager assigned',
              firstName: manager?.first_name || null,
              lastName: manager?.last_name || null,
              subscriptionTier,
              subscriptionStatus,
              stripeCustomerId: manager?.stripe_customer_id || null,
              stripeSubscriptionId: manager?.stripe_subscription_id || null,
              currentPeriodEnd: manager?.current_period_end || null,
              cancelAtPeriodEnd: manager?.cancel_at_period_end || null,
            },
            totalCrewCount: totalCrewCounts.get(vessel.id) || 0,
            crewCountTowardLimit: crewCountsTowardLimit.get(vessel.id)?.size || 0,
            restrictions: {
              crewLimit: getCrewLimit(subscriptionTier, subscriptionStatus),
              vesselLimit: getVesselLimit(subscriptionTier, subscriptionStatus),
              canGenerateDocuments: canGenerateDocuments(subscriptionTier, subscriptionStatus),
            },
          };
        });

        setVesselSubscriptions(vesselSubscriptionData);
      } catch (error) {
        console.error('[VESSEL SUBSCRIPTIONS] Error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchVesselSubscriptions();
  }, [isAdmin, user?.id, isLoadingProfile, supabase]);

  if (isLoadingProfile) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Vessel Subscriptions</h1>
          <p className="text-muted-foreground">
            View all vessels and their subscription status, billing dates, and restrictions.
          </p>
        </div>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Vessel Subscriptions</h1>
          <p className="text-muted-foreground">
            View all vessels and their subscription status, billing dates, and restrictions.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">You don't have permission to view this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Vessel Subscriptions</h1>
        <p className="text-muted-foreground">
          View all vessels and their subscription status, billing dates, and restrictions.
        </p>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Vessel Subscriptions</CardTitle>
            <CardDescription>
              {vesselSubscriptions.length} vessel{vesselSubscriptions.length !== 1 ? 's' : ''} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Vessel Name</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Subscription Tier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next Billing Date</TableHead>
                  <TableHead>Total Tracking</TableHead>
                  <TableHead>Counts Toward Limit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vesselSubscriptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No vessels found
                    </TableCell>
                  </TableRow>
                ) : (
                  vesselSubscriptions.map((data) => {
                    const isExpanded = expandedRows.has(data.vessel.id);
                    const isActive = data.vesselManager.subscriptionStatus.toLowerCase() === 'active';
                    const isCancelled = data.vesselManager.cancelAtPeriodEnd === true;
                    const tierName = formatTierName(data.vesselManager.subscriptionTier);
                    const billingDate = formatBillingDate(data.vesselManager.currentPeriodEnd);
                    const crewLimit = data.restrictions.crewLimit;
                    const isAtLimit = crewLimit !== null && data.crewCountTowardLimit >= crewLimit;

                    return (
                      <React.Fragment key={data.vessel.id}>
                        <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRow(data.vessel.id)}>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Ship className="h-4 w-4 text-muted-foreground" />
                              {data.vessel.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            {data.vesselManager.firstName || data.vesselManager.lastName
                              ? `${data.vesselManager.firstName || ''} ${data.vesselManager.lastName || ''}`.trim()
                              : data.vesselManager.email}
                          </TableCell>
                          <TableCell>
                            <Badge variant={isActive ? 'default' : 'secondary'}>
                              {tierName}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {isActive ? (
                              <Badge variant="default" className="bg-green-500">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <XCircle className="h-3 w-3 mr-1" />
                                Inactive
                              </Badge>
                            )}
                            {isCancelled && (
                              <Badge variant="destructive" className="ml-2">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Cancelling
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              {billingDate}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              {data.totalCrewCount}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span className={isAtLimit ? 'text-destructive font-medium' : ''}>
                                {data.crewCountTowardLimit}
                                {crewLimit !== null && ` / ${crewLimit}`}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-muted/20 p-0">
                              <div className="p-6 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                  <Card className="border shadow-sm">
                                    <CardHeader className="pb-3">
                                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                                        Subscription Details
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                      <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Tier</p>
                                        <p className="text-sm font-medium">{tierName}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Status</p>
                                        <div className="flex items-center gap-2">
                                          {isActive ? (
                                            <Badge variant="default" className="bg-green-500">
                                              <CheckCircle2 className="h-3 w-3 mr-1" />
                                              Active
                                            </Badge>
                                          ) : (
                                            <Badge variant="secondary">
                                              <XCircle className="h-3 w-3 mr-1" />
                                              Inactive
                                            </Badge>
                                          )}
                                          {isCancelled && (
                                            <Badge variant="destructive" className="text-xs">
                                              Cancelling
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                      {data.vesselManager.stripeSubscriptionId && (
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground mb-1">Subscription ID</p>
                                          <p className="text-xs text-muted-foreground font-mono break-all">
                                            {data.vesselManager.stripeSubscriptionId}
                                          </p>
                                        </div>
                                      )}
                                    </CardContent>
                                  </Card>

                                  <Card className="border shadow-sm">
                                    <CardHeader className="pb-3">
                                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                        Billing
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                      <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Next Billing Date</p>
                                        <p className="text-sm font-medium">{billingDate}</p>
                                      </div>
                                      {data.vesselManager.stripeCustomerId && (
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground mb-1">Customer ID</p>
                                          <p className="text-xs text-muted-foreground font-mono break-all">
                                            {data.vesselManager.stripeCustomerId}
                                          </p>
                                        </div>
                                      )}
                                    </CardContent>
                                  </Card>

                                  <Card className="border shadow-sm">
                                    <CardHeader className="pb-3">
                                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                                        Restrictions
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                      <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Crew Limit</p>
                                        <p className="text-sm font-medium">
                                          {crewLimit === null ? 'Unlimited' : `${crewLimit} members`}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Vessel Limit</p>
                                        <p className="text-sm font-medium">
                                          {data.restrictions.vesselLimit === null ? 'N/A' : `${data.restrictions.vesselLimit} vessels`}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Document Generation</p>
                                        {data.restrictions.canGenerateDocuments ? (
                                          <Badge variant="default" className="bg-green-500">
                                            <CheckCircle2 className="h-3 w-3 mr-1" />
                                            Enabled
                                          </Badge>
                                        ) : (
                                          <Badge variant="secondary">
                                            <XCircle className="h-3 w-3 mr-1" />
                                            Disabled
                                          </Badge>
                                        )}
                                      </div>
                                    </CardContent>
                                  </Card>

                                  <Card className="border shadow-sm">
                                    <CardHeader className="pb-3">
                                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                                        <Users className="h-4 w-4 text-muted-foreground" />
                                        Usage
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                      <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Total Tracking</p>
                                        <p className="text-sm font-medium">{data.totalCrewCount} members</p>
                                      </div>
                                      <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Counts Toward Limit</p>
                                        <p className={`text-sm font-medium ${isAtLimit ? 'text-destructive' : ''}`}>
                                          {data.crewCountTowardLimit}
                                          {crewLimit !== null && ` / ${crewLimit}`}
                                        </p>
                                      </div>
                                      {crewLimit !== null && (
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground mb-1">Usage</p>
                                          <div className="space-y-1">
                                            <p className={`text-sm font-medium ${isAtLimit ? 'text-destructive' : ''}`}>
                                              {Math.round((data.crewCountTowardLimit / crewLimit) * 100)}%
                                            </p>
                                            {isAtLimit && (
                                              <Badge variant="destructive" className="text-xs">
                                                At Limit
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                      <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Vessel Official</p>
                                        <Badge variant={data.vessel.isOfficial ? 'default' : 'secondary'} className="text-xs">
                                          {data.vessel.isOfficial ? 'Yes' : 'No'}
                                        </Badge>
                                      </div>
                                    </CardContent>
                                  </Card>
                                </div>

                                <Card className="border shadow-sm">
                                  <CardHeader className="pb-3">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                                      <User className="h-4 w-4 text-muted-foreground" />
                                      Manager Details
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Email</p>
                                        <p className="text-sm font-medium">{data.vesselManager.email}</p>
                                      </div>
                                      {(data.vesselManager.firstName || data.vesselManager.lastName) && (
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground mb-1">Name</p>
                                          <p className="text-sm font-medium">
                                            {`${data.vesselManager.firstName || ''} ${data.vesselManager.lastName || ''}`.trim()}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  </CardContent>
                                </Card>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
