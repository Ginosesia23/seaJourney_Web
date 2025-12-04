
'use client';

import { useMemo } from 'react';
import { useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Skeleton } from '../ui/skeleton';
import { UserProfile } from '@/lib/types';

function SubscriptionSkeleton() {
    return (
        <Card className="rounded-xl border shadow-sm">
             <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="space-y-2">
                    <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-4 w-48" />
                    </div>
                    <Skeleton className="h-6 w-20 rounded-xl" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-6 w-32" />
                    </div>
                    <Skeleton className="h-10 w-full rounded-lg" />
                </div>
            </CardContent>
        </Card>
    )
}


export function SubscriptionCard() {
  const { user } = useUser();

  const { data: userProfileRaw, isLoading: isProfileLoading } = useDoc<UserProfile>('users', user?.id);

  // Transform user profile to handle both snake_case (from DB) and camelCase (from types)
  const userProfile = useMemo(() => {
    if (!userProfileRaw) return null;
    
    return {
      ...userProfileRaw,
      subscriptionTier: (userProfileRaw as any).subscription_tier || (userProfileRaw as any).subscriptionTier || 'free',
      subscriptionStatus: (userProfileRaw as any).subscription_status || (userProfileRaw as any).subscriptionStatus || 'inactive',
    } as UserProfile;
  }, [userProfileRaw]);

  if (isProfileLoading) {
    return <SubscriptionSkeleton />;
  }

  const subscriptionStatus = userProfile?.subscriptionStatus || 'inactive';
  const subscriptionTier = userProfile?.subscriptionTier || 'free';
  const nextRenewalDate = null; // This would need to come from Stripe via webhook
  
  // Format subscription tier for display
  const formatTierName = (tier: string) => {
    // Remove common prefixes
    const cleaned = tier.replace(/^(sj_|sea_journey_)/i, '').trim();
    // Capitalize first letter of each word
    return cleaned.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  const displayTier = formatTierName(subscriptionTier);
  const isActive = subscriptionStatus === 'active';
  const isPastDue = subscriptionStatus === 'past-due';
  
  return (
    <Card className="rounded-xl border shadow-sm hover:shadow-md transition-shadow">
        <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">Subscription</CardTitle>
              <CardDescription className="mt-0.5">
                Plan & billing
              </CardDescription>
            </div>
          </div>
                <Badge 
                    className={cn(
              "rounded-xl capitalize text-xs font-medium",
              isActive
                ? 'bg-green-500/20 text-green-700 border-green-500/30 dark:text-green-400' 
                : isPastDue
                ? 'bg-orange-500/20 text-orange-700 border-orange-500/30 dark:text-orange-400'
                : 'bg-muted text-muted-foreground border-border'
                    )}
                >
                    {subscriptionStatus}
                </Badge>
            </div>
        </CardHeader>
        <CardContent>
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Plan</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold text-foreground">
                {displayTier || 'Free'}
              </p>
            </div>
            {nextRenewalDate && isActive && (
                        <p className="text-sm text-muted-foreground">
                            Renews on {format(nextRenewalDate, 'PPP')}
                        </p>
                    )}
            {!isActive && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {isPastDue 
                  ? 'Your subscription payment is past due. Please update your payment method to continue service.'
                  : 'You are currently on the free plan. Upgrade to unlock premium features.'
                }
                        </p>
                    )}
                </div>
          
          <div className="pt-2">
            <Button 
              asChild 
              variant={isActive ? "outline" : "default"} 
              className="w-full rounded-xl" 
              size="default"
            >
              <a href="/offers">
                {isActive ? (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Manage Subscription
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Upgrade Plan
                  </>
                )}
              </a>
                </Button>
          </div>
            </div>
        </CardContent>
    </Card>
  )
}
