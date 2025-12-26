'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  CreditCard, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Ship, 
  DollarSign, 
  Calendar,
  Loader2,
  BarChart3,
  PieChart,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import type { UserProfile } from '@/lib/types';
import { format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns';

interface RevenueStats {
  monthlyRevenue: number;
  annualRevenue: number;
  activeCrewSubscriptions: number;
  activeVesselSubscriptions: number;
  totalActiveSubscriptions: number;
  subscriptionsByTier: Record<string, { count: number; revenue: number }>;
  revenueByAccountType: {
    crew: number;
    vessel: number;
  };
  monthlyTrend: Array<{ month: string; revenue: number; subscriptions: number }>;
}

export default function RevenuePage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const [revenueStats, setRevenueStats] = useState<RevenueStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'year'>('month');

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

  // Pricing map for subscription tiers (monthly prices in GBP)
  const tierPricing: Record<string, number> = {
    // Crew plans
    'standard': 4.99,
    'premium': 9.99,
    'pro': 14.99,
    'professional': 14.99,
    // Vessel plans
    'vessel_lite': 24.99,
    'vessel_basic': 49.99,
    'vessel_pro': 99.99,
    'vessel_fleet': 249.99,
  };

  useEffect(() => {
    if (!isAdmin || !user?.id) {
      setIsLoading(false);
      return;
    }

    const fetchRevenueData = async () => {
      setIsLoading(true);
      try {
        // Fetch all crew users
        const { data: allUsers, error: usersError } = await supabase
          .from('users')
          .select('id, subscription_status, subscription_tier, created_at, role')
          .neq('role', 'vessel');

        if (usersError) {
          console.error('[REVENUE PAGE] Error fetching users:', usersError);
        }

        // Fetch all vessel accounts
        const { data: allVesselAccounts, error: vesselAccountsError } = await supabase
          .from('users')
          .select('id, subscription_status, subscription_tier, created_at, role')
          .eq('role', 'vessel');

        if (vesselAccountsError) {
          console.error('[REVENUE PAGE] Error fetching vessel accounts:', vesselAccountsError);
        }

        // Calculate current revenue
        const subscriptionsByTier: Record<string, { count: number; revenue: number }> = {};
        let monthlyRevenue = 0;
        let activeCrewSubscriptions = 0;
        let activeVesselSubscriptions = 0;
        let crewRevenue = 0;
        let vesselRevenue = 0;

        // Process crew subscriptions
        allUsers?.forEach(user => {
          if ((user.subscription_status || '').toLowerCase() === 'active') {
            activeCrewSubscriptions++;
            const tier = (user.subscription_tier || 'free').toLowerCase();
            const price = tierPricing[tier] || 0;
            
            if (price > 0) {
              monthlyRevenue += price;
              crewRevenue += price;
              
              if (!subscriptionsByTier[tier]) {
                subscriptionsByTier[tier] = { count: 0, revenue: 0 };
              }
              subscriptionsByTier[tier].count++;
              subscriptionsByTier[tier].revenue += price;
            }
          }
        });

        // Process vessel subscriptions
        allVesselAccounts?.forEach(vessel => {
          if ((vessel.subscription_status || '').toLowerCase() === 'active') {
            activeVesselSubscriptions++;
            const tier = (vessel.subscription_tier || 'free').toLowerCase();
            const price = tierPricing[tier] || 0;
            
            if (price > 0) {
              monthlyRevenue += price;
              vesselRevenue += price;
              
              if (!subscriptionsByTier[tier]) {
                subscriptionsByTier[tier] = { count: 0, revenue: 0 };
              }
              subscriptionsByTier[tier].count++;
              subscriptionsByTier[tier].revenue += price;
            }
          }
        });

        // Calculate monthly trend (last 6 months)
        const monthlyTrend: Array<{ month: string; revenue: number; subscriptions: number }> = [];
        const now = new Date();
        const sixMonthsAgo = subMonths(now, 5);
        const months = eachMonthOfInterval({ start: sixMonthsAgo, end: now });

        // For each month, calculate subscriptions that were active
        for (const month of months) {
          const monthStart = startOfMonth(month);
          const monthEnd = endOfMonth(month);
          
          // Count subscriptions that were created before or during this month and are still active
          // This is a simplified calculation - in production you'd want to track subscription history
          let monthRevenue = 0;
          let monthSubscriptions = 0;

          // Count active subscriptions that existed during this month
          [...(allUsers || []), ...(allVesselAccounts || [])].forEach(account => {
            const createdAt = account.created_at ? new Date(account.created_at) : null;
            const isActive = (account.subscription_status || '').toLowerCase() === 'active';
            
            if (isActive && createdAt && createdAt <= monthEnd) {
              monthSubscriptions++;
              const tier = (account.subscription_tier || 'free').toLowerCase();
              const price = tierPricing[tier] || 0;
              monthRevenue += price;
            }
          });

          monthlyTrend.push({
            month: format(month, 'MMM yyyy'),
            revenue: monthRevenue,
            subscriptions: monthSubscriptions,
          });
        }

        const annualRevenue = monthlyRevenue * 12;

        setRevenueStats({
          monthlyRevenue,
          annualRevenue,
          activeCrewSubscriptions,
          activeVesselSubscriptions,
          totalActiveSubscriptions: activeCrewSubscriptions + activeVesselSubscriptions,
          subscriptionsByTier,
          revenueByAccountType: {
            crew: crewRevenue,
            vessel: vesselRevenue,
          },
          monthlyTrend,
        });
      } catch (error) {
        console.error('[REVENUE PAGE] Error fetching revenue data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRevenueData();
  }, [isAdmin, user?.id, supabase]);

  if (isLoadingProfile || isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="rounded-xl">
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Card className="max-w-md rounded-xl">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>You do not have permission to view this page.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!revenueStats) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Card className="max-w-md rounded-xl">
          <CardHeader>
            <CardTitle>No Data Available</CardTitle>
            <CardDescription>Unable to load revenue data.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Calculate growth (comparing current month to previous month)
  const currentMonthRevenue = revenueStats.monthlyTrend[revenueStats.monthlyTrend.length - 1]?.revenue || 0;
  const previousMonthRevenue = revenueStats.monthlyTrend[revenueStats.monthlyTrend.length - 2]?.revenue || 0;
  const revenueGrowth = previousMonthRevenue > 0 
    ? ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100 
    : 0;

  const currentMonthSubscriptions = revenueStats.monthlyTrend[revenueStats.monthlyTrend.length - 1]?.subscriptions || 0;
  const previousMonthSubscriptions = revenueStats.monthlyTrend[revenueStats.monthlyTrend.length - 2]?.subscriptions || 0;
  const subscriptionGrowth = previousMonthSubscriptions > 0
    ? ((currentMonthSubscriptions - previousMonthSubscriptions) / previousMonthSubscriptions) * 100
    : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Revenue & Subscriptions</h1>
        <p className="text-muted-foreground">Track revenue, subscriptions, and growth metrics</p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-xl border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Revenue</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-green-500/10 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              £{revenueStats.monthlyRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="flex items-center gap-1 mt-1">
              {revenueGrowth >= 0 ? (
                <ArrowUpRight className="h-3 w-3 text-green-500" />
              ) : (
                <ArrowDownRight className="h-3 w-3 text-red-500" />
              )}
              <p className={`text-xs ${revenueGrowth >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {Math.abs(revenueGrowth).toFixed(1)}% vs last month
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Annual Revenue</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              £{revenueStats.annualRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Projected annual</p>
          </CardContent>
        </Card>

        <Card className="rounded-xl border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Subscriptions</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-purple-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{revenueStats.totalActiveSubscriptions}</div>
            <div className="flex items-center gap-1 mt-1">
              {subscriptionGrowth >= 0 ? (
                <ArrowUpRight className="h-3 w-3 text-green-500" />
              ) : (
                <ArrowDownRight className="h-3 w-3 text-red-500" />
              )}
              <p className={`text-xs ${subscriptionGrowth >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {Math.abs(subscriptionGrowth).toFixed(1)}% vs last month
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Revenue per User</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-orange-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              £{revenueStats.totalActiveSubscriptions > 0
                ? (revenueStats.monthlyRevenue / revenueStats.totalActiveSubscriptions).toFixed(2)
                : '0.00'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Per active subscription</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-xl border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Revenue by Account Type</CardTitle>
            <CardDescription>Monthly revenue breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Crew Accounts</span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">
                    £{revenueStats.revenueByAccountType.crew.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {revenueStats.activeCrewSubscriptions} subscriptions
                  </div>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${revenueStats.monthlyRevenue > 0
                      ? (revenueStats.revenueByAccountType.crew / revenueStats.monthlyRevenue) * 100
                      : 0}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Ship className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Vessel Accounts</span>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">
                    £{revenueStats.revenueByAccountType.vessel.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {revenueStats.activeVesselSubscriptions} subscriptions
                  </div>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${revenueStats.monthlyRevenue > 0
                      ? (revenueStats.revenueByAccountType.vessel / revenueStats.monthlyRevenue) * 100
                      : 0}%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Subscription Breakdown</CardTitle>
            <CardDescription>Active subscriptions by type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b">
                <span className="text-sm font-medium">Crew Subscriptions</span>
                <Badge variant="secondary">{revenueStats.activeCrewSubscriptions}</Badge>
              </div>
              <div className="flex items-center justify-between pb-2 border-b">
                <span className="text-sm font-medium">Vessel Subscriptions</span>
                <Badge variant="secondary">{revenueStats.activeVesselSubscriptions}</Badge>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm font-semibold">Total Active</span>
                <Badge className="bg-primary">{revenueStats.totalActiveSubscriptions}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscription Tiers Table */}
      <Card className="rounded-xl border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Revenue by Subscription Tier</CardTitle>
          <CardDescription>Detailed breakdown of subscriptions and revenue by plan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subscription Tier</TableHead>
                  <TableHead>Active Subscriptions</TableHead>
                  <TableHead>Monthly Revenue</TableHead>
                  <TableHead>Annual Revenue</TableHead>
                  <TableHead>% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(revenueStats.subscriptionsByTier)
                  .sort(([, a], [, b]) => b.revenue - a.revenue)
                  .map(([tier, data]) => {
                    const annualRevenue = data.revenue * 12;
                    const percentage = revenueStats.monthlyRevenue > 0
                      ? (data.revenue / revenueStats.monthlyRevenue) * 100
                      : 0;
                    
                    return (
                      <TableRow key={tier}>
                        <TableCell className="font-medium capitalize">
                          {tier.replace(/_/g, ' ')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{data.count}</Badge>
                        </TableCell>
                        <TableCell className="font-semibold">
                          £{data.revenue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="font-semibold">
                          £{annualRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-muted rounded-full h-2">
                              <div
                                className="bg-primary h-2 rounded-full"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-sm text-muted-foreground w-12 text-right">
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                {Object.keys(revenueStats.subscriptionsByTier).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No active subscriptions found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Trend */}
      <Card className="rounded-xl border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">6-Month Revenue Trend</CardTitle>
          <CardDescription>Monthly revenue and subscription growth</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {revenueStats.monthlyTrend.map((month, index) => {
              const isLatest = index === revenueStats.monthlyTrend.length - 1;
              const previousMonth = index > 0 ? revenueStats.monthlyTrend[index - 1] : null;
              const growth = previousMonth && previousMonth.revenue > 0
                ? ((month.revenue - previousMonth.revenue) / previousMonth.revenue) * 100
                : 0;

              return (
                <div key={month.month} className="flex items-center justify-between p-4 rounded-lg border bg-card">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium">{month.month}</span>
                      {isLatest && (
                        <Badge variant="default" className="text-xs">Current</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div>
                        <div className="text-2xl font-bold">
                          £{month.revenue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-xs text-muted-foreground">Revenue</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold">{month.subscriptions}</div>
                        <div className="text-xs text-muted-foreground">Subscriptions</div>
                      </div>
                    </div>
                  </div>
                  {previousMonth && (
                    <div className="flex items-center gap-1">
                      {growth >= 0 ? (
                        <ArrowUpRight className="h-4 w-4 text-green-500" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-red-500" />
                      )}
                      <span className={`text-sm font-medium ${growth >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {Math.abs(growth).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

