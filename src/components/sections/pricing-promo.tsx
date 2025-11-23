
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

const plans = [
    {
        name: 'Standard',
        price: '£5.99',
        priceSuffix: '/ month',
        description: 'For dedicated professionals who need advanced tracking.',
        features: [
          'Unlimited sea time logging',
          'Digital testimonials',
          'Up to 2 vessels',
          'Single date state tracking',
        ],
        cta: 'Choose Plan',
        href: '/offers'
    },
    {
        name: 'Premium',
        price: '£9.99',
        priceSuffix: '/ month',
        description: 'For career-focused seafarers needing detailed analytics.',
        features: [
          'All Standard features',
          'Unlimited vessels',
          'Advanced career analytics',
          'Certification progress tracking',
        ],
        cta: 'Choose Plan',
        highlighted: true,
        href: '/offers'
    },
    {
        name: 'Pro',
        price: '£14.99',
        priceSuffix: '/ month',
        description: 'The ultimate toolkit for maritime professionals.',
        features: [
          'All Premium features',
          'AI Co-pilot for reports',
          'Unlimited document exports',
          'Priority support'
        ],
        cta: 'Choose Plan',
        href: '/offers'
    }
];


export default function PricingPromo() {
    return (
        <section id="pricing-promo" className="bg-header text-header-foreground border-y border-primary/10 py-16 sm:py-24">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-2xl text-center">
                    <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">
                        Choose Your Voyage
                    </h2>
                    <p className="mt-4 text-lg leading-8 text-header-foreground/80">
                        Find the perfect fit for your maritime career. All plans come with a 7-day free trial.
                    </p>
                </div>

                <div className="mx-auto mt-16 grid max-w-lg grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-3">
                    {plans.map((plan) => (
                        <Card key={plan.name} className={cn(
                            "flex flex-col rounded-2xl bg-black/20 border-primary/20 backdrop-blur-sm",
                            plan.highlighted ? "border-accent ring-2 ring-accent" : ""
                        )}>
                            <CardHeader className="flex-grow">
                                {plan.highlighted && (
                                    <div className="flex justify-end">
                                        <div className="flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                                            <Star className="h-3 w-3" />
                                            Most Popular
                                        </div>
                                    </div>
                                )}
                                <CardTitle className="font-headline text-2xl text-white">{plan.name}</CardTitle>
                                <div className="flex items-baseline gap-1 text-white">
                                    <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
                                    <span className="text-sm font-semibold text-muted-foreground">{plan.priceSuffix}</span>

                                </div>
                                <CardDescription className="text-header-foreground/80 !mt-4">{plan.description}</CardDescription>
                            </CardHeader>
                            <CardContent className="border-t border-primary/10 pt-6">
                                <ul className="space-y-4 text-sm text-header-foreground/90">
                                    {plan.features.map((feature) => (
                                        <li key={feature} className="flex items-start">
                                            <Check className="mr-3 mt-0.5 h-5 w-5 flex-shrink-0 text-accent" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                            <CardFooter>
                                <Button asChild className="w-full rounded-full" variant={plan.highlighted ? "accent" : "outline"}>
                                    <Link href={plan.href}>{plan.cta}</Link>
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>

                 <div className="mt-16 text-center">
                    <p className="text-lg text-header-foreground/80">Looking for vessel or fleet management?</p>
                    <Button asChild variant="link" className="text-accent text-lg">
                        <Link href="/offers">Explore Vessel Plans &rarr;</Link>
                    </Button>
                </div>
            </div>
        </section>
    );
}