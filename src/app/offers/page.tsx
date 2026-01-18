
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
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
  Download,
  Loader2,
  Star,
  Zap,
  Shield,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { hasActiveSubscription } from '@/supabase/database/subscription-helpers';
import { useRouter, usePathname } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import {
  createCheckoutSession,
  getStripeProducts,
  type StripeProduct,
} from '@/app/actions';
import type { UserProfile } from '@/lib/types';
import { motion } from 'framer-motion';

interface Plan {
  name: string;
  price: string;
  priceSuffix: string;
  description: string;
  features: string[];
  cta: string;
  icon: typeof Shield;
  color: 'blue' | 'purple' | 'orange';
  highlighted?: boolean;
  priceId?: string; // Stripe price ID
  comingSoon?: boolean; // Coming soon flag
  availableDate?: string; // Available date
}

// Crew plan templates - for individual crew members
const crewPlanTemplates: Omit<Plan, 'priceId'>[] = [
  {
    name: 'Standard',
    price: '£4.99',
    priceSuffix: '/ month',
    description: 'Essential sea time tracking for maritime professionals.',
    features: [
      'Unlimited sea time logging',
      'Up to 3 vessels',
      'MCA compliant sea time calculations',
      'PDF export of digital testimonials',
      'Direct digital sign-offs',
    ],
    cta: 'Get Started',
    icon: Shield,
    color: 'blue',
  },
  {
    name: 'Premium',
    price: '£9.99',
    priceSuffix: '/ month',
    description: 'Advanced logging and documentation for career progression.',
    features: [
      'All Standard features',
      'Unlimited vessels',
      'Passage log book',
      'Bridge watch log book',
      'Export sea time to multi-format (Excel, CSV, etc.)',
      'Visa tracker',
      'Request sea time',
    ],
    cta: 'Get Started',
    highlighted: true,
    icon: Zap,
    color: 'purple',
  },
  {
    name: 'Pro',
    price: '£14.99',
    priceSuffix: '/ month',
    description:
      'Complete maritime career management and certification tracking.',
    features: [
      'All Premium features',
      'Advanced analytics',
      'GPS passage tracking',
      'Automatic vessel state tracking via AIS (additional fee per month)',
      'Direct MCA submissions & approvals',
    ],
    cta: 'Get Started',
    icon: TrendingUp,
    color: 'orange',
    comingSoon: true,
    availableDate: '2026',
  },
];

// Vessel plan templates - for vessel accounts
const vesselPlanTemplates: Omit<Plan, 'priceId'>[] = [
  {
    name: 'Vessel Lite',
    price: '£24.99',
    priceSuffix: '/ month',
    description: 'Essential vessel management for small operations.',
    features: [
      'Single vessel',
      'Up to 15 crew members',
      'Crew management & assignments',
      'Vessel state tracking',
      'Digital testimonial approvals',
      'Crew sea time verification',
      'Basic reporting & exports',
    ],
    cta: 'Get Started',
    icon: Shield,
    color: 'blue',
  },
  {
    name: 'Vessel Basic',
    price: '£49.99',
    priceSuffix: '/ month',
    description: 'Advanced vessel management for growing operations.',
    features: [
      'Single vessel',
      'Up to 30 crew members',
      'All Lite features',
      'Advanced crew analytics',
      'Automated testimonial workflows',
      'Crew certification tracking',
      'Priority support',
    ],
    cta: 'Get Started',
    highlighted: false,
    icon: Zap,
    color: 'purple',
  },
  {
    name: 'Vessel Pro',
    price: '£99.99',
    priceSuffix: '/ month',
    description: 'Complete vessel management solution.',
    features: [
      'Single vessel',
      'Unlimited crew members',
      'Multiple role assignments',
      'All Basic features',
      'Fleet-wide analytics',
      'Custom reporting & integrations',
      'Advanced security & compliance',
    ],
    cta: 'Get Started',
    icon: TrendingUp,
    color: 'orange',
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
      'All Pro features',
      'Enterprise-grade analytics',
      'Custom integrations & API access',
      'Dedicated account manager',
      '24/7 priority support',
      'Advanced compliance & security',
    ],
    cta: 'Get Started',
    icon: TrendingUp,
    color: 'orange',
    comingSoon: false,
  },
];

