import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check } from 'lucide-react';

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
  },
];


export default function ComingSoonPage() {
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

            <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-4">
              {tiers.map((tier) => (
                <Card key={tier.name} className={`flex flex-col ${tier.highlighted ? 'border-primary ring-2 ring-primary' : ''}`}>
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
                      className="w-full"
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
