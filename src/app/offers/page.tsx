
'use client';

import { useState, useEffect } from 'react';
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
import {
  useUser,
  useFirestore,
  errorEmitter,
  FirestorePermissionError,
} from '@/firebase';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useRevenueCat } from '@/components/providers/revenue-cat-provider';
import { doc, setDoc } from 'firebase/firestore';
import {
  Purchases,
  ErrorCode,
  PurchasesError,
  type Package,
} from '@revenuecat/purchases-js';

const staticTierInfo: Record<
  string,
  { name: string; description: string; features: string[]; type: 'crew' | 'vessel' }
> = {
  sj_starter: {
    name: 'Starter',
    description: 'For dedicated professionals getting started.',
    features: [
      'Unlimited sea time logging',
      'Digital testimonials',
      'Up to 2 vessels',
      'Single date state tracking',
    ],
    type: 'crew',
  },
  sj_premium: {
    name: 'Premium',
    description: 'For career-focused seafarers needing detailed analytics.',
    features: [
      'All Starter features',
      'Unlimited vessels',
      'Advanced career analytics',
      'Certification progress tracking',
    ],
    type: 'crew',
  },
  sj_pro: {
    name: 'Professional',
    description: 'The ultimate toolkit for maritime professionals.',
    features: [
      'All Premium features',
      'AI Co-pilot for reports',
      'Unlimited document exports',
      'Priority support',
    ],
    type: 'crew',
  },
  sj_vessel_basic: {
    name: 'Vessel Basic',
    description: 'Manage sea time and documents for a small crew.',
    features: ['Up to 5 crew members', 'Centralized sea time logs', 'Bulk testimonial sign-offs'],
    type: 'vessel',
  },
  sj_vessel_fleet: {
    name: 'Vessel Fleet',
    description: 'Comprehensive management for multiple vessels.',
    features: ['Unlimited crew members', 'Multi-vessel dashboard', 'Fleet-wide analytics'],
    type: 'vessel',
  },
};

const freeTier = {
  name: 'Mobile App',
  description:
    'Get started with the essential tools to track your sea time on the free version of the app.',
  features: ['Sea time logging', 'Basic PDF exports', 'Digital testimonial requests'],
  cta: 'Download',
  href: 'https://apps.apple.com/gb/app/seajourney/id6751553072',
};

// 🔹 Get the billing product for a web Package (purchases-js)
function getPackageProduct(pkg: Package): any | null {
  const anyPkg = pkg as any;
  return anyPkg.rcBillingProduct ?? null;
}

// 🔹 Billing period for display (use RC’s built-in packageType values)
function getBillingPeriod(pkg: Package): string {
  switch (pkg.packageType) {
    case 'MONTHLY':
      return 'month';
    case 'ANNUAL':
      return 'year';
    case 'SIX_MONTH':
      return '6 months';
    case 'WEEKLY':
      return 'week';
    default:
      return '';
  }
}

