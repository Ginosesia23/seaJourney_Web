
'use client';

import { useState } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Ship, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const tiers = [
  {
    name: 'Free',
    price: '$0',
    priceSuffix: '/ month',
    description: 'For individuals getting started with tracking their sea time.',
    features: [
      'Basic sea time logging',
      'Log up to 1 vessel',
      'Community support',
    ],
    cta: 'Get Started',
    type: 'crew',
  },
  {
    name: 'Premium',
    price: '$9.99',
    priceSuffix: '/ month',
    description: 'For dedicated professionals who need advanced tracking.',
    features: [
      'Unlimited sea time logging',
      'Digital testimonials',
      'Multi-vessel support',
      'Export documentation',
    ],
    cta: 'Coming Soon',
    highlighted: true,
    type: 'crew',
  },
  {
    name: 'Premium+',
    price: '$19.99',
    priceSuffix: '/ month',
    description: 'For career-focused seafarers needing detailed analytics.',
    features: [
      'All Premium features',
      'Advanced career analytics',
      'Certification progress tracking',
      'Cloud data backup',
    ],
    cta: 'Coming Soon',
    type: 'crew',
  },
  {
    name: 'Professional',
    price: '$49.99',
    priceSuffix: '/ month',
    description: 'For captains and managers overseeing multiple crew members.',
    features: [
      'All Premium+ features',
      'Crew management tools',
      'Fleet-wide reporting',
      'Priority support',
    ],
    cta: 'Coming Soon',
    type: 'crew',
  },
  {
    name: 'Vessel Basic',
    price: '$29.99',
    priceSuffix: '/ month',
    description: 'Essential tracking for a single vessel and its crew.',
    features: [
      'Track up to 5 crew members',
      'Centralized sea time log',
      'Basic reporting',
      'Email support',
    ],
    cta: 'Coming Soon',
    type: 'vessel',
  },
  {
    name: 'Vessel Pro',
    price: '$79.99',
    priceSuffix: '/ month',
    description: 'Comprehensive management for a professional yacht.',
    features: [
      'Track up to 20 crew members',
      'Automated documentation',
      'Advanced compliance reporting',
      'Priority support',
    ],
    cta: 'Coming Soon',
    highlighted: true,
    type: 'vessel',
  },
  {
    name: 'Vessel Fleet',
    price: '$149.99',
    priceSuffix: '/ month',
    description: 'Ideal for managing multiple vessels and larger crews.',
    features: [
      'Track up to 50 crew members',
      'All Vessel Pro features',
      'Fleet-wide analytics',
      'API access for integrations',
    ],
    cta: 'Coming Soon',
    type: 'vessel',
  },
  {
    name: 'Vessel Enterprise',
    price: '$299.99',
    priceSuffix: '/ month',
    description: 'Scalable solution for large fleets and management companies.',
    features: [
      'Track unlimited crew members',
      'All Vessel Fleet features',
      'Dedicated account manager',
      'Custom onboarding & support',
    ],
    cta: 'Coming Soon',
    type: 'vessel',
  },
];


export default function ComingSoonPage() {
  const [planType, setPlanType] = useState('crew');
  const filteredTiers = tiers.filter(tier => tier.type === planType);

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
                We're launching new plans soon. Find the perfect fit for your maritime career and get ready to set sail.
              </p>
            </div>
            
            <div className="mt-10 flex justify-center gap-2 rounded-lg bg-muted p-1.5 max-w-sm mx-auto">
                <Button
                  onClick={() => setPlanType('crew')}
                  variant={planType === 'crew' ? 'default' : 'ghost'}
                  className={cn(
                    "w-full rounded-md", 
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
                    "w-full rounded-md", 
                    planType === 'vessel' && 'bg-primary text-primary-foreground hover:bg-primary/90'
                  )}
                >
                  <Ship className="mr-2 h-5 w-5" />
                  Vessel Plans
                </Button>
              </div>

            <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-4">
              {filteredTiers.map((tier) => (
                <Card key={tier.name} className={`flex flex-col rounded-lg ${tier.highlighted ? 'border-primary ring-2 ring-primary' : ''}`}>
                  <CardHeader className="flex-grow">
                    <CardTitle className="font-headline text-2xl">{tier.name}</CardTitle>
                    <div className="flex items-baseline gap-1">
                       <span className="text-4xl font-bold tracking-tight">{tier.price}</span>
                       <span className="text-sm font-semibold text-muted-foreground">{tier.priceSuffix}</span>
                    </div>
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
                    <Button 
                      className="w-full rounded-lg"
                      variant={tier.highlighted ? 'default' : 'outline'}
                      disabled
                    >
                      {tier.cta}
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
