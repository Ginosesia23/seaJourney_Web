
'use client';

import { useState } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { BarChart2, Ship, Globe, FileText, LifeBuoy, Route, Anchor } from 'lucide-react';
import { cn } from '@/lib/utils';
import MainChart from '@/components/dashboard/main-chart';

const features = [
  {
    icon: <BarChart2 className="h-8 w-8 text-accent" />,
    title: 'Advanced Analytics',
    description: 'Visualize your sea time with interactive charts, track your progress over time, and gain insights into your career trajectory.',
    longDescription: 'Go beyond simple day counting. Our advanced analytics break down your sea time by vessel, position, and even the state of the vessel (at sea, in port, etc.). Interactive charts help you visualize your career progression and identify what you need for your next certificate.',
    image: 'https://picsum.photos/seed/dashboard-feature-1/800/600',
    imageHint: 'dashboard analytics chart'
  },
  {
    icon: <Ship className="h-8 w-8 text-accent" />,
    title: 'Vessel Management',
    description: 'Keep a comprehensive log of every vessel you\'ve worked on. Manage details, track time per vessel, and build your complete maritime history.',
    longDescription: 'Your fleet at your fingertips. Add, edit, and manage all the vessels you\'ve worked on. The dashboard gives you a summary of your time on each one, making it easy to recall specific dates and trips for your CV or applications.',
    image: 'https://picsum.photos/seed/dashboard-feature-2/800/600',
    imageHint: 'vessel list management'
  },
  {
    icon: <Globe className="h-8 w-8 text-accent" />,
    title: 'Interactive World Map',
    description: 'Chart your voyages on a stunning, interactive hex map. See your global experience come to life and track your passages across the world.',
    longDescription: 'Watch your career span the globe. Our unique interactive map visualizes all your recorded passages, giving you a stunning and shareable overview of your journey. It\'s not just a logbook; it\'s your story.',
    image: 'https://picsum.photos/seed/dashboard-feature-3/800/600',
    imageHint: 'world map visualization'
  },
  {
    icon: <FileText className="h-8 w-8 text-accent" />,
    title: 'Effortless Documentation',
    description: 'Generate and export professional sea time reports and signed testimonials, ready for your next certificate application.',
    longDescription: 'Paperwork, simplified. Generate professional, ready-to-print sea time reports and testimonials with just a few clicks. Request digital signatures from captains and have all your documents securely stored and accessible anytime.',
    image: 'https://picsum.photos/seed/dashboard-feature-4/800/600',
    imageHint: 'document export professional'
  },
];

const mockChartData = [
    { month: "Jan", seaDays: 20 },
    { month: "Feb", seaDays: 15 },
    { month: "Mar", seaDays: 25 },
    { month: "Apr", seaDays: 22 },
    { month: "May", seaDays: 30 },
    { month: "Jun", seaDays: 18 },
    { month: "Jul", seaDays: 28 },
    { month: "Aug", seaDays: 24 },
    { month: "Sep", seaDays: 19 },
    { month: "Oct", seaDays: 27 },
    { month: "Nov", seaDays: 21 },
    { month: "Dec", seaDays: 26 },
]

export default function DashboardOfferingPage() {
  const [selectedFeature, setSelectedFeature] = useState(features[0]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-header text-header-foreground py-20 sm:py-28">
            <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid lg:grid-cols-2 gap-12 items-center">
                    <div className="text-center lg:text-left">
                        <h1 className="font-headline text-4xl font-bold tracking-tight text-white sm:text-6xl">
                            Your Career Command Center
                        </h1>
                        <p className="mt-6 text-lg leading-8 text-header-foreground/80">
                            Visualize your sea time, manage your fleet, and chart your course to success with our powerful dashboard for premium members.
                        </p>
                        <div className="mt-10 flex items-center justify-center lg:justify-start gap-4">
                            <Button asChild size="lg" className="rounded-full bg-accent hover:bg-accent/90 text-white">
                            <Link href="/signup">Get Started</Link>
                            </Button>
                        </div>
                    </div>
                    <div className="[perspective:2000px]">
                        <div className="bg-card/5 border border-white/10 rounded-2xl p-4 shadow-2xl [transform:rotateX(10deg)_rotateY(-10deg)_rotateZ(-3deg)]">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
                                <Card className="bg-card/20 border-white/10 text-white">
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Total Sea Days</CardTitle>
                                        <Ship className="h-4 w-4 text-muted-foreground" />
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">1,204</div>
                                    </CardContent>
                                </Card>
                                <Card className="bg-card/20 border-white/10 text-white">
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Testimonials</CardTitle>
                                        <LifeBuoy className="h-4 w-4 text-muted-foreground"/>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">12</div>
                                    </CardContent>
                                </Card>
                                 <Card className="bg-card/20 border-white/10 text-white">
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Passages</CardTitle>
                                        <Route className="h-4 w-4 text-muted-foreground"/>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">38</div>
                                    </CardContent>
                                </Card>
                                 <Card className="bg-card/20 border-white/10 text-white">
                                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                        <CardTitle className="text-sm font-medium">Vessels</CardTitle>
                                        <Anchor className="h-4 w-4 text-muted-foreground"/>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">8</div>
                                    </CardContent>
                                </Card>
                            </div>
                            <Card className="bg-card/20 border-white/10 text-white">
                                <CardHeader>
                                    <CardTitle>Sea Day Analytics</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <MainChart data={mockChartData}/>
                                </CardContent>
                            </Card>
                        </div>
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
            <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-none lg:grid-cols-4">
              {features.map((feature) => (
                <button
                  key={feature.title}
                  className="h-full text-left"
                  onClick={() => setSelectedFeature(feature)}
                >
                  <Card
                    className={cn(
                        "flex h-full flex-col transform transition-all duration-300 bg-card border-border/50 rounded-2xl",
                        selectedFeature.title === feature.title
                        ? "ring-2 ring-primary shadow-2xl -translate-y-2"
                        : "hover:shadow-xl hover:-translate-y-1"
                    )}
                    >
                    <CardHeader>
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
                        {feature.icon}
                      </div>
                      <CardTitle className="pt-4 font-headline text-xl">{feature.title}</CardTitle>
                      <CardDescription className="pt-2">{feature.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </button>
              ))}
            </div>

            <div className="mt-16 overflow-hidden rounded-2xl bg-card border">
                <div className="grid grid-cols-1 lg:grid-cols-2 items-center">
                    <div className="p-8 lg:p-12">
                        <h3 className="font-headline text-2xl font-bold text-primary">{selectedFeature.title}</h3>
                        <p className="mt-4 text-foreground/80">{selectedFeature.longDescription}</p>
                    </div>
                    <div className="aspect-video">
                        <Image
                            src={selectedFeature.image}
                            alt={selectedFeature.title}
                            width={800}
                            height={600}
                            className="h-full w-full object-cover"
                            data-ai-hint={selectedFeature.imageHint}
                            key={selectedFeature.title}
                        />
                    </div>
                </div>
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

    