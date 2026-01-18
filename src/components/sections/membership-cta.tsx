'use client';

import { useState, useEffect } from 'react';
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
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  createCheckoutSession,
  getStripeProducts,
  type StripeProduct, // ⚠️ This should now represent a Stripe.Price object
} from '@/app/actions';
import { useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { hasActiveSubscription } from '@/supabase/database/subscription-helpers';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile } from '@/lib/types';
import Link from 'next/link';

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

// These are just design defaults; real prices will be overridden from Stripe
const planTemplates: Omit<Plan, 'priceId'>[] = [
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

export default function MembershipCTA() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [purchasingPlan, setPurchasingPlan] = useState<string | null>(null);
  const { user } = useUser();
  const router = useRouter();
  const { toast } = useToast();

  // Get user profile to check subscription status
  const { data: userProfile, isLoading: isProfileLoading } =
    useDoc<UserProfile>('users', user?.id);
  const hasActiveSub = hasActiveSubscription(userProfile);

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

  const currentTier = userProfile
    ? formatTierName(
        (userProfile as any).subscription_tier ||
          (userProfile as any).subscriptionTier ||
          'free',
      )
    : 'Free';

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

  useEffect(() => {
    const fetchProducts = async () => {
      console.log('========================================');
      console.log('[MEMBERSHIP CTA] ===== FETCHING PRODUCTS =====');
      console.log('[MEMBERSHIP CTA] Timestamp:', new Date().toISOString());
      console.log('========================================');
      
      try {
        console.log('[MEMBERSHIP CTA] Calling getStripeProducts()...');
        // ⚠️ getStripeProducts should now return Stripe Price objects, NOT products
        const stripePrices: StripeProduct[] = await getStripeProducts();

        console.log(
          '[MEMBERSHIP CTA] ✅ Received prices from Stripe:',
          stripePrices.length,
        );
        console.log('[MEMBERSHIP CTA] Prices summary:', stripePrices.map((p: any) => ({
          id: p.id,
          amount: p.unit_amount ? `£${(p.unit_amount / 100).toFixed(2)}` : 'N/A',
          interval: p.recurring?.interval,
          tier: p.metadata?.tier || p.nickname || 'unknown',
          livemode: p.livemode,
        })));
        console.log(
          '[MEMBERSHIP CTA] Detailed prices data:',
          JSON.stringify(
            stripePrices.map((p) => ({
              id: (p as any).id,
              nickname: (p as any).nickname,
              unit_amount: (p as any).unit_amount,
              currency: (p as any).currency,
              interval: (p as any).recurring?.interval,
              metadata: (p as any).metadata,
              product_id:
                typeof (p as any).product === 'string'
                  ? (p as any).product
                  : (p as any).product?.id,
              livemode: (p as any).livemode,
            })),
            null,
            2,
          ),
        );

        const getTemplateTierKey = (templateName: string) => {
          const lower = templateName.toLowerCase();
          if (lower === 'pro') return 'professional'; // map "Pro" card → professional tier
          return lower; // 'standard', 'premium', etc.
        };

        const mappedPlans: Plan[] = planTemplates.map((template) => {
          console.log(
            `[MEMBERSHIP CTA] Mapping template "${template.name}"...`,
          );

          const templateTier = getTemplateTierKey(template.name); // e.g. 'standard', 'premium', 'professional'

          const matchingPrice = stripePrices.find((price) => {
            const anyPrice: any = price;
            const priceTier = (
              anyPrice.metadata?.tier ||
              anyPrice.nickname || // fallback to nickname if you like
              ''
            ).toLowerCase();

            const match =
              priceTier === templateTier ||
              priceTier.includes(templateTier) ||
              templateTier.includes(priceTier);

            console.log(`[MEMBERSHIP CTA] Checking price ${anyPrice.id}:`, {
              template_tier: templateTier,
              price_tier: priceTier,
              nickname: anyPrice.nickname,
              metadata: anyPrice.metadata,
              match,
            });

            return match;
          });

          if (matchingPrice) {
            const anyPrice: any = matchingPrice;
            const amount = (anyPrice.unit_amount ?? 0) / 100;
            const currency =
              anyPrice.currency?.toUpperCase() || 'GBP';
            const interval =
              anyPrice.recurring?.interval || 'month';

            console.log(
              `[MEMBERSHIP CTA] Mapped "${template.name}" to price:`,
              {
                price_id: anyPrice.id,
                amount,
                currency,
                interval,
              },
            );

            return {
              ...template,
              price: `£${amount.toFixed(2)}`,
              priceSuffix: `/${interval}`,
              priceId: anyPrice.id,
            };
          }

          console.log(
            `[MEMBERSHIP CTA] No Stripe price match found for "${template.name}", using template defaults.`,
          );

          // Fallback to template values if no Stripe price found
          return {
            ...template,
            priceId: undefined,
          };
        });

        console.log('[MEMBERSHIP CTA] Final mapped plans:');
        mappedPlans.forEach((plan, index) => {
          console.log(`[MEMBERSHIP CTA] Plan ${index + 1}:`, {
            name: plan.name,
            price: plan.price,
            priceId: plan.priceId || 'NOT SET',
            hasPriceId: !!plan.priceId,
          });
        });
        
        const plansWithPriceIds = mappedPlans.filter(p => p.priceId).length;
        console.log('[MEMBERSHIP CTA] Summary:', {
          total_plans: mappedPlans.length,
          plans_with_price_ids: plansWithPriceIds,
          plans_without_price_ids: mappedPlans.length - plansWithPriceIds,
        });

        console.log('[MEMBERSHIP CTA] Setting plans state...');
        setPlans(mappedPlans);
        console.log('[MEMBERSHIP CTA] ✅ Plans set successfully');
        console.log('========================================');
      } catch (error: any) {
        console.error('========================================');
        console.error('[MEMBERSHIP CTA] ❌ ERROR FETCHING PRODUCTS');
        console.error('[MEMBERSHIP CTA] Error message:', error?.message);
        console.error('[MEMBERSHIP CTA] Error type:', error?.type);
        console.error('[MEMBERSHIP CTA] Error code:', error?.code);
        console.error('[MEMBERSHIP CTA] Error stack:', error?.stack);
        console.error('[MEMBERSHIP CTA] Full error:', error);
        console.error('[MEMBERSHIP CTA] ========================================');
        
        // Fallback to templates without price IDs
        console.log('[MEMBERSHIP CTA] Falling back to template defaults (no price IDs)');
        setPlans(
          planTemplates.map((t) => ({ ...t, priceId: undefined })),
        );
      } finally {
        setIsLoading(false);
        console.log('[MEMBERSHIP CTA] Fetch complete, loading set to false');
      }
    };

    fetchProducts();
  }, []);

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
      router.push(`/signup?redirect=/`);
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
        description:
          error.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
      setPurchasingPlan(null);
    }
  };

  if (isLoading || isProfileLoading) {
    return (
      <section
        className="py-20 sm:py-28 relative overflow-hidden"
        style={{ backgroundColor: '#000b15' }}
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
          </div>
        </div>
      </section>
    );
  }

  return (
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
            <h2 className="font-headline text-4xl font-bold tracking-tight text-white sm:text-5xl mb-4">
              {hasActiveSub && user
                ? 'Change Your Plan'
                : 'Become a Member Now'}
            </h2>
            <p className="mt-6 text-xl leading-8 text-blue-100">
              {hasActiveSub && user
                ? 'Upgrade or downgrade your subscription to match your needs. Changes take effect immediately.'
                : 'Choose the perfect plan for your maritime career. Start your journey today.'}
            </p>
          </motion.div>
        </div>

        <div className="mx-auto mt-16 grid max-w-lg grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-3">
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
                        !plan.comingSoon && (
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

        {/* Additional CTA Section */}
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
      </div>
    </section>
  );
}
