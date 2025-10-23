import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Sparkles, MapPin, Compass, ShieldCheck } from 'lucide-react';

const features = [
  {
    icon: <Sparkles className="h-8 w-8 text-accent" />,
    title: 'AI Itinerary Planner',
    description: 'Our intelligent AI crafts personalized travel plans based on your interests, duration, and destination.',
  },
  {
    icon: <MapPin className="h-8 w-8 text-accent" />,
    title: 'Hidden Gem Finder',
    description: 'Discover local secrets and off-the-beaten-path locations that you won\'t find in typical guidebooks.',
  },
  {
    icon: <Compass className="h-8 w-8 text-accent" />,
    title: 'Offline Maps & Guides',
    description: 'Access your maps, itineraries, and travel guides even without an internet connection.',
  },
  {
    icon: <ShieldCheck className="h-8 w-8 text-accent" />,
    title: 'Travel Safety Tips',
    description: 'Stay informed with real-time safety alerts and localized travel advice for your destination.',
  },
];

const Features = () => {
  return (
    <section id="features" className="py-16 sm:py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
            Everything You Need for a Perfect Journey
          </h2>
          <p className="mt-4 text-lg leading-8 text-foreground/80">
            SeaJourney is packed with powerful features to make your travel seamless and unforgettable.
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 sm:grid-cols-2 lg:max-w-none lg:grid-cols-4">
          {features.map((feature) => (
            <Card key={feature.title} className="transform transition-transform duration-300 hover:-translate-y-2 hover:shadow-xl">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  {feature.icon}
                </div>
                <CardTitle className="pt-4 font-headline text-xl">{feature.title}</CardTitle>
                <CardDescription className="pt-2">{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
