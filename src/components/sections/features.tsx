import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CalendarDays, FileSignature, Award, Ship } from 'lucide-react';

const features = [
  {
    icon: <CalendarDays className="h-8 w-8 text-primary" />,
    title: 'Effortless Sea Time Logging',
    description: 'Quickly log your days at sea, vessel details, and position. Our smart tracker makes it simple and accurate.',
  },
  {
    icon: <FileSignature className="h-8 w-8 text-primary" />,
    title: 'Digital Testimonials',
    description: 'Generate and export professional sea time testimonials. Get them digitally signed by captains and chief engineers.',
  },
  {
    icon: <Award className="h-8 w-8 text-primary" />,
    title: 'Certification Ready',
    description: 'Easily compile and export all necessary documentation for your ticket applications and certificate renewals.',
  },
  {
    icon: <Ship className="h-8 w-8 text-primary" />,
    title: 'Multi-Vessel Support',
    description: 'Manage your sea time across multiple vessels, from superyachts to commercial ships, all in one place.',
  },
];

const Features = () => {
  return (
    <section id="features" className="py-16 sm:py-24 bg-primary/5">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
            The Captain's Choice for Career Progression
          </h2>
          <p className="mt-4 text-lg leading-8 text-foreground/80">
            SeaJourney provides all the tools you need to accurately log your experience and advance your maritime career.
          </p>
        </div>
        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 sm:grid-cols-2 lg:max-w-none lg:grid-cols-4">
          {features.map((feature) => (
            <Card key={feature.title} className="transform transition-transform duration-300 hover:-translate-y-2 hover:shadow-xl bg-card border-border/50">
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
