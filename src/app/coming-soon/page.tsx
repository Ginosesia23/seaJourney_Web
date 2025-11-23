
'use client';

import { useState } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Ship, User, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useUser } from '@/firebase';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useRevenueCat } from '@/components/providers/revenue-cat-provider';
import { purchaseSubscriptionPackage } from '@/app/actions';


const tiers = [
  {
    name: 'Mobile App',
    price: '£0',
    priceSuffix: '',
    description: 'Get started with the essential tools to track your sea time on the free version of the app.',
    features: [
      'Sea time logging',
      'Basic PDF exports',
      'Digital testimonial requests',
    ],
    cta: 'Download',
    type: 'crew',
    href: 'https://apps.apple.com/gb/app/seajourney/id6751553072'
  },
  {
    name: 'Standard',
    identifier: 'sj_starter',
    price: '£5.99',
    priceSuffix: '/ month',
    description: 'For dedicated professionals who need advanced tracking.',
    features: [
      'Unlimited sea time logging',
      'Digital testimonials',
      'Up to 2 vessels',
      'Single date state tracking',
      '4GB online storage',
      '10 document export limit'
    ],
    cta: 'Choose Plan',
    type: 'crew',
  },
  {
    name: 'Premium',
    identifier: 'premium',
    price: '£9.99',
    priceSuffix: '/ month',
    description: 'For career-focused seafarers needing detailed analytics.',
    features: [
      'All Standard features',
      'Unlimited vessels',
      'Advanced career analytics',
      'Certification progress tracking',
      '6GB online storage',
      '20 document export limit'
    ],
    cta: 'Choose Plan',
    highlighted: true,
    type: 'crew',
  },
  {
    name: 'Pro',
    identifier: 'pro',
    price: '£14.99',
    priceSuffix: '/ month',
    description: 'The ultimate toolkit for maritime professionals.',
    features: [
      'All Premium features',
      'AI Co-pilot for reports',
      'Unlimited document exports',
      '10GB online storage',
      'Priority support'
    ],
    cta: 'Choose Plan',
    type: 'crew',
  },
  {
    name: 'Vessel Basic',
    identifier: 'vessel_basic',
    price: '£299.99',
    priceSuffix: '/ month',
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
  {
    name: 'Vessel Pro',
    identifier: 'vessel_pro',
    price: '£599.99',
    priceSuffix: '/ month',
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
  {
    name: 'Vessel Fleet',
    identifier: 'vessel_fleet',
    price: '£1199.99',
    priceSuffix: '/ month',
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
  {
    name: 'Vessel Enterprise',
    identifier: 'vessel_enterprise',
    price: 'Custom',
    priceSuffix: '',
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
];


export default function ComingSoonPage() {
  const [planType, setPlanType] = useState('crew');
  const [isPurchasing, setIsPurchasing] = useState<string | null>(null);
  const { user, isUserLoading } = useUser();
  const { offerings, isReady } = useRevenueCat();
  const router = useRouter();
  const { toast } = useToast();

  const filteredTiers = tiers.filter(tier => tier.type === planType);
  
  const handlePurchase = async (tierIdentifier: string | undefined) => {
    if (!user) {
      router.push(`/signup?redirect=/coming-soon`);
      return;
    }
    
    if (!tierIdentifier || !offerings || !offerings.all[tierIdentifier]) {
        toast({
            title: "Error",
            description: "Subscription package not found.",
            variant: "destructive",
        });
        return;
    };

    const offering = offerings.all[tierIdentifier];
    const pkg = offering?.availablePackages[0];

    if (!pkg) {
        toast({
            title: "Error",
            description: "Subscription offering not available. Please try again later.",
            variant: "destructive",
        });
        return;
    }

    setIsPurchasing(tierIdentifier);
    
    try {
      // The entitlement identifier is the same as the offering identifier
      const result = await purchaseSubscriptionPackage(tierIdentifier, user.uid);
      
      if (result.success) {
        toast({
          title: "Purchase Successful",
          description: "Your subscription has been activated!",
        });
        router.push('/dashboard');
      } else {
        throw new Error(result.error || 'An unexpected error occurred.');
      }
      
    } catch (e: any) {
        console.error("Purchase process failed.", e);
        toast({
            title: "Purchase Failed",
            description: e.message || "An unexpected error occurred during purchase.",
            variant: 'destructive',
        });
    } finally {
      setIsPurchasing(null);
    }
  }
  
  const isLoading = isUserLoading || !isReady;

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
                Find the perfect fit for your maritime career and get ready to set sail.
              </p>
            </div>
            
            <div className="mt-10 flex justify-center gap-2 rounded-full bg-muted p-1.5 max-w-sm mx-auto">
                <Button
                  onClick={() => setPlanType('crew')}
                  variant={planType === 'crew' ? 'default' : 'ghost'}
                  className={cn(
                    "w-full rounded-full", 
                    planType === 'crew' && 'bg-primary text-primary-foreground hover:bg-primary/90'
                  )}
                >
                  <User className="mr-2 h-5 w-5" />
                  Crew Plans
                </Button>
                <Button
                  onClick={() => setPlanType('vessel')}
                  variant={planType === 'vessel' ? 'default' : 'ghost'}
                  className={cn(
                    "w-full rounded-full", 
                    planType === 'vessel' && 'bg-primary text-primary-foreground hover:bg-primary/90'
                  )}
                >
                  <Ship className="mr-2 h-5 w-5" />
                  Vessel Plans
                </Button>
              </div>

            <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-4">
              {filteredTiers.map((tier) => {
                const isProcessing = isPurchasing === tier.identifier;
                
                let price = tier.price;
                let tierDescription = tier.description;
                let features = tier.features;

                if (tier.identifier && offerings && offerings.all && offerings.all[tier.identifier]) {
                    const tierOffering = offerings.all[tier.identifier];
                    if (tierOffering) {
                        const monthlyPackage = tierOffering.availablePackages.find(p => p.packageType === 'MONTHLY' || p.packageType === 'ANNUAL');
                        if (monthlyPackage) {
                            price = monthlyPackage.product.priceString;
                        }
                        tierDescription = tierOffering.serverDescription;
                        const metadataFeatures = (tierOffering.metadata as any)?.features;
                        if (metadataFeatures && Array.isArray(metadataFeatures)) {
                           features = metadataFeatures.map(String);
                        }
                    }
                }

                return (
                    <Card key={tier.name} className={cn(
                        "flex flex-col rounded-2xl",
                        tier.name === 'Mobile App' ? 'bg-primary/5 border-primary/20' : '',
                        tier.highlighted ? 'border-primary ring-2 ring-primary' : ''
                    )}>
                    <CardHeader className="flex-grow">
                        {tier.name === 'Mobile App' ? (
                            <>
                               <CardTitle className="font-headline text-2xl">{tier.name}</CardTitle>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-4xl font-bold tracking-tight">Free</span>
                                </div>
                            </>
                        ) : (
                            <>
                                <CardTitle className="font-headline text-2xl">{tier.name}</CardTitle>
                                <div className="flex items-baseline gap-1">
                                <span className="text-4xl font-bold tracking-tight">{price}</span>
                                <span className="text-sm font-semibold text-muted-foreground">{tier.priceSuffix}</span>
                                </div>
                            </>
                        )}
                        <CardDescription>{tierDescription}</CardDescription>
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
                        {tier.href ? (
                            <Button asChild className="w-full rounded-full" variant={tier.name === 'Mobile App' ? 'default' : (tier.highlighted ? 'default' : 'outline')}>
                                <Link href={tier.href} target="_blank" rel="noopener noreferrer">
                                    <Download className="mr-2 h-4 w-4" /> {tier.cta}
                                </Link>
                            </Button>
                        ) : tier.identifier === 'vessel_enterprise' ? (
                             <Button className="w-full rounded-full" variant={tier.highlighted ? 'default' : 'outline'}>
                                <Link href="mailto:support@seajourney.com">
                                    {tier.cta}
                                </Link>
                            </Button>
                        ) : (
                            <Button 
                                className="w-full rounded-full"
                                variant={tier.highlighted ? 'default' : 'outline'}
                                disabled={isLoading || isProcessing}
                                onClick={() => handlePurchase(tier.identifier)}
                            >
                                {(isLoading || isProcessing) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isProcessing ? 'Processing...' : (isLoading ? 'Loading...' : (user ? tier.cta : 'Sign Up to Subscribe'))}
                            </Button>
                        )}
                    </CardFooter>
                    </Card>
                )
              })}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

    