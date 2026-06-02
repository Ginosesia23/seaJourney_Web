'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from "@/lib/supabaseClient"; // adjust path to wherever you exported createClient(...)
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useUser, useSupabase } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { hasActiveSubscription } from '@/supabase/database/subscription-helpers';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile } from '@/lib/types';
import { format } from 'date-fns';
import { createCheckoutSession } from '@/app/actions';
import { CREW_TRIAL_DISPLAY_LABEL } from '@/lib/stripe-checkout-trials';
import { Badge } from '@/components/ui/badge';
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

  const currentTier = formatTierName(profileTierRaw);

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
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Subscription</h1>
          <p className="text-muted-foreground mt-2">
            This is a vessel-linked account. There&apos;s nothing to pay or manage here.
          </p>
        </div>

        {/* Linked-account hero card */}
        <Card className="overflow-hidden border-primary/30">
          {/* Top eyebrow */}
          <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent px-6 py-5 border-b">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
              <Link2 className="h-3.5 w-3.5" />
              Vessel-linked account
            </div>

            {/* Link diagram: [You] ── linked ── [Vessel] */}
            <div className="mt-3 flex items-stretch gap-2 sm:gap-3">
              {/* You */}
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

              {/* Connector */}
              <div className="flex flex-col items-center justify-center px-1">
                <div className="h-px w-6 bg-primary/40 sm:w-10" aria-hidden />
                <div className="my-1 flex h-7 w-7 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary shadow-sm">
                  <Link2 className="h-3.5 w-3.5" />
                </div>
                <div className="h-px w-6 bg-primary/40 sm:w-10" aria-hidden />
                <div className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-primary">
                  Linked
                </div>
              </div>

              {/* Vessel */}
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 p-3 text-center shadow-sm">
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Ship className="h-4 w-4" />
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">
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
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <UserCog className="h-3 w-3" /> Your role on this vessel
                </div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {linkedRoleLabel}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
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
              <div className="rounded-lg border bg-background p-3">
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
                      className="text-sm text-primary hover:underline"
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

            <div className="rounded-lg border border-dashed bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">
                Want your own personal SeaJourney account with full crew features (sea-time tracking, visa tracker, etc.)? You can sign up separately at{' '}
                <a className="font-medium text-primary hover:underline" href="/signup">
                  /signup
                </a>{' '}
                using a different email.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Manage Subscription
        </h1>
        <p className="text-muted-foreground mt-2">
          Change your plan, update billing, or cancel your subscription
        </p>
      </div>

      {/* Current Subscription Info */}
      {subscription && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Current Subscription</CardTitle>
            <CardDescription>
              {isFullyCanceled
                ? 'This subscription has ended. Start a new plan to continue.'
                : isScheduledToCancelAtPeriodEnd
                  ? 'Your subscription is scheduled to cancel at the end of the billing period.'
                  : 'Your active subscription details'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Plan</p>
                <p className="text-sm text-muted-foreground">{displayedPlanName}</p>
              </div>
              <div>
                <p className="font-medium">Status</p>
                <Badge
                  variant={
                    isCancelled
                      ? 'destructive'
                      : subscription.status === 'active'
                      ? 'default'
                      : 'secondary'
                  }
                  className="mt-1"
                >
                  {isFullyCanceled
                    ? 'Canceled'
                    : isScheduledToCancelAtPeriodEnd
                      ? 'Cancelling'
                      : subscription.status.charAt(0).toUpperCase() +
                        subscription.status.slice(1)}
                </Badge>
              </div>
            </div>

            {currentPeriodEnd && (
              <div>
                <p className="font-medium">
                  {isScheduledToCancelAtPeriodEnd ? 'Cancels on' : 'Next billing date'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(currentPeriodEnd, 'PPP')}
                </p>
              </div>
            )}

            {isScheduledToCancelAtPeriodEnd && currentPeriodEnd && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                      Cancellation scheduled
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      You keep access until {format(currentPeriodEnd, 'PPP')}. You can resume to
                      keep billing past that date.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResumeSubscription}
                  className="rounded-xl shrink-0 self-start sm:self-center"
                >
                  Resume Subscription
                </Button>
              </div>
            )}

            {isFullyCanceled && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 bg-muted/50 border border-border rounded-lg">
                <div>
                  <p className="text-sm font-medium text-foreground">Subscription ended</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Stripe no longer has an active subscription to “resume.” Start a new subscription
                    to continue. In the Stripe Dashboard, search by customer email or Customer ID
                    (cus_…), not the old subscription id.
                  </p>
                </div>
                <Button asChild variant="default" size="sm" className="rounded-xl shrink-0">
                  <Link href="/offers">View plans</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invoices/Receipts Section - Only for Vessel Accounts */}
      {isVesselAccount && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Invoices & Receipts</CardTitle>
            <CardDescription>
              Download invoices for your subscription payments
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingInvoices ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No invoices found</p>
                <p className="text-sm mt-2">
                  Invoices will appear here once you have an active subscription.
                </p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
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
                          {format(new Date(invoice.date), 'MMM dd, yyyy')}
                        </TableCell>
                        <TableCell>
                          {invoice.periodStart && invoice.periodEnd ? (
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(invoice.periodStart), 'MMM dd')} - {format(new Date(invoice.periodEnd), 'MMM dd, yyyy')}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
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
                                if (url) {
                                  window.open(url, '_blank');
                                }
                              }}
                              className="rounded-xl"
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download
                            </Button>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
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

      {/* Available Plans */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-6 text-foreground">
          Available Plans
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan, index) => {
            const Icon = plan.icon;
            const isHighlighted = plan.highlighted;
            const isCurrent = isCurrentPlan(plan.name);

            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={isCurrent ? 'scale-105' : ''}
              >
                <Card
                  className={`flex flex-col rounded-2xl border transition-all duration-300 ${
                    isCurrent ? 'hover:scale-102' : 'hover:scale-105'
                  } ${
                    isHighlighted
                      ? 'border-purple-500/50 ring-2 ring-purple-500/30 dark:border-purple-500/50 dark:ring-purple-500/30'
                      : plan.color === 'blue'
                      ? 'border-blue-500/30 ring-1 ring-blue-500/20 dark:border-blue-500/30 dark:ring-blue-500/20'
                      : plan.color === 'purple'
                      ? 'border-purple-500/30 ring-1 ring-purple-500/20 dark:border-purple-500/30 dark:ring-purple-500/20'
                      : plan.color === 'green'
                      ? 'border-green-600/30 ring-1 ring-green-600/20 dark:border-green-500/30 dark:ring-green-500/20'
                      : 'border-orange-600/30 ring-1 ring-orange-600/20 dark:border-orange-500/30 dark:ring-orange-500/20'
                  } ${
                    isHighlighted
                      ? 'bg-purple-50/80 dark:bg-purple-950/20'
                      : plan.color === 'blue'
                      ? 'bg-slate-50 dark:bg-[rgba(2,22,44,0.6)]'
                      : 'bg-slate-50 dark:bg-[rgba(2,22,44,0.6)]'
                  } ${
                    plan.color === 'blue'
                      ? 'shadow-lg shadow-blue-500/10 dark:shadow-blue-500/15 hover:shadow-xl hover:shadow-blue-500/20 dark:hover:shadow-blue-500/30'
                      : plan.color === 'purple'
                      ? 'shadow-lg shadow-purple-500/15 dark:shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/25 dark:hover:shadow-purple-500/40'
                      : plan.color === 'green'
                      ? 'shadow-lg shadow-green-600/20 dark:shadow-green-500/25 hover:shadow-xl hover:shadow-green-600/30 dark:hover:shadow-green-500/40'
                      : plan.name === 'Vessel Fleet'
                      ? 'shadow-lg shadow-orange-600/20 dark:shadow-orange-500/25 hover:shadow-xl hover:shadow-orange-600/30 dark:hover:shadow-orange-500/40'
                      : 'shadow-lg shadow-orange-600/20 dark:shadow-orange-500/25 hover:shadow-xl hover:shadow-orange-600/30 dark:hover:shadow-orange-500/40'
                  } backdrop-blur-sm dark:backdrop-blur-[20px]`}
                >
                  <CardHeader className="flex-grow pb-6">
                    <div className="flex justify-between items-start mb-4">
                      {isCurrent && (
                        <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border bg-green-100 dark:bg-green-500/20 border-green-300 dark:border-green-500/50 text-green-700 dark:text-green-400">
                          <Check className="h-3.5 w-3.5" />
                          Current Plan
                        </div>
                      )}
                      {plan.comingSoon && (
                        <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border ml-auto bg-orange-100 dark:bg-orange-500/20 border-orange-300 dark:border-orange-500/50 text-orange-700 dark:text-orange-400">
                          Coming Soon
                        </div>
                      )}
                      {isHighlighted && !isCurrent && !plan.comingSoon && !isVesselAccount && (
                        <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border ml-auto bg-purple-100 dark:bg-purple-500/20 border-purple-300 dark:border-purple-500/50 text-purple-700 dark:text-purple-400">
                          <Star className="h-3.5 w-3.5 fill-current" />
                          Most Popular
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                          plan.color === 'blue'
                            ? 'bg-blue-100 dark:bg-blue-500/20'
                            : plan.color === 'purple'
                            ? 'bg-purple-100 dark:bg-purple-500/20'
                            : plan.color === 'green'
                            ? 'bg-green-100 dark:bg-green-500/20'
                            : 'bg-orange-100 dark:bg-orange-500/20'
                        }`}
                      >
                        <Icon
                          className={`h-6 w-6 ${
                            plan.color === 'blue'
                              ? 'text-blue-600 dark:text-blue-400'
                              : plan.color === 'purple'
                              ? 'text-purple-600 dark:text-purple-400'
                              : plan.color === 'green'
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-orange-600 dark:text-orange-400'
                          }`}
                        />
                      </div>
                      <CardTitle className="font-headline text-2xl text-gray-900 dark:text-white">
                        {plan.name}
                      </CardTitle>
                    </div>

                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-5xl font-bold tracking-tight text-gray-900 dark:text-white">
                        {plan.price}
                      </span>
                      <span className="text-base font-semibold text-gray-600 dark:text-slate-400">
                        {plan.priceSuffix}
                      </span>
                    </div>
                    {plan.trialLabel &&
                      isCrewLimited &&
                      plan.priceId &&
                      !plan.comingSoon && (
                        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-1">
                          {plan.trialLabel}
                        </p>
                      )}
                    <CardDescription className="text-gray-600 dark:text-blue-100/80 text-base mt-4">
                      {plan.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="border-t border-gray-200 dark:border-white/10 pt-6 pb-6">
                    <ul className="space-y-4 text-sm">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                              plan.color === 'blue'
                                ? 'bg-blue-100 dark:bg-blue-500/20'
                                : plan.color === 'purple'
                                ? 'bg-purple-100 dark:bg-purple-500/20'
                                : plan.color === 'green'
                                ? 'bg-green-100 dark:bg-green-500/20'
                                : 'bg-orange-100 dark:bg-orange-500/20'
                            }`}
                          >
                            <Check
                              className={`h-3 w-3 ${
                                plan.color === 'blue'
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : plan.color === 'purple'
                                  ? 'text-purple-600 dark:text-purple-400'
                                  : plan.color === 'green'
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-orange-600 dark:text-orange-400'
                              }`}
                            />
                          </div>
                          <span className="text-gray-700 dark:text-white/90">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter className="pt-0">
                    {isCurrent ? (
                      <Button
                        disabled
                        className="w-full rounded-xl text-base font-semibold h-12 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white border-0 shadow-lg"
                      >
                        Current Plan
                      </Button>
                    ) : plan.comingSoon ? (
                      <Button
                        disabled
                        className="w-full rounded-xl text-base font-semibold h-12 bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-white/50 border border-gray-300 dark:border-white/10 cursor-not-allowed"
                      >
                        <div className="flex items-center justify-center gap-2">
                          Available Later {plan.availableDate || '2026'}
                        </div>
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleChangePlan(plan)}
                        disabled={!plan.priceId || isChangingPlan === plan.name}
                        className={`w-full rounded-xl text-base font-semibold h-12 ${
                          isHighlighted
                            ? 'bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white border-0 shadow-lg shadow-purple-500/30 disabled:opacity-50'
                            : 'bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 text-gray-900 dark:text-white border border-gray-300 dark:border-white/20 disabled:opacity-50'
                        }`}
                      >
                        {isChangingPlan === plan.name ? (
                          <div className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Changing...
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-2">
                            Switch to This Plan
                          </div>
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

      {/* Cancel Subscription */}
      {subscription && !isCancelled && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">
              Cancel Subscription
            </CardTitle>
            <CardDescription>
              Cancel your subscription. You will retain access until the end of
              your billing period.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              variant="destructive"
              onClick={() => setShowCancelDialog(true)}
              className="rounded-xl"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancel Subscription
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel your subscription? You will retain
              access to all premium features until{' '}
              {currentPeriodEnd
                ? format(currentPeriodEnd, 'PPP')
                : 'the end of your billing period'}
              . After that, your subscription will be cancelled and you will be
              moved to the free plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">
              Keep Subscription
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelSubscription}
              disabled={isCancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Yes, Cancel Subscription'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
