'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  Ship,
  TrendingUp,
  TrendingDown,
  Activity,
  Calendar,
  FileText,
  Map as MapIcon,
  Navigation,
  Globe,
  LifeBuoy,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BarChart3,
  PieChart,
  Loader2,
  Target,
  Zap
} from 'lucide-react';
import type { UserProfile } from '@/lib/types';
import { format, subDays, startOfDay, endOfDay, isWithinInterval, parse, startOfMonth, endOfMonth, eachMonthOfInterval } from 'date-fns';
import { useRouter } from 'next/navigation';
import { getVesselStateLogs, getVesselAssignments } from '@/supabase/database/queries';

interface PlatformMetrics {
  // User Metrics
  totalUsers: number;
  activeUsers30Days: number;
  activeUsers7Days: number;
  newUsersThisMonth: number;
  usersWithActiveVessels: number;
  usersWithoutVessels: number;
  
  // Engagement Metrics
  usersLoggingSeaTime: number;
  usersWithTestimonials: number;
  usersTrackingVisas: number;
  usersWithPassageLogs: number;
  usersWithBridgeWatch: number;
  
  // Content Metrics
  totalVessels: number;
  officialVessels: number;
  activeAssignments: number;
  totalTestimonials: number;
  approvedTestimonials: number;
  pendingTestimonials: number;
  
  // Activity Metrics
  totalSeaTimeDays: number;
  seaTimeThisMonth: number;
  seaTimeLastMonth: number;
  totalStateLogs: number;
  stateLogsThisMonth: number;
  totalPassageLogs: number;
  totalBridgeWatchLogs: number;
  
  // Growth Metrics
  signupsByMonth: Array<{ month: string; count: number }>;
  seaTimeByMonth: Array<{ month: string; days: number }>;
  
  // Top Performers
  topActiveUsers: Array<{ userId: string; name: string; daysLogged: number }>;
  topVessels: Array<{ vesselId: string; name: string; activeCrew: number; totalDays: number }>;
  
  // Recent Signups
  recentSignups: Array<{ id: string; firstName: string; lastName: string; username: string; email: string; role: string; createdAt: string }>;
}

