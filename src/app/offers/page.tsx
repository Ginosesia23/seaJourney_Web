
'use client';

import { useState, useEffect, useRef } from 'react';
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
import { Check, Download, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useUser } from '@/supabase';
import { useDoc } from '@/supabase/database';
import { hasActiveSubscription } from '@/supabase/database/subscription-helpers';
import { useRouter, usePathname } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { getStripeProducts, createCheckoutSession, type StripeProduct } from '@/app/actions';
import type { UserProfile } from '@/lib/types';
import type { Stripe } from 'stripe';


const freeTier = {
  name: 'Mobile App',
  description:
    'Get started with the essential tools to track your sea time on the free version of the app.',
  features: ['Sea time logging', 'Basic PDF exports', 'Digital testimonial requests'],
  cta: 'Download',
  href: 'https://apps.apple.com/gb/app/seajourney/id6751553072',
};


export default function OffersPage() {
  const [isPurchasing, setIsPurchasing] = useState<string | null>(null);
  const [products, setProducts] = useState<StripeProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const redirectingRef = useRef(false);

  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  // Get user profile to check subscription status
  const { data: userProfile, isLoading: isProfileLoading } = useDoc<UserProfile>('users', user?.id);

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

    // Use helper function to check subscription status (handles snake_case from database)
    // Handle null/undefined userProfile gracefully
    const isActive = userProfile ? hasActiveSubscription(userProfile) : false;

    console.log('[OFFERS] Check:', {
      pathname,
      raw_subscription_status: userProfile ? (userProfile as any).subscription_status : null,
      hasActiveSubscription: isActive,
      userProfileKeys: userProfile ? Object.keys(userProfile) : [],
    });

    // Only redirect if subscription is active and we're on offers page
    if (isActive) {
      redirectingRef.current = true;
      console.log('[OFFERS] Redirecting to dashboard - subscription is active');
      router.replace('/dashboard');
    }
  }, [user, userProfile, isUserLoading, isProfileLoading, router, pathname]);

  useEffect(() => {
    // Don't fetch products if user has active subscription (will redirect)
    if (hasActiveSubscription(userProfile)) return;
    
    const fetchProducts = async () => {
      setIsLoadingProducts(true);
      try {
        const stripeProducts = await getStripeProducts();
        console.log('[OFFERS] Fetched Stripe products:', stripeProducts);
        setProducts(stripeProducts || []);
      } catch (error: any) {
        console.error('[OFFERS] Failed to fetch Stripe products:', error);
        setProducts([]); // Set empty array on error
        toast({
          title: 'Error',
          description: 'Could not load subscription plans. Please try again later.',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingProducts(false);
      }
    };
    fetchProducts();
  }, [toast, userProfile]);


  const handlePurchase = async (priceId: string) => {
    if (!user) {
      router.push(`/signup?redirect=/offers`);
      return;
    }
  
    setIsPurchasing(priceId);
  
    try {
      const { sessionId, url } = await createCheckoutSession(priceId, user.id, user.email!);
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
      setIsPurchasing(null);
    }
  };

  const isLoading = isLoadingProducts || isUserLoading || isProfileLoading;
  
  // Show loading state while checking subscription
  if (isUserLoading || isProfileLoading) {
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

  // Don't render offers page if user has active subscription (will redirect)
  // Use helper function to check subscription status (handles null/undefined userProfile)
  const isActive = userProfile ? hasActiveSubscription(userProfile) : false;
  
  // Show loading/redirect state if user has active subscription
  if (user && isActive) {
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
        <section className="py-16 sm:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="font-headline text-4xl font-bold tracking-tight text-primary sm:text-5xl">
                Choose Your Voyage
              </h1>
              <p className="mt-4 text-lg leading-8 text-foreground/80">
                {user?.user_metadata?.username ? `Welcome, ${user.user_metadata.username}! ` : ''}
                Find the perfect fit for your maritime career and get ready to set sail.
              </p>
            </div>

            {/* Cards */}
            <div className="mx-auto mt-16 grid max-w-lg grid-cols-1 justify-center gap-8 lg:max-w-4xl lg:grid-cols-2">
              {isLoading ? (
                // Skeleton loading
                Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="flex flex-col rounded-2xl animate-pulse">
                    <CardHeader className="flex-grow">
                      <div className="h-6 bg-muted rounded w-3/4"></div>
                      <div className="h-10 bg-muted rounded w-1/2 mt-2"></div>
                      <div className="h-4 bg-muted rounded w-full mt-4"></div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="h-4 bg-muted rounded w-full"></div>
                        <div className="h-4 bg-muted rounded w-full"></div>
                        <div className="h-4 bg-muted rounded w-5/6"></div>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <div className="h-12 bg-muted rounded-full w-full"></div>
                    </CardFooter>
                  </Card>
                ))
              ) : (
                <>
                  {/* Free tier card */}
                  <Card className="flex flex-col rounded-2xl bg-primary/5 border-primary/20">
                    <CardHeader className="flex-grow">
                      <CardTitle className="font-headline text-2xl">
                        {freeTier.name}
                      </CardTitle>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold tracking-tight">Free</span>
                      </div>
                      <CardDescription>{freeTier.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-4">
                        {freeTier.features.map((feature) => (
                          <li key={feature} className="flex items-start">
                            <Check className="mr-3 h-5 w-5 flex-shrink-0 text-primary" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter>
                      <Button
                        asChild
                        className="w-full rounded-full"
                        variant="default"
                      >
                        <Link
                          href={freeTier.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Download className="mr-2 h-4 w-4" /> {freeTier.cta}
                        </Link>
                      </Button>
                    </CardFooter>
                  </Card>

                  {products.length === 0 ? (
                    <div className="col-span-full text-center text-muted-foreground">
                      No paid plans are configured in Stripe.
                    </div>
                  ) : (
                    products.map((price) => {
                      // StripeProduct now extends Stripe.Price, so price IS the price object
                      const isProcessing = isPurchasing === price.id;
                      const product = (price.product && typeof price.product === 'object') 
                        ? price.product as Stripe.Product 
                        : null;
                      const tier = price.metadata?.tier || price.nickname || 'Standard';
                      const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
                      
                      // Get tier-specific features based on tier name
                      const getTierFeatures = (tierName: string) => {
                        const lower = tierName.toLowerCase();
                        if (lower.includes('premium')) {
                          return [
                            'Unlimited vessels',
                            'Advanced analytics',
                            'Passage log book',
                            'Bridge watch log',
                            'Priority support',
                          ];
                        } else if (lower.includes('pro') || lower.includes('professional')) {
                          return [
                            'Everything in Premium',
                            'API access',
                            'Custom integrations',
                            'Dedicated support',
                            'Advanced reporting',
                          ];
                        } else {
                          return [
                            'Up to 3 vessels',
                            'Sea time tracking',
                            'Basic analytics',
                            'PDF exports',
                            'Email support',
                          ];
                        }
                      };
                      
                      const features = getTierFeatures(tierName);
                      const amount = (price.unit_amount || 0) / 100;
                      const interval = price.recurring?.interval || 'month';
                      
                      return (
                        <Card
                          key={price.id}
                          className="flex flex-col rounded-2xl"
                        >
                          <CardHeader className="flex-grow">
                            <CardTitle className="font-headline text-2xl">
                              {tierName}
                            </CardTitle>
                            <div className="flex items-baseline gap-1">
                              <span className="text-4xl font-bold tracking-tight">
                                £{amount.toFixed(2)}
                              </span>
                              <span className="text-sm font-semibold text-muted-foreground">
                                  / {interval}
                              </span>
                            </div>
                            <CardDescription>
                              {product?.description || `Subscribe to the ${tierName.toLowerCase()} plan`}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                             <ul className="space-y-4">
                                {features.map((feature, idx) => (
                                    <li key={idx} className="flex items-start">
                                    <Check className="mr-3 h-5 w-5 flex-shrink-0 text-primary" />
                                    <span>{feature}</span>
                                    </li>
                                ))}
                            </ul>
                          </CardContent>
                          <CardFooter>
                            <Button
                              className="w-full rounded-full"
                              variant="outline"
                              disabled={isPurchasing !== null}
                              onClick={() => handlePurchase(price.id)}
                            >
                              {isProcessing && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              )}
                              {isProcessing
                                ? 'Processing...'
                                : isPurchasing
                                ? 'Please wait...'
                                : 'Choose Plan'}
                            </Button>
                          </CardFooter>
                        </Card>
                      );
                    })
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