// Default to crew plans (backward compatibility)
const planTemplates = crewPlanTemplates;

const freeTier = {
  name: 'Mobile App',
  description:
    'Get started with the essential tools to track your sea time on the free version of the app.',
  features: ['Sea time logging', 'Basic PDF exports', 'Digital testimonial requests'],
  cta: 'Download',
  href: 'https://apps.apple.com/gb/app/seajourney/id6751553072',
};


export default function OffersPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [purchasingPlan, setPurchasingPlan] = useState<string | null>(null);
  const redirectingRef = useRef(false);

  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  // Get user profile to check subscription status and role
  const { data: userProfileRaw, isLoading: isProfileLoading } = useDoc<UserProfile>('users', user?.id);
  
  // Transform user profile to handle both snake_case (from DB) and camelCase (from types)
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    
    return {
      ...userProfileRaw,
      role: (userProfileRaw as any).role || 'crew',
      subscriptionTier: (userProfileRaw as any).subscription_tier || (userProfileRaw as any).subscriptionTier || 'free',
      subscriptionStatus: (userProfileRaw as any).subscription_status || (userProfileRaw as any).subscriptionStatus || 'inactive',
    } as UserProfile;
  }, [userProfileRaw]);
  
  const hasActiveSub = userProfile ? hasActiveSubscription(userProfile) : false;
  
  // Determine if user is a vessel account - properly extract role
  const userRole = userProfile?.role || 'crew';
  const isVesselAccount = userRole?.toLowerCase() === 'vessel';
  
  // Log for debugging
  useEffect(() => {
    if (userProfile) {
      console.log('[OFFERS PAGE] User profile loaded:', {
        userId: userProfile.id,
        role: userRole,
        isVesselAccount,
        rawRole: (userProfileRaw as any)?.role,
        transformedRole: userProfile?.role,
      });
    }
  }, [userProfile, userProfileRaw, userRole, isVesselAccount]);
  
  // Select appropriate plan templates based on role
  const selectedPlanTemplates = isVesselAccount ? vesselPlanTemplates : crewPlanTemplates;

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

  // Check if a plan is the current active plan
  const isCurrentPlan = (planName: string) => {
    if (!hasActiveSub || !userProfile) return false;
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

  // Redirect to dashboard if user has active subscription
  useEffect(() => {
    // Prevent multiple redirects
    if (redirectingRef.current) return;
    
    // Wait for loading to complete
    if (isUserLoading || isProfileLoading) {
      return;
    }
    
    // If no user, allow them to see offers
    if (!user) {
      return;
    }

    // Only proceed if we're actually on the offers page
    if (pathname !== '/offers') {
      return;
    }

    // Only redirect if subscription is active and we're on offers page
    if (hasActiveSub) {
      redirectingRef.current = true;
      console.log('[OFFERS] Redirecting to dashboard - subscription is active');
      router.replace('/dashboard');
    }
  }, [user, userProfile, isUserLoading, isProfileLoading, router, pathname, hasActiveSub]);

  useEffect(() => {
    // Don't fetch products if user has active subscription (will redirect)
    if (hasActiveSub) return;
    
    // Wait for user profile to load before determining vessel account status
    if (isProfileLoading || !userProfile) {
      console.log('[OFFERS PAGE] Waiting for user profile to load...');
      return;
    }
    
    const fetchProducts = async () => {
      console.log('========================================');
      console.log('[OFFERS PAGE] ===== FETCHING PRODUCTS =====');
      console.log('[OFFERS PAGE] Timestamp:', new Date().toISOString());
      console.log('[OFFERS PAGE] User profile loaded:', !!userProfile);
      console.log('[OFFERS PAGE] User role:', userProfile?.role);
      console.log('[OFFERS PAGE] Is vessel account:', isVesselAccount);
      console.log('========================================');
      
      try {
        console.log('[OFFERS PAGE] Calling getStripeProducts()...');
        console.log('[OFFERS PAGE] Is vessel account:', isVesselAccount);
        const stripePrices: StripeProduct[] = await getStripeProducts(isVesselAccount);

        console.log('[OFFERS PAGE] ✅ Received prices from Stripe:', stripePrices.length);
        console.log('[OFFERS PAGE] Prices received:', stripePrices.map((p: any) => ({
          id: p.id,
          amount: p.unit_amount ? `£${(p.unit_amount / 100).toFixed(2)}` : 'N/A',
          interval: p.recurring?.interval,
          tier: p.metadata?.tier || p.nickname || 'unknown',
        })));

        const getTemplateTierKey = (templateName: string) => {
          const lower = templateName.toLowerCase();
          // Handle vessel plans
          if (lower.includes('vessel')) {
            if (lower.includes('fleet')) return 'vessel_fleet';
            if (lower.includes('pro')) return 'vessel_pro';
            if (lower.includes('basic')) return 'vessel_basic';
            if (lower.includes('lite')) return 'vessel_lite';
          }
          // Handle crew plans
          if (lower === 'pro') return 'professional';
          return lower;
        };

        console.log('[OFFERS PAGE] Mapping prices to plan templates...');
        console.log('[OFFERS PAGE] User role:', isVesselAccount ? 'vessel' : 'crew');
        console.log('[OFFERS PAGE] Available templates:', selectedPlanTemplates.map(t => t.name));
        
        const mappedPlans: Plan[] = selectedPlanTemplates.map((template) => {
          const templateTier = getTemplateTierKey(template.name);
          console.log(`[OFFERS PAGE] Mapping template "${template.name}" (tier key: "${templateTier}")...`);

          const matchingPrice = stripePrices.find((price) => {
            const anyPrice: any = price;
            const priceTier = (
              anyPrice.metadata?.tier ||
              anyPrice.nickname ||
              ''
            ).toLowerCase();

            // Match vessel plans with vessel prices, crew plans with crew prices
            const isVesselPrice = priceTier.includes('vessel');
            const isVesselTemplate = templateTier.includes('vessel');
            
            // Only match if both are vessel or both are crew
            if (isVesselPrice !== isVesselTemplate) {
              return false;
            }

            const match =
              priceTier === templateTier ||
              priceTier.includes(templateTier) ||
              templateTier.includes(priceTier);

            if (match) {
              console.log(`[OFFERS PAGE] ✅ Found match for "${template.name}":`, {
                price_id: anyPrice.id,
                price_tier: priceTier,
                template_tier: templateTier,
              });
            }

            return match;
          });

          if (matchingPrice) {
            const anyPrice: any = matchingPrice;
            const amount = (anyPrice.unit_amount ?? 0) / 100;
            const interval = anyPrice.recurring?.interval || 'month';

            const mappedPlan = {
              ...template,
              price: `£${amount.toFixed(2)}`,
              priceSuffix: `/${interval}`,
              priceId: anyPrice.id,
            };
            
            console.log(`[OFFERS PAGE] ✅ Mapped "${template.name}" to:`, {
              price: mappedPlan.price,
              priceId: mappedPlan.priceId,
              interval: interval,
            });
            
            return mappedPlan;
          }

          console.log(`[OFFERS PAGE] ⚠️ No Stripe price found for "${template.name}", using template defaults`);
          
          // Fallback to template values if no Stripe price found
          return {
            ...template,
            priceId: undefined,
          };
        });

        console.log('[OFFERS PAGE] Final mapped plans:');
        mappedPlans.forEach((plan, index) => {
          console.log(`[OFFERS PAGE] Plan ${index + 1}:`, {
            name: plan.name,
            price: plan.price,
            priceId: plan.priceId || 'NOT SET',
            hasPriceId: !!plan.priceId,
          });
        });

        const plansWithPriceIds = mappedPlans.filter(p => p.priceId).length;
        console.log('[OFFERS PAGE] Summary:', {
          total_plans: mappedPlans.length,
          plans_with_price_ids: plansWithPriceIds,
          plans_without_price_ids: mappedPlans.length - plansWithPriceIds,
        });

        console.log('[OFFERS PAGE] Setting plans state...');
        setPlans(mappedPlans);
        console.log('[OFFERS PAGE] ✅ Plans set successfully');
        console.log('========================================');
      } catch (error: any) {
        console.error('========================================');
        console.error('[OFFERS PAGE] ❌ ERROR FETCHING PRODUCTS');
        console.error('[OFFERS PAGE] Error message:', error?.message);
        console.error('[OFFERS PAGE] Error type:', error?.type);
        console.error('[OFFERS PAGE] Error code:', error?.code);
        console.error('[OFFERS PAGE] Error stack:', error?.stack);
        console.error('[OFFERS PAGE] Full error:', error);
        console.error('[OFFERS PAGE] Is vessel account:', isVesselAccount);
        console.error('[OFFERS PAGE] User role:', userProfile?.role);
        console.error('[OFFERS PAGE] ========================================');
        
        // Fallback to templates without price IDs
        console.log('[OFFERS PAGE] Falling back to template defaults (no price IDs)');
        setPlans(
          selectedPlanTemplates.map((t) => ({ ...t, priceId: undefined })),
        );
        
        // Show more specific error message
        const errorMessage = error?.message || 'Could not load subscription plans.';
        const isProductIdError = errorMessage.includes('product ID') || errorMessage.includes('not configured');
        
        toast({
          title: 'Error',
          description: isProductIdError 
            ? `${errorMessage} Please check your environment variables.`
            : `${errorMessage} Please try again later.`,
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
        console.log('[OFFERS PAGE] Fetch complete, loading set to false');
      }
    };

    fetchProducts();
  }, [toast, hasActiveSub, isVesselAccount, selectedPlanTemplates, isProfileLoading, userProfile]);


  const handlePurchase = async (plan: Plan) => {
    if (plan.comingSoon) {
      toast({
        title: 'Coming Soon',
        description: `This plan will be available in ${
          plan.availableDate || '2026'
        }.`,
        variant: 'default',
      });
      return;
    }

    if (!plan.priceId) {
      toast({
        title: 'Plan Unavailable',
        description:
          'This plan is not currently available. Please try again later.',
        variant: 'destructive',
      });
      return;
    }

    if (!user) {
      router.push(`/signup?redirect=/offers`);
      return;
    }
  
    setPurchasingPlan(plan.name);
  
    try {
      const { sessionId, url } = await createCheckoutSession(
        plan.priceId,
        user.id,
        user.email!,
      );

      if (url) {
        router.push(url);
      } else {
        throw new Error('Could not create a checkout session.');
      }
    } catch (error: any) {
      console.error('Stripe checkout error:', error);
      toast({
        title: 'Purchase Failed',
        description: error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
      setPurchasingPlan(null);
    }
  };
  
  // Show loading state while checking subscription
  if (isLoading || isUserLoading || isProfileLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }
  
  // Show loading/redirect state if user has active subscription
  if (user && hasActiveSub) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }
  
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <section
          className="py-20 sm:py-28 relative overflow-hidden"
          style={{ backgroundColor: '#000b15' }}
        >
          {/* Background decoration */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
          </div>

          <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="mx-auto max-w-3xl text-center mb-16">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <h1 className="font-headline text-4xl font-bold tracking-tight text-white sm:text-5xl mb-4">
                  {hasActiveSub && user
                    ? 'Change Your Plan'
                    : isVesselAccount
                    ? 'Choose Your Vessel Plan'
                    : 'Choose Your Voyage'}
              </h1>
                <p className="mt-6 text-xl leading-8 text-blue-100">
                  {hasActiveSub && user
                    ? 'Upgrade or downgrade your subscription to match your needs. Changes take effect immediately.'
                    : isVesselAccount
                    ? 'Select the perfect plan for managing your vessel and crew based on your fleet size and crew numbers.'
                    : 'Find the perfect fit for your maritime career and get ready to set sail. Start your journey today.'}
              </p>
              </motion.div>
            </div>

            <div className={`mx-auto mt-16 grid max-w-lg grid-cols-1 gap-8 lg:max-w-none ${isVesselAccount ? 'lg:grid-cols-2 xl:grid-cols-4' : 'lg:grid-cols-2 xl:grid-cols-3'}`}>
              {/* Free tier card - only show for crew accounts */}
              {!isVesselAccount && (
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0 }}
              >
                <Card className="flex flex-col rounded-2xl border border-blue-500/30 ring-1 ring-blue-500/20 dark:border-blue-500/30 dark:ring-blue-500/20 transition-all duration-300 hover:scale-105 bg-white dark:bg-[rgba(2,22,44,0.6)] shadow-lg shadow-blue-500/10 dark:shadow-blue-500/15 hover:shadow-xl hover:shadow-blue-500/20 dark:hover:shadow-blue-500/30 backdrop-blur-sm dark:backdrop-blur-[20px]">
                  <CardHeader className="flex-grow pb-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-blue-100 dark:bg-blue-500/20">
                        <Download className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <CardTitle className="font-headline text-2xl text-gray-900 dark:text-white">
                        {freeTier.name}
                      </CardTitle>
                    </div>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-5xl font-bold tracking-tight text-gray-900 dark:text-white">Free</span>
                      </div>
                    <CardDescription className="text-gray-600 dark:text-blue-100/80 text-base mt-4">
                      {freeTier.description}
                    </CardDescription>
                    </CardHeader>
                  <CardContent className="border-t border-gray-200 dark:border-white/10 pt-6 pb-6">
                    <ul className="space-y-4 text-sm">
                      {freeTier.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <div className="mt-0.5 h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 bg-blue-100 dark:bg-blue-500/20">
                            <Check className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                          </div>
                          <span className="text-gray-700 dark:text-white/90">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  <CardFooter className="pt-0">
                      <Button
                        asChild
                      className="w-full rounded-xl text-base font-semibold h-12 bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 text-gray-900 dark:text-white border border-gray-300 dark:border-white/20"
                      >
                        <Link
                          href={freeTier.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2"
                        >
                        <Download className="h-4 w-4" />
                        {freeTier.cta}
                        </Link>
                      </Button>
                    </CardFooter>
                  </Card>
              </motion.div>
              )}

              {/* Paid plan cards */}
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
                    transition={{ duration: 0.5, delay: (index + 1) * 0.1 }}
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
                          : 'border-orange-500/30 ring-1 ring-orange-500/20 dark:border-orange-500/30 dark:ring-orange-500/20'
                      } ${
                        isHighlighted
                          ? 'bg-purple-50/80 dark:bg-purple-950/20'
                          : plan.color === 'blue'
                          ? 'bg-white dark:bg-[rgba(2,22,44,0.6)]'
                          : 'bg-white dark:bg-[rgba(2,22,44,0.6)]'
                      } ${
                        plan.color === 'blue'
                          ? 'shadow-lg shadow-blue-500/10 dark:shadow-blue-500/15 hover:shadow-xl hover:shadow-blue-500/20 dark:hover:shadow-blue-500/30'
                          : plan.color === 'purple'
                          ? 'shadow-lg shadow-purple-500/15 dark:shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/25 dark:hover:shadow-purple-500/40'
                          : 'shadow-lg shadow-orange-500/10 dark:shadow-orange-500/15 hover:shadow-xl hover:shadow-orange-500/20 dark:hover:shadow-orange-500/30'
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
                          {isHighlighted &&
                            !isCurrent &&
                            !plan.comingSoon &&
                            !isVesselAccount && (
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
                                : 'bg-orange-100 dark:bg-orange-500/20'
                            }`}
                          >
                            <Icon
                              className={`h-6 w-6 ${
                                plan.color === 'blue'
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : plan.color === 'purple'
                                  ? 'text-purple-600 dark:text-purple-400'
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
                        <CardDescription className="text-gray-600 dark:text-blue-100/80 text-base mt-4">
                          {plan.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="border-t border-gray-200 dark:border-white/10 pt-6 pb-6">
                        <ul className="space-y-4 text-sm">
                          {plan.features.map((feature, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-3"
                            >
                              <div
                                className={`mt-0.5 h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                                  plan.color === 'blue'
                                    ? 'bg-blue-100 dark:bg-blue-500/20'
                                    : plan.color === 'purple'
                                    ? 'bg-purple-100 dark:bg-purple-500/20'
                                    : 'bg-orange-100 dark:bg-orange-500/20'
                                }`}
                              >
                                <Check
                                  className={`h-3 w-3 ${
                                    plan.color === 'blue'
                                      ? 'text-blue-600 dark:text-blue-400'
                                      : plan.color === 'purple'
                                      ? 'text-purple-600 dark:text-purple-400'
                                      : 'text-orange-600 dark:text-orange-400'
                                  }`}
                                />
                              </div>
                              <span className="text-gray-700 dark:text-white/90">
                                {feature}
                              </span>
                                    </li>
                                ))}
                            </ul>
                          </CardContent>
                      <CardFooter className="pt-0">
                        {isCurrent ? (
                            <Button
                            asChild
                            className="w-full rounded-xl text-base font-semibold h-12 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white border-0 shadow-lg"
                          >
                            <Link
                              href="/dashboard"
                              className="flex items-center justify-center gap-2"
                            >
                              Go to Dashboard
                              <ArrowRight className="h-4 w-4" />
                            </Link>
                          </Button>
                        ) : plan.comingSoon ? (
                          <Button
                            disabled
                            className="w-full rounded-xl text-base font-semibold h-12 bg-gray-100 dark:bg-white/5 text-gray-400 dark:text-white/50 border border-gray-300 dark:border-white/10 cursor-not-allowed"
                          >
                            <div className="flex items-center justify-center gap-2">
                              Available Later{' '}
                              {plan.availableDate || '2026'}
                            </div>
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handlePurchase(plan)}
                            disabled={
                              !plan.priceId ||
                              purchasingPlan === plan.name
                            }
                            className={`w-full rounded-xl text-base font-semibold h-12 ${
                              isHighlighted
                                ? 'bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-700 hover:to-purple-600 text-white border-0 shadow-lg shadow-purple-500/30 disabled:opacity-50'
                                : 'bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 text-gray-900 dark:text-white border border-gray-300 dark:border-white/20 disabled:opacity-50'
                            }`}
                            >
                            {purchasingPlan === plan.name ? (
                              <div className="flex items-center justify-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Processing...
                              </div>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                {hasActiveSub && user
                                  ? 'Switch Plan'
                                  : plan.cta}
                                <ArrowRight className="h-4 w-4" />
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

            {/* Additional CTA Section - only show for crew accounts */}
            {!isVesselAccount && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="mt-16 text-center"
            >
              <div
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full border"
                style={{
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  borderColor: 'rgba(59, 130, 246, 0.3)',
                }}
              >
                <Shield className="h-5 w-5 text-blue-400" />
                <p className="text-blue-200 font-medium">
                  <span className="text-white font-bold">
                    Cancel anytime
                  </span>{' '}
                  - Flexible billing
                </p>
              </div>
            </motion.div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
