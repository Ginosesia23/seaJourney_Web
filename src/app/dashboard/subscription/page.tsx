'use client';

import { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { useToast } from '@/hooks/use-toast';
import type { UserProfile } from '@/lib/types';
import { format } from 'date-fns';
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

interface Plan {
  name: string;
  price: string;
  priceSuffix: string;
  description: string;
  features: string[];
  icon: typeof Shield;
  color: 'blue' | 'purple' | 'orange';
  highlighted?: boolean;
  priceId?: string;
  comingSoon?: boolean;
  availableDate?: string;
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
    ],
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
      'Visa tracker',
      'Direct MCA submissions & approvals',
    ],
    icon: TrendingUp,
    color: 'orange',
    comingSoon: true,
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

  const { user } = useUser();
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

  // Fetch subscription data and plans via API
  useEffect(() => {
    const fetchData = async () => {
      if (!user?.email) return;

      try {
        setIsLoading(true);

        const res = await fetch(
          `/api/billing?email=${encodeURIComponent(user.email)}`,
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
        }: {
          subscriptionData: StripeSubscriptionData | null;
          stripePrices: StripePrice[];
        } = await res.json();

        setStripeSubscription(subscriptionData || null);

        const getTemplateTierKey = (templateName: string) => {
          const lower = templateName.toLowerCase();
          if (lower === 'pro') return 'professional';
          return lower;
        };

        const mappedPlans: Plan[] = planTemplates.map((template) => {
          const templateTier = getTemplateTierKey(template.name);

          const matchingPrice = stripePrices.find((price: StripePrice) => {
            const priceTier = (
              price.metadata?.tier || price.nickname || ''
            )
              .toString()
              .toLowerCase();

            return (
              priceTier === templateTier ||
              priceTier.includes(templateTier) ||
              templateTier.includes(priceTier)
            );
          });

          if (matchingPrice) {
            const amount = (matchingPrice.unit_amount ?? 0) / 100;
            const interval =
              matchingPrice.recurring?.interval?.toString() || 'month';

            return {
              ...template,
              price: `£${amount.toFixed(2)}`,
              priceSuffix: `/${interval}`,
              priceId: matchingPrice.id,
            };
          }

          return {
            ...template,
            priceId: undefined,
          };
        });

        setPlans(mappedPlans);
      } catch (error: any) {
        console.error('Failed to fetch subscription data:', error);
        toast({
          title: 'Error',
          description:
            error.message ||
            'Failed to load subscription information. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user?.email, toast]);

  const handleChangePlan = async (plan: Plan) => {
    if (!plan.priceId || !stripeSubscription?.subscription) {
      toast({
        title: 'Error',
        description: 'Unable to change plan. Please try again later.',
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
      
      // Refresh subscription data
      if (user?.email) {
        const refreshed = await fetch(
          `/api/billing?email=${encodeURIComponent(user.email)}`,
        );
        if (refreshed.ok) {
          const { subscriptionData }: { subscriptionData: StripeSubscriptionData | null } =
            await refreshed.json();
          setStripeSubscription(subscriptionData || null);
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

      // Refresh subscription data
      if (user?.email) {
        const refreshed = await fetch(
          `/api/billing?email=${encodeURIComponent(user.email)}`,
        );
        if (refreshed.ok) {
          const { subscriptionData }: { subscriptionData: StripeSubscriptionData | null } =
            await refreshed.json();
          setStripeSubscription(subscriptionData || null);
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
    if (!stripeSubscription?.subscription) {
      toast({
        title: 'Error',
        description: 'Unable to resume subscription. Please contact support.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const res = await fetch('/api/billing/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: stripeSubscription.subscription.id,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to resume subscription.');
      }

      toast({
        title: 'Subscription Resumed',
        description: 'Your subscription has been resumed.',
      });

      // Refresh subscription data
      if (user?.email) {
        const refreshed = await fetch(
          `/api/billing?email=${encodeURIComponent(user.email)}`,
        );
        if (refreshed.ok) {
          const { subscriptionData }: { subscriptionData: StripeSubscriptionData | null } =
            await refreshed.json();
          setStripeSubscription(subscriptionData || null);
        }
      }

      router.refresh();
    } catch (error: any) {
      console.error('Failed to resume subscription:', error);
      toast({
        title: 'Resume Failed',
        description:
          error.message ||
          'Failed to resume subscription. Please contact support.',
        variant: 'destructive',
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
  const isCancelled =
    subscription?.cancel_at_period_end || subscription?.status === 'canceled';
  const currentPeriodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;

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
              {isCancelled
                ? 'Your subscription is scheduled to cancel at the end of the billing period.'
                : 'Your active subscription details'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Plan</p>
                <p className="text-sm text-muted-foreground">{currentTier}</p>
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
                  {isCancelled
                    ? 'Cancelling'
                    : subscription.status.charAt(0).toUpperCase() +
                      subscription.status.slice(1)}
                </Badge>
              </div>
            </div>

            {currentPeriodEnd && (
              <div>
                <p className="font-medium">
                  {isCancelled ? 'Cancels on' : 'Next billing date'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(currentPeriodEnd, 'PPP')}
                </p>
              </div>
            )}

            {isCancelled && currentPeriodEnd && (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                    Subscription Cancelled
                  </p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300">
                    You will retain access until {format(currentPeriodEnd, 'PPP')}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResumeSubscription}
                  className="rounded-xl"
                >
                  Resume Subscription
                </Button>
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
                      {isHighlighted && !isCurrent && !plan.comingSoon && (
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
                        <li key={idx} className="flex items-start gap-3">
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