export default function OffersPage() {
  const [isPurchasing, setIsPurchasing] = useState<string | null>(null);

  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { offerings, customerInfo, isReady: isRevenueCatReady } = useRevenueCat();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (isRevenueCatReady && customerInfo?.entitlements && Object.keys(customerInfo.entitlements.active).length > 0) {
      router.push('/dashboard');
    }
  }, [customerInfo, isRevenueCatReady, router]);


  // Log active entitlements = what plan the user is on
  useEffect(() => {
    if (!offerings || !isRevenueCatReady) return;

    const purchases = Purchases.getSharedInstance();
    purchases.getCustomerInfo().then((info) => {
      const active = Object.keys(info.entitlements.active);

      console.log('Active Entitlements:', active);

      if (active.length === 0) {
        console.log('User is on FREE plan');
      } else {
        console.log('User is on plan:', active[0]); // e.g. "sj_premium"
      }
    });
  }, [offerings, isRevenueCatReady]);

  const handlePurchase = async (pkg: Package) => {
    if (!user) {
      router.push(`/signup?redirect=/offers`);
      return;
    }
  
    setIsPurchasing(pkg.identifier);
  
    try {
      const purchases = Purchases.getSharedInstance();
      const { customerInfo } = await purchases.purchasePackage(pkg);
  
      const product = getPackageProduct(pkg);
      if (!product) {
        throw new Error('No product info found on package.');
      }
  
      // 🔹 Look at entitlements actually activated by RevenueCat
      const activeEntitlements = customerInfo.entitlements.active;
      const activeEntitlementIds = Object.keys(activeEntitlements);
  
      console.log('Active entitlements after purchase:', activeEntitlements);
  
      if (activeEntitlementIds.length === 0) {
        throw new Error('Purchase completed, but no active entitlements were found.');
      }
  
      // For now, just take the first active entitlement as the user’s plan
      const entitlementId = activeEntitlementIds[0]; // e.g. "premium"
  
      if (!firestore) {
        throw new Error('Firestore is not initialized.');
      }
  
      const userProfileRef = doc(firestore, 'users', user.uid, 'profile', user.uid);
      const profileUpdateData = {
        subscriptionTier: entitlementId,        // "premium"
        subscriptionStatus: 'active',
        lastProductId: product.identifier,      // e.g. "sj_premium_monthly"
      };
  
      await setDoc(userProfileRef, profileUpdateData, { merge: true });
  
      toast({
        title: 'Purchase Successful',
        description: 'Your subscription has been activated!',
      });
      router.push('/dashboard');
    } catch (e: any) {
      // Firestore permission issue
      if (e instanceof FirestorePermissionError) {
        errorEmitter.emit('permission-error', e);
        return;
      }
  
      // RevenueCat / purchase errors
      if (e instanceof PurchasesError) {
        if (e.code === ErrorCode.purchaseCancelledError) {
          toast({
            title: 'Purchase Cancelled',
            description: 'You have cancelled the purchase.',
          });
          return;
        }
  
        console.error('RevenueCat purchase error:', e);
        toast({
          title: 'Purchase Failed',
          description: e.message ?? 'An unexpected error occurred.',
          variant: 'destructive',
        });
        return;
      }
  
      // Any other unexpected error
      console.error('Purchase error:', e);
      toast({
        title: 'Purchase Failed',
        description: e?.message || 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsPurchasing(null);
    }
  };
  

  const isLoading = isUserLoading || !isRevenueCatReady;

  const packagesToShow: Package[] = offerings?.current?.availablePackages || [];

  // Log what packages we actually got back from RC
  useEffect(() => {
    console.log('RC packagesToShow:', packagesToShow);

    packagesToShow.forEach((pkg) => {
      const product = getPackageProduct(pkg);
      if (product) {
        console.log('Package debug:', {
          pkgIdentifier: pkg.identifier,
          productIdentifier: product.identifier,
          title: product.title,
          price: product.currentPrice?.formattedPrice,
        });
      }
    });
  }, [packagesToShow]);

  if (isLoading || (isRevenueCatReady && customerInfo?.entitlements && Object.keys(customerInfo.entitlements.active).length > 0)) {
     return (
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
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
                {user?.displayName ? `Welcome, ${user.displayName}! ` : ''}
                Find the perfect fit for your maritime career and get ready to set sail.
              </p>
            </div>

            {/* Cards */}
            <div className="mx-auto mt-16 grid max-w-lg grid-cols-1 justify-center gap-8 lg:max-w-none lg:grid-cols-2 lg:w-fit">
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

                  {/* RevenueCat packages */}
                  {packagesToShow.length === 0 ? (
                    <div className="col-span-full text-center text-muted-foreground">
                      No paid plans are configured in RevenueCat for the current offering.
                    </div>
                  ) : (
                    packagesToShow.map((pkg) => {
                      const product = getPackageProduct(pkg);
                      if (!product) return null;
                      
                      const baseIdentifier = Object.keys(staticTierInfo).find(key => product.identifier.startsWith(key));
                      
                      if (!baseIdentifier) {
                        console.warn(`No static info found for product: ${product.identifier}`);
                        return null;
                      }

                      const staticInfo = staticTierInfo[baseIdentifier];

                      const displayName =
                        staticInfo?.name ?? product.title ?? product.identifier;

                      const description =
                        staticInfo?.description ??
                        product.description ??
                        'Premium access to SeaJourney features.';

                      const features = staticInfo?.features ?? [
                        'Full access to premium features',
                      ];

                      const isProcessing = isPurchasing === pkg.identifier;
                      const billingPeriod = getBillingPeriod(pkg);

                      return (
                        <Card
                          key={pkg.identifier}
                          className="flex flex-col rounded-2xl"
                        >
                          <CardHeader className="flex-grow">
                            <CardTitle className="font-headline text-2xl">
                              {displayName}
                            </CardTitle>
                            <div className="flex items-baseline gap-1">
                              <span className="text-4xl font-bold tracking-tight">
                                {product.currentPrice?.formattedPrice ?? '£?'}
                              </span>
                              {billingPeriod && (
                                <span className="text-sm font-semibold text-muted-foreground">
                                  / {billingPeriod}
                                </span>
                              )}
                            </div>
                            <CardDescription>{description}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <ul className="space-y-4">
                              {features.map((feature) => (
                                <li key={feature} className="flex items-start">
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
                              onClick={() => handlePurchase(pkg)}
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
