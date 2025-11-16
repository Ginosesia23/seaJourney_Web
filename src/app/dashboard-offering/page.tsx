
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart2, Ship, Globe, FileText } from 'lucide-react';

const features = [
  {
    icon: <BarChart2 className="h-8 w-8 text-accent" />,
    title: 'Advanced Analytics',
    description: 'Visualize your sea time with interactive charts, track your progress over time, and gain insights into your career trajectory.',
    image: 'https://picsum.photos/seed/dashboard-feature-1/800/600',
    imageHint: 'dashboard analytics chart'
  },
  {
    icon: <Ship className="h-8 w-8 text-accent" />,
    title: 'Vessel Management',
    description: 'Keep a comprehensive log of every vessel you\'ve worked on. Manage details, track time per vessel, and build your complete maritime history.',
    image: 'https://picsum.photos/seed/dashboard-feature-2/800/600',
    imageHint: 'vessel list management'
  },
  {
    icon: <Globe className="h-8 w-8 text-accent" />,
    title: 'Interactive World Map',
    description: 'Chart your voyages on a stunning, interactive hex map. See your global experience come to life and track your passages across the world.',
    image: 'https://picsum.photos/seed/dashboard-feature-3/800/600',
    imageHint: 'world map visualization'
  },
  {
    icon: <FileText className="h-8 w-8 text-accent" />,
    title: 'Effortless Documentation',
    description: 'Generate and export professional sea time reports and signed testimonials, ready for your next certificate application.',
    image: 'https://picsum.photos/seed/dashboard-feature-4/800/600',
    imageHint: 'document export professional'
  },
];

export default function DashboardOfferingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-header text-header-foreground py-20 sm:py-28">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div className="text-center lg:text-left">
                <h1 className="font-headline text-4xl font-bold tracking-tight text-white sm:text-6xl">
                  Your Career Command Center
                </h1>
                <p className="mt-6 text-lg leading-8 text-header-foreground/80">
                  Visualize your sea time, manage your fleet, and chart your course to success with our powerful dashboard for premium members.
                </p>
                <div className="mt-10 flex items-center justify-center gap-4 lg:justify-start">
                  <Button asChild size="lg" className="rounded-full bg-accent hover:bg-accent/90 text-white">
                    <Link href="/signup">Get Started</Link>
                  </Button>
                </div>
              </div>
              <div className="flex justify-center">
                <Image
                  src="/dashboard-preview.png"
                  alt="A preview of the SeaJourney dashboard showing charts and stats."
                  width={600}
                  height={400}
                  className="rounded-xl shadow-2xl"
                  data-ai-hint="dashboard preview charts"
                  priority
                />
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-16 sm:py-24 bg-background text-foreground">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
                All Your Data, Beautifully Organized
              </h2>
              <p className="mt-4 text-lg leading-8 text-foreground/80">
                The SeaJourney dashboard provides everything you need to take control of your maritime career records.
              </p>
            </div>
            <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 sm:grid-cols-2 lg:max-w-none lg:grid-cols-4">
              {features.map((feature) => (
                <Card key={feature.title} className="transform transition-transform duration-300 hover:-translate-y-2 hover:shadow-xl bg-card border-border/50 rounded-2xl">
                  <CardHeader>
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
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

        {/* CTA Section */}
        <section id="cta" className="bg-header text-header-foreground">
            <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-2xl text-center">
                <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">
                    Ready to Take Command?
                </h2>
                <p className="mt-4 text-lg leading-8 text-header-foreground/80">
                    Sign up for a premium account today and unlock instant access to the dashboard.
                </p>
                <div className="mt-10">
                    <Button asChild size="lg" className="rounded-full bg-accent hover:bg-accent/90 text-white">
                        <Link href="/signup">Sign Up Now</Link>
                    </Button>
                </div>
                </div>
            </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}
