
'use client';

import { Ship, LifeBuoy, Anchor, Loader2, Star, Waves, Building, Calendar, MapPin, PlusCircle, Clock, TrendingUp, History, CalendarDays, TrendingDown, Activity, Target, Trophy, CheckCircle2, XCircle, FileText, Users, CreditCard, BarChart3, Globe, LogIn } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { format, getYear, subDays, startOfDay, isWithinInterval, parse, startOfMonth, endOfMonth, isSameMonth, isBefore, isAfter } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUser, useSupabase } from '@/supabase';
import { useToast } from '@/hooks/use-toast';
import { useCollection, useDoc } from '@/supabase/database';
import { getVesselSeaService, getVesselStateLogs, updateStateLogsBatch } from '@/supabase/database/queries';
import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Vessel, SeaServiceRecord, StateLog, UserProfile, DailyStatus, Testimonial, VisaTracker, VisaEntry } from '@/lib/types';
import { calculateStandbyDays } from '@/lib/standby-calculation';
import { findMissingDays } from '@/lib/fill-missing-days';
import { calculateVisaCompliance, detectVisaRules } from '@/lib/visa-compliance';
import { cn } from '@/lib/utils';

const vesselStates: { value: DailyStatus; label: string; color: string, icon: React.FC<any> }[] = [
  { value: 'underway', label: 'Underway', color: 'hsl(var(--chart-blue))', icon: Waves },
  { value: 'at-anchor', label: 'At Anchor', color: 'hsl(var(--chart-orange))', icon: Anchor },
  { value: 'in-port', label: 'In Port', color: 'hsl(var(--chart-green))', icon: Building },
  { value: 'on-leave', label: 'On Leave', color: 'hsl(var(--chart-gray))', icon: LifeBuoy },
  { value: 'in-yard', label: 'In Yard', color: 'hsl(var(--chart-red))', icon: Ship },
];

export default function DashboardPage() {
  const { user } = useUser();
  const { supabase } = useSupabase();
  const { toast } = useToast();

  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedVessel, setSelectedVessel] = useState('all');
  
  const [allSeaService, setAllSeaService] = useState<SeaServiceRecord[]>([]);
  const [allStateLogs, setAllStateLogs] = useState<Map<string, StateLog[]>>(new Map());
  const [currentVesselLogs, setCurrentVesselLogs] = useState<StateLog[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [activeVisas, setActiveVisas] = useState<Array<VisaTracker & { daysRemaining: number; daysUsed: number }>>([]);
  const [isLoggingVisaDate, setIsLoggingVisaDate] = useState(false);
  const [adminStats, setAdminStats] = useState<{
    totalUsers: number;
    activeSubscriptions: number;
    activeVesselSubscriptions: number;
    totalVessels: number;
    subscriptionsByTier: Record<string, number>;
    recentSignups: number;
    monthlyRevenue: number;
    annualRevenue: number;
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
        const { data: allUsers, error: usersError } = await supabase
          .from('users')
          .select('id, subscription_status, subscription_tier, created_at, role')
          .neq('role', 'vessel');

        if (usersError) {
          console.error('[ADMIN DASHBOARD] Error fetching users:', usersError);
        }

        // Fetch all vessel accounts
        const { data: allVesselAccounts, error: vesselAccountsError } = await supabase
          .from('users')
          .select('id, subscription_status, subscription_tier, created_at, role')
          .eq('role', 'vessel');

        if (vesselAccountsError) {
          console.error('[ADMIN DASHBOARD] Error fetching vessel accounts:', vesselAccountsError);
        }

        // Fetch all vessels
        const { data: allVesselsData, error: vesselsError } = await supabase
          .from('vessels')
          .select('id, is_official');

        if (vesselsError) {
          console.error('[ADMIN DASHBOARD] Error fetching vessels:', vesselsError);
        }

        // Calculate statistics
        const totalUsers = allUsers?.length || 0;
        const activeSubscriptions = allUsers?.filter(u => 
          (u.subscription_status || '').toLowerCase() === 'active'
        ).length || 0;
        
        const activeVesselSubscriptions = allVesselAccounts?.filter(u => 
          (u.subscription_status || '').toLowerCase() === 'active'
        ).length || 0;
        
        const officialVessels = allVesselsData?.filter(v => {
          const isOfficial = (v as any).is_official;
          return isOfficial === true || isOfficial === 'true';
        }).length || 0;

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

        // Count subscriptions by tier and calculate revenue
        const subscriptionsByTier: Record<string, number> = {};
        let monthlyRevenue = 0;

        // Calculate revenue from crew subscriptions
        allUsers?.forEach(user => {
          if ((user.subscription_status || '').toLowerCase() === 'active') {
            const tier = (user.subscription_tier || 'free').toLowerCase();
            subscriptionsByTier[tier] = (subscriptionsByTier[tier] || 0) + 1;
            
            // Add to revenue if tier has pricing
            const price = tierPricing[tier];
            if (price) {
              monthlyRevenue += price;
            }
          }
        });

        // Calculate revenue from vessel subscriptions
        allVesselAccounts?.forEach(vessel => {
          if ((vessel.subscription_status || '').toLowerCase() === 'active') {
            const tier = (vessel.subscription_tier || 'free').toLowerCase();
            subscriptionsByTier[tier] = (subscriptionsByTier[tier] || 0) + 1;
            
            // Add to revenue if tier has pricing
            const price = tierPricing[tier];
            if (price) {
              monthlyRevenue += price;
            }
          }
        });

        const annualRevenue = monthlyRevenue * 12;

        // Count recent signups (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentSignups = allUsers?.filter(u => {
          const createdAt = u.created_at ? new Date(u.created_at) : null;
          return createdAt && createdAt >= thirtyDaysAgo;
        }).length || 0;

        setAdminStats({
          totalUsers,
          activeSubscriptions,
          activeVesselSubscriptions,
          totalVessels: officialVessels,
          subscriptionsByTier,
          recentSignups,
          monthlyRevenue,
          annualRevenue,
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
      return;
    }

    const fetchVesselStats = async () => {
      setIsLoadingVesselStats(true);
      try {
        const vesselId = userProfile.activeVesselId;

        // Fetch crew count (active assignments)
        const { data: assignments, error: assignmentsError } = await supabase
          .from('vessel_assignments')
          .select('id')
          .eq('vessel_id', vesselId)
          .is('end_date', null);

        if (assignmentsError) {
          console.error('[VESSEL DASHBOARD] Error fetching crew:', assignmentsError);
        }

        // Fetch all state logs for this vessel
        const { data: allLogs, error: logsError } = await supabase
          .from('daily_state_logs')
          .select('*')
          .eq('vessel_id', vesselId);

        if (logsError) {
          console.error('[VESSEL DASHBOARD] Error fetching logs:', logsError);
        }

        // Transform logs
        const stateLogs: StateLog[] = (allLogs || []).map((log: any) => ({
          id: log.id,
          userId: log.user_id,
          vesselId: log.vessel_id,
          date: log.date,
          state: log.state,
        }));

        // Calculate sea time
        const { totalSeaDays, totalStandbyDays } = calculateStandbyDays(stateLogs);

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
        const { totalSeaDays: monthSeaDays } = calculateStandbyDays(currentMonthLogs);

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
          crewCount: assignments?.length || 0,
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
    let days = 0;
    let atSea = 0;
    let standby = 0;

    // Collect all logs to filter by vessel and year
    const vesselIdsToCount = selectedVessel === 'all' 
      ? Array.from(allStateLogs.keys())
      : [selectedVessel];

    // Collect filtered logs for MCA/PYA calculation
    const filteredLogs: StateLog[] = [];

    vesselIdsToCount.forEach(vesselId => {
      const logs = allStateLogs.get(vesselId) || [];
        logs.forEach(log => {
        // Filter by year if needed
        const logYear = getYear(new Date(log.date));
        const yearMatch = selectedYear === 'all' || logYear === parseInt(selectedYear, 10);
        
        if (yearMatch) {
            days++;
          filteredLogs.push(log);
            if (log.state === 'underway') {
                atSea++;
          }
            }
        });
    });

    // Calculate MCA/PYA compliant standby days
    const { totalStandbyDays } = calculateStandbyDays(filteredLogs);
    standby = totalStandbyDays;

    return { totalDays: days, atSeaDays: atSea, standbyDays: standby };
  }, [allStateLogs, selectedVessel, selectedYear]);

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
    return [{ id: 'all', name: 'All Vessels' }, ...vessels];
  }, [vessels]);

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

    // Calculate stats with state breakdown
    const totalDays = past7DaysLogs.length;
    const atSeaDays = past7DaysLogs.filter(log => log.state === 'underway').length;
    const atAnchorDays = past7DaysLogs.filter(log => log.state === 'at-anchor').length;
    const inPortDays = past7DaysLogs.filter(log => log.state === 'in-port').length;
    const onLeaveDays = past7DaysLogs.filter(log => log.state === 'on-leave').length;
    const inYardDays = past7DaysLogs.filter(log => log.state === 'in-yard').length;
    
    // Calculate MCA/PYA compliant standby days for the past 7 days
    const { totalStandbyDays } = calculateStandbyDays(past7DaysLogs);
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
  }, [allStateLogs]);

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

    // Calculate stats with state breakdown
    const totalDays = thisMonthLogs.length;
    const atSeaDays = thisMonthLogs.filter(log => log.state === 'underway').length;
    const atAnchorDays = thisMonthLogs.filter(log => log.state === 'at-anchor').length;
    const inPortDays = thisMonthLogs.filter(log => log.state === 'in-port').length;
    const onLeaveDays = thisMonthLogs.filter(log => log.state === 'on-leave').length;
    const inYardDays = thisMonthLogs.filter(log => log.state === 'in-yard').length;
    
    // Calculate MCA/PYA compliant standby days for this month
    const { totalStandbyDays } = calculateStandbyDays(thisMonthLogs);
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
  }, [allStateLogs]);

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
        atSeaDays: 0, 
        standbyDays: 0,
        stateBreakdown: {},
        serviceStartDate: null,
        serviceDuration: 0
      };
    }

    let atSea = 0;
    const stateBreakdown: Record<string, number> = {};
    let earliestDate: Date | null = null;

    currentVesselLogs.forEach(log => {
      // Count by state
      stateBreakdown[log.state] = (stateBreakdown[log.state] || 0) + 1;
      
      // Count at sea
      if (log.state === 'underway') atSea++;
      
      // Find earliest date
      const logDate = new Date(log.date);
      if (earliestDate === null) {
        earliestDate = logDate;
      } else if (logDate < earliestDate) {
        earliestDate = logDate;
      }
    });

    // Calculate MCA/PYA compliant standby days
    const { totalStandbyDays } = calculateStandbyDays(currentVesselLogs);
    const standby = totalStandbyDays;

    // Calculate service duration
    let serviceDuration = 0;
    if (earliestDate) {
      const now = new Date();
      const startDate = earliestDate as Date;
      const diffTime = now.getTime() - startDate.getTime();
      serviceDuration = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1);
    }

    return { 
      totalDays: currentVesselLogs.length,
      atSeaDays: atSea,
      standbyDays: standby,
      stateBreakdown,
      serviceStartDate: earliestDate,
      serviceDuration
    };
  }, [currentVesselLogs]);

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

    return (
      <div className="flex flex-col gap-6">
        {/* Header Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {currentVessel?.name || 'Vessel Dashboard'}
              </h1>
              <p className="text-muted-foreground">Complete vessel overview and management</p>
            </div>
            <div className="flex items-center gap-3">
              {vesselStats.todayStatus && todayStateInfo && (
                <Badge 
                  variant="outline" 
                  className="text-sm border-2"
                  style={{ borderColor: todayStateInfo.color, color: todayStateInfo.color }}
                >
                  <TodayStateIcon className="mr-2 h-4 w-4" />
                  Today: {todayStateInfo.label}
                </Badge>
              )}
              {currentVessel && (
                <Badge variant="outline" className="text-sm">
                  <Ship className="mr-2 h-4 w-4" />
                  {currentVessel.type || 'Vessel'}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/20 dark:to-blue-900/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Crew Members</CardTitle>
              <div className="h-10 w-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{vesselStats.crewCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Active crew on vessel</p>
              <Button asChild variant="ghost" size="sm" className="mt-2 h-7 text-xs">
                <Link href="/dashboard/crew">View All →</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/20 dark:to-green-900/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Sea Days</CardTitle>
              <div className="h-10 w-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                <Waves className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{vesselStats.totalSeaDays}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {vesselStats.totalStandbyDays} standby • {vesselStats.totalDays} total
              </p>
              <Button asChild variant="ghost" size="sm" className="mt-2 h-7 text-xs">
                <Link href="/dashboard/calendar">View Details →</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/20 dark:to-purple-900/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">This Month</CardTitle>
              <div className="h-10 w-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{vesselStats.currentMonthSeaDays}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {vesselStats.currentMonthDays} days logged this month
              </p>
              <Button asChild variant="ghost" size="sm" className="mt-2 h-7 text-xs">
                <Link href="/dashboard/calendar">View Calendar →</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/20 dark:to-orange-900/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Testimonials</CardTitle>
              <div className="h-10 w-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <FileText className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{vesselStats.pendingTestimonials}</div>
              <p className="text-xs text-muted-foreground mt-1">Awaiting your approval</p>
              {vesselStats.pendingTestimonials > 0 && (
                <Button asChild variant="default" size="sm" className="mt-2 h-7 text-xs">
                  <Link href="/dashboard/inbox">Review Now →</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* State Breakdown */}
          <Card className="rounded-xl border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">State Breakdown</CardTitle>
              <CardDescription>Days logged by vessel state</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {vesselStates.map(state => {
                  const count = vesselStats.stateBreakdown[state.value] || 0;
                  const percentage = vesselStats.totalDays > 0 
                    ? Math.round((count / vesselStats.totalDays) * 100) 
                    : 0;
                  const StateIcon = state.icon;
                  
                  return (
                    <div key={state.value} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StateIcon className="h-4 w-4" style={{ color: state.color }} />
                          <span className="text-sm font-medium">{state.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{count}</span>
                          <span className="text-xs text-muted-foreground">({percentage}%)</span>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all"
                          style={{ 
                            width: `${percentage}%`,
                            backgroundColor: state.color 
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Sea Time Summary */}
          <Card className="rounded-xl border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Sea Time Summary</CardTitle>
              <CardDescription>MCA/PYA compliant calculations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Waves className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-semibold">At Sea</span>
                    </div>
                    <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {vesselStats.totalSeaDays}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Days underway</p>
                </div>
                <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Anchor className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      <span className="text-sm font-semibold">Standby</span>
                    </div>
                    <span className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {vesselStats.totalStandbyDays}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">MCA/PYA compliant</p>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Total Days</span>
                    </div>
                    <span className="text-lg font-bold">{vesselStats.totalDays} days</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Crew Activity */}
          <Card className="rounded-xl border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Recent Crew Activity</CardTitle>
              <CardDescription>Last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              {vesselStats.recentCrewActivity.length > 0 ? (
                <div className="space-y-3">
                  {vesselStats.recentCrewActivity.map((activity) => (
                    <div 
                      key={activity.userId}
                      className="flex items-center justify-between p-2 rounded-lg border bg-background/50 hover:bg-accent transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{activity.userName}</p>
                        <p className="text-xs text-muted-foreground">
                          {activity.daysLogged} days logged
                        </p>
                      </div>
                      {activity.lastActivity && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          {format(parse(activity.lastActivity, 'yyyy-MM-dd', new Date()), 'MMM d')}
                        </Badge>
                      )}
                    </div>
                  ))}
                  <Button asChild variant="ghost" className="w-full rounded-lg" size="sm">
                    <Link href="/dashboard/crew">
                      <Users className="mr-2 h-4 w-4" />
                      View All Crew
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No recent activity</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions & Recent Activity */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="rounded-xl border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
              <CardDescription>Common vessel management tasks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline" className="h-auto flex-col items-start p-4 rounded-lg">
                  <Link href="/dashboard/crew">
                    <Users className="mb-2 h-5 w-5" />
                    <span className="font-semibold">Crew</span>
                    <span className="text-xs text-muted-foreground">{vesselStats.crewCount} members</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-auto flex-col items-start p-4 rounded-lg">
                  <Link href="/dashboard/inbox">
                    <FileText className="mb-2 h-5 w-5" />
                    <span className="font-semibold">Testimonials</span>
                    {vesselStats.pendingTestimonials > 0 && (
                      <Badge variant="destructive" className="mt-1">
                        {vesselStats.pendingTestimonials} pending
                      </Badge>
                    )}
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-auto flex-col items-start p-4 rounded-lg">
                  <Link href="/dashboard/calendar">
                    <Calendar className="mb-2 h-5 w-5" />
                    <span className="font-semibold">Calendar</span>
                    <span className="text-xs text-muted-foreground">View all dates</span>
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-auto flex-col items-start p-4 rounded-lg">
                  <Link href="/dashboard/current">
                    <Activity className="mb-2 h-5 w-5" />
                    <span className="font-semibold">Current</span>
                    <span className="text-xs text-muted-foreground">Today's status</span>
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Activity Overview</CardTitle>
              <CardDescription>Last 7 days summary</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Days Logged</span>
                  </div>
                  <span className="text-2xl font-bold">{vesselStats.recentActivity}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Waves className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">This Month</span>
                  </div>
                  <span className="text-2xl font-bold">{vesselStats.currentMonthSeaDays}</span>
                </div>
                <div className="pt-2 border-t">
                  <Button asChild variant="ghost" className="w-full rounded-lg" size="sm">
                    <Link href="/dashboard/calendar">
                      <History className="mr-2 h-4 w-4" />
                      View Full Activity
                    </Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
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
        {/* Header Section */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground">Company overview and key metrics</p>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Crew Accounts</CardTitle>
              <div className="h-8 w-8 rounded-xl bg-green-500/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-green-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{adminStats.activeSubscriptions}</div>
              <p className="text-xs text-muted-foreground mt-1">
                of {adminStats.totalUsers} total users
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Official Vessels</CardTitle>
              <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Ship className="h-4 w-4 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{adminStats.totalVessels}</div>
              <p className="text-xs text-muted-foreground mt-1">Registered vessels</p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
              <div className="h-8 w-8 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-purple-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{adminStats.totalUsers}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {adminStats.recentSignups} new in last 30 days
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Revenue</CardTitle>
              <div className="h-8 w-8 rounded-xl bg-green-500/10 flex items-center justify-center">
                <CreditCard className="h-4 w-4 text-green-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">£{adminStats.monthlyRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <p className="text-xs text-muted-foreground mt-1">
                £{adminStats.annualRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} annually
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Subscription Breakdown */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="rounded-xl border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Subscription Tiers</CardTitle>
              <CardDescription>Active subscriptions by tier</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(adminStats.subscriptionsByTier).length > 0 ? (
                  Object.entries(adminStats.subscriptionsByTier)
                    .sort(([, a], [, b]) => b - a)
                    .map(([tier, count]) => (
                      <div key={tier} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium capitalize">
                            {tier.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))
                ) : (
                  <p className="text-sm text-muted-foreground">No active subscriptions</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Quick Actions</CardTitle>
              <CardDescription>Common admin tasks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Button asChild variant="outline" className="w-full justify-start rounded-lg">
                  <Link href="/dashboard/crew">
                    <Users className="mr-2 h-4 w-4" />
                    Manage Crew Members
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start rounded-lg">
                  <Link href="/dashboard/vessels">
                    <Ship className="mr-2 h-4 w-4" />
                    Manage Vessels
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start rounded-lg">
                  <Link href="/dashboard/vessels">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    View Analytics
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Revenue Breakdown</CardTitle>
              <CardDescription>Subscription revenue by account type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Active Vessel Accounts</span>
                  <span className="text-sm font-semibold">
                    {adminStats.activeVesselSubscriptions}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm text-muted-foreground">Active Crew Accounts</span>
                  <span className="text-sm font-semibold">
                    {adminStats.activeSubscriptions}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm font-medium">Total Active Subscriptions</span>
                  <span className="text-sm font-bold">
                    {adminStats.activeSubscriptions + adminStats.activeVesselSubscriptions}
                  </span>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Monthly Recurring Revenue</span>
                    <span className="text-sm font-bold text-green-600 dark:text-green-400">
                      £{adminStats.monthlyRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Annual Recurring Revenue</span>
                    <span className="text-sm font-bold text-green-600 dark:text-green-400">
                      £{adminStats.annualRevenue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
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
      {/* Header Section */}
      <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">Your career at a glance</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-full sm:w-[140px] rounded-xl">
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
              <SelectTrigger className="w-full sm:w-[180px] rounded-xl">
                <Ship className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Vessel" />
                </SelectTrigger>
                <SelectContent>
                    {availableVessels.map(vessel => (
                        <SelectItem key={vessel.id} value={vessel.id}>{vessel.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
      </div>
        <Separator />
      </div>
      
      {/* Past 7 Days Summary and Quick Visa Log - Side by Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Past 7 Days Summary */}
      {past7DaysStats.totalDays > 0 && (
        <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow bg-gradient-to-r from-primary/5 to-primary/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                <CalendarDays className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-2">Last 7 Days Summary</h3>
                <div className="space-y-2">
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
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-orange))' }} />
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
                          <span className="font-semibold text-foreground">{past7DaysStats.inPortDays}</span> day{past7DaysStats.inPortDays !== 1 ? 's' : ''} in port
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
          <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow bg-gradient-to-r from-blue-500/5 to-purple-500/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <Globe className="h-4 w-4 text-blue-500" />
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
                    <div key={visa.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-background/50">
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
                        className="rounded-lg"
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
                <Link href="/dashboard/visa-tracker">
                  <Button variant="ghost" size="sm" className="text-xs w-full">
                    View All Visas →
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Days Logged</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Ship className="h-4 w-4 text-primary" />
            </div>
            </CardHeader>
            <CardContent>
            <div className="text-3xl font-bold">{totalDays}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedYear === 'all' && selectedVessel === 'all' ? 'All time' : 'Filtered results'}
            </p>
            </CardContent>
        </Card>
        
        <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">At Sea Days</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Waves className="h-4 w-4 text-blue-500" />
            </div>
            </CardHeader>
            <CardContent>
            <div className="text-3xl font-bold">{atSeaDays}</div>
            <p className="text-xs text-muted-foreground mt-1">Total days underway</p>
            </CardContent>
        </Card>
        
        <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Standby Days</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <Anchor className="h-4 w-4 text-orange-500" />
            </div>
            </CardHeader>
            <CardContent>
            <div className="text-3xl font-bold">{standbyDays}</div>
            <p className="text-xs text-muted-foreground mt-1">In port or at anchor</p>
            </CardContent>
        </Card>
        
        <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vessels Logged</CardTitle>
            <div className="h-8 w-8 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Building className="h-4 w-4 text-purple-500" />
            </div>
            </CardHeader>
            <CardContent>
            <div className="text-3xl font-bold">{userVesselCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Vessels you've been on</p>
            </CardContent>
        </Card>
      </div>
      
      {/* Current Vessel and Recent Activity Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Current Vessel Card */}
        <Card className="rounded-xl border shadow-sm hover:shadow-md transition-all duration-300 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent relative overflow-hidden">
            {/* Decorative background element */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16" />
            <CardHeader className="relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
                  <MapPin className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle>Current Vessel</CardTitle>
                  <CardDescription className="mt-0.5">
                    {currentVessel ? `${currentVessel.name}` : 'No active vessel at this time'}
                  </CardDescription>
                </div>
              </div>
              {currentVessel && (
                <Badge variant="secondary" className="bg-primary text-primary-foreground animate-pulse">Active</Badge>
              )}
            </div>
            </CardHeader>
            <CardContent>
            {currentVessel ? (
              <div className="space-y-4">
                {/* Vessel Header */}
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center">
                      <Ship className="h-7 w-7 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xl font-semibold">{currentVessel.name}</p>
                      <p className="text-sm text-muted-foreground">{currentVessel.type || 'Vessel'}</p>
                    </div>
                  </div>
                </div>
                
                {/* Service Duration and Start Date */}
                {currentVesselStats.serviceStartDate && (
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {currentVesselStats.serviceDuration} day{currentVesselStats.serviceDuration !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Since {format(currentVesselStats.serviceStartDate, 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>
                )}
                
                <Separator />
                
                {/* Today's Status */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Today's Status</p>
                  {todayStatus ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-background/50 border">
                      {(() => {
                        const stateInfo = vesselStates.find(s => s.value === todayStatus);
                        const StateIcon = stateInfo?.icon || Ship;
                        return (
                          <>
                            <div 
                              className="h-10 w-10 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: `${stateInfo?.color || 'hsl(var(--muted-foreground))'}20` }}
                            >
                              <StateIcon className="h-5 w-5" style={{ color: stateInfo?.color || 'hsl(var(--muted-foreground))' }} />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-semibold">{stateInfo?.label || todayStatus}</p>
                              <p className="text-xs text-muted-foreground">{format(new Date(), 'EEEE, MMM d')}</p>
                            </div>
                            <div 
                              className="h-3 w-3 rounded-full" 
                              style={{ backgroundColor: stateInfo?.color || 'hsl(var(--muted-foreground))' }}
                            />
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-background/50 border border-dashed">
                      <p className="text-sm text-muted-foreground">No status logged for today</p>
                    </div>
                  )}
                </div>

                <Separator />
                
                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 rounded-xl bg-background/50">
                    <p className="text-2xl font-bold">{currentVesselStats.totalDays}</p>
                    <p className="text-xs text-muted-foreground mt-1">Total Days</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-background/50">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Waves className="h-3 w-3 text-blue-500" />
                      <p className="text-2xl font-bold">{currentVesselStats.atSeaDays}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">At Sea</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-background/50">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Anchor className="h-3 w-3 text-orange-500" />
                      <p className="text-2xl font-bold">{currentVesselStats.standbyDays}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">Standby</p>
                  </div>
                </div>
                
                {/* State Breakdown Visualization */}
                {currentVesselStats.totalDays > 0 && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-3">State Distribution</p>
                      <div className="space-y-2.5">
                        {vesselStates.map(state => {
                          const count = currentVesselStats.stateBreakdown[state.value] || 0;
                          if (count === 0) return null;
                          const percentage = (count / currentVesselStats.totalDays) * 100;
                          const StateIcon = state.icon;
                          
                          return (
                            <div key={state.value} className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <StateIcon className="h-3.5 w-3.5" style={{ color: state.color }} />
                                  <span className="text-muted-foreground">{state.label}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-foreground">{count}</span>
                                  <span className="text-muted-foreground">({Math.round(percentage)}%)</span>
                                </div>
                              </div>
                              <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
                                <div 
                                  className="h-full rounded-full transition-all"
                                  style={{ 
                                    width: `${percentage}%`,
                                    backgroundColor: state.color
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
                
                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button asChild className="flex-1 rounded-xl">
                    <Link href="/dashboard/current">
                      <MapPin className="mr-2 h-4 w-4" />
                      Manage Service
                    </Link>
                  </Button>
                  {todayStatus && (
                    <Button asChild variant="outline" className="rounded-xl" size="icon">
                      <Link href="/dashboard/current">
                        <TrendingUp className="h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <Ship className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-4">No active vessel</p>
                <Button asChild variant="outline" className="rounded-lg">
                  <Link href="/dashboard/current">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Start a Service
                  </Link>
                </Button>
              </div>
            )}
            </CardContent>
        </Card>
        
        <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
            <CardHeader>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
                <CardTitle>Recent Activity</CardTitle>
            </div>
            <CardDescription>Your recent activity including sea time, state changes, visa logs, and testimonial updates</CardDescription>
            </CardHeader>
            <CardContent>
            {recentActivity.length > 0 ? (
              <div className="space-y-3">
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
                        className="flex items-center gap-3 p-3 rounded-xl border bg-background/50 hover:bg-background transition-colors"
                      >
                        <div className="h-10 w-10 flex items-center justify-center flex-shrink-0 rounded-xl bg-blue-500/20">
                          <Globe className="h-5 w-5 text-blue-600" />
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
                        <div className="h-2.5 w-2.5 rounded-full flex-shrink-0 bg-blue-600" />
                      </div>
                    );
                  }
                  
                  if (activity.type === 'testimonial_approved' || activity.type === 'testimonial_rejected') {
                    const isApproved = activity.type === 'testimonial_approved';
                    return (
                      <div 
                        key={activity.id}
                        className="flex items-center gap-3 p-3 rounded-xl border bg-background/50 hover:bg-background transition-colors"
                      >
                        <div 
                          className={`h-10 w-10 flex items-center justify-center flex-shrink-0 rounded-xl ${
                            isApproved 
                              ? 'bg-green-500/20' 
                              : 'bg-red-500/20'
                          }`}
                        >
                          {isApproved ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-600" />
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
                        <div 
                          className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                            isApproved ? 'bg-green-600' : 'bg-red-600'
                          }`}
                        />
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
                      className="flex items-center gap-3 p-3 rounded-xl border bg-background/50 hover:bg-background transition-colors"
                    >
                      <div 
                        className="h-10 w-10 flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${stateInfo?.color || 'hsl(var(--muted-foreground))'}20` }}
                      >
                        <StateIcon 
                          className="h-5 w-5" 
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
                      <div 
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: stateInfo?.color || 'hsl(var(--muted-foreground))' }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                  <History className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground mb-1">No recent activity</p>
                <p className="text-xs text-muted-foreground">Start logging your sea time to see activity here</p>
              </div>
            )}
            {recentActivity.length > 0 && (
              <div className="mt-4 pt-3 border-t">
                <Button asChild variant="ghost" className="w-full rounded-lg" size="sm">
                  <Link href="/dashboard/recent-activity">
                    <History className="mr-2 h-4 w-4" />
                    View All Recent Activity
                  </Link>
                </Button>
              </div>
            )}
            </CardContent>
        </Card>
      </div>

      {/* This Month Summary Section */}
      {thisMonthStats.totalDays > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Activity className="h-5 w-5 text-accent-foreground" />
              </div>
            <div>
                <h2 className="text-2xl font-bold tracking-tight">This Month</h2>
                <p className="text-sm text-muted-foreground">
                  Your activity overview for {format(new Date(), 'MMMM yyyy')}
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Days</CardTitle>
                  <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Calendar className="h-4 w-4 text-primary" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{thisMonthStats.totalDays}</div>
                  <p className="text-xs text-muted-foreground mt-1">This month</p>
                </CardContent>
              </Card>
              
              <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">At Sea</CardTitle>
                  <div className="h-8 w-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Waves className="h-4 w-4 text-blue-500" />
          </div>
        </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{thisMonthStats.atSeaDays}</div>
                  <p className="text-xs text-muted-foreground mt-1">Days underway</p>
        </CardContent>
      </Card>

              <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Standby</CardTitle>
                  <div className="h-8 w-8 rounded-xl bg-orange-500/10 flex items-center justify-center">
                    <Anchor className="h-4 w-4 text-orange-500" />
          </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{thisMonthStats.standbyDays}</div>
                  <p className="text-xs text-muted-foreground mt-1">MCA/PYA compliant</p>
                </CardContent>
            </Card>

              <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">On Leave</CardTitle>
                  <div className="h-8 w-8 rounded-xl bg-gray-500/10 flex items-center justify-center">
                    <LifeBuoy className="h-4 w-4 text-gray-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{thisMonthStats.onLeaveDays}</div>
                  <p className="text-xs text-muted-foreground mt-1">Days off</p>
                </CardContent>
            </Card>
            </div>
          </div>
        </>
        )}

      {/* Career Highlights Section */}
      <Separator />

    </div>
  );
}
