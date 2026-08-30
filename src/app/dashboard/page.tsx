
'use client';

import { Ship, LifeBuoy, Anchor, Loader2, Star, Waves, Building, Wrench, Calendar, MapPin, PlusCircle, Clock, TrendingUp, History, CalendarDays, TrendingDown, Activity, Target, Trophy, CheckCircle2, XCircle, FileText, Users, CreditCard, BarChart3, Globe, LogIn, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { format, getYear, subDays, startOfDay, isWithinInterval, parse, startOfMonth, endOfMonth, isSameMonth, isBefore, isAfter, endOfDay, addDays, differenceInDays } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser, useSupabase } from '@/supabase';
import { useToast } from '@/hooks/use-toast';
import { useCollection, useDoc } from '@/supabase/database';
import { getVesselSeaService, getVesselStateLogs, updateStateLogsBatch, getVesselAssignments } from '@/supabase/database/queries';
import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Vessel, SeaServiceRecord, StateLog, UserProfile, DailyStatus, Testimonial, VisaTracker, VisaEntry, VesselAssignment } from '@/lib/types';
import { calculateStandbyDays } from '@/lib/standby-calculation';
import { getVesselCalculationCategory, isAllDaysExceptLeaveCountAsSea } from '@/lib/vessel-calculation-categories';
import { findMissingDays } from '@/lib/fill-missing-days';
import { calculateVisaCompliance, detectVisaRules } from '@/lib/visa-compliance';
import { cn } from '@/lib/utils';
import { StatePill } from '@/components/state-pill';
import { hasActiveSubscription, countsTowardPaidMrr, excludeTestingAccounts } from '@/supabase/database/subscription-helpers';
import { getSubscriptionTierPricingMap } from '@/app/actions';
import { lookupTierPriceGbp } from '@/lib/subscription-tier-pricing';
import {
  DashboardHeader,
  DashboardPanel,
  DashboardQuickLinks,
  DashboardStatRow,
  StateBreakdownBars,
} from '@/components/dashboard/dashboard-home-ui';

const vesselStates: { value: DailyStatus; label: string; color: string, icon: LucideIcon }[] = [
  { value: 'underway', label: 'Underway', color: 'hsl(var(--chart-blue))', icon: Waves },
  { value: 'at-anchor', label: 'At Anchor', color: 'hsl(var(--chart-orange))', icon: Anchor },
  { value: 'in-port', label: 'Moored', color: 'hsl(var(--chart-green))', icon: Building },
  { value: 'on-leave', label: 'On Leave', color: 'hsl(var(--chart-gray))', icon: LifeBuoy },
  { value: 'in-yard', label: 'In Yard', color: 'hsl(var(--chart-red))', icon: Wrench },
];

/** Only count logs that fall within a vessel_assignment interval for that vessel (matches Vessel History). */
function isStateLogWithinVesselAssignments(
  log: StateLog,
  assignments: VesselAssignment[]
): boolean {
  const forVessel = assignments.filter((a) => a.vesselId === log.vesselId);
  if (forVessel.length === 0) return true;
  const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
  return forVessel.some((a) => {
    const start = parse(a.startDate, 'yyyy-MM-dd', new Date());
    const end = a.endDate ? parse(a.endDate, 'yyyy-MM-dd', new Date()) : new Date();
    return isWithinInterval(logDate, {
      start: startOfDay(start),
      end: endOfDay(end),
    });
  });
}