export default function PlatformAnalyticsPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');

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

  // Redirect if not admin (only after profile has loaded)
  useEffect(() => {
    if (!isLoadingProfile && userProfile && !isAdmin) {
      router.push('/dashboard');
    }
  }, [isAdmin, isLoadingProfile, userProfile, router]);

  // Fetch platform metrics
  useEffect(() => {
    if (!isAdmin || !user?.id) {
      setIsLoading(false);
      return;
    }

    const fetchMetrics = async () => {
      setIsLoading(true);
      try {
        const now = new Date();
        const sevenDaysAgo = subDays(now, 7);
        const thirtyDaysAgo = subDays(now, 30);
        const ninetyDaysAgo = subDays(now, 90);
        const thisMonthStart = startOfMonth(now);
        const lastMonthStart = startOfMonth(subDays(now, 30));
        const lastMonthEnd = endOfMonth(subDays(now, 30));

        // Fetch all users (crew and captains)
        const { data: allUsers, error: usersError } = await supabase
          .from('users')
          .select('id, first_name, last_name, username, email, role, created_at, active_vessel_id')
          .in('role', ['crew', 'captain']);

        if (usersError) {
          console.error('[PLATFORM ANALYTICS] Error fetching users:', usersError);
        }

        // Fetch all vessels
        const { data: allVessels, error: vesselsError } = await supabase
          .from('vessels')
          .select('id, name, is_official');

        if (vesselsError) {
          console.error('[PLATFORM ANALYTICS] Error fetching vessels:', vesselsError);
        }

        // Fetch all vessel assignments
        const allAssignments: any[] = [];
        for (const user of allUsers || []) {
          try {
            const assignments = await getVesselAssignments(supabase, user.id);
            allAssignments.push(...assignments);
          } catch (error) {
            // Continue if error
          }
        }

        // Fetch testimonials
        const { data: testimonials, error: testimonialsError } = await supabase
          .from('testimonials')
          .select('id, status, created_at');

        if (testimonialsError) {
          console.error('[PLATFORM ANALYTICS] Error fetching testimonials:', testimonialsError);
        }

        // Fetch state logs from all vessels
        let totalStateLogs = 0;
        let stateLogsThisMonth = 0;
        const stateLogsByUser = new Map<string, number>();
        const stateLogsByVessel = new Map<string, number>();

        for (const vessel of allVessels || []) {
          try {
            const logs = await getVesselStateLogs(supabase, vessel.id, undefined);
            totalStateLogs += logs.length;
            
            const thisMonthLogs = logs.filter(log => {
              const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
              return isWithinInterval(logDate, { start: thisMonthStart, end: now });
            });
            stateLogsThisMonth += thisMonthLogs.length;

            // Track by user
            logs.forEach(log => {
              const count = stateLogsByUser.get(log.userId) || 0;
              stateLogsByUser.set(log.userId, count + 1);
            });

            // Track by vessel
            const vesselCount = stateLogsByVessel.get(vessel.id) || 0;
            stateLogsByVessel.set(vessel.id, vesselCount + logs.length);
          } catch (error) {
            // Continue if error
          }
        }

        // Fetch passage logs
        let passageLogs: any[] = [];
        try {
          const { data, error } = await supabase
            .from('passage_logs')
            .select('id, crew_id, created_at');
          
          if (error) {
            console.error('[PLATFORM ANALYTICS] Error fetching passage logs:', error);
          } else {
            passageLogs = data || [];
          }
        } catch (error) {
          console.error('[PLATFORM ANALYTICS] Exception fetching passage logs:', error);
        }

        // Fetch bridge watch logs
        let bridgeWatchLogs: any[] = [];
        try {
          const { data, error } = await supabase
            .from('bridge_watch_logs')
            .select('id, crew_id, created_at');
          
          if (error) {
            console.error('[PLATFORM ANALYTICS] Error fetching bridge watch logs:', error);
          } else {
            bridgeWatchLogs = data || [];
          }
        } catch (error) {
          console.error('[PLATFORM ANALYTICS] Exception fetching bridge watch logs:', error);
        }

        // Fetch visa trackers
        let visaTrackers: any[] = [];
        try {
          // Try both singular and plural table names
          const { data, error } = await supabase
            .from('visa_tracker')
            .select('id, user_id');
          
          if (error) {
            // Try plural if singular fails
            const { data: data2, error: error2 } = await supabase
              .from('visa_trackers')
              .select('id, user_id');
            
            if (error2) {
              console.error('[PLATFORM ANALYTICS] Error fetching visa trackers:', error2);
            } else {
              visaTrackers = data2 || [];
            }
          } else {
            visaTrackers = data || [];
          }
        } catch (error) {
          console.error('[PLATFORM ANALYTICS] Exception fetching visa trackers:', error);
        }

        // Calculate metrics
        const totalUsers = allUsers?.length || 0;
        const activeAssignments = allAssignments.filter(a => !a.endDate).length;
        const usersWithActiveVessels = new Set(allAssignments.filter(a => !a.endDate).map(a => a.userId)).size;
        const usersWithoutVessels = totalUsers - usersWithActiveVessels;

        // Active users (based on state logs)
        const activeUsers30Days = Array.from(stateLogsByUser.keys()).length;
        const usersWithRecentLogs = new Set<string>();
        for (const vessel of allVessels || []) {
          try {
            const logs = await getVesselStateLogs(supabase, vessel.id, undefined);
            logs.forEach(log => {
              const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
              if (isWithinInterval(logDate, { start: thirtyDaysAgo, end: now })) {
                usersWithRecentLogs.add(log.userId);
              }
            });
          } catch (error) {
            // Continue
          }
        }

        // New users this month
        const newUsersThisMonth = (allUsers || []).filter(u => {
          const createdAt = new Date(u.created_at);
          return isWithinInterval(createdAt, { start: thisMonthStart, end: now });
        }).length;

        // Signups by month (last 12 months)
        const signupsByMonth: Array<{ month: string; count: number }> = [];
        const months = eachMonthOfInterval({ start: subDays(now, 365), end: now });
        months.forEach(month => {
          const monthStart = startOfMonth(month);
          const monthEnd = endOfMonth(month);
          const count = (allUsers || []).filter(u => {
            const createdAt = new Date(u.created_at);
            return isWithinInterval(createdAt, { start: monthStart, end: monthEnd });
          }).length;
          signupsByMonth.push({
            month: format(month, 'MMM yyyy'),
            count,
          });
        });

        // Sea time by month
        const seaTimeByMonth: Array<{ month: string; days: number }> = [];
        months.forEach(month => {
          const monthStart = startOfMonth(month);
          const monthEnd = endOfMonth(month);
          let days = 0;
          for (const vessel of allVessels || []) {
            try {
              const logs = await getVesselStateLogs(supabase, vessel.id, undefined);
              const monthLogs = logs.filter(log => {
                const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
                return isWithinInterval(logDate, { start: monthStart, end: monthEnd });
              });
              days += monthLogs.length;
            } catch (error) {
              // Continue
            }
          }
          seaTimeByMonth.push({
            month: format(month, 'MMM yyyy'),
            days,
          });
        });

        // Top active users
        const topActiveUsers = Array.from(stateLogsByUser.entries())
          .map(([userId, daysLogged]) => {
            const user = allUsers?.find(u => u.id === userId);
            const name = user 
              ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username
              : 'Unknown';
            return { userId, name, daysLogged };
          })
          .sort((a, b) => b.daysLogged - a.daysLogged)
          .slice(0, 10);

        // Top vessels
        const topVessels = Array.from(stateLogsByVessel.entries())
          .map(([vesselId, totalDays]) => {
            const vessel = allVessels?.find(v => v.id === vesselId);
            const activeCrew = allAssignments.filter(a => a.vesselId === vesselId && !a.endDate).length;
            return {
              vesselId,
              name: vessel?.name || 'Unknown',
              activeCrew,
              totalDays,
            };
          })
          .sort((a, b) => b.totalDays - a.totalDays)
          .slice(0, 10);

        // Users with different content types
        const usersWithTestimonials = new Set((testimonials || []).map(t => (t as any).user_id || (t as any).userId)).size;
        const usersWithPassageLogs = new Set(passageLogs.map(p => p.crew_id || (p as any).user_id || (p as any).userId)).size;
        const usersWithBridgeWatch = new Set(bridgeWatchLogs.map(b => b.crew_id || (b as any).user_id || (b as any).userId)).size;
        const usersTrackingVisas = new Set(visaTrackers.map(v => v.user_id || (v as any).userId)).size;

        // Calculate sea time metrics
        const seaTimeThisMonth = stateLogsThisMonth;
        const seaTimeLastMonth = seaTimeByMonth[seaTimeByMonth.length - 2]?.days || 0;

        // Recent signups (last 20, sorted by most recent)
        const recentSignups = (allUsers || [])
          .map(user => ({
            id: user.id,
            firstName: user.first_name || '',
            lastName: user.last_name || '',
            username: user.username || '',
            email: user.email || '',
            role: user.role || 'crew',
            createdAt: user.created_at,
          }))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 20);

        setMetrics({
          totalUsers,
          activeUsers30Days: usersWithRecentLogs.size,
          activeUsers7Days: Array.from(stateLogsByUser.keys()).length, // Simplified
          newUsersThisMonth,
          usersWithActiveVessels,
          usersWithoutVessels,
          usersLoggingSeaTime: stateLogsByUser.size,
          usersWithTestimonials,
          usersTrackingVisas,
          usersWithPassageLogs,
          usersWithBridgeWatch,
          totalVessels: allVessels?.length || 0,
          officialVessels: allVessels?.filter(v => (v as any).is_official === true || (v as any).is_official === 'true').length || 0,
          activeAssignments,
          totalTestimonials: testimonials?.length || 0,
          approvedTestimonials: testimonials?.filter(t => (t as any).status === 'approved').length || 0,
          pendingTestimonials: testimonials?.filter(t => (t as any).status === 'pending').length || 0,
          totalSeaTimeDays: totalStateLogs,
          seaTimeThisMonth,
          seaTimeLastMonth,
          totalStateLogs,
          stateLogsThisMonth,
          totalPassageLogs: passageLogs.length,
          totalBridgeWatchLogs: bridgeWatchLogs.length,
          signupsByMonth,
          seaTimeByMonth,
          topActiveUsers,
          topVessels,
          recentSignups,
        });
      } catch (error) {
        console.error('[PLATFORM ANALYTICS] Error fetching metrics:', error);
        setMetrics(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
  }, [isAdmin, user?.id, supabase, timeRange]);

  if (isLoadingProfile || isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Platform Analytics</h1>
          <p className="text-muted-foreground">
            Comprehensive overview of platform performance and user engagement.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <Card key={i}>
              <CardHeader className="pb-2">
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
    return null;
  }

  if (!metrics) {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Platform Analytics</h1>
          <p className="text-muted-foreground">
            Error loading metrics. Please try again later.
          </p>
        </div>
      </div>
    );
  }

  const seaTimeChange = metrics.seaTimeLastMonth > 0 
    ? ((metrics.seaTimeThisMonth - metrics.seaTimeLastMonth) / metrics.seaTimeLastMonth * 100).toFixed(1)
    : '0';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Platform Analytics</h1>
          <p className="text-muted-foreground">
            Comprehensive overview of platform performance and user engagement.
          </p>
        </div>
        <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Time Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="90d">Last 90 Days</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="growth">Growth</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">

          {/* Key Metrics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              Crew & Captain accounts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users (30d)</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{metrics.activeUsers30Days}</div>
            <p className="text-xs text-muted-foreground">
              {((metrics.activeUsers30Days / metrics.totalUsers) * 100).toFixed(1)}% of total users
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New This Month</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.newUsersThisMonth}</div>
            <p className="text-xs text-muted-foreground">
              New signups
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">With Active Vessels</CardTitle>
            <Ship className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.usersWithActiveVessels}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.usersWithoutVessels} without vessels
            </p>
          </CardContent>
        </Card>
          </div>

          {/* Quick Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sea Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.totalSeaTimeDays.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Days logged all time</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Vessels</CardTitle>
                <Ship className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.totalVessels}</div>
                <p className="text-xs text-muted-foreground">{metrics.officialVessels} official</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Assignments</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.activeAssignments}</div>
                <p className="text-xs text-muted-foreground">Current assignments</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.totalUsers}</div>
                <p className="text-xs text-muted-foreground">
                  Crew & Captain accounts
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Users (30d)</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{metrics.activeUsers30Days}</div>
                <p className="text-xs text-muted-foreground">
                  {((metrics.activeUsers30Days / metrics.totalUsers) * 100).toFixed(1)}% of total users
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">New This Month</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.newUsersThisMonth}</div>
                <p className="text-xs text-muted-foreground">
                  New signups
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">With Active Vessels</CardTitle>
                <Ship className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.usersWithActiveVessels}</div>
                <p className="text-xs text-muted-foreground">
                  {metrics.usersWithoutVessels} without vessels
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Top Active Users */}
          <Card>
            <CardHeader>
              <CardTitle>Top Active Users</CardTitle>
              <CardDescription>Users with most sea time logged</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Days Logged</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.topActiveUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    metrics.topActiveUsers.map((user, index) => (
                      <TableRow key={user.userId}>
                        <TableCell className="font-medium">#{index + 1}</TableCell>
                        <TableCell>{user.name}</TableCell>
                        <TableCell className="text-right">{user.daysLogged.toLocaleString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Recent Signups */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Signups</CardTitle>
              <CardDescription>Most recently created user accounts</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Signup Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.recentSignups.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No recent signups
                      </TableCell>
                    </TableRow>
                  ) : (
                    metrics.recentSignups.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.firstName} {user.lastName}
                        </TableCell>
                        <TableCell>{user.username}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge variant={user.role === 'captain' ? 'default' : 'secondary'}>
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(user.createdAt), 'MMM d, yyyy')}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Logging Sea Time</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.usersLoggingSeaTime}</div>
                <p className="text-xs text-muted-foreground">Active trackers</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">With Testimonials</CardTitle>
                <LifeBuoy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.usersWithTestimonials}</div>
                <p className="text-xs text-muted-foreground">Created testimonials</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tracking Visas</CardTitle>
                <Globe className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.usersTrackingVisas}</div>
                <p className="text-xs text-muted-foreground">Visa trackers</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Passage Logs</CardTitle>
                <MapIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.usersWithPassageLogs}</div>
                <p className="text-xs text-muted-foreground">Users with logs</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Bridge Watch</CardTitle>
                <Navigation className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.usersWithBridgeWatch}</div>
                <p className="text-xs text-muted-foreground">Users with logs</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Sea Time This Month</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.seaTimeThisMonth.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {parseFloat(seaTimeChange) > 0 ? (
                    <TrendingUp className="h-3 w-3 text-green-600" />
                  ) : parseFloat(seaTimeChange) < 0 ? (
                    <TrendingDown className="h-3 w-3 text-red-600" />
                  ) : null}
                  {seaTimeChange}% vs last month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">State Logs</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.totalStateLogs.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {metrics.stateLogsThisMonth} this month
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Content Tab */}
        <TabsContent value="content" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Testimonials</CardTitle>
                <LifeBuoy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.totalTestimonials}</div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {metrics.approvedTestimonials}
                  </Badge>
                  <Badge variant="secondary">
                    <Clock className="h-3 w-3 mr-1" />
                    {metrics.pendingTestimonials}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">State Logs</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.totalStateLogs.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {metrics.stateLogsThisMonth} this month
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Passage Logs</CardTitle>
                <MapIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.totalPassageLogs.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Total entries</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Bridge Watch Logs</CardTitle>
                <Navigation className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.totalBridgeWatchLogs.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Total entries</p>
              </CardContent>
            </Card>
          </div>

          {/* Top Vessels */}
          <Card>
            <CardHeader>
              <CardTitle>Top Vessels</CardTitle>
              <CardDescription>Vessels with most activity</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Vessel</TableHead>
                    <TableHead className="text-right">Crew</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.topVessels.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    metrics.topVessels.map((vessel, index) => (
                      <TableRow key={vessel.vesselId}>
                        <TableCell className="font-medium">#{index + 1}</TableCell>
                        <TableCell>{vessel.name}</TableCell>
                        <TableCell className="text-right">{vessel.activeCrew}</TableCell>
                        <TableCell className="text-right">{vessel.totalDays.toLocaleString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Growth Tab */}
        <TabsContent value="growth" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>User Signups Over Time</CardTitle>
            <CardDescription>New user registrations by month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {metrics.signupsByMonth.slice(-12).map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{item.month}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-muted rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full" 
                        style={{ width: `${(item.count / Math.max(...metrics.signupsByMonth.map(m => m.count))) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-12 text-right">{item.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sea Time Activity Over Time</CardTitle>
            <CardDescription>Days logged by month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {metrics.seaTimeByMonth.slice(-12).map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{item.month}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-muted rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${(item.days / Math.max(...metrics.seaTimeByMonth.map(m => m.days), 1)) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-16 text-right">{item.days.toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

