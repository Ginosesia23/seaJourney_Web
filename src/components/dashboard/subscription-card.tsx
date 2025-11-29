
'use client';

import { useUser, useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, Loader2 } from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { useRevenueCat } from '../providers/revenue-cat-provider';
import { format } from 'date-fns';
import { Skeleton } from '../ui/skeleton';

function SubscriptionSkeleton() {
    return (
        <Card className="rounded-xl border bg-card dark:shadow-md transition-shadow dark:hover:shadow-lg">
             <CardHeader>
                <div className="flex justify-between items-center">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-6 w-20" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                    <div>
                        <Skeleton className="h-5 w-24 mb-1" />
                        <Skeleton className="h-4 w-40" />
                    </div>
                    <Skeleton className="h-9 w-36 mt-2 sm:mt-0" />
                </div>
            </CardContent>
        </Card>
    )
}


export function SubscriptionCard() {
  const { user } = useUser();
  const firestore = useFirestore();
  const { customerInfo, isReady: isRevenueCatReady } = useRevenueCat();

  const userProfileRef = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, 'users', user.uid, 'profile', user.uid);
  }, [firestore, user?.uid]);

  const { data: userProfile, isLoading: isProfileLoading } = useDoc(userProfileRef);

  const isLoading = isProfileLoading || !isRevenueCatReady;

  if (isLoading) {
    return <SubscriptionSkeleton />;
  }

  const activeEntitlements = customerInfo?.entitlements.active || {};
  const activeEntitlementId = Object.keys(activeEntitlements)[0];
  const activeEntitlement = activeEntitlementId ? activeEntitlements[activeEntitlementId] : null;

  const subscriptionStatus = activeEntitlement ? 'active' : 'inactive';
  const subscriptionTier = activeEntitlementId || userProfile?.subscriptionTier || 'free';
  const nextRenewalDate = activeEntitlement?.expirationDate ? new Date(activeEntitlement.expirationDate) : null;
  
  return (
     <Card className="rounded-xl border bg-card dark:shadow-md transition-shadow dark:hover:shadow-lg">
        <CardHeader>
            <div className="flex justify-between items-center">
                <CardTitle className="text-lg flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-accent" />
                    Subscription
                </CardTitle>
                <Badge 
                    className={cn(
                        subscriptionStatus === 'active' ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-destructive/20 text-destructive-foreground'
                    )}
                >
                    {subscriptionStatus}
                </Badge>
            </div>
        </CardHeader>
        <CardContent>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                <div>
                    <p className="font-semibold text-foreground capitalize">{subscriptionTier.replace(/^(sj_)/, '')}</p>
                    {nextRenewalDate && subscriptionStatus === 'active' && (
                        <p className="text-sm text-muted-foreground">
                            Renews on {format(nextRenewalDate, 'PPP')}
                        </p>
                    )}
                    {subscriptionStatus === 'inactive' && (
                            <p className="text-sm text-muted-foreground">
                            No active plan.
                        </p>
                    )}
                </div>
                <Button asChild variant="outline" size="sm" className="rounded-lg">
                    <a href="/offers">Manage Subscription</a>
                </Button>
            </div>
        </CardContent>
    </Card>
  )
}
