
'use client';

import { useState } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Ship, User, Download, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useRevenueCat } from '@/components/providers/revenue-cat-provider';
import type { PurchasesPackage } from '@revenuecat/purchases-js';

const tiers = [
  {
    name: 'Free',
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
    identifier: 'standard',
    price: '£9.99',
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
    highlighted: true,
    type: 'crew',
  },
  {
    name: 'Premium',
    identifier: 'premium',
    price: '£19.99',
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
    type: 'crew',
  },
  {
    name: 'Premium+',
    identifier: 'premium_plus',
    price: '£49.99',
    priceSuffix: '/ month',
    description: 'For captains and managers overseeing multiple crew members.',
    features: [
      'All Premium features',
      'Multi-date state tracking',
      'Crew management tools',
      'Fleet-wide reporting',
      'Unlimited online storage',
      'Unlimited document exports'
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
  const { offerings, purchasePackage } = useRevenueCat();

  const filteredTiers = tiers.filter(tier => tier.type === planType);
  
  const handlePurchase = async (pkg: PurchasesPackage | null) => {
    if (!pkg) return;
    setIsPurchasing(pkg.identifier);
    try {
      await purchasePackage(pkg);
    } finally {
      setIsPurchasing(null);
    }
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
                const offering = offerings?.all[tier.identifier || ''];
                const pkg = offering?.availablePackages[0];
                const isProcessing = isPurchasing === pkg?.identifier;
                
                return (
                    <Card key={tier.name} className={cn(
                        "flex flex-col rounded-2xl",
                        tier.name === 'Free' ? 'bg-primary/5 border-primary/20' : '',
                        tier.highlighted ? 'border-primary ring-2 ring-primary' : ''
                    )}>
                    <CardHeader className="flex-grow">
                        {tier.name === 'Free' ? (
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 mb-4">
                                <Download className="h-6 w-6 text-accent"/>
                            </div>
                        ) : (
                            <>
                                <CardTitle className="font-headline text-2xl">{tier.name}</CardTitle>
                                <div className="flex items-baseline gap-1">
                                <span className="text-4xl font-bold tracking-tight">{pkg?.product.priceString || tier.price}</span>
                                <span className="text-sm font-semibold text-muted-foreground">{tier.priceSuffix}</span>
                                </div>
                            </>
                        )}
                        <CardDescription>{tier.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ul className="space-y-4">
                        {tier.features.map((feature) => (
                            <li key={feature} className="flex items-start">
                            <Check className="mr-3 h-5 w-5 flex-shrink-0 text-primary" />
                            <span>{feature}</span>
                            </li>
                        ))}
                        </ul>
                    </CardContent>
                    <CardFooter>
                        {tier.href ? (
                            <Button asChild className="w-full rounded-full" variant={tier.name === 'Free' ? 'default' : (tier.highlighted ? 'default' : 'outline')}>
                                <Link href={tier.href} target="_blank" rel="noopener noreferrer">
                                    <Download className="mr-2 h-4 w-4" /> {tier.cta}
                                </Link>
                            </Button>
                        ) : (
                            <Button 
                                className="w-full rounded-full"
                                variant={tier.highlighted ? 'default' : 'outline'}
                                disabled={isProcessing || !pkg}
                                onClick={() => handlePurchase(pkg || null)}
                            >
                                {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {tier.cta}
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
