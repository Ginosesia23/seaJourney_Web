'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from "@/lib/supabaseClient"; // adjust path to wherever you exported createClient(...)
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Check,
  Star,
  Zap,
  Shield,
  TrendingUp,
  Loader2,
  XCircle,
  AlertTriangle,
  Download,
  FileText,
  Anchor,
  Ship,
  Link2,
  UserCog,
  Mail,
  User as UserIcon,
  CreditCard,
  CalendarDays,
  PauseCircle,
  ArrowRight,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { hasActiveSubscription, isPersonalPlanPausedForVessel } from '@/supabase/database/subscription-helpers';
import { crewVesselBoostLabel } from '@/lib/crew-vessel-feature-boost';
import { useCrewVesselFeatureBoost } from '@/contexts/crew-vessel-feature-boost-context';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile } from '@/lib/types';
import { format } from 'date-fns';
import { createCheckoutSession } from '@/app/actions';
import { CREW_TRIAL_DISPLAY_LABEL } from '@/lib/stripe-checkout-trials';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Plan {
  name: string;
  price: string;
  priceSuffix: string;
  description: string;
  features: string[];
  icon: typeof Shield;
  color: 'blue' | 'purple' | 'orange' | 'green';
  highlighted?: boolean;
  priceId?: string;
  comingSoon?: boolean;
  availableDate?: string;
  trialLabel?: string;
}

// Minimal shape of Stripe price coming from /api/billing
interface StripePrice {
  id: string;
  unit_amount: number | null;
  recurring?: {
    interval: string;
  } | null;
  metadata?: {
    tier?: string;
    [key: string]: any;
  } | null;
  nickname?: string | null;
  [key: string]: any;
}

// Minimal shape of Stripe subscription coming from /api/billing
interface StripeSubscription {
  id: string;
  status: string;
  cancel_at_period_end?: boolean | null;
  current_period_end?: number | null; // unix timestamp (seconds)
  [key: string]: any;
}

interface StripeSubscriptionData {
  subscription: StripeSubscription | null;
  [key: string]: any;
}

// Crew plan templates - for individual crew members
const crewPlanTemplates: Omit<Plan, 'priceId'>[] = [
  {
    name: 'Crew Standard',
    price: '£4.99',
    priceSuffix: '/ month',
    trialLabel: CREW_TRIAL_DISPLAY_LABEL,
    description: 'Essential sea time tracking for maritime professionals.',
    features: [
      'Unlimited sea time logging',
      'Up to 3 vessels',
      'MCA compliant sea time calculations',
      'PDF export of digital testimonials',
      'Direct digital sign-offs',
    ],
    icon: Shield,
    color: 'blue',
  },
  {
    name: 'Crew Premium',
    price: '£9.99',
    priceSuffix: '/ month',
    description: 'Advanced logging and documentation for career progression.',
    features: [
      'All Crew Standard features',
      'Unlimited vessels',
      'Passage log book',
      'Bridge watch log book',
      'Visa tracker',
      'Export sea time to multi-format (Excel, CSV, etc.)',
      'Request sea time',
    ],
    highlighted: true,
    icon: Zap,
    color: 'purple',
    trialLabel: CREW_TRIAL_DISPLAY_LABEL,
  },
  {
    name: 'Crew Professional',
    price: '£14.99',
    priceSuffix: '/ month',
    trialLabel: CREW_TRIAL_DISPLAY_LABEL,
    description:
      'Complete maritime career management and certification tracking.',
    features: [
      'All Crew Premium features',
      'Advanced analytics',
      'GPS passage tracking',
      'Automatic vessel state tracking via AIS (additional fee per month)',
      'Direct MCA submissions & approvals',
    ],
    icon: TrendingUp,
    color: 'green',
    comingSoon: true,
  },
];

// Vessel plan templates - for vessel accounts
const vesselPlanTemplates: Omit<Plan, 'priceId'>[] = [
  {
    name: 'Vessel Standard',
    price: '£35.99',
    priceSuffix: '/ month',
    description: 'Essential vessel management for small operations.',
    features: [
      'Single vessel',
      'Crew management & assignments',
      'Vessel state tracking',
      'Digital testimonial approvals',
      'Crew sea time verification',
      'Support and feedback',
    ],
    icon: Shield,
    color: 'blue',
  },
  {
    name: 'Vessel Premium',
    price: '£79.99',
    priceSuffix: '/ month',
    description: 'Advanced vessel management for growing operations.',
    features: [
      'Single vessel',
      'All Standard features',
      'Advanced crew analytics',
      'AI form builder',
      'Watch schedules',
      'Onboard tracker',
      'Vessel linked role accounts',
      'Priority support',
    ],
    highlighted: false,
    icon: Zap,
    color: 'purple',
  },
  {
    name: 'Vessel Professional',
    price: '£139.99',
    priceSuffix: '/ month',
    description: 'Complete vessel management solution.',
    features: [
      'Single vessel',
      'Multiple role assignments',
      'All Premium features',
      'Generate documents and applications for crew members',
      'End-to-end sign-off cycle: vessel → captain → crew',
      'Free crew accounts while actively tracking this vessel',
    ],
    icon: TrendingUp,
    color: 'green',
    comingSoon: false,
  },
  {
    name: 'Vessel Fleet',
    price: '£249.99',
    priceSuffix: '/ month',
    description: 'Enterprise fleet management for large operations.',
    features: [
      'Up to 3 vessels (included)',
      'Unlimited crew members',
      '£50 per additional vessel',
      'All Professional features',
      'Enterprise-grade analytics',
      'Custom integrations & API access',
      'Dedicated account manager',
      '24/7 priority support',
      'Advanced compliance & security',
    ],
    icon: TrendingUp,
    color: 'orange',
    comingSoon: false,
  },
];

export default function ManageSubscriptionPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isChangingPlan, setIsChangingPlan] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [stripeSubscription, setStripeSubscription] =
    useState<StripeSubscriptionData | null>(null);
  /** Tier from Stripe price metadata (matches Stripe Dashboard); synced to profile when billing loads with auth. */
  const [stripeTierLive, setStripeTierLive] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Array<{
    id: string;
    number: string | null;
    amount: number;
    currency: string;
    status: string;
    date: number;
    periodStart: number | null;
    periodEnd: number | null;
    hostedInvoiceUrl: string | null;
    invoicePdf: string | null;
    description: string;
  }>>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(false);

  const { user } = useUser();
  const { supabase } = useSupabase();
  const router = useRouter();
  const { toast } = useToast();

  const { data: userProfileRaw, isLoading: isProfileLoading } =
    useDoc<UserProfile>('users', user?.id);
  const { boost: vesselBoost, vesselName: boostVesselName } = useCrewVesselFeatureBoost();
  const vesselFeatureBoostLabel = crewVesselBoostLabel(vesselBoost);

  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    return {
      ...userProfileRaw,
      subscriptionTier:
        (userProfileRaw as any).subscription_tier ||
        userProfileRaw.subscriptionTier ||
        'free',
      subscriptionStatus:
        (userProfileRaw as any).subscription_status ||
        userProfileRaw.subscriptionStatus ||
        'inactive',
    } as UserProfile;
  }, [userProfileRaw]);

  // Determine if user is a vessel account - check both camelCase and snake_case
  const userRole = userProfile?.role || (userProfile as any)?.role || null;
  const isVesselAccount = userRole?.toLowerCase() === 'vessel';
  
  // Check if user has crew_limited tier (restricted access - can create new subscription)
  const isCrewLimited = useMemo(() => {
    if (!userProfile || !userProfileRaw) return false;
    const tier = (userProfile as any).subscription_tier || userProfile.subscriptionTier || 'free';
    const role = (userProfile as any).role || userProfile.role || 'crew';

    return (
      role === 'crew' &&
      tier === 'crew_limited' &&
      hasActiveSubscription(userProfileRaw)
    );
  }, [userProfile, userProfileRaw]);

  const pausedPersonalPlan = useMemo(() => {
    if (!userProfileRaw) return null;
    if (!isPersonalPlanPausedForVessel(userProfileRaw)) return null;
    return {
      tier:
        (userProfileRaw as any).personal_plan_paused_tier ||
        (userProfileRaw as any).personalPlanPausedTier ||
        'your plan',
      vesselId:
        (userProfileRaw as any).personal_plan_paused_for_vessel_id ||
        (userProfileRaw as any).personalPlanPausedForVesselId ||
        null,
    };
  }, [userProfileRaw]);

  const [pausedVesselName, setPausedVesselName] = useState<string | null>(null);
  useEffect(() => {
    const vesselId = pausedPersonalPlan?.vesselId;
    if (!vesselId || !supabase) {
      setPausedVesselName(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from('vessels')
      .select('name')
      .eq('id', vesselId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setPausedVesselName((data?.name as string | undefined) || null);
      });
    return () => {
      cancelled = true;
    };
  }, [pausedPersonalPlan?.vesselId, supabase]);

  // Vessel-linked secondary accounts (Captain / Officer / Engineer / Manager
  // owned by a vessel on the Pro/Fleet plan). These accounts don't have their
  // own Stripe subscription — the vessel pays for them — so we show a
  // simplified "managed by your vessel" view instead of the plan picker.
  const isVesselLinked = useMemo(() => {
    if (!userProfile || !userProfileRaw) return false;
    const tier = ((userProfile as any).subscription_tier || userProfile.subscriptionTier || 'free').toString().toLowerCase();
    return tier === 'vessel_linked' && hasActiveSubscription(userProfileRaw);
  }, [userProfile, userProfileRaw]);

  /** Parent-vessel info shown to a vessel_linked user (vessel name, plan, manager contact). */
  type LinkedVesselInfo = {
    vesselId: string;
    vesselName: string;
    vesselType: string | null;
    /** Role label shown on this linked account, e.g. "Captain", "Officer". */
    linkedRoleLabel: string;
    /** Plan held by the vessel manager — typically vessel_pro / vessel_fleet. */
    managerTier: string | null;
    /** Display name of the vessel manager (best-effort). */
    managerName: string | null;
    /** Contact email of the vessel manager. */
    managerEmail: string | null;
  };
  const [linkedVesselInfo, setLinkedVesselInfo] = useState<LinkedVesselInfo | null>(null);
  const [isLoadingLinkedInfo, setIsLoadingLinkedInfo] = useState(false);

  useEffect(() => {
    if (!isVesselLinked || !userProfileRaw) {
      setLinkedVesselInfo(null);
      return;
    }
    const managedVesselId =
      (userProfileRaw as any).managed_by_vessel_id ||
      (userProfileRaw as any).active_vessel_id ||
      null;
    if (!managedVesselId) {
      setLinkedVesselInfo(null);
      return;
    }
    let cancelled = false;
    const linkedRoleLabel =
      ((userProfileRaw as any).position as string | null) || 'Linked account';
    setIsLoadingLinkedInfo(true);
    void (async () => {
      try {
        const { data: vesselRow } = await supabase
          .from('vessels')
          .select('id, name, type, vessel_manager_id')
          .eq('id', managedVesselId)
          .maybeSingle();
        if (cancelled) return;
        const managerId = (vesselRow as any)?.vessel_manager_id || null;
        let managerName: string | null = null;
        let managerEmail: string | null = null;
        let managerTier: string | null = null;
        if (managerId) {
          const { data: managerRow } = await supabase
            .from('users')
            .select('first_name, last_name, email, subscription_tier')
            .eq('id', managerId)
            .maybeSingle();
          if (!cancelled && managerRow) {
            const first = (managerRow as any).first_name || '';
            const last = (managerRow as any).last_name || '';
            managerName = `${first} ${last}`.trim() || null;
            managerEmail = (managerRow as any).email || null;
            managerTier = (managerRow as any).subscription_tier || null;
          }
        }
        if (cancelled) return;
        setLinkedVesselInfo({
          vesselId: managedVesselId,
          vesselName: (vesselRow as any)?.name || 'Your vessel',
          vesselType: (vesselRow as any)?.type || null,
          linkedRoleLabel,
          managerTier,
          managerName,
          managerEmail,
        });
      } catch (err) {
        if (cancelled) return;
        console.error('[SUBSCRIPTION PAGE] Failed to load linked vessel info:', err);
        setLinkedVesselInfo({
          vesselId: managedVesselId,
          vesselName: 'Your vessel',
          vesselType: null,
          linkedRoleLabel,
          managerTier: null,
          managerName: null,
          managerEmail: null,
        });
      } finally {
        if (!cancelled) setIsLoadingLinkedInfo(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isVesselLinked, userProfileRaw]);
  
  // Log for debugging
  useEffect(() => {
    if (userProfile) {
      console.log('[SUBSCRIPTION PAGE] User profile loaded:', {
        userId: userProfile.id,
        role: userRole,
        isVesselAccount,
        isCrewLimited,
        rawRole: (userProfile as any)?.role,
      });
    }
  }, [userProfile, userRole, isVesselAccount, isCrewLimited]);
  
  // Select appropriate plan templates based on role
  // Filter out Fleet plan for now (not finished yet)
  const filteredVesselPlans = vesselPlanTemplates.filter(plan => plan.name !== 'Vessel Fleet');
  const selectedPlanTemplates = isVesselAccount ? filteredVesselPlans : crewPlanTemplates;

  // Format subscription tier for display
  const formatTierName = (tier: string) => {
    if (!tier || tier === 'free') return 'Free';
    const cleaned = tier.replace(/^(sj_|sea_journey_)/i, '').trim();
    return cleaned
      .split('_')
      .map(
        (word) =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
      )
      .join(' ');
  };

  const profileTierRaw = userProfile
    ? (userProfile as any).subscription_tier ||
      (userProfile as any).subscriptionTier ||
      'free'
    : 'free';

  /** Prefer live Stripe tier when present so UI matches Stripe Dashboard before realtime profile updates. */
  const displayedPlanName = formatTierName(stripeTierLive ?? profileTierRaw);

  // Check if a plan is the current active plan
  const isCurrentPlan = (planName: string) => {
    if (!userProfile) return false;
    const userTier =
      (userProfile as any).subscription_tier ||
      (userProfile as any).subscriptionTier ||
      'free';
    const normalizedUserTier = formatTierName(userTier).toLowerCase();
    const normalizedPlanName = planName.toLowerCase();
    return (
      normalizedUserTier === normalizedPlanName ||
      normalizedUserTier.includes(normalizedPlanName) ||
      normalizedPlanName.includes(normalizedUserTier)
    );
  };

  // Fetch invoices for vessel accounts
  useEffect(() => {
    const fetchInvoices = async () => {
      if (!isVesselAccount || !user?.id) {
        setInvoices([]);
        return;
      }

      setIsLoadingInvoices(true);
      try {
        // Get auth token
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          console.error('[SUBSCRIPTION PAGE] No session token');
          setIsLoadingInvoices(false);
          return;
        }

        const response = await fetch('/api/billing/invoices', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch invoices');
        }

        const { invoices: fetchedInvoices } = await response.json();
        setInvoices(fetchedInvoices || []);
      } catch (error) {
        console.error('[SUBSCRIPTION PAGE] Error fetching invoices:', error);
        toast({
          title: 'Error',
          description: 'Failed to load invoices. Please try again later.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingInvoices(false);
      }
    };

    fetchInvoices();
  }, [isVesselAccount, user?.id, supabase, toast]);

  // Fetch subscription data and plans via API
  useEffect(() => {
    const fetchData = async () => {
      if (!user?.email) return;

      // Wait for user profile to load before determining vessel account status
      if (isProfileLoading || !userProfile) {
        console.log('[SUBSCRIPTION PAGE] Waiting for user profile to load...');
        return;
      }

      console.log('[SUBSCRIPTION PAGE] User profile loaded:', !!userProfile);
      console.log('[SUBSCRIPTION PAGE] User role:', userProfile?.role);
      console.log('[SUBSCRIPTION PAGE] Is vessel account:', isVesselAccount);

      try {
        setIsLoading(true);

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        const billingHeaders: HeadersInit = {};
        if (token) {
          billingHeaders.Authorization = `Bearer ${token}`;
        }

        const res = await fetch(
          `/api/billing?email=${encodeURIComponent(user.email)}&isVesselAccount=${isVesselAccount}`,
          { headers: billingHeaders },
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            body.error || 'Failed to load subscription information.',
          );
        }

        const {
          subscriptionData,
          stripePrices,
          stripeTierLive: tierFromStripe,
        }: {
          subscriptionData: StripeSubscriptionData | null;
          stripePrices: StripePrice[];
          stripeTierLive?: string | null;
        } = await res.json();

        setStripeTierLive(
          typeof tierFromStripe === 'string' ? tierFromStripe : null,
        );

        // Log detailed tier information
        console.log(`\n========================================`);
        console.log(`[SUBSCRIPTION PAGE] ${isVesselAccount ? 'VESSEL' : 'CREW'} SUBSCRIPTION TIER DETAILS`);
        console.log(`========================================`);
        console.log(`[SUBSCRIPTION PAGE] Total prices received: ${stripePrices.length}`);
        console.log(`[SUBSCRIPTION PAGE] User role: ${userProfile?.role || 'unknown'}`);
        console.log(`[SUBSCRIPTION PAGE] Is vessel account: ${isVesselAccount}`);
        console.log(`[SUBSCRIPTION PAGE] Timestamp: ${new Date().toISOString()}\n`);

        stripePrices.forEach((price, index) => {
          const amount = price.unit_amount ? (price.unit_amount / 100).toFixed(2) : 'N/A';
          const currency = price.currency?.toUpperCase() || 'N/A';
          const interval = price.recurring?.interval || 'one-time';
          const intervalCount = price.recurring?.interval_count || 1;
          const tier = price.metadata?.tier || price.metadata?.price_tier || price.nickname || 'unknown';
          
          console.log(`--- Tier ${index + 1} ---`);
          console.log(`  Price ID: ${price.id}`);
          console.log(`  Tier Name: ${tier}`);
          console.log(`  Amount: ${currency} ${amount}`);
          console.log(`  Interval: ${intervalCount} ${interval}(s)`);
          console.log(`  Nickname: ${price.nickname || 'N/A'}`);
          console.log(`  Active: ${price.active !== false ? 'Yes' : 'No'}`);
          console.log(`  Livemode: ${price.livemode ? 'Yes' : 'No'}`);
          console.log(`  Metadata:`, JSON.stringify(price.metadata || {}, null, 2));
          if (price.recurring) {
            console.log(`  Recurring Details:`, {
              interval: price.recurring.interval,
              interval_count: price.recurring.interval_count,
              usage_type: price.recurring.usage_type,
            });
          }
          console.log(``);
        });

        console.log(`========================================`);
        console.log(`[SUBSCRIPTION PAGE] End of tier details`);
        console.log(`========================================\n`);

        setStripeSubscription(subscriptionData || null);

        const getTemplateTierKey = (templateName: string) => {
          const lower = templateName.toLowerCase();
          // Handle vessel plans
          if (lower.includes('vessel')) {
            if (lower.includes('fleet')) return 'vessel_fleet';
            if (lower.includes('pro')) return 'vessel_pro';
            if (lower.includes('premium') || lower.includes('basic')) return 'vessel_basic';
            if (lower.includes('standard') || lower.includes('lite')) return 'vessel_lite';
          }
          // Handle crew plans (with or without "crew" prefix)
          if (lower.includes('professional') || lower === 'pro' || lower === 'crew pro') return 'professional';
          if (lower.includes('premium')) return 'premium';
          if (lower.includes('standard')) return 'standard';
          return lower;
        };

        // Helper to normalize tier names for matching
        const normalizeTierName = (tier: string): string => {
          return tier
            .toLowerCase()
            .replace(/^(sj_|sea_journey_)/i, '') // Remove common prefixes
            .replace(/\s+/g, '_') // Replace spaces with underscores
            .trim();
        };

        console.log(`[SUBSCRIPTION PAGE] Mapping prices to plan templates...`);
        console.log(`[SUBSCRIPTION PAGE] Available templates:`, selectedPlanTemplates.map(t => t.name));

        const mappedPlans: Plan[] = selectedPlanTemplates.map((template) => {
          const templateTier = getTemplateTierKey(template.name);
          const normalizedTemplateTier = normalizeTierName(templateTier);

          const matchingPrice = stripePrices.find((price: StripePrice) => {
            const rawPriceTier = (
              price.metadata?.tier || price.metadata?.price_tier || price.nickname || ''
            ).toString();
            const priceTier = normalizeTierName(rawPriceTier);

            // Match vessel plans with vessel prices, crew plans with crew prices
            const isVesselPrice = priceTier.includes('vessel') || rawPriceTier.toLowerCase().includes('vessel');
            const isVesselTemplate = templateTier.includes('vessel');
            
            // Only match if both are vessel or both are crew
            if (isVesselPrice !== isVesselTemplate) {
              return false;
            }

            // Try multiple matching strategies
            const exactMatch = priceTier === normalizedTemplateTier || priceTier === templateTier;
            const containsMatch = priceTier.includes(normalizedTemplateTier) || normalizedTemplateTier.includes(priceTier);
            // Special handling for "pro" vs "professional"
            const proMatch = (normalizedTemplateTier === 'professional' && priceTier === 'pro') ||
                            (normalizedTemplateTier === 'pro' && priceTier === 'professional');
            
            // Handle vessel plan matching: "vessel basic" should match "vessel_basic"
            // Extract the plan type (basic, lite, pro, fleet) from both
            const templatePlanType = normalizedTemplateTier.split('_').pop() || '';
            const pricePlanType = priceTier.split(/[_\s]+/).pop() || '';
            const vesselMatch = isVesselTemplate && (
              priceTier === normalizedTemplateTier || // Exact match after normalization
              normalizedTemplateTier === priceTier || // Reverse exact match
              (templatePlanType && pricePlanType && templatePlanType === pricePlanType) || // Plan type matches
              priceTier.includes(templatePlanType) || // Price contains template plan type
              normalizedTemplateTier.includes(pricePlanType) // Template contains price plan type
            );

            return exactMatch || containsMatch || proMatch || vesselMatch;
          });

          if (matchingPrice) {
            const amount = (matchingPrice.unit_amount ?? 0) / 100;
            const interval =
              matchingPrice.recurring?.interval?.toString() || 'month';

            console.log(`[SUBSCRIPTION PAGE] ✅ Matched "${template.name}" to price:`, {
              priceId: matchingPrice.id,
              amount: `£${amount.toFixed(2)}`,
              interval: interval,
              tier: matchingPrice.metadata?.tier || matchingPrice.nickname || 'unknown',
            });

            return {
              ...template,
              price: `£${amount.toFixed(2)}`,
              priceSuffix: `/${interval}`,
              priceId: matchingPrice.id,
            };
          }

          console.log(`[SUBSCRIPTION PAGE] ⚠️ No price match found for template: "${template.name}" (tier key: "${templateTier}")`);
          console.log(`[SUBSCRIPTION PAGE] Available Stripe prices:`, stripePrices.map((p: StripePrice) => ({
            id: p.id,
            tier: p.metadata?.tier || p.nickname || 'unknown',
            amount: p.unit_amount ? `£${(p.unit_amount / 100).toFixed(2)}` : 'N/A',
          })));

          // Don't use template price - show unavailable instead
          return {
            ...template,
            price: 'Price unavailable',
            priceSuffix: '',
            priceId: undefined,
          };
        });

        console.log(`[SUBSCRIPTION PAGE] Final mapped plans:`, mappedPlans.map(p => ({
          name: p.name,
          price: p.price,
          priceSuffix: p.priceSuffix,
          priceId: p.priceId || 'NOT FOUND',
        })));
        console.log(`\n`);

        setPlans(mappedPlans);
      } catch (error: any) {
        console.error('[SUBSCRIPTION PAGE] Failed to fetch subscription data:', error);
        console.error('[SUBSCRIPTION PAGE] Is vessel account:', isVesselAccount);
        console.error('[SUBSCRIPTION PAGE] User role:', userProfile?.role);
        console.error('[SUBSCRIPTION PAGE] Error details:', {
          message: error?.message,
          type: error?.type,
          code: error?.code,
        });
        
        const errorMessage = error?.message || 'Failed to load subscription information.';
        const isProductIdError = errorMessage.includes('product ID') || errorMessage.includes('not configured');
        
        toast({
          title: 'Error',
          description: isProductIdError
            ? `${errorMessage} Please check your environment variables.`
            : `${errorMessage} Please try again.`,
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user?.email, toast, isVesselAccount, isProfileLoading, userProfile, supabase]);

  const handleChangePlan = async (plan: Plan) => {
    if (!plan.priceId) {
      toast({
        title: 'Error',
        description: 'Plan price information is missing. Please try again later.',
        variant: 'destructive',
      });
      return;
    }

    if (plan.comingSoon) {
      toast({
        title: 'Coming Soon',
        description: `This plan will be available in ${
          plan.availableDate || '2026'
        }.`,
      });
      return;
    }

    // Crew on a vessel Professional/Fleet assignment use the vessel plan;
    // their personal Stripe subscription stays paused until they leave.
    if (pausedPersonalPlan) {
      toast({
        title: 'Personal plan paused',
        description:
          'Your personal plan is paused while you are assigned to a vessel. It will resume automatically when you leave.',
        variant: 'destructive',
      });
      return;
    }

    // For crew_limited users, always allow creating a new subscription
    // (they may not have a Stripe subscription, or may have one that can't be changed)
    if (isCrewLimited) {
      if (!user?.id || !user?.email) {
        toast({
          title: 'Error',
          description: 'You must be logged in to subscribe to a plan.',
          variant: 'destructive',
        });
        return;
      }

      setIsChangingPlan(plan.name);

      try {
        const { sessionId, url } = await createCheckoutSession(
          plan.priceId,
          user.id,
          user.email,
        );

        if (url) {
          router.push(url);
        } else {
          throw new Error('Could not create a checkout session.');
        }
      } catch (error: any) {
        console.error('Failed to create subscription:', error);
        toast({
          title: 'Subscription Failed',
          description:
            error.message ||
            'Failed to create subscription. Please try again.',
          variant: 'destructive',
        });
        setIsChangingPlan(null);
      }
      return;
    }

    // For users with existing subscriptions, change the plan
    if (!stripeSubscription?.subscription) {
      toast({
        title: 'Error',
        description: 'Unable to change plan. Please try again later.',
        variant: 'destructive',
      });
      return;
    }

    setIsChangingPlan(plan.name);

    try {
      const res = await fetch('/api/billing/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: stripeSubscription.subscription.id,
          priceId: plan.priceId,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error || 'Failed to change subscription plan.',
        );
      }

      const json = await res.json();

      if (json.mode === 'downgrade_scheduled') {
        toast({
          title: 'Downgrade scheduled',
          description: `Your plan will change on ${new Date(json.effectiveAt * 1000).toLocaleDateString()}.`,
        });
      } else {
        toast({
          title: 'Subscription updated',
          description: 'Your plan has been updated.',
        });
      }
      
      // Refresh subscription data (auth header syncs profile tier/period from Stripe)
      if (user?.email) {
        const { data: s } = await supabase.auth.getSession();
        const h: HeadersInit = {};
        if (s.session?.access_token) {
          h.Authorization = `Bearer ${s.session.access_token}`;
        }
        const refreshed = await fetch(
          `/api/billing?email=${encodeURIComponent(user.email)}&isVesselAccount=${isVesselAccount}`,
          { headers: h },
        );
        if (refreshed.ok) {
          const body = await refreshed.json();
          setStripeSubscription(body.subscriptionData || null);
          setStripeTierLive(
            typeof body.stripeTierLive === 'string' ? body.stripeTierLive : null,
          );
        }
      }

      // Refresh page after a short delay
      setTimeout(() => {
        router.refresh();
      }, 1000);
    } catch (error: any) {
      console.error('Failed to change plan:', error);
      toast({
        title: 'Change Failed',
        description:
          error.message ||
          'Failed to change subscription plan. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsChangingPlan(null);
    }
  };

  const handleCancelSubscription = async () => {
    if (!stripeSubscription?.subscription) {
      toast({
        title: 'Error',
        description: 'Unable to cancel subscription. Please contact support.',
        variant: 'destructive',
      });
      return;
    }

    setIsCancelling(true);

    try {
      const res = await fetch('/api/billing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: stripeSubscription.subscription.id,
          // You can also pass `cancelAtPeriodEnd: false` if your API expects it
          cancelAtPeriodEnd: false,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to cancel subscription.');
      }

      toast({
        title: 'Subscription Cancelled',
        description:
          'Your subscription has been cancelled. You will retain access until the end of your billing period.',
      });

      // Refresh subscription data (auth header syncs profile tier/period from Stripe)
      if (user?.email) {
        const { data: s } = await supabase.auth.getSession();
        const h: HeadersInit = {};
        if (s.session?.access_token) {
          h.Authorization = `Bearer ${s.session.access_token}`;
        }
        const refreshed = await fetch(
          `/api/billing?email=${encodeURIComponent(user.email)}&isVesselAccount=${isVesselAccount}`,
          { headers: h },
        );
        if (refreshed.ok) {
          const body = await refreshed.json();
          setStripeSubscription(body.subscriptionData || null);
          setStripeTierLive(
            typeof body.stripeTierLive === 'string' ? body.stripeTierLive : null,
          );
        }
      }

      router.refresh();
    } catch (error: any) {
      console.error('Failed to cancel subscription:', error);
      toast({
        title: 'Cancellation Failed',
        description:
          error.message ||
          'Failed to cancel subscription. Please contact support.',
        variant: 'destructive',
      });
    } finally {
      setIsCancelling(false);
      setShowCancelDialog(false);
    }
  };

  const handleResumeSubscription = async () => {
    const sub = stripeSubscription?.subscription;
    if (!sub) {
      toast({
        title: "Error",
        description: "Unable to load subscription details. Refresh the page or contact support.",
        variant: "destructive",
      });
      return;
    }

    const st = String(sub.status ?? '');
    const canResumeInStripe =
      sub.cancel_at_period_end === true &&
      st !== 'canceled' &&
      st !== 'incomplete_expired' &&
      ['active', 'trialing', 'past_due'].includes(st);

    if (!canResumeInStripe) {
      toast({
        title: "Resume not available",
        description:
          'Stripe only allows “resume” while a subscription is still active but scheduled to cancel. If your plan has already ended, start a new subscription from the Offers page.',
        variant: "destructive",
      });
      return;
    }

    try {
      // ✅ Get access token from Supabase (browser/localStorage)
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
  
      if (sessionErr || !token) {
        throw new Error("You are not logged in. Please sign in again.");
      }
  
      const res = await fetch("/api/billing/resume", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        // ✅ No need to send subscriptionId anymore (server should look it up from DB)
        body: JSON.stringify({}),
      });
  
      const body = await res.json().catch(() => ({}));
  
      if (!res.ok) {
        throw new Error(body.error || "Failed to resume subscription.");
      }
  
      toast({
        title: "Subscription Resumed",
        description: "Your subscription has been resumed.",
      });
  
      // Refresh subscription data (auth header syncs profile tier/period from Stripe)
      if (user?.email) {
        const h: HeadersInit = {
          Authorization: `Bearer ${token}`,
        };
        const refreshed = await fetch(
          `/api/billing?email=${encodeURIComponent(user.email)}&isVesselAccount=${isVesselAccount}`,
          { headers: h },
        );
        if (refreshed.ok) {
          const body = await refreshed.json();
          setStripeSubscription(body.subscriptionData || null);
          setStripeTierLive(
            typeof body.stripeTierLive === 'string' ? body.stripeTierLive : null,
          );
        }
      }
  
      router.refresh();
    } catch (error: any) {
      console.error("Failed to resume subscription:", error);
      toast({
        title: "Resume Failed",
        description: error?.message || "Failed to resume subscription. Please contact support.",
        variant: "destructive",
      });
    }
  };
  

  if (isLoading || isProfileLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  const subscription = stripeSubscription?.subscription || null;
  const subStatus = String(subscription?.status ?? '');
  const isFullyCanceled =
    subStatus === 'canceled' || subStatus === 'incomplete_expired';
  /** Still active in Stripe but will cancel at period end — only case where Resume works */
  const isScheduledToCancelAtPeriodEnd =
    Boolean(subscription?.cancel_at_period_end) &&
    !isFullyCanceled &&
    ['active', 'trialing', 'past_due'].includes(subStatus);
  /** UI: subscription is “cancelled” in a broad sense (scheduled or already ended) */
  const isCancelled = isScheduledToCancelAtPeriodEnd || isFullyCanceled;
  const currentPeriodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

  const matchedPlan = plans.find((p) => isCurrentPlan(p.name));
  const statusLabel = pausedPersonalPlan
    ? 'Paused on vessel'
    : isFullyCanceled
      ? 'Canceled'
      : isScheduledToCancelAtPeriodEnd
        ? 'Cancelling'
        : isCrewLimited
          ? 'Vessel-managed'
          : subscription
            ? subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)
            : hasActiveSubscription(userProfileRaw)
              ? 'Active'
              : 'Inactive';

  const statusTone = pausedPersonalPlan
    ? 'sky'
    : isFullyCanceled
      ? 'destructive'
      : isScheduledToCancelAtPeriodEnd
        ? 'amber'
        : subStatus === 'past_due'
          ? 'amber'
          : 'emerald';

  // Vessel-linked secondary account — they don't have their own subscription;
  // the vessel pays. Show a simplified "managed by your vessel" view with
  // the parent vessel's name, the user's role on the vessel, and the
  // vessel manager's contact info.
  if (isVesselLinked) {
    const vesselName = linkedVesselInfo?.vesselName || 'Your vessel';
    const vesselType = linkedVesselInfo?.vesselType || null;
    const linkedRoleLabel = linkedVesselInfo?.linkedRoleLabel || 'Linked account';
    const managerTier = (linkedVesselInfo?.managerTier || '').toLowerCase();
    const managerPlanLabel = managerTier
      ? managerTier
          .replace(/^vessel_/, 'Vessel ')
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : 'Vessel plan';
    const managerName = linkedVesselInfo?.managerName || null;
    const managerEmail = linkedVesselInfo?.managerEmail || null;
    // Build a friendly "you" label for the link diagram (first name → email → "Your account").
    const ownFirstName =
      ((userProfileRaw as any)?.first_name as string | undefined) ||
      (userProfile?.firstName as string | undefined) ||
      null;
    const ownEmail = (user?.email as string | undefined) || null;
    const youLabel = ownFirstName || ownEmail || 'Your account';
    return (
      <div className="flex flex-col gap-6 pb-8">
        <div className="space-y-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/20 to-blue-600/10">
              <CreditCard className="h-6 w-6 text-sky-600 dark:text-sky-400" />
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">Subscription</h1>
              <p className="max-w-xl text-muted-foreground">
                This is a vessel-linked account — billing is handled by the vessel.
              </p>
            </div>
          </div>
          <Separator />
        </div>

        <Card className="overflow-hidden rounded-2xl border-sky-500/25 shadow-sm">
          <div className="border-b bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent px-6 py-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
              <Link2 className="h-3.5 w-3.5" />
              Vessel-linked account
            </div>

            <div className="mt-4 flex items-stretch gap-2 sm:gap-3">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl border bg-background/70 p-3 text-center shadow-sm">
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-muted text-foreground">
                  <UserIcon className="h-4 w-4" />
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  You
                </div>
                <div className="w-full truncate text-sm font-semibold text-foreground" title={youLabel}>
                  {youLabel}
                </div>
                <Badge variant="outline" className="font-normal">
                  {linkedRoleLabel}
                </Badge>
              </div>

              <div className="flex flex-col items-center justify-center px-1">
                <div className="h-px w-6 bg-sky-500/40 sm:w-10" aria-hidden />
                <div className="my-1 flex h-7 w-7 items-center justify-center rounded-full border border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300 shadow-sm">
                  <Link2 className="h-3.5 w-3.5" />
                </div>
                <div className="h-px w-6 bg-sky-500/40 sm:w-10" aria-hidden />
              </div>

              <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 text-center shadow-sm">
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300">
                  <Ship className="h-4 w-4" />
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                  Vessel
                </div>
                {isLoadingLinkedInfo && !linkedVesselInfo ? (
                  <>
                    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                  </>
                ) : (
                  <>
                    <div className="w-full truncate text-sm font-semibold text-foreground" title={vesselName}>
                      {vesselName}
                    </div>
                    <Badge variant="secondary" className="font-normal">
                      {managerPlanLabel}
                    </Badge>
                  </>
                )}
              </div>
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              This account is linked to{' '}
              <span className="font-semibold text-foreground">{vesselName}</span>
              {vesselType ? (
                <>
                  {' '}
                  <span className="inline-flex items-center gap-1 align-middle text-muted-foreground">
                    <Anchor className="h-3 w-3" /> {vesselType}
                  </span>
                </>
              ) : null}
              . Access and billing are handled by the vessel.
            </p>
          </div>

          <CardContent className="space-y-4 pt-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <UserCog className="h-3 w-3" /> Your role
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {linkedRoleLabel}
                </div>
              </div>
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Shield className="h-3 w-3" /> Paid by
                </div>
                <div className="mt-1 truncate text-sm font-semibold text-foreground">
                  {vesselName}
                </div>
                <div className="text-xs text-muted-foreground">
                  via the vessel&apos;s {managerPlanLabel} plan
                </div>
              </div>
            </div>

            {(managerName || managerEmail) && (
              <div className="rounded-xl border bg-background p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Mail className="h-3 w-3" /> Vessel manager
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  {managerName && (
                    <span className="text-sm font-semibold text-foreground">
                      {managerName}
                    </span>
                  )}
                  {managerEmail && (
                    <a
                      href={`mailto:${managerEmail}`}
                      className="text-sm text-sky-700 hover:underline dark:text-sky-300"
                    >
                      {managerEmail}
                    </a>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Contact the vessel manager to change your access or unlink this account.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-8">
      {/* Header */}
      <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-500/20 bg-gradient-to-br from-sky-500/20 to-blue-600/10">
              <CreditCard className="h-6 w-6 text-sky-600 dark:text-sky-400" />
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold tracking-tight">Subscription</h1>
              <p className="max-w-xl text-muted-foreground">
                Your plan, next payment, and billing options in one place.
              </p>
            </div>
          </div>
          {!isCancelled && subscription && (
            <Button
              variant="outline"
              className="rounded-xl shrink-0"
              onClick={() =>
                document.getElementById('available-plans')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              Change plan
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
        <Separator />
      </div>

      {/* Current plan hero */}
      <Card className="overflow-hidden rounded-2xl border-sky-500/20 shadow-sm">
        <div className="border-b bg-gradient-to-br from-sky-500/10 via-transparent to-blue-600/5 px-6 py-6 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">
                Current plan
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  {pausedPersonalPlan
                    ? 'Crew Limited'
                    : displayedPlanName === 'Free'
                      ? isCrewLimited
                        ? 'Crew Limited'
                        : 'Free'
                      : displayedPlanName.startsWith('Crew') ||
                          displayedPlanName.startsWith('Vessel')
                        ? displayedPlanName
                        : isVesselAccount
                          ? `Vessel ${displayedPlanName}`
                          : `Crew ${displayedPlanName}`}
                </h2>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold',
                    statusTone === 'emerald' &&
                      'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
                    statusTone === 'amber' &&
                      'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200',
                    statusTone === 'sky' &&
                      'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300',
                    statusTone === 'destructive' &&
                      'border-destructive/30 bg-destructive/10 text-destructive',
                  )}
                >
                  {statusLabel}
                </span>
              </div>
              {matchedPlan?.description && !pausedPersonalPlan && (
                <p className="max-w-2xl text-sm text-muted-foreground">
                  {matchedPlan.description}
                </p>
              )}
              {pausedPersonalPlan && (
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Using vessel access while assigned to{' '}
                  <span className="font-medium text-foreground">
                    {pausedVesselName || 'a vessel'}
                  </span>
                  . Your {formatTierName(pausedPersonalPlan.tier)} plan is paused and will resume
                  when you leave.
                </p>
              )}
              {isCrewLimited && !pausedPersonalPlan && (
                <p className="max-w-2xl text-sm text-muted-foreground">
                  This account is covered by a vessel plan. You can still upgrade to your own personal
                  crew subscription below.
                </p>
              )}
              {vesselFeatureBoostLabel && (isCrewLimited || pausedPersonalPlan) && (
                <p className="max-w-2xl text-sm text-emerald-700 dark:text-emerald-400">
                  {vesselFeatureBoostLabel} active via{' '}
                  <span className="font-medium">{boostVesselName || 'your current vessel'}</span>
                  . When you leave that assignment, access returns to your personal plan tier.
                </p>
              )}
            </div>
            {matchedPlan && !pausedPersonalPlan && (
              <div className="rounded-2xl border bg-background/80 px-5 py-4 text-right shadow-sm backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Price
                </p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">
                  {matchedPlan.price}
                </p>
                <p className="text-sm text-muted-foreground">{matchedPlan.priceSuffix}</p>
              </div>
            )}
          </div>
        </div>

        <CardContent className="grid gap-4 p-6 sm:grid-cols-3 sm:p-8">
          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              {isScheduledToCancelAtPeriodEnd
                ? 'Access until'
                : isFullyCanceled
                  ? 'Ended'
                  : 'Next payment'}
            </div>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {currentPeriodEnd
                ? format(currentPeriodEnd, 'd MMM yyyy')
                : pausedPersonalPlan || isCrewLimited
                  ? 'Covered by vessel'
                  : '—'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isScheduledToCancelAtPeriodEnd
                ? 'Then moves to Free'
                : isFullyCanceled
                  ? 'Subscribe again to restore access'
                  : currentPeriodEnd
                    ? 'Billing period renews on this date'
                    : pausedPersonalPlan
                      ? 'No personal charge while paused'
                      : 'No active Stripe billing date'}
            </p>
          </div>

          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <CreditCard className="h-3.5 w-3.5" />
              Billing
            </div>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {pausedPersonalPlan
                ? 'Paused'
                : isFullyCanceled
                  ? 'Ended'
                  : isScheduledToCancelAtPeriodEnd
                    ? 'Cancels at period end'
                    : subscription
                      ? 'Monthly'
                      : isCrewLimited
                        ? 'Vessel-paid'
                        : 'None'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {pausedPersonalPlan
                ? `Resumes as ${formatTierName(pausedPersonalPlan.tier)}`
                : isVesselAccount
                  ? 'Vessel subscription'
                  : 'Crew subscription'}
            </p>
          </div>

          <div className="rounded-xl border bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              Account
            </div>
            <p className="mt-2 text-lg font-semibold capitalize text-foreground">
              {isVesselAccount ? 'Vessel' : userRole || 'Crew'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {user?.email || 'Signed-in account'}
            </p>
          </div>
        </CardContent>

        {(isScheduledToCancelAtPeriodEnd || isFullyCanceled || pausedPersonalPlan) && (
          <div className="space-y-3 border-t px-6 py-5 sm:px-8">
            {pausedPersonalPlan && (
              <div className="flex items-start gap-3 rounded-xl border border-sky-500/25 bg-sky-500/5 p-4">
                <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" />
                <div className="text-sm">
                  <p className="font-medium text-foreground">Personal plan paused</p>
                  <p className="mt-1 text-muted-foreground">
                    Your {formatTierName(pausedPersonalPlan.tier)} plan is on hold while you work on{' '}
                    {pausedVesselName || 'this vessel'}. You will not be billed for it, and it will
                    resume automatically when your assignment ends.
                  </p>
                </div>
              </div>
            )}

            {isScheduledToCancelAtPeriodEnd && currentPeriodEnd && (
              <div className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">Cancellation scheduled</p>
                    <p className="mt-1 text-muted-foreground">
                      You keep access until {format(currentPeriodEnd, 'd MMM yyyy')}. Resume to keep
                      billing past that date.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResumeSubscription}
                  className="rounded-xl shrink-0 self-start sm:self-center"
                >
                  Resume subscription
                </Button>
              </div>
            )}

            {isFullyCanceled && (
              <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <p className="font-medium text-foreground">Subscription ended</p>
                  <p className="mt-1 text-muted-foreground">
                    There is no active Stripe subscription to resume. Choose a plan below to continue.
                  </p>
                </div>
                <Button
                  size="sm"
                  className="rounded-xl shrink-0"
                  onClick={() =>
                    document.getElementById('available-plans')?.scrollIntoView({ behavior: 'smooth' })
                  }
                >
                  View plans
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Invoices — vessel accounts */}
      {isVesselAccount && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10">
                <FileText className="h-5 w-5 text-sky-700 dark:text-sky-300" />
              </div>
              <div>
                <CardTitle>Invoices & receipts</CardTitle>
                <CardDescription>
                  Download invoices for your vessel subscription payments
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingInvoices ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="rounded-xl border border-dashed px-6 py-10 text-center text-muted-foreground">
                <FileText className="mx-auto mb-3 h-10 w-10 opacity-40" />
                <p className="font-medium text-foreground">No invoices yet</p>
                <p className="mt-1 text-sm">
                  Invoices appear here once your vessel subscription has been billed.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">
                          {invoice.number || invoice.id.slice(-8)}
                        </TableCell>
                        <TableCell>
                          {format(new Date(invoice.date), 'd MMM yyyy')}
                        </TableCell>
                        <TableCell>
                          {invoice.periodStart && invoice.periodEnd ? (
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(invoice.periodStart), 'd MMM')} –{' '}
                              {format(new Date(invoice.periodEnd), 'd MMM yyyy')}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {new Intl.NumberFormat('en-GB', {
                            style: 'currency',
                            currency: invoice.currency.toUpperCase(),
                          }).format(invoice.amount / 100)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              invoice.status === 'paid'
                                ? 'default'
                                : invoice.status === 'open'
                                  ? 'secondary'
                                  : 'destructive'
                            }
                            className="rounded-xl capitalize"
                          >
                            {invoice.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {invoice.invoicePdf || invoice.hostedInvoiceUrl ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const url = invoice.invoicePdf || invoice.hostedInvoiceUrl;
                                if (url) window.open(url, '_blank');
                              }}
                              className="rounded-xl"
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </Button>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Available plans */}
      <div id="available-plans" className="space-y-5">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {pausedPersonalPlan ? 'Plans' : 'Change plan'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {pausedPersonalPlan
              ? 'Your personal plan stays paused while you are on a vessel Professional plan.'
              : isVesselAccount
                ? 'Compare vessel plans and switch when you need more capacity.'
                : 'Compare crew plans and switch when you are ready.'}
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan, index) => {
            const Icon = plan.icon;
            const isCurrent = isCurrentPlan(plan.name) && !pausedPersonalPlan;
            const planLocked = !!pausedPersonalPlan;

            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: index * 0.06 }}
              >
                <Card
                  className={cn(
                    'flex h-full flex-col rounded-2xl border shadow-sm transition-colors',
                    isCurrent
                      ? 'border-sky-500/40 ring-2 ring-sky-500/20'
                      : 'hover:border-sky-500/25',
                  )}
                >
                  <CardHeader className="space-y-4 pb-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10">
                        <Icon className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                      </div>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {isCurrent && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                            <Check className="h-3 w-3" />
                            Current
                          </span>
                        )}
                        {plan.comingSoon && (
                          <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                            Coming soon
                          </span>
                        )}
                        {plan.highlighted && !isCurrent && !plan.comingSoon && !isVesselAccount && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-800 dark:text-sky-300">
                            <Star className="h-3 w-3 fill-current" />
                            Popular
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <CardTitle className="text-xl">{plan.name}</CardTitle>
                      <div className="mt-3 flex items-baseline gap-1.5">
                        <span className="text-3xl font-bold tracking-tight">{plan.price}</span>
                        <span className="text-sm text-muted-foreground">{plan.priceSuffix}</span>
                      </div>
                      {plan.trialLabel &&
                        isCrewLimited &&
                        !pausedPersonalPlan &&
                        plan.priceId &&
                        !plan.comingSoon && (
                          <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                            {plan.trialLabel}
                          </p>
                        )}
                      <CardDescription className="mt-3 text-sm leading-relaxed">
                        {plan.description}
                      </CardDescription>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 border-t pt-5">
                    <ul className="space-y-3 text-sm">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300">
                            <Check className="h-3 w-3" />
                          </span>
                          <span className="text-foreground/90">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>

                  <CardFooter className="pt-2">
                    {isCurrent ? (
                      <Button disabled className="h-11 w-full rounded-xl">
                        Current plan
                      </Button>
                    ) : plan.comingSoon ? (
                      <Button disabled variant="outline" className="h-11 w-full rounded-xl">
                        Available later {plan.availableDate || '2026'}
                      </Button>
                    ) : planLocked ? (
                      <Button disabled variant="outline" className="h-11 w-full rounded-xl">
                        Unavailable while paused
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleChangePlan(plan)}
                        disabled={!plan.priceId || isChangingPlan === plan.name}
                        className={cn(
                          'h-11 w-full rounded-xl',
                          plan.highlighted
                            ? 'bg-sky-600 text-white hover:bg-sky-700'
                            : '',
                        )}
                        variant={plan.highlighted ? 'default' : 'outline'}
                      >
                        {isChangingPlan === plan.name ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Changing…
                          </>
                        ) : (
                          'Switch to this plan'
                        )}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Cancel */}
      {subscription && !isCancelled && !pausedPersonalPlan && (
        <Card className="rounded-2xl border-destructive/20 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Cancel subscription</CardTitle>
            <CardDescription>
              You keep access until the end of your billing period
              {currentPeriodEnd ? ` (${format(currentPeriodEnd, 'd MMM yyyy')})` : ''}.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(true)}
              className="rounded-xl border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel subscription
            </Button>
          </CardFooter>
        </Card>
      )}

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel? You keep access until{' '}
              {currentPeriodEnd
                ? format(currentPeriodEnd, 'd MMM yyyy')
                : 'the end of your billing period'}
              . After that you move to the free plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Keep subscription</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubscription}
              disabled={isCancelling}
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancelling…
                </>
              ) : (
                'Yes, cancel subscription'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