export default function DashboardPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();

  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedVessel, setSelectedVessel] = useState('all');
  
  const [allSeaService, setAllSeaService] = useState<SeaServiceRecord[]>([]);
  const [allStateLogs, setAllStateLogs] = useState<Map<string, StateLog[]>>(new Map());
  const [currentVesselLogs, setCurrentVesselLogs] = useState<StateLog[]>([]);
  const [watchDates, setWatchDates] = useState<Set<string>>(new Set());
  const [vesselAssignments, setVesselAssignments] = useState<VesselAssignment[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [activeVisas, setActiveVisas] = useState<Array<VisaTracker & { daysRemaining: number; daysUsed: number }>>([]);
  const [isLoggingVisaDate, setIsLoggingVisaDate] = useState(false);
  const [adminStats, setAdminStats] = useState<{
    totalUsers: number;
    activeSubscriptions: number;
    activeVesselSubscriptions: number;
    totalVessels: number;
    crewSubscriptionsByTier: Record<string, number>;
    vesselSubscriptionsByTier: Record<string, number>;
    recentSignups: number;
    monthlyRevenue: number;
    annualRevenue: number;
    crewRevenue: number;
    vesselRevenue: number;
    recentUserSignups: Array<{ id: string; email: string; firstName: string | null; lastName: string | null; createdAt: string; role: string; todayState: string | null; todayStateKey: string | null; todayStateLastChanged: string | null }>;
    recentVesselSignups: Array<{ id: string; email: string; firstName: string | null; lastName: string | null; createdAt: string; vesselName: string | null; todayState: string | null; todayStateKey: string | null; todayStateLastChanged: string | null }>;
  } | null>(null);
  const [isLoadingAdminStats, setIsLoadingAdminStats] = useState(false);
  const [vesselStats, setVesselStats] = useState<{
    crewCount: number;
    totalSeaDays: number;
    totalStandbyDays: number;
    totalDays: number;
    currentMonthDays: number;
    currentMonthSeaDays: number;
    pendingTestimonials: number;
    recentActivity: number;
    stateBreakdown: Record<string, number>;
    todayStatus: string | null;
    recentCrewActivity: Array<{
      userId: string;
      userName: string;
      lastActivity: string | null;
      daysLogged: number;
    }>;
  } | null>(null);
  const [isLoadingVesselStats, setIsLoadingVesselStats] = useState(false);
  const [vesselStateLogs, setVesselStateLogs] = useState<StateLog[] | null>(null);
  const [seaTimeRangeStart, setSeaTimeRangeStart] = useState<string>(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [seaTimeRangeEnd, setSeaTimeRangeEnd] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));

  // Fetch user profile to get active vessel
  const { data: userProfileRaw, isLoading: isLoadingProfile } = useDoc<UserProfile>('users', user?.id);
  
  // Transform user profile to handle both snake_case (from DB) and camelCase (from types)
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    const activeVesselId = (userProfileRaw as any).active_vessel_id || (userProfileRaw as any).activeVesselId;
    const role = (userProfileRaw as any).role || userProfileRaw.role || 'crew';
    return {
      ...userProfileRaw,
      activeVesselId: activeVesselId || undefined,
      role: role,
    } as UserProfile;
  }, [userProfileRaw]);

  const isAdmin = userProfile?.role === 'admin';
  const isVesselManager = userProfile?.role === 'vessel';

  // Check if user is an officer (rank or higher)
  const isOfficer = useMemo(() => {
    if (!userProfile) return false;
    const position = (userProfile.position || '').toLowerCase();
    const role = (userProfile.role || '').toLowerCase();
    
    // Officers include: Captain, Chief Officer, First Officer, First Mate, Second Officer, Third Officer, OOW, Deck Officer
    // Also Chief Engineer, First Engineer, Second Engineer, Third Engineer, Fourth Engineer
    const officerPositions = [
      'captain', 'master', 'chief officer', 'first officer', 'first mate', 
      'second officer', 'third officer', 'officer of the watch', 'oow', 'deck officer',
      'chief engineer', 'first engineer', 'second engineer', 'third engineer', 'fourth engineer'
    ];
    
    return role === 'captain' || role === 'admin' || officerPositions.some(op => position.includes(op));
  }, [userProfile]);

  // Fetch watch logs for the user (officers only)
  useEffect(() => {
    const fetchWatchLogs = async () => {
      if (!user?.id || !isOfficer) {
        setWatchDates(new Set());
        return;
      }

      try {
        const { data: watchLogs, error } = await supabase
          .from('nav_watch_logs')
          .select('start_time')
          .eq('user_id', user.id);

        if (error) throw error;

        // Extract dates from watch logs (start_time timestamps)
        const dates = new Set<string>();
        if (watchLogs) {
          watchLogs.forEach(log => {
            const dateStr = format(new Date(log.start_time), 'yyyy-MM-dd');
            dates.add(dateStr);
          });
        }
        setWatchDates(dates);
      } catch (error) {
        console.error('Error fetching watch logs:', error);
        setWatchDates(new Set());
      }
    };

    fetchWatchLogs();
  }, [user?.id, isOfficer, supabase]);

  // Fetch vessel assignments
  useEffect(() => {
    if (!user?.id) {
      setVesselAssignments([]);
      return;
    }

    const fetchAssignments = async () => {
      try {
        const assignments = await getVesselAssignments(supabase, user.id);
        setVesselAssignments(assignments);
      } catch (error) {
        console.error('Error fetching vessel assignments:', error);
        setVesselAssignments([]);
      }
    };

    fetchAssignments();
  }, [user?.id, supabase]);

  // Fetch admin statistics
  useEffect(() => {
    if (!isAdmin || !user?.id) {
      setAdminStats(null);
      return;
    }

    const fetchAdminStats = async () => {
      setIsLoadingAdminStats(true);
      try {
        // Fetch all users (crew members)
        const { data: allUsersRaw, error: usersError } = await supabase
          .from('users')
          .select(
            'id, email, first_name, last_name, subscription_status, subscription_tier, current_period_end, cancel_at_period_end, created_at, role, stripe_subscription_id, is_testing'
          )
          .neq('role', 'vessel');

        if (usersError) {
          console.error('[ADMIN DASHBOARD] Error fetching users:', usersError);
        }

        // Fetch all vessel accounts
        const { data: allVesselAccountsRaw, error: vesselAccountsError } = await supabase
          .from('users')
          .select(
            'id, email, first_name, last_name, subscription_status, subscription_tier, current_period_end, cancel_at_period_end, created_at, role, active_vessel_id, stripe_subscription_id, is_testing'
          )
          .eq('role', 'vessel');

        if (vesselAccountsError) {
          console.error('[ADMIN DASHBOARD] Error fetching vessel accounts:', vesselAccountsError);
        }

        const allUsers = excludeTestingAccounts(allUsersRaw);
        const allVesselAccounts = excludeTestingAccounts(allVesselAccountsRaw);

        // Fetch all vessels
        const { data: allVesselsData, error: vesselsError } = await supabase
          .from('vessels')
          .select('id, name, is_official, vessel_manager_id');

        if (vesselsError) {
          console.error('[ADMIN DASHBOARD] Error fetching vessels:', vesselsError);
        }

        // Most recent state per user (any date) – admin RLS allows SELECT on daily_state_logs
        const stateLabels: Record<string, string> = {
          underway: 'Underway',
          'at-anchor': 'At anchor',
          'in-port': 'Moored',
          'on-leave': 'On leave',
          'in-yard': 'In yard',
        };
        const todayStateByUser = new Map<string, string>();
        const todayStateKeyByUser = new Map<string, string>();
        const todayStateLastChangedByUser = new Map<string, string>();
        const allUserIds = [
          ...(allUsers || []).map(u => u.id),
          ...(allVesselAccounts || []).map(v => v.id),
        ];
        if (allUserIds.length > 0) {
          const { data: allLogs } = await supabase
            .from('daily_state_logs')
            .select('user_id, state, date, updated_at, created_at')
            .in('user_id', allUserIds)
            .order('date', { ascending: false })
            .limit(Math.max(2000, allUserIds.length * 30));
          (allLogs || []).forEach((log: any) => {
            if (!todayStateByUser.has(log.user_id)) {
              const label = stateLabels[log.state] || log.state || '—';
              todayStateByUser.set(log.user_id, label);
              if (log.state) todayStateKeyByUser.set(log.user_id, log.state);
              const lastChanged = log.updated_at || log.created_at;
              if (lastChanged) {
                todayStateLastChangedByUser.set(log.user_id, format(new Date(lastChanged), 'MMM d, yyyy'));
              }
            }
          });
        }

        // Calculate statistics
        const totalUsers = allUsers?.length || 0;
        const activeSubscriptions = allUsers?.filter(u => {
          const tier = (u.subscription_tier || 'free').toLowerCase();
          // Exclude crew_limited, vessel_linked, and free from active subscription counts —
          // these are vessel-managed free tiers, not paying customers.
          return (
            hasActiveSubscription(u) && tier !== 'crew_limited' && tier !== 'vessel_linked' && tier !== 'free'
          );
        }).length || 0;

        const activeVesselSubscriptions =
          allVesselAccounts?.filter((u) => hasActiveSubscription(u)).length || 0;
        
        const officialVessels = allVesselsData?.filter(v => {
          const isOfficial = (v as any).is_official;
          return isOfficial === true || isOfficial === 'true';
        }).length || 0;

        // Pricing from live Stripe prices (crew + vessel), with local fallbacks
        const tierPricing = await getSubscriptionTierPricingMap();

        // Count subscriptions by tier and calculate revenue
        const crewSubscriptionsByTier: Record<string, number> = {};
        const vesselSubscriptionsByTier: Record<string, number> = {};
        let monthlyRevenue = 0;
        let crewRevenue = 0;
        let vesselRevenue = 0;

        // Calculate revenue from crew subscriptions (include cancel-at-period-end until period ends)
        allUsers?.forEach((user) => {
          if (!countsTowardPaidMrr(user)) return;
          const tier = (user.subscription_tier || 'free').toLowerCase();
          crewSubscriptionsByTier[tier] = (crewSubscriptionsByTier[tier] || 0) + 1;

          const price = lookupTierPriceGbp(tierPricing, tier);
          if (price > 0) {
            monthlyRevenue += price;
            crewRevenue += price;
          }
        });

        // Calculate revenue from vessel subscriptions
        allVesselAccounts?.forEach((vessel) => {
          if (!countsTowardPaidMrr(vessel)) return;
          const tier = (vessel.subscription_tier || 'free').toLowerCase();
          vesselSubscriptionsByTier[tier] = (vesselSubscriptionsByTier[tier] || 0) + 1;

          const price = lookupTierPriceGbp(tierPricing, tier);
          if (price > 0) {
            monthlyRevenue += price;
            vesselRevenue += price;
          }
        });

        const annualRevenue = monthlyRevenue * 12;

        // Count recent signups (last 30 days) - keep for stats
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentSignups = allUsers?.filter(u => {
          const createdAt = u.created_at ? new Date(u.created_at) : null;
          return createdAt && createdAt >= thirtyDaysAgo;
        }).length || 0;

        // Get recent user signups (last 10, regardless of date)
        const recentUserSignups = (allUsers || [])
          .sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA; // Most recent first
          })
          .slice(0, 10)
          .map(u => ({
            id: u.id,
            email: (u as any).email || '',
            firstName: (u as any).first_name || null,
            lastName: (u as any).last_name || null,
            createdAt: u.created_at || '',
            role: (u as any).role || 'crew',
            todayState: todayStateByUser.get(u.id) ?? null,
            todayStateKey: todayStateKeyByUser.get(u.id) ?? null,
            todayStateLastChanged: todayStateLastChangedByUser.get(u.id) ?? null,
          }));

        // Get recent vessel signups (last 10, regardless of date)
        const recentVesselSignups = (allVesselAccounts || [])
          .sort((a, b) => {
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA; // Most recent first
          })
          .slice(0, 10)
          .map(v => {
            // Find vessel name for this vessel account
            const vessel = allVesselsData?.find(vessel => 
              (vessel as any).vessel_manager_id === v.id || 
              (vessel as any).id === (v as any).active_vessel_id
            );
            return {
              id: v.id,
              email: (v as any).email || '',
              firstName: (v as any).first_name || null,
              lastName: (v as any).last_name || null,
              createdAt: v.created_at || '',
              vesselName: vessel ? (vessel as any).name : null,
              todayState: todayStateByUser.get(v.id) ?? null,
              todayStateKey: todayStateKeyByUser.get(v.id) ?? null,
              todayStateLastChanged: todayStateLastChangedByUser.get(v.id) ?? null,
            };
          });

        setAdminStats({
          totalUsers,
          activeSubscriptions,
          activeVesselSubscriptions,
          totalVessels: officialVessels,
          crewSubscriptionsByTier,
          vesselSubscriptionsByTier,
          recentSignups,
          monthlyRevenue,
          annualRevenue,
          crewRevenue,
          vesselRevenue,
          recentUserSignups,
          recentVesselSignups,
        });
      } catch (error) {
        console.error('[ADMIN DASHBOARD] Error fetching admin stats:', error);
      } finally {
        setIsLoadingAdminStats(false);
      }
    };

    fetchAdminStats();
  }, [isAdmin, user?.id, supabase]);

  // Fetch vessel statistics for vessel managers
  useEffect(() => {
    if (!isVesselManager || !user?.id || !userProfile?.activeVesselId) {
      setVesselStats(null);
      setVesselStateLogs(null);
      return;
    }

    const fetchVesselStats = async () => {
      setIsLoadingVesselStats(true);
      try {
        const vesselId = userProfile.activeVesselId;

        // Fetch crew count (active assignments)
        // First, get the vessel to find the vessel manager ID
        const { data: vesselData } = await supabase
          .from('vessels')
          .select('vessel_manager_id')
          .eq('id', vesselId)
          .single();

        const vesselManagerId = vesselData?.vessel_manager_id;

        // Fetch active assignments, excluding the vessel account (vessel manager)
        const { data: assignments, error: assignmentsError } = await supabase
          .from('vessel_assignments')
          .select('id, user_id')
          .eq('vessel_id', vesselId)
          .is('end_date', null);

        if (assignmentsError) {
          console.error('[VESSEL DASHBOARD] Error fetching crew:', assignmentsError);
        }

        // Filter out the vessel account from crew count
        // Exclude users who are the vessel manager or have role 'vessel'
        let crewAssignments = assignments || [];
        if (vesselManagerId || crewAssignments.length > 0) {
          // Get user roles for all assignment users to filter out vessel accounts
          const assignmentUserIds = crewAssignments.map(a => a.user_id);
          const { data: userRoles } = await supabase
            .from('users')
            .select('id, role')
            .in('id', assignmentUserIds);

          // Create a set of vessel account user IDs (vessel manager + users with role 'vessel')
          const vesselAccountIds = new Set<string>();
          if (vesselManagerId) {
            vesselAccountIds.add(vesselManagerId);
          }
          (userRoles || []).forEach((user: any) => {
            if (user.role === 'vessel') {
              vesselAccountIds.add(user.id);
            }
          });

          // Filter out vessel accounts from crew count
          crewAssignments = crewAssignments.filter(a => !vesselAccountIds.has(a.user_id));
        }

        // Fetch state logs for this vessel - ONLY the vessel manager's logs
        // Do not include crew member logs, even if access has been granted
        // The vessel dashboard should only show the vessel's own operational data
        const { data: allLogs, error: logsError } = await supabase
          .from('daily_state_logs')
          .select('*')
          .eq('vessel_id', vesselId)
          .eq('user_id', vesselManagerId || user.id); // Only vessel manager's logs

        if (logsError) {
          console.error('[VESSEL DASHBOARD] Error fetching logs:', logsError);
        }

        // Transform logs (include isPartOfActivePassage for standby calculation)
        const stateLogs: StateLog[] = (allLogs || []).map((log: any) => ({
          id: log.id,
          userId: log.user_id,
          vesselId: log.vessel_id,
          date: log.date,
          state: log.state,
          isPartOfActivePassage: log.is_part_of_active_passage ?? false,
        }));

        setVesselStateLogs(stateLogs);

        // Extract part of active passage dates from logs
        const partOfActivePassageDates = new Set<string>();
        stateLogs.forEach(log => {
          if (log.isPartOfActivePassage) {
            partOfActivePassageDates.add(log.date);
          }
        });
        
        // Calculate sea time (vessel stats use all vessel logs, not user-specific, so no watch dates)
        const { totalSeaDays, totalStandbyDays } = calculateStandbyDays(stateLogs, undefined, partOfActivePassageDates, {
          vesselManagerSeaTime: true,
        });

        // State breakdown
        const stateBreakdown: Record<string, number> = {};
        stateLogs.forEach(log => {
          stateBreakdown[log.state] = (stateBreakdown[log.state] || 0) + 1;
        });

        // Today's status
        const today = format(new Date(), 'yyyy-MM-dd');
        const todayLog = stateLogs.find(log => log.date === today);
        const todayStatus = todayLog ? todayLog.state : null;

        // Current month stats
        const now = new Date();
        const monthStart = startOfMonth(now);
        const monthEnd = endOfMonth(now);
        const currentMonthLogs = stateLogs.filter(log => {
          const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
          return isWithinInterval(logDate, { start: monthStart, end: monthEnd });
        });
        const { totalSeaDays: monthSeaDays } = calculateStandbyDays(currentMonthLogs, undefined, undefined, {
          vesselManagerSeaTime: true,
        });

        // Fetch pending testimonials for this vessel
        // Use the same approach as inbox page - filter by vessel_id and status
        let pendingTestimonialsCount = 0;
        try {
          const { data: pendingTestimonials, error: testimonialsError } = await supabase
            .from('testimonials')
            .select('id')
            .eq('vessel_id', vesselId)
            .eq('status', 'pending_captain');

          if (testimonialsError) {
            console.error('[VESSEL DASHBOARD] Error fetching testimonials:', {
              error: testimonialsError,
              message: testimonialsError.message,
              code: testimonialsError.code,
              details: testimonialsError.details,
              hint: testimonialsError.hint,
              vesselId,
            });
            // Default to 0 on error
            pendingTestimonialsCount = 0;
          } else {
            pendingTestimonialsCount = pendingTestimonials?.length || 0;
          }
        } catch (err) {
          console.error('[VESSEL DASHBOARD] Exception fetching testimonials:', err);
          pendingTestimonialsCount = 0;
        }

        // Recent activity (last 7 days)
        const sevenDaysAgo = subDays(now, 7);
        const recentLogs = stateLogs.filter(log => {
          const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
          return !isBefore(logDate, sevenDaysAgo);
        });

        // Fetch crew member info for recent activity
        const crewUserIds = [...new Set(stateLogs.map(log => log.userId))];
        const { data: crewProfiles } = await supabase
          .from('users')
          .select('id, first_name, last_name, username')
          .in('id', crewUserIds);

        const profileMap = new Map((crewProfiles || []).map((p: any) => [
          p.id,
          {
            name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username,
            username: p.username,
          }
        ]));

        // Calculate recent crew activity (last 30 days per crew member)
        const thirtyDaysAgo = subDays(now, 30);
        const recentCrewActivity = crewUserIds.map(userId => {
          const userLogs = stateLogs.filter(log => {
            const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
            return log.userId === userId && !isBefore(logDate, thirtyDaysAgo);
          });
          const lastLog = userLogs.sort((a, b) => b.date.localeCompare(a.date))[0];
          const profile = profileMap.get(userId);
          return {
            userId,
            userName: profile?.name || 'Unknown',
            lastActivity: lastLog?.date || null,
            daysLogged: userLogs.length,
          };
        }).filter(activity => activity.daysLogged > 0)
          .sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || ''))
          .slice(0, 5); // Top 5 most active

        setVesselStats({
          crewCount: crewAssignments.length,
          totalSeaDays,
          totalStandbyDays,
          totalDays: stateLogs.length,
          currentMonthDays: currentMonthLogs.length,
          currentMonthSeaDays: monthSeaDays,
          pendingTestimonials: pendingTestimonialsCount,
          recentActivity: recentLogs.length,
          stateBreakdown,
          todayStatus,
          recentCrewActivity,
        });
      } catch (error) {
        console.error('[VESSEL DASHBOARD] Exception fetching stats:', error);
        setVesselStats(null);
        setVesselStateLogs(null);
      } finally {
        setIsLoadingVesselStats(false);
      }
    };

    fetchVesselStats();
  }, [isVesselManager, user?.id, userProfile?.activeVesselId, supabase]);

  // Query all vessels (vessels are shared, not owned by users)
  const { data: vessels, isLoading: isLoadingVessels } = useCollection<Vessel>(
    user?.id ? 'vessels' : null,
    user?.id ? { orderBy: 'created_at', ascending: false } : undefined
  );

  // Get current vessel
  const currentVessel = useMemo(() => {
    if (!userProfile || !vessels || vessels.length === 0) return undefined;
    const activeVesselId = userProfile.activeVesselId;
    return vessels.find(v => v.id === activeVesselId);
  }, [vessels, userProfile]);

  // Sea time for vessel dashboard date range (quick calculator)
  const vesselSeaTimeInRange = useMemo(() => {
    if (!vesselStateLogs || vesselStateLogs.length === 0) return null;
    const start = seaTimeRangeStart;
    const end = seaTimeRangeEnd;
    if (!start || !end || end < start) return null;
    const filtered = vesselStateLogs.filter(log => log.date >= start && log.date <= end);
    if (filtered.length === 0) return { totalDays: 0, atSeaDays: 0, standbyDays: 0, seaServiceDays: 0 };
    const partOfActivePassageDates = new Set<string>();
    filtered.forEach(log => {
      if (log.isPartOfActivePassage) partOfActivePassageDates.add(log.date);
    });
    const { totalSeaDays, totalStandbyDays } = calculateStandbyDays(filtered, undefined, partOfActivePassageDates, {
      vesselManagerSeaTime: true,
    });
    return {
      totalDays: filtered.length,
      atSeaDays: totalSeaDays,
      standbyDays: totalStandbyDays,
      seaServiceDays: totalSeaDays + totalStandbyDays,
    };
  }, [vesselStateLogs, seaTimeRangeStart, seaTimeRangeEnd]);

  useEffect(() => {
    if (vessels && user?.id) {
        const fetchServiceAndLogs = async () => {
            const serviceRecords: SeaServiceRecord[] = [];
            const logsMap = new Map<string, StateLog[]>();

            await Promise.all(vessels.map(async (vessel) => {
                const [seaService, stateLogs] = await Promise.all([
                    getVesselSeaService(supabase, user.id, vessel.id),
                    getVesselStateLogs(supabase, vessel.id, user.id)
                ]);
                
                serviceRecords.push(...seaService);
                logsMap.set(vessel.id, stateLogs);
            }));
            setAllSeaService(serviceRecords);
            setAllStateLogs(logsMap);
        };
        fetchServiceAndLogs();
    }
  }, [vessels, user?.id, supabase]);

  // Fetch testimonials
  useEffect(() => {
    if (!user?.id) return;

    const fetchTestimonials = async () => {
      try {
        const { data, error } = await supabase
          .from('testimonials')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['approved', 'rejected'])
          .order('updated_at', { ascending: false });

        if (error) {
          console.error('Error fetching testimonials:', error);
          setTestimonials([]);
        } else {
          setTestimonials((data || []) as Testimonial[]);
        }
      } catch (error) {
        console.error('Error fetching testimonials:', error);
        setTestimonials([]);
      }
    };

    fetchTestimonials();
  }, [user?.id, supabase]);

  // Fetch active visas for quick log
  useEffect(() => {
    if (!user?.id || isAdmin) return;

    const fetchActiveVisas = async () => {
      try {
        const today = startOfDay(new Date());
        const { data, error } = await supabase
          .from('visa_tracker')
          .select('*')
          .eq('user_id', user.id)
          .gte('expire_date', format(today, 'yyyy-MM-dd'))
          .order('expire_date', { ascending: true });

        if (error) {
          console.error('[DASHBOARD] Error fetching visas:', error);
          setActiveVisas([]);
        } else {
          const visaIds = (data || []).map((v: any) => v.id);
          
          // Fetch all entries for all visas (not just count)
          const { data: entriesData } = await supabase
            .from('visa_entries')
            .select('*')
            .in('visa_id', visaIds);

          // Group entries by visa_id
          const entriesByVisa = new Map<string, VisaEntry[]>();
          (entriesData || []).forEach((entry: any) => {
            const visaEntry: VisaEntry = {
              id: entry.id,
              visaId: entry.visa_id,
              userId: entry.user_id,
              entryDate: entry.entry_date,
              createdAt: entry.created_at,
              updatedAt: entry.updated_at,
            };
            const existing = entriesByVisa.get(entry.visa_id) || [];
            entriesByVisa.set(entry.visa_id, [...existing, visaEntry]);
          });

          const transformedVisas = (data || []).map((visa: any) => {
            const entries = entriesByVisa.get(visa.id) || [];
            
            // Auto-detect rules if not set
            let visaWithRules: VisaTracker = {
              id: visa.id,
              userId: visa.user_id,
              areaName: visa.area_name,
              issueDate: visa.issue_date,
              expireDate: visa.expire_date,
              totalDays: visa.total_days,
              ruleType: visa.rule_type || 'fixed',
              daysAllowed: visa.days_allowed || null,
              periodDays: visa.period_days || null,
              notes: visa.notes || null,
              createdAt: visa.created_at,
              updatedAt: visa.updated_at,
            };
            
            // Auto-detect rules if not set
            if (!visaWithRules.ruleType || !visaWithRules.daysAllowed) {
              const detectedRules = detectVisaRules(visaWithRules.areaName);
              if (detectedRules) {
                visaWithRules = {
                  ...visaWithRules,
                  ruleType: visaWithRules.ruleType || detectedRules.ruleType,
                  daysAllowed: visaWithRules.daysAllowed || detectedRules.daysAllowed,
                  periodDays: visaWithRules.periodDays || detectedRules.periodDays,
                };
              }
            }
            
            // Use compliance calculation
            const compliance = calculateVisaCompliance(visaWithRules, entries);
            
            return {
              ...visaWithRules,
              daysUsed: compliance.daysUsed,
              daysRemaining: compliance.daysRemaining,
            };
          });
          setActiveVisas(transformedVisas);
        }
      } catch (error) {
        console.error('[DASHBOARD] Exception fetching visas:', error);
        setActiveVisas([]);
      }
    };

    fetchActiveVisas();
  }, [user?.id, supabase, isAdmin]);


  // Quick log today's date for a visa
  const handleQuickLogVisaDate = async (visa: VisaTracker, showToast = true) => {
    if (!user?.id) return;

    setIsLoggingVisaDate(true);
    try {
      const today = startOfDay(new Date());
      const todayStr = format(today, 'yyyy-MM-dd');
      const visaIssue = parse(visa.issueDate, 'yyyy-MM-dd', new Date());
      const visaExpire = parse(visa.expireDate, 'yyyy-MM-dd', new Date());

      // Check if date is within visa period
      if (isBefore(today, visaIssue) || isAfter(today, visaExpire)) {
        toast({
          title: 'Invalid Date',
          description: `Today's date is outside the visa period (${format(visaIssue, 'MMM d, yyyy')} - ${format(visaExpire, 'MMM d, yyyy')}).`,
          variant: 'destructive',
        });
        setIsLoggingVisaDate(false);
        return;
      }

      // Check if already logged
      const { data: existing, error: checkError } = await supabase
        .from('visa_entries')
        .select('id')
        .eq('visa_id', visa.id)
        .eq('entry_date', todayStr)
        .single();

      if (existing) {
        toast({
          title: 'Already Logged',
          description: "Today's date has already been logged for this visa.",
          variant: 'destructive',
        });
        setIsLoggingVisaDate(false);
        return;
      }

      const { error } = await supabase
        .from('visa_entries')
        .insert({
          visa_id: visa.id,
          user_id: user.id,
          entry_date: todayStr,
        });

      if (error) throw error;

      // Fetch updated visa entries to calculate days remaining using compliance logic
      const { data: visaEntriesData, error: entriesError } = await supabase
        .from('visa_entries')
        .select('*')
        .eq('visa_id', visa.id);

      const entries: VisaEntry[] = (visaEntriesData || []).map((entry: any) => ({
        id: entry.id,
        visaId: entry.visa_id,
        userId: entry.user_id,
        entryDate: entry.entry_date,
        createdAt: entry.created_at,
        updatedAt: entry.updated_at,
      }));

      // Auto-detect rules if not set
      let visaWithRules: VisaTracker = {
        ...visa,
        ruleType: (visa as any).ruleType || (visa as any).rule_type || 'fixed',
        daysAllowed: (visa as any).daysAllowed || (visa as any).days_allowed || null,
        periodDays: (visa as any).periodDays || (visa as any).period_days || null,
      };
      
      if (!visaWithRules.ruleType || !visaWithRules.daysAllowed) {
        const detectedRules = detectVisaRules(visaWithRules.areaName);
        if (detectedRules) {
          visaWithRules = {
            ...visaWithRules,
            ruleType: visaWithRules.ruleType || detectedRules.ruleType,
            daysAllowed: visaWithRules.daysAllowed || detectedRules.daysAllowed,
            periodDays: visaWithRules.periodDays || detectedRules.periodDays,
          };
        }
      }

      const compliance = calculateVisaCompliance(visaWithRules, entries);
      const daysRemaining = compliance.daysRemaining;

      if (showToast) {
        toast({
          title: 'Date Logged',
          description: `Successfully logged today's date for ${visa.areaName}. ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining.`,
        });
      }

      // Refresh active visas with updated entries using compliance calculation
      const { data: updatedData, error: fetchError } = await supabase
        .from('visa_tracker')
        .select('*')
        .eq('user_id', user.id)
        .gte('expire_date', todayStr)
        .order('expire_date', { ascending: true });

      if (!fetchError && updatedData) {
        const visaIds = updatedData.map((v: any) => v.id);
        
        // Fetch all entries for all visas
        const { data: entriesData } = await supabase
          .from('visa_entries')
          .select('*')
          .in('visa_id', visaIds);

        // Group entries by visa_id
        const entriesByVisa = new Map<string, VisaEntry[]>();
        (entriesData || []).forEach((entry: any) => {
          const visaEntry: VisaEntry = {
            id: entry.id,
            visaId: entry.visa_id,
            userId: entry.user_id,
            entryDate: entry.entry_date,
            createdAt: entry.created_at,
            updatedAt: entry.updated_at,
          };
          const existing = entriesByVisa.get(entry.visa_id) || [];
          entriesByVisa.set(entry.visa_id, [...existing, visaEntry]);
        });

        const transformedVisas = updatedData.map((v: any) => {
          const entries = entriesByVisa.get(v.id) || [];
          
          // Auto-detect rules if not set
          let visaWithRules: VisaTracker = {
            id: v.id,
            userId: v.user_id,
            areaName: v.area_name,
            issueDate: v.issue_date,
            expireDate: v.expire_date,
            totalDays: v.total_days,
            ruleType: v.rule_type || 'fixed',
            daysAllowed: v.days_allowed || null,
            periodDays: v.period_days || null,
            notes: v.notes || null,
            createdAt: v.created_at,
            updatedAt: v.updated_at,
          };
          
          // Auto-detect rules if not set
          if (!visaWithRules.ruleType || !visaWithRules.daysAllowed) {
            const detectedRules = detectVisaRules(visaWithRules.areaName);
            if (detectedRules) {
              visaWithRules = {
                ...visaWithRules,
                ruleType: visaWithRules.ruleType || detectedRules.ruleType,
                daysAllowed: visaWithRules.daysAllowed || detectedRules.daysAllowed,
                periodDays: visaWithRules.periodDays || detectedRules.periodDays,
              };
            }
          }
          
          // Use compliance calculation
          const compliance = calculateVisaCompliance(visaWithRules, entries);
          
          return {
            ...visaWithRules,
            daysUsed: compliance.daysUsed,
            daysRemaining: compliance.daysRemaining,
          };
        });
        setActiveVisas(transformedVisas);
      }
    } catch (error: any) {
      console.error('[DASHBOARD] Error logging visa date:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to log date. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoggingVisaDate(false);
    }
  };

  const [isFillingGaps, setIsFillingGaps] = useState(false);

  // Fetch state logs for current vessel
  useEffect(() => {
    if (!currentVessel || !user?.id) {
      setCurrentVesselLogs([]);
      return;
    }

    getVesselStateLogs(supabase, currentVessel.id, user.id)
      .then((logs) => {
        setCurrentVesselLogs(logs);
      })
      .catch((error) => {
        console.error('Error fetching current vessel logs:', error);
        setCurrentVesselLogs([]);
      });
  }, [currentVessel?.id, user?.id, supabase]);

  // Automatically fill missing days between last logged date and today for active vessel
  useEffect(() => {
    const fillGaps = async () => {
      // Only run if we have an active vessel, state logs are loaded, and we're not already filling gaps
      if (!currentVessel || !user?.id || currentVesselLogs.length === 0 || isFillingGaps) {
        return;
      }

      // Find missing days
      const { lastLoggedDate, lastLoggedState, missingDays } = findMissingDays(currentVesselLogs);

      // If there are missing days and we have a last logged state, fill them
      if (missingDays.length > 0 && lastLoggedState) {
        setIsFillingGaps(true);
        
        try {
          console.log(`[FILL MISSING DAYS] Found ${missingDays.length} missing days from ${lastLoggedDate ? format(lastLoggedDate, 'yyyy-MM-dd') : 'unknown'} to today. Filling with state: ${lastLoggedState}`);
          
          // Create logs for all missing days with the same state as the last logged entry
          const logsToCreate = missingDays.map(date => ({
            date,
            state: lastLoggedState,
          }));

          await updateStateLogsBatch(supabase, user.id, currentVessel.id, logsToCreate);

          console.log(`[FILL MISSING DAYS] Successfully filled ${missingDays.length} missing days`);

          // Refresh current vessel logs to show the newly created entries
          const updatedLogs = await getVesselStateLogs(supabase, currentVessel.id, user.id);
          setCurrentVesselLogs(updatedLogs);

          // Also update the allStateLogs map
          setAllStateLogs(prev => {
            const updated = new Map(prev);
            updated.set(currentVessel.id, updatedLogs);
            return updated;
          });
        } catch (error: any) {
          console.error('Error filling missing days:', error);
          // Don't show toast error - this is automatic background operation
        } finally {
          setIsFillingGaps(false);
        }
      }
    };

    fillGaps();
  }, [currentVesselLogs, currentVessel?.id, user?.id, supabase, isFillingGaps]);


  const filteredServiceRecords = useMemo(() => {
    if (!allSeaService) return [];
    return allSeaService.filter(service => {
      const serviceYear = getYear(new Date(service.date));
      const yearMatch = selectedYear === 'all' || serviceYear === parseInt(selectedYear, 10);
      const vesselMatch = selectedVessel === 'all' || service.vesselId === selectedVessel;
      return yearMatch && vesselMatch;
    });
  }, [allSeaService, selectedYear, selectedVessel]);

   const { totalDays, atSeaDays, standbyDays } = useMemo(() => {
    const vesselIdsToCount = selectedVessel === 'all'
      ? Array.from(allStateLogs.keys())
      : [selectedVessel];

    const filteredLogs: StateLog[] = [];
    vesselIdsToCount.forEach(vesselId => {
      const logs = allStateLogs.get(vesselId) || [];
      logs.forEach(log => {
        const logYear = getYear(new Date(log.date));
        const yearMatch = selectedYear === 'all' || logYear === parseInt(selectedYear, 10);
        if (!yearMatch) return;
        if (!isStateLogWithinVesselAssignments(log, vesselAssignments)) return;
        filteredLogs.push(log);
      });
    });

    // Days on board with a logged state, excluding leave (still scoped to assignments + year filter)
    const totalDays = filteredLogs.filter((l) => l.state !== 'on-leave').length;
    if (filteredLogs.length === 0) return { totalDays: 0, atSeaDays: 0, standbyDays: 0 };

    const vesselsById = new Map<string, Vessel>(vessels?.map(v => [v.id, v]) ?? []);
    const logsByVessel = new Map<string, StateLog[]>();
    filteredLogs.forEach(log => {
      if (!logsByVessel.has(log.vesselId)) logsByVessel.set(log.vesselId, []);
      logsByVessel.get(log.vesselId)!.push(log);
    });

    let atSeaSum = 0;
    let standbySum = 0;

    logsByVessel.forEach((logs, vesselId) => {
      const vessel = vesselsById.get(vesselId);
      const category = getVesselCalculationCategory(vessel?.type ?? null);

      if (isAllDaysExceptLeaveCountAsSea(category)) {
        const leaveCount = logs.filter(l => l.state === 'on-leave').length;
        atSeaSum += logs.length - leaveCount;
      } else {
        const partOfActivePassageV = new Set(
          logs.filter(l => l.isPartOfActivePassage).map(l => l.date)
        );
        const { totalSeaDays, totalStandbyDays } = calculateStandbyDays(
          logs,
          watchDates,
          partOfActivePassageV,
          { vesselManagerSeaTime: isVesselManager }
        );
        atSeaSum += totalSeaDays;
        standbySum += totalStandbyDays;
      }
    });

    return { totalDays, atSeaDays: atSeaSum, standbyDays: standbySum };
  }, [allStateLogs, selectedVessel, selectedYear, watchDates, vessels, isVesselManager, vesselAssignments]);

  const [visaEntries, setVisaEntries] = useState<VisaEntry[]>([]);

  // Fetch visa entries for recent activity
  useEffect(() => {
    if (!user?.id || isAdmin) return;

    const fetchVisaEntries = async () => {
      try {
        const thirtyDaysAgo = subDays(new Date(), 30);
        const { data: entriesData, error: entriesError } = await supabase
          .from('visa_entries')
          .select('*')
          .eq('user_id', user.id)
          .gte('entry_date', format(thirtyDaysAgo, 'yyyy-MM-dd'))
          .order('created_at', { ascending: false });

        if (entriesError) {
          console.error('[DASHBOARD] Error fetching visa entries:', entriesError);
          setVisaEntries([]);
          return;
        }

        if (!entriesData || entriesData.length === 0) {
          setVisaEntries([]);
          return;
        }

        // Fetch visa tracker info for each entry
        const visaIds = [...new Set(entriesData.map((e: any) => e.visa_id))];
        const { data: visasData, error: visasError } = await supabase
          .from('visa_tracker')
          .select('id, area_name')
          .in('id', visaIds);

        if (visasError) {
          console.error('[DASHBOARD] Error fetching visa trackers:', visasError);
        }

        const visaMap = new Map((visasData || []).map((v: any) => [v.id, v.area_name]));

        const transformedEntries: Array<VisaEntry & { areaName?: string }> = entriesData.map((entry: any) => ({
          id: entry.id,
          visaId: entry.visa_id,
          userId: entry.user_id,
          entryDate: entry.entry_date,
          createdAt: entry.created_at,
          updatedAt: entry.updated_at,
          areaName: visaMap.get(entry.visa_id) || 'Unknown Area',
        }));
        setVisaEntries(transformedEntries);
      } catch (error) {
        console.error('[DASHBOARD] Exception fetching visa entries:', error);
        setVisaEntries([]);
      }
    };

    fetchVisaEntries();
  }, [user?.id, supabase, isAdmin]);

  const recentActivity = useMemo(() => {
    const activities: Array<{
      id: string;
      type: 'state_log' | 'testimonial_approved' | 'testimonial_rejected' | 'state_change' | 'visa_logged';
      date: string;
      timestamp: number;
      vesselName?: string;
      vesselType?: string;
      vesselId?: string;
      state?: DailyStatus;
      testimonial?: Testimonial;
      visaAreaName?: string;
    }> = [];
    
    if (!vessels) return [];
    
    const thirtyDaysAgo = subDays(new Date(), 30).getTime();
    
    // 1. Collect recent state logs and state changes
    if (allStateLogs) {
      
      allStateLogs.forEach((logs, vesselId) => {
        const vessel = vessels.find(v => v.id === vesselId);
        logs.forEach(log => {
          // Use updatedAt if available and different from createdAt (actual state change)
          const logDate = new Date(log.date);
          const logTimestamp = log.updatedAt 
            ? new Date(log.updatedAt).getTime()
            : logDate.getTime();
          
          // Only include recent activities (last 30 days)
          if (logTimestamp >= thirtyDaysAgo) {
            // Check if this is a state change (has updatedAt and it's different from the log date)
            const isStateChange = log.updatedAt && 
              Math.abs(new Date(log.updatedAt).getTime() - logDate.getTime()) > 60000; // More than 1 minute difference
            
            activities.push({
              id: log.id || `${log.date}-${vesselId}`,
              type: isStateChange ? 'state_change' : 'state_log',
              date: format(isStateChange && log.updatedAt ? new Date(log.updatedAt) : logDate, 'yyyy-MM-dd'),
              timestamp: logTimestamp,
              vesselName: vessel?.name || 'Unknown Vessel',
              vesselType: vessel?.type,
              vesselId: log.vesselId,
              state: log.state,
            });
          }
        });
      });
    }
    
    // 2. Add testimonial approvals/rejections (only recent ones)
    testimonials.forEach(testimonial => {
      // Use signoff_used_at if available (when captain signed off), otherwise use updated_at
      const timestampDate = testimonial.signoff_used_at 
        ? new Date(testimonial.signoff_used_at)
        : testimonial.updated_at 
        ? new Date(testimonial.updated_at)
        : null;
      
      // Only include recent approvals/rejections (last 30 days)
      if (timestampDate && 
          timestampDate.getTime() >= thirtyDaysAgo &&
          (testimonial.status === 'approved' || testimonial.status === 'rejected')) {
        const vessel = vessels.find(v => v.id === testimonial.vessel_id);
        activities.push({
          id: `testimonial-${testimonial.id}`,
          type: testimonial.status === 'approved' ? 'testimonial_approved' : 'testimonial_rejected',
          date: format(timestampDate, 'yyyy-MM-dd'),
          timestamp: timestampDate.getTime(),
          vesselName: vessel?.name || 'Unknown Vessel',
          vesselType: vessel?.type,
          vesselId: testimonial.vessel_id,
          testimonial,
        });
      }
    });
    
    // 3. Add visa entry logs
    visaEntries.forEach(entry => {
      const entryDate = new Date(entry.entryDate);
      const entryTimestamp = entry.createdAt ? new Date(entry.createdAt).getTime() : entryDate.getTime();
      const thirtyDaysAgo = subDays(new Date(), 30).getTime();
      
      if (entryTimestamp >= thirtyDaysAgo) {
        activities.push({
          id: `visa-${entry.id}`,
          type: 'visa_logged',
          date: entry.entryDate,
          timestamp: entryTimestamp,
          visaAreaName: (entry as any).areaName || 'Unknown Area',
        });
      }
    });
    
    // Sort by timestamp (most recent first) and take the last 8 (to show more activities)
    return activities
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 8)
      .map(activity => ({
        ...activity,
        // Ensure date is properly formatted
        date: activity.date || format(new Date(activity.timestamp), 'yyyy-MM-dd'),
      }));
  }, [allStateLogs, vessels, testimonials, visaEntries]);
  
  const availableYears = useMemo(() => {
    if (!allSeaService) return [];
    const years = new Set(allSeaService.map(service => getYear(new Date(service.date))));
    return ['all', ...Array.from(years).sort((a, b) => b - a).map(String)];
  }, [allSeaService]);

  const availableVessels = useMemo(() => {
    if(!vessels) return [];
    
    // Admins can see all vessels
    if (isAdmin) {
      return [{ id: 'all', name: 'All Vessels' }, ...vessels];
    }
    
    // Filter to only show vessels the user has been on
    // A user has been on a vessel if they have:
    // 1. State logs for that vessel, OR
    // 2. A vessel assignment for that vessel
    const vesselsUserHasBeenOn = vessels.filter(vessel => {
      // Check if user has state logs for this vessel
      const hasStateLogs = allStateLogs.has(vessel.id) && allStateLogs.get(vessel.id)!.length > 0;
      
      // Check if user has an assignment for this vessel
      const hasAssignment = vesselAssignments.some(assignment => assignment.vesselId === vessel.id);
      
      return hasStateLogs || hasAssignment;
    });
    
    return [{ id: 'all', name: 'All Vessels' }, ...vesselsUserHasBeenOn];
  }, [vessels, allStateLogs, vesselAssignments, isAdmin]);

  // Calculate stats for the past 7 days
  const past7DaysStats = useMemo(() => {
    const today = startOfDay(new Date());
    const sevenDaysAgo = subDays(today, 6); // Include today, so 6 days ago + today = 7 days
    
    // Collect all logs from the past 7 days
    const past7DaysLogs: StateLog[] = [];
    
    allStateLogs.forEach((logs) => {
      logs.forEach(log => {
        const logDate = startOfDay(parse(log.date, 'yyyy-MM-dd', new Date()));
        if (isWithinInterval(logDate, { start: sevenDaysAgo, end: today })) {
          past7DaysLogs.push(log);
        }
      });
    });

    // Extract part of active passage dates from logs
    const partOfActivePassageDates = new Set<string>();
    past7DaysLogs.forEach(log => {
      if (log.isPartOfActivePassage) {
        partOfActivePassageDates.add(log.date);
      }
    });
    
    // Calculate MCA-compliant standby days and sea days for the past 7 days
    const { totalStandbyDays, totalSeaDays } = calculateStandbyDays(past7DaysLogs, watchDates, partOfActivePassageDates, {
      vesselManagerSeaTime: isVesselManager,
    });
    
    // Calculate stats with state breakdown
    // At sea = underway days + part of active passage days (from calculation)
    const totalDays = past7DaysLogs.length;
    const atSeaDays = totalSeaDays;
    const atAnchorDays = past7DaysLogs.filter(log => log.state === 'at-anchor').length;
    const inPortDays = past7DaysLogs.filter(log => log.state === 'in-port').length;
    const onLeaveDays = past7DaysLogs.filter(log => log.state === 'on-leave').length;
    const inYardDays = past7DaysLogs.filter(log => log.state === 'in-yard').length;
    const standbyDays = totalStandbyDays;

    return {
      totalDays,
      atSeaDays,
      atAnchorDays,
      inPortDays,
      onLeaveDays,
      inYardDays,
      standbyDays,
    };
  }, [allStateLogs, watchDates, isVesselManager]);

  // Calculate stats for this month
  const thisMonthStats = useMemo(() => {
    const today = new Date();
    const monthStart = startOfMonth(today);
    const monthEnd = endOfMonth(today);
    
    // Collect all logs from this month
    const thisMonthLogs: StateLog[] = [];
    
    allStateLogs.forEach((logs) => {
      logs.forEach(log => {
        const logDate = startOfDay(parse(log.date, 'yyyy-MM-dd', new Date()));
        if (isWithinInterval(logDate, { start: monthStart, end: monthEnd })) {
          thisMonthLogs.push(log);
        }
      });
    });

    // Extract part of active passage dates from logs
    const partOfActivePassageDates = new Set<string>();
    thisMonthLogs.forEach(log => {
      if (log.isPartOfActivePassage) {
        partOfActivePassageDates.add(log.date);
      }
    });
    
    // Calculate MCA-compliant standby days and sea days for this month
    const { totalStandbyDays, totalSeaDays } = calculateStandbyDays(thisMonthLogs, watchDates, partOfActivePassageDates, {
      vesselManagerSeaTime: isVesselManager,
    });
    
    // Calculate stats with state breakdown
    // At sea = underway days + part of active passage days (from calculation)
    const totalDays = thisMonthLogs.length;
    const atSeaDays = totalSeaDays;
    const atAnchorDays = thisMonthLogs.filter(log => log.state === 'at-anchor').length;
    const inPortDays = thisMonthLogs.filter(log => log.state === 'in-port').length;
    const onLeaveDays = thisMonthLogs.filter(log => log.state === 'on-leave').length;
    const inYardDays = thisMonthLogs.filter(log => log.state === 'in-yard').length;
    const standbyDays = totalStandbyDays;

    return {
      totalDays,
      atSeaDays,
      atAnchorDays,
      inPortDays,
      onLeaveDays,
      inYardDays,
      standbyDays,
    };
  }, [allStateLogs, watchDates, isVesselManager]);

  // Get today's status for current vessel
  const todayStatus = useMemo(() => {
    if (!currentVesselLogs || currentVesselLogs.length === 0) return null;
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    const todayLog = currentVesselLogs.find(log => log.date === todayKey);
    return todayLog ? todayLog.state : null;
  }, [currentVesselLogs]);

  // Get current vessel stats with detailed breakdown
  const currentVesselStats = useMemo(() => {
    if (!currentVesselLogs || currentVesselLogs.length === 0) {
      return { 
        totalDays: 0, 
        loggedDaysCount: 0,
        atSeaDays: 0, 
        standbyDays: 0,
        stateBreakdown: {},
        serviceStartDate: null,
        serviceDuration: 0
      };
    }

    // Match Vessel History: prefer active assignment (no end date), else most recent by start date
    const currentVesselAssignments = currentVessel
      ? vesselAssignments.filter(a => a.vesselId === currentVessel.id)
      : [];

    const activeAssignment =
      currentVesselAssignments.find(a => !a.endDate || String(a.endDate).trim() === '') ?? null;

    const mostRecentAssignment =
      currentVesselAssignments.length > 0
        ? [...currentVesselAssignments].sort(
            (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
          )[0]
        : null;

    const assignmentForWindow = activeAssignment ?? mostRecentAssignment;

    const assignmentStartDate = assignmentForWindow
      ? parse(assignmentForWindow.startDate, 'yyyy-MM-dd', new Date())
      : null;

    // Filter logs to since joining the vessel (assignment start date) or all logs if no assignment date
    let filteredLogs: StateLog[];
    
    if (assignmentStartDate) {
      const filterStartDate = assignmentStartDate;
      const filterEndDate = endOfDay(new Date());
      
      filteredLogs = currentVesselLogs.filter(log => {
        const logDate = parse(log.date, 'yyyy-MM-dd', new Date());
        return isWithinInterval(logDate, { start: filterStartDate, end: filterEndDate });
      });
    } else {
      filteredLogs = currentVesselLogs;
    }

    const stateBreakdown: Record<string, number> = {};
    filteredLogs.forEach(log => {
      stateBreakdown[log.state] = (stateBreakdown[log.state] || 0) + 1;
    });

    const earliestDate = filteredLogs.reduce<Date | null>((min, log) => {
      const logDate = new Date(log.date);
      if (min === null || logDate < min) return logDate;
      return min;
    }, null);

    // Extract part of active passage dates from ALL logs (for proper voyage context)
    const partOfActivePassageDates = new Set<string>();
    currentVesselLogs.forEach(log => {
      if (log.isPartOfActivePassage) {
        partOfActivePassageDates.add(log.date);
      }
    });

    // Calculate MCA-compliant standby days using ALL logs (for proper voyage context)
    // Then filter standby periods to only count those since joining the vessel
    const { totalStandbyDays, standbyPeriods } = calculateStandbyDays(currentVesselLogs, watchDates, partOfActivePassageDates, {
      vesselManagerSeaTime: isVesselManager,
    });
    
    // Filter standby periods to only count days since joining the vessel
    let standby = 0;
    
    if (assignmentStartDate) {
      const filterStartDate = assignmentStartDate;
      const filterEndDate = endOfDay(new Date());
      
      for (const period of standbyPeriods) {
        const periodStart = period.startDate;
        const periodEnd = period.endDate;
        
        // Find the overlap between the standby period and the period since joining
        const overlapStart = periodStart > filterStartDate ? periodStart : filterStartDate;
        const overlapEnd = periodEnd < filterEndDate ? periodEnd : filterEndDate;
        
        if (overlapStart <= overlapEnd) {
          // Count how many of the counted days fall within the period since joining
          const countedDays = period.countedDays;
          const periodDays = period.days;
          
          // Calculate how many counted days are since joining
          let countedSinceJoining = 0;
          for (let i = 0; i < Math.min(countedDays, periodDays); i++) {
            const dayDate = addDays(periodStart, i);
            if (isWithinInterval(dayDate, { start: filterStartDate, end: filterEndDate })) {
              countedSinceJoining++;
            }
          }
          
          standby += countedSinceJoining;
        }
      }
    } else {
      // No assignment date - use all standby days
      standby = totalStandbyDays;
    }

    // Calculate at sea days from filtered logs
    let atSea = 0;
    filteredLogs.forEach(log => {
      if (log.state === 'underway' || (isVesselManager && log.state === 'at-anchor')) atSea++;
    });

    // Add part of active passage days to at-sea count (these count as "at sea" regardless of state)
    if (partOfActivePassageDates.size > 0) {
      const partOfActivePassageDaysInRange = Array.from(partOfActivePassageDates).filter(dateStr => {
        const passageDate = parse(dateStr, 'yyyy-MM-dd', new Date());
        if (assignmentStartDate) {
          const filterStartDate = assignmentStartDate;
          const filterEndDate = endOfDay(new Date());
          return isWithinInterval(passageDate, { start: filterStartDate, end: filterEndDate });
        }
        return true;
      }).length;
      atSea += partOfActivePassageDaysInRange;
    }

    // Add watch days to at-sea count (watch days count as "at sea" even if vessel is at anchor)
    if (watchDates.size > 0) {
      const watchDaysInRange = Array.from(watchDates).filter(dateStr => {
        const watchDate = parse(dateStr, 'yyyy-MM-dd', new Date());
        if (assignmentStartDate) {
          const filterStartDate = assignmentStartDate;
          const filterEndDate = endOfDay(new Date());
          return isWithinInterval(watchDate, { start: filterStartDate, end: filterEndDate });
        }
        return true;
      }).length;
      atSea += watchDaysInRange;
    }

    // "Since" + duration: same source as Vessel History (assignment start/end), not first log date
    let serviceStartDate: Date | null = null;
    let serviceDuration = 0;
    if (assignmentForWindow) {
      const start = startOfDay(parse(assignmentForWindow.startDate, 'yyyy-MM-dd', new Date()));
      serviceStartDate = start;
      const end = assignmentForWindow.endDate
        ? startOfDay(parse(assignmentForWindow.endDate, 'yyyy-MM-dd', new Date()))
        : startOfDay(new Date());
      serviceDuration = Math.max(0, differenceInDays(end, start) + 1);
    } else if (earliestDate) {
      const fallbackStart = startOfDay(earliestDate);
      serviceStartDate = fallbackStart;
      const diffTime = new Date().getTime() - fallbackStart.getTime();
      serviceDuration = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1);
    }

    const loggedDaysCount = filteredLogs.length;

    return { 
      // Assignment calendar span (same as Vessel History / "days on vessel"), not count of log rows
      totalDays: serviceDuration,
      loggedDaysCount,
      atSeaDays: atSea,
      standbyDays: standby,
      stateBreakdown,
      serviceStartDate,
      serviceDuration
    };
  }, [currentVesselLogs, currentVessel, vesselAssignments, watchDates, isVesselManager]);

  const longestPassage = useMemo(() => {
    // With new structure, each record is for one date, so "longest passage" 
    // would be based on state logs, not service records
    // For now, return null or calculate based on state logs
    return null;
  }, []);

  // Calculate the number of vessels the user has logged time on
  const userVesselCount = useMemo(() => {
    if (!allStateLogs || allStateLogs.size === 0) return 0;
    // Count only vessels that have non-empty state logs (user has actually logged time on them)
    let count = 0;
    allStateLogs.forEach((logs) => {
      if (logs && logs.length > 0) {
        count++;
      }
    });
    return count;
  }, [allStateLogs]);

  const topVessel = useMemo(() => {
    if(!vessels || !allStateLogs || allStateLogs.size === 0) return null;

    // Count days based on state logs per vessel
    const daysByVessel: Record<string, number> = {};
    allStateLogs.forEach((logs, vesselId) => {
      daysByVessel[vesselId] = logs.length;
    });

    if (Object.keys(daysByVessel).length === 0) return null;

    const topVesselId = Object.entries(daysByVessel).sort(([,a],[,b]) => b - a)[0][0];
    const vessel = vessels.find(v => v.id === topVesselId);

    return {
      vesselName: vessel?.name || 'Unknown',
      days: daysByVessel[topVesselId]
    }
  }, [vessels, allStateLogs]);


  const isLoading = isLoadingVessels || isLoadingProfile || (vessels && (allSeaService.length === 0 && allStateLogs.size === 0 && vessels.length > 0));
  
  // Render vessel manager dashboard
  if (isVesselManager) {
    if (isLoadingVesselStats || !vesselStats) {
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

    const todayStateInfo = vesselStats.todayStatus 
      ? vesselStates.find(s => s.value === vesselStats.todayStatus)
      : null;
    const TodayStateIcon = todayStateInfo?.icon || Ship;

    const atSeaDays =
      (vesselStats.stateBreakdown['underway'] || 0) +
      (vesselStats.stateBreakdown['at-anchor'] || 0);

    return (
      <div className="flex flex-col gap-6">
        <DashboardHeader
          title={currentVessel?.name || 'Vessel Dashboard'}
          description="Vessel activity, crew, and sea-time overview"
          actions={
            <>
              {vesselStats.todayStatus && todayStateInfo ? (
                <Badge
                  variant="outline"
                  style={{ borderColor: todayStateInfo.color, color: todayStateInfo.color }}
                >
                  <TodayStateIcon className="mr-1.5 h-3.5 w-3.5" />
                  Today: {todayStateInfo.label}
                </Badge>
              ) : null}
              {currentVessel ? (
                <Badge variant="outline">
                  <Ship className="mr-1.5 h-3.5 w-3.5" />
                  {currentVessel.type || 'Vessel'}
                </Badge>
              ) : null}
            </>
          }
        />

        <DashboardStatRow
          items={[
            { label: 'Crew', value: vesselStats.crewCount, hint: 'Active members' },
            { label: 'Sea days', value: atSeaDays, hint: 'Underway + anchor' },
            {
              label: 'This month',
              value: vesselStats.currentMonthSeaDays,
              hint: `${vesselStats.currentMonthDays} days logged`,
            },
            {
              label: 'Pending testimonials',
              value: vesselStats.pendingTestimonials,
              hint: 'Awaiting approval',
            },
          ]}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <DashboardPanel title="Days by state" description="Logged vessel days">
            <StateBreakdownBars
              rows={vesselStates
                .filter((state) => state.value !== 'on-leave')
                .map((state) => ({
                  key: state.value,
                  label: state.label,
                  count: vesselStats.stateBreakdown[state.value] || 0,
                  color: state.color,
                  icon: state.icon,
                }))}
            />
            <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">At sea</p>
                <p className="font-semibold tabular-nums">{atSeaDays}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Standby</p>
                <p className="font-semibold tabular-nums">{vesselStats.totalStandbyDays}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-semibold tabular-nums">{vesselStats.totalDays}</p>
              </div>
            </div>
          </DashboardPanel>

          <DashboardPanel
            title="Recent crew activity"
            description="Last 30 days"
            action={
              <Button asChild variant="ghost" size="sm" className="h-7">
                <Link href="/dashboard/crew">View all</Link>
              </Button>
            }
          >
            {vesselStats.recentCrewActivity.length > 0 ? (
              <div className="divide-y">
                {vesselStats.recentCrewActivity.map((activity) => (
                  <div key={activity.userId} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{activity.userName}</p>
                      <p className="text-xs text-muted-foreground">{activity.daysLogged} days logged</p>
                    </div>
                    {activity.lastActivity ? (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {format(parse(activity.lastActivity, 'yyyy-MM-dd', new Date()), 'MMM d')}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No recent activity</p>
            )}
          </DashboardPanel>
        </div>

        <DashboardQuickLinks
          links={[
            { href: '/dashboard/crew', label: 'Crew', icon: Users },
            { href: '/dashboard/inbox', label: 'Inbox / Testimonials', icon: FileText },
            { href: '/dashboard/calendar', label: 'Calendar', icon: Calendar },
            { href: '/dashboard/current', label: 'Current', icon: Activity },
          ]}
        />

        <DashboardPanel
          title="Sea-time calculator"
          description="MCA-compliant sea time for a selected date range"
          action={
            <Button asChild variant="ghost" size="sm" className="h-7">
              <Link href="/dashboard/calendar">
                <History className="mr-1.5 h-3.5 w-3.5" />
                Calendar
              </Link>
            </Button>
          }
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sea-time-from" className="text-xs text-muted-foreground">From</Label>
                <Input
                  id="sea-time-from"
                  type="date"
                  value={seaTimeRangeStart}
                  onChange={(e) => setSeaTimeRangeStart(e.target.value)}
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sea-time-to" className="text-xs text-muted-foreground">To</Label>
                <Input
                  id="sea-time-to"
                  type="date"
                  value={seaTimeRangeEnd}
                  onChange={(e) => setSeaTimeRangeEnd(e.target.value)}
                  className="rounded-lg"
                />
              </div>
            </div>
            {vesselSeaTimeInRange ? (
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
                {[
                  ['Days logged', vesselSeaTimeInRange.totalDays],
                  ['At sea', vesselSeaTimeInRange.atSeaDays],
                  ['Standby', vesselSeaTimeInRange.standbyDays],
                  ['Sea service', vesselSeaTimeInRange.seaServiceDays],
                ].map(([label, value]) => (
                  <div key={label} className="bg-card px-3 py-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </DashboardPanel>
      </div>
    );
  }
  
  // Render admin dashboard if user is admin
  if (isAdmin) {
    if (isLoadingAdminStats || !adminStats) {
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

    return (
      <div className="flex flex-col gap-6">
        <DashboardHeader
          title="Admin Dashboard"
          description="Company overview and key metrics"
        />

        <DashboardStatRow
          items={[
            {
              label: 'Active crew',
              value: adminStats.activeSubscriptions,
              hint: `of ${adminStats.totalUsers} users`,
            },
            {
              label: 'Vessels',
              value: adminStats.totalVessels,
              hint: 'Registered vessels',
            },
            {
              label: 'Total users',
              value: adminStats.totalUsers,
              hint: `${adminStats.recentSignups} recent signups`,
            },
            {
              label: 'Monthly revenue',
              value: `£${adminStats.monthlyRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              hint: `£${adminStats.annualRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} annually`,
            },
          ]}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <DashboardPanel
            title="Subscriptions"
            description="Active crew and vessel tiers"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Crew</p>
                {Object.entries(adminStats.crewSubscriptionsByTier).length > 0 ? (
                  <div className="divide-y">
                    {Object.entries(adminStats.crewSubscriptionsByTier)
                      .sort(([, a], [, b]) => b - a)
                      .map(([tier, count]) => (
                        <div key={tier} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                          <span className="truncate text-sm">
                            {tier === 'crew_limited'
                              ? 'Crew Limited'
                              : tier === 'vessel_linked'
                                ? 'Vessel Linked'
                                : tier.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}
                          </span>
                          <span className="text-sm font-semibold tabular-nums">{count}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No active subscriptions</p>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Vessels</p>
                {Object.entries(adminStats.vesselSubscriptionsByTier).length > 0 ? (
                  <div className="divide-y">
                    {Object.entries(adminStats.vesselSubscriptionsByTier)
                      .sort(([, a], [, b]) => b - a)
                      .map(([tier, count]) => (
                        <div key={tier} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                          <span className="truncate text-sm">
                            {tier.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}
                          </span>
                          <span className="text-sm font-semibold tabular-nums">{count}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No active subscriptions</p>
                )}
              </div>
            </div>
          </DashboardPanel>

          <DashboardPanel
            title="Revenue snapshot"
            description="Monthly subscription revenue"
          >
            <div className="divide-y">
              <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
                <div>
                  <p className="text-sm font-medium">Crew</p>
                  <p className="text-xs text-muted-foreground">{adminStats.activeSubscriptions} active accounts</p>
                </div>
                <p className="font-semibold tabular-nums">
                  £{adminStats.crewRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium">Vessels</p>
                  <p className="text-xs text-muted-foreground">{adminStats.activeVesselSubscriptions} active accounts</p>
                </div>
                <p className="font-semibold tabular-nums">
                  £{adminStats.vesselRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 pt-3">
                <p className="text-sm font-medium">Total monthly</p>
                <p className="text-lg font-semibold tabular-nums">
                  £{adminStats.monthlyRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </DashboardPanel>
        </div>

        <DashboardQuickLinks
          links={[
            { href: '/dashboard/crew', label: 'Crew', icon: Users },
            { href: '/dashboard/vessels', label: 'Vessels', icon: Ship },
            { href: '/dashboard/revenue', label: 'Revenue', icon: BarChart3 },
            { href: '/dashboard/vessel-subscriptions', label: 'Subscriptions', icon: CreditCard },
          ]}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <DashboardPanel title="Latest user signups" description="Most recent crew accounts">
            {adminStats.recentUserSignups.length > 0 ? (
              <div className="divide-y">
                {adminStats.recentUserSignups.map((user) => {
                  const displayName = user.firstName || user.lastName
                    ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                    : user.email;
                  const signupDate = user.createdAt
                    ? format(new Date(user.createdAt), 'MMM d, yyyy')
                    : 'Unknown';
                  return (
                    <div key={user.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{displayName}</p>
                        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {user.todayStateKey ? (
                          <StatePill stateKey={user.todayStateKey} label={user.todayState} />
                        ) : null}
                        <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
                          {signupDate}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No user signups found</p>
            )}
          </DashboardPanel>

          <DashboardPanel title="Latest vessel signups" description="Most recent vessel accounts">
            {adminStats.recentVesselSignups.length > 0 ? (
              <div className="divide-y">
                {adminStats.recentVesselSignups.map((vessel) => {
                  const displayName = vessel.firstName || vessel.lastName
                    ? `${vessel.firstName || ''} ${vessel.lastName || ''}`.trim()
                    : vessel.email;
                  const signupDate = vessel.createdAt
                    ? format(new Date(vessel.createdAt), 'MMM d, yyyy')
                    : 'Unknown';
                  return (
                    <div key={vessel.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{displayName}</p>
                        <p className="truncate text-xs text-muted-foreground">{vessel.email}</p>
                        {vessel.vesselName ? (
                          <p className="truncate text-xs text-muted-foreground">{vessel.vesselName}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {vessel.todayStateKey ? (
                          <StatePill stateKey={vessel.todayStateKey} label={vessel.todayState} />
                        ) : null}
                        <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
                          {signupDate}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">No vessel signups found</p>
            )}
          </DashboardPanel>
        </div>
      </div>
    );
  }
  
  // Loading skeleton component
  const StatCardSkeleton = () => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16 mb-2" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  );
  
  if (isLoading) {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <Card className="lg:col-span-2 rounded-xl">
            <CardHeader>
              <Skeleton className="h-6 w-40 mb-2" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader
        title="Dashboard"
        description="Your career at a glance"
        actions={
          <>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[140px]">
                <Calendar className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year.toLowerCase()}>
                    {year === 'all' ? 'All Years' : year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedVessel} onValueChange={setSelectedVessel}>
              <SelectTrigger className="w-[180px]">
                <Ship className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Vessel" />
              </SelectTrigger>
              <SelectContent>
                {availableVessels.map(vessel => (
                  <SelectItem key={vessel.id} value={vessel.id}>{vessel.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />
      
      {/* Past 7 Days Summary and Quick Visa Log - Side by Side */}
      {(past7DaysStats.totalDays > 0 || (!isAdmin && activeVisas.length > 0)) ? (
      <div className="order-4 grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Past 7 Days Summary */}
      {past7DaysStats.totalDays > 0 && (
        <Card className="rounded-xl border shadow-none">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="mb-1.5 text-sm font-semibold">Last 7 days</h3>
                <div className="space-y-1.5">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    In the last week, you logged{' '}
                    <span className="font-semibold text-foreground">{past7DaysStats.totalDays} day{past7DaysStats.totalDays !== 1 ? 's' : ''}</span>:
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {past7DaysStats.atSeaDays > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-blue))' }} />
                        <span className="text-muted-foreground">
                          <span className="font-semibold text-foreground">{past7DaysStats.atSeaDays}</span> day{past7DaysStats.atSeaDays !== 1 ? 's' : ''} at sea
                        </span>
                      </div>
                    )}
                    {past7DaysStats.standbyDays > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-purple))' }} />
                        <span className="text-muted-foreground">
                          <span className="font-semibold text-foreground">{past7DaysStats.standbyDays}</span> standby day{past7DaysStats.standbyDays !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                    {past7DaysStats.atAnchorDays > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-orange))' }} />
                        <span className="text-muted-foreground">
                          <span className="font-semibold text-foreground">{past7DaysStats.atAnchorDays}</span> day{past7DaysStats.atAnchorDays !== 1 ? 's' : ''} at anchor
                        </span>
                      </div>
                    )}
                    {past7DaysStats.inPortDays > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-green))' }} />
                        <span className="text-muted-foreground">
                          <span className="font-semibold text-foreground">{past7DaysStats.inPortDays}</span> day{past7DaysStats.inPortDays !== 1 ? 's' : ''} moored
                        </span>
                      </div>
                    )}
                    {past7DaysStats.onLeaveDays > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-gray))' }} />
                        <span className="text-muted-foreground">
                          <span className="font-semibold text-foreground">{past7DaysStats.onLeaveDays}</span> day{past7DaysStats.onLeaveDays !== 1 ? 's' : ''} on leave
                        </span>
                      </div>
                    )}
                    {past7DaysStats.inYardDays > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-red))' }} />
                        <span className="text-muted-foreground">
                          <span className="font-semibold text-foreground">{past7DaysStats.inYardDays}</span> day{past7DaysStats.inYardDays !== 1 ? 's' : ''} in yard
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

        {/* Quick Visa Log Section - Compact */}
        {!isAdmin && activeVisas.length > 0 && (
          <Card className="rounded-xl border shadow-none">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border bg-muted/30">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base">Quick Visa Log</CardTitle>
                  <CardDescription className="text-xs">Log today's date</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {activeVisas.map((visa) => {
                  const today = startOfDay(new Date());
                  const visaIssue = parse(visa.issueDate, 'yyyy-MM-dd', new Date());
                  const visaExpire = parse(visa.expireDate, 'yyyy-MM-dd', new Date());
                  const isTodayValid = !isBefore(today, visaIssue) && !isAfter(today, visaExpire);

                  return (
                    <div key={visa.id} className="flex items-center justify-between gap-3 border-t py-2.5 first:border-t-0 first:pt-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{visa.areaName}</p>
                        <p className="text-xs text-muted-foreground">
                          {visa.daysRemaining} day{visa.daysRemaining !== 1 ? 's' : ''} remaining
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickLogVisaDate(visa)}
                        disabled={!isTodayValid || isLoggingVisaDate}
                        className="h-8 rounded-lg"
                      >
                        {isLoggingVisaDate ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Logging...
                          </>
                        ) : (
                          <>
                            <LogIn className="mr-2 h-4 w-4" />
                            Log Today
                          </>
                        )}
                      </Button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 pt-3 border-t">
                <DashboardQuickLinks
                  links={[{ href: '/dashboard/visa-tracker', label: 'View all visas', icon: Globe }]}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      ) : null}
      
      <DashboardStatRow
        className="order-2"
        items={[
          { label: 'Total days', value: totalDays, hint: 'On board, excluding leave' },
          { label: 'At sea', value: atSeaDays, hint: `${thisMonthStats.atSeaDays} this month` },
          { label: 'Standby', value: standbyDays, hint: 'Moored or at anchor' },
          { label: 'Vessels', value: userVesselCount, hint: 'Career assignments' },
        ]}
      />
      
      {/* Current Vessel and Recent Activity Section */}
      <div className="order-3 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Current Vessel Card */}
        <DashboardPanel
          title="Current vessel"
          description={currentVessel ? 'Your active assignment' : 'No active vessel at this time'}
        >
            {currentVessel ? (
              <div className="space-y-4">
                {/* Vessel hero — name, type, active badge */}
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border bg-muted/30">
                    <Ship className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{currentVessel.name}</p>
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Active</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{currentVessel.type || 'Vessel'}</p>
                  </div>
                </div>

                {/* Service info — duration and start date */}
                {currentVesselStats.serviceStartDate && (
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {currentVesselStats.serviceDuration} day{currentVesselStats.serviceDuration !== 1 ? 's' : ''} on vessel
                    </span>
                    <span className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Since {format(currentVesselStats.serviceStartDate, 'MMM d, yyyy')}
                    </span>
                  </div>
                )}

                {/* Today's status */}
                <div>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Today&apos;s status</p>
                  {todayStatus ? (
                    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                      {(() => {
                        const stateInfo = vesselStates.find(s => s.value === todayStatus);
                        const StateIcon = stateInfo?.icon || Ship;
                        return (
                          <>
                            <div
                              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md"
                              style={{ backgroundColor: `${stateInfo?.color || 'hsl(var(--muted-foreground))'}20` }}
                            >
                              <StateIcon className="h-4 w-4" style={{ color: stateInfo?.color || 'hsl(var(--muted-foreground))' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{stateInfo?.label || todayStatus}</p>
                              <p className="text-xs text-muted-foreground">{format(new Date(), 'EEEE, MMM d')}</p>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed px-3 py-2.5 text-muted-foreground">
                      <p className="text-sm">No status logged for today</p>
                    </div>
                  )}
                </div>

                {/* State distribution */}
                {currentVesselStats.loggedDaysCount > 0 && (
                  <div className="border-t pt-4">
                    <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">State breakdown</p>
                    <StateBreakdownBars
                      rows={vesselStates.map(state => ({
                        key: state.value,
                        label: state.label,
                        count: currentVesselStats.stateBreakdown[state.value] || 0,
                        color: state.color,
                        icon: state.icon,
                      }))}
                    />
                  </div>
                )}

                {/* Actions */}
                <div className="pt-1">
                  <Button asChild className="w-full">
                    <Link href="/dashboard/current">
                      <MapPin className="mr-2 h-4 w-4" />
                      Manage service
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border bg-muted/30">
                  <Ship className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">No active vessel</p>
                <p className="text-sm text-muted-foreground mb-6 max-w-xs">Start a service to track sea time on a vessel.</p>
                <Button asChild>
                  <Link href="/dashboard/current">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Start a service
                  </Link>
                </Button>
              </div>
            )}
        </DashboardPanel>
        
        <DashboardPanel
          title="Recent activity"
          description="Sea time, state changes, visa logs, and testimonial updates"
        >
            {recentActivity.length > 0 ? (
              <div className="divide-y">
                {recentActivity.map((activity, index) => {
                  const activityDate = new Date(activity.date);
                  const isToday = format(activityDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                  const isYesterday = format(activityDate, 'yyyy-MM-dd') === format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
                  
                  let dateLabel = '';
                  if (isToday) {
                    dateLabel = 'Today';
                  } else if (isYesterday) {
                    dateLabel = 'Yesterday';
                  } else {
                    dateLabel = format(activityDate, 'MMM d, yyyy');
                  }
                  
                  // Handle different activity types
                  if (activity.type === 'visa_logged') {
                    return (
                      <div 
                        key={activity.id}
                        className="flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0"
                      >
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-blue-500/10">
                          <Globe className="h-3.5 w-3.5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-semibold truncate">{activity.visaAreaName || 'Unknown Area'}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-blue-600">
                              Visa Date Logged
                            </span>
                            <span className="text-xs text-muted-foreground">•</span>
                            <span className="text-xs text-muted-foreground">{dateLabel}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  
                  if (activity.type === 'testimonial_approved' || activity.type === 'testimonial_rejected') {
                    const isApproved = activity.type === 'testimonial_approved';
                    return (
                      <div 
                        key={activity.id}
                        className="flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0"
                      >
                        <div 
                          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${
                            isApproved 
                              ? 'bg-green-500/20' 
                              : 'bg-red-500/20'
                          }`}
                        >
                          {isApproved ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-red-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-semibold truncate">{activity.vesselName}</p>
                            {activity.vesselType && (
                              <span className="text-xs text-muted-foreground truncate">• {activity.vesselType}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-medium ${isApproved ? 'text-green-600' : 'text-red-600'}`}>
                              Testimonial {isApproved ? 'Approved' : 'Rejected'}
                            </span>
                            <span className="text-xs text-muted-foreground">•</span>
                            <span className="text-xs text-muted-foreground">{dateLabel}</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  
                  // Handle state logs and state changes
                  const stateInfo = vesselStates.find(s => s.value === activity.state);
                  const StateIcon = stateInfo?.icon || Ship;
                  const isStateChange = activity.type === 'state_change';
                  
                  return (
                    <div 
                      key={activity.id || `${activity.date}-${activity.vesselId}-${index}`}
                      className="flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div 
                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md"
                        style={{ backgroundColor: `${stateInfo?.color || 'hsl(var(--muted-foreground))'}20` }}
                      >
                        <StateIcon 
                          className="h-3.5 w-3.5"
                          style={{ color: stateInfo?.color || 'hsl(var(--muted-foreground))' }} 
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold truncate">{activity.vesselName}</p>
                          {activity.vesselType && (
                            <span className="text-xs text-muted-foreground truncate">• {activity.vesselType}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium" style={{ color: stateInfo?.color || 'hsl(var(--muted-foreground))' }}>
                            {isStateChange ? 'State Changed: ' : ''}{stateInfo?.label || activity.state}
                          </span>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">{dateLabel}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-32 flex-col items-center justify-center text-center">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border bg-muted/30">
                  <History className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground mb-1">No recent activity</p>
                <p className="text-xs text-muted-foreground">Start logging your sea time to see activity here</p>
              </div>
            )}
        </DashboardPanel>
      </div>

    </div>
  );
}
