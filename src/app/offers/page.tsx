
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
import { Check, Ship, User, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import type { Package } from '@revenuecat/purchases-js';
import { Purchases } from '@revenuecat/purchases-js';

const staticTierInfo: Record<
  string,
  {
    name: string;
    description: string;
    features: string[];
    type: 'crew' | 'vessel';
    highlighted?: boolean;
    cta: string;
    href?: string;
  }
> = {
  default: {
    name: 'Mobile App',
    description:
      'Get started with the essential tools to track your sea time on the free version of the app.',
    features: ['Sea time logging', 'Basic PDF exports', 'Digital testimonial requests'],
    cta: 'Download',
    type: 'crew',
    href: 'https://apps.apple.com/gb/app/seajourney/id6751553072',
  },
  sj_starter: {
    name: 'Standard',
    description: 'For dedicated professionals who need advanced tracking.',
    features: [
      'Unlimited sea time logging',
      'Digital testimonials',
      'Up to 2 vessels',
      'Single date state tracking',
      '4GB online storage',
      '10 document export limit',
    ],
    cta: 'Choose Plan',
    type: 'crew',
  },
  premium: {
    name: 'Premium',
    description: 'For career-focused seafarers needing detailed analytics.',
    features: [
      'All Standard features',
      'Unlimited vessels',
      'Advanced career analytics',
      'Certification progress tracking',
      '6GB online storage',
      '20 document export limit',
    ],
    cta: 'Choose Plan',
    highlighted: true,
    type: 'crew',
  },
  pro: {
    name: 'Pro',
    description: 'The ultimate toolkit for maritime professionals.',
    features: [
      'All Premium features',
      'AI Co-pilot for reports',
      'Unlimited document exports',
      '10GB online storage',
      'Priority support',
    ],
    cta: 'Choose Plan',
    type: 'crew',
  },
  vessel_basic: {
    name: 'Vessel Basic',
    description: 'Essential tracking for a single vessel and its crew.',
    features: [
      'Track up to 5 crew members',
      'Centralized sea time log',
      'Basic reporting',
      'Email support',
    ],
    cta: 'Choose Plan',
    type: 'vessel',
  },
  vessel_pro: {
    name: 'Vessel Pro',
    description: 'Comprehensive management for a professional yacht.',
    features: [
      'Track up to 20 crew members',
      'Automated documentation',
      'Advanced compliance reporting',
      'Priority support',
    ],
    cta: 'Choose Plan',
    highlighted: true,
    type: 'vessel',
  },
  vessel_fleet: {
    name: 'Vessel Fleet',
    description: 'Ideal for managing multiple vessels and larger crews.',
    features: [
      'Track up to 50 crew members',
      'All Vessel Pro features',
      'Fleet-wide analytics',
      'API access for integrations',
    ],
    cta: 'Choose Plan',
    type: 'vessel',
  },
  vessel_enterprise: {
    name: 'Vessel Enterprise',
    description: 'Scalable solution for large fleets and management companies.',
    features: [
      'Track unlimited crew members',
      'All Vessel Fleet features',
      'Dedicated account manager',
      'Custom onboarding & support',
    ],
    cta: 'Contact Us',
    type: 'vessel',
  },
};

type TierConfig = (typeof staticTierInfo)[keyof typeof staticTierInfo];

// 🔹 Helper: get the “product” object from a web Package (rcBillingProduct/webBillingProduct)
function getPackageProduct(pkg: Package): any | null {
  const anyPkg = pkg as any;
  return anyPkg.product ?? anyPkg.rcBillingProduct ?? anyPkg.webBillingProduct ?? null;
}

// 🔹 Helper: derive billing period from packageType
function getBillingPeriod(pkg: Package): string {
  switch (pkg.packageType) {
    case '$sj_premium_monthly':
      return 'month';
    default:
      return '';
  }
}

export default function OffersPage() {
  const [isPurchasing, setIsPurchasing] = useState<string | null>(null);

  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { offerings, isReady: isRevenueCatReady } = useRevenueCat();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (offerings) {
      console.log('RC: offerings:', offerings);
    }
  }, [offerings]);

  const handlePurchase = async (pkg: Package) => {
    if (!user || !firestore) {
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

      // NOTE: this assumes entitlementId === product.identifier.
      // If not, create a mapping table from productId → entitlementId.
      const entitlementId = product.identifier;
      const hasEntitlement = customerInfo.entitlements.active[entitlementId];

      if (hasEntitlement) {
        const userProfileRef = doc(firestore, 'users', user.uid, 'profile', user.uid);
        const profileUpdateData = {
          subscriptionTier: entitlementId,
          subscriptionStatus: 'active',
        };

        await setDoc(userProfileRef, profileUpdateData, { merge: true });

        toast({
          title: 'Purchase Successful',
          description: 'Your subscription has been activated!',
        });

        router.push('/dashboard');
      } else {
        throw new Error('Purchase completed, but entitlement not found.');
      }
    } catch (e: any) {
      if (e?.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
        toast({
          title: 'Purchase Cancelled',
          description: 'You have cancelled the purchase.',
        });
      } else if (e instanceof FirestorePermissionError) {
        errorEmitter.emit('permission-error', e);
      } else {
        console.error('Purchase error:', e);
        toast({
          title: 'Purchase Failed',
          description: e?.message || 'An unexpected error occurred.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsPurchasing(null);
    }
  };

  const isLoading = isUserLoading || !isRevenueCatReady;

  const packagesToShow: Package[] = offerings?.current?.availablePackages
    ? offerings.current.availablePackages.filter(pkg => {
        if (!pkg || !pkg.product) {
          return false;
        }
        const tierInfo = staticTierInfo[pkg.product.identifier];
        return tierInfo;
      })
    : [];

  const allTiers: (TierConfig | Package)[] = [staticTierInfo['default'], ...packagesToShow];

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
            <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-4">
              {isLoading ? (
                // Skeleton loading cards
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
              ) : allTiers.length === 0 ? (
                <div className="col-span-full text-center text-muted-foreground">
                  No plans are available right now. Please check back later.
                </div>
              ) : (
                allTiers.map((tier) => {
                  // 🔹 RevenueCat package card
                  if ((tier as Package).identifier && (tier as Package).packageType) {
                    const pkg = tier as Package;
                    const product = getPackageProduct(pkg);
                    if (!product) return null;

                    const productId = product.identifier as string;
                    const tierInfo = staticTierInfo[productId];
                    const isProcessing = isPurchasing === pkg.identifier;
                    const billingPeriod = getBillingPeriod(pkg);

                    return (
                      <Card
                        key={pkg.identifier}
                        className={cn(
                          'flex flex-col rounded-2xl',
                          tierInfo?.highlighted ? 'border-primary ring-2 ring-primary' : '',
                        )}
                      >
                        <CardHeader className="flex-grow">
                          <CardTitle className="font-headline text-2xl">
                            {tierInfo?.name || product.localizedTitle || product.title || 'Premium'}
                          </CardTitle>
                          <div className="flex items-baseline gap-1">
                            <span className="text-4xl font-bold tracking-tight">
                              {product.priceString ||
                                `${product.price} ${product.currencyCode || ''}`}
                            </span>
                            {billingPeriod && (
                              <span className="text-sm font-semibold text-muted-foreground">
                                / {billingPeriod}
                              </span>
                            )}
                          </div>
                          <CardDescription>
                            {tierInfo?.description ||
                              product.localizedDescription ||
                              product.description ||
                              'Unlock SeaJourney premium features.'}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ul className="space-y-4">
                            {(tierInfo?.features || []).map((feature) => (
                              <li key={feature} className="flex items-start">
                                <Check className="mr-3 h-5 w-5 flex-shrink-0 text-primary" />
                                <span>{feature}</span>
                              </li>
                            ))}
                            {!tierInfo && (
                              <li className="text-sm text-muted-foreground break-all">
                                <span className="font-semibold">Product ID:</span> {productId}
                              </li>
                            )}
                          </ul>
                        </CardContent>
                        <CardFooter>
                          <Button
                            className="w-full rounded-full"
                            variant={tierInfo?.highlighted ? 'default' : 'outline'}
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
                              : tierInfo?.cta || 'Choose Plan'}
                          </Button>
                        </CardFooter>
                      </Card>
                    );
                  }

                  // 🔹 Static free app tier card
                  const staticTier = tier as TierConfig;

                  return (
                    <Card
                      key={staticTier.name}
                      className={cn(
                        'flex flex-col rounded-2xl bg-primary/5 border-primary/20',
                      )}
                    >
                      <CardHeader className="flex-grow">
                        <CardTitle className="font-headline text-2xl">
                          {staticTier.name}
                        </CardTitle>
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold tracking-tight">Free</span>
                        </div>
                        <CardDescription>{staticTier.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-4">
                          {staticTier.features.map((feature) => (
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
                          variant={'default'}
                        >
                          <Link
                            href={staticTier.href!}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download className="mr-2 h-4 w-4" /> {staticTier.cta}
                          </Link>
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
