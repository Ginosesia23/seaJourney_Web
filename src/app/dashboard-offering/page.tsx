
'use client';

import { useState, useEffect, useRef } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { BarChart2, Ship, Globe, FileText, FileDown, CheckCircle, Route, LifeBuoy, Anchor, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import MainChart from '@/components/dashboard/main-chart';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableRow, TableHead, TableHeader } from '@/components/ui/table';

const features = [
  {
    icon: <BarChart2 className="h-8 w-8 text-accent" />,
    title: 'Advanced Analytics',
    description: 'Visualize your sea time with interactive charts, track your progress over time, and gain insights into your career trajectory.',
    component: (
      <Card className="h-full bg-card/80 backdrop-blur-sm border-white/10 text-white flex flex-col shadow-2xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-accent" />
            Advanced Analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-grow flex items-center justify-center">
            <MainChart data={[
                { month: "J", seaDays: 15 }, { month: "F", seaDays: 20 }, { month: "M", seaDays: 25 },
                { month: "A", seaDays: 22 }, { month: "M", seaDays: 30 }, { month: "J", seaDays: 18 }
            ]} />
        </CardContent>
      </Card>
    )
  },
  {
    icon: <Ship className="h-8 w-8 text-accent" />,
    title: 'Vessel Management',
    description: 'Keep a comprehensive log of every vessel you\'ve worked on. Manage details, track time per vessel, and build your complete maritime history.',
    component: (
        <Card className="h-full bg-card/80 backdrop-blur-sm border-white/10 text-white flex flex-col shadow-2xl">
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    <Ship className="h-5 w-5 text-accent" />
                    Vessel Management
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-grow">
                <Table>
                    <TableBody>
                        <TableRow className="border-none hover:bg-white/5">
                            <TableCell className="p-2 font-medium">M/Y Odyssey</TableCell>
                            <TableCell className="p-2 text-right"><Badge variant="secondary">Current</Badge></TableCell>
                        </TableRow>
                        <TableRow className="border-none hover:bg-white/5">
                            <TableCell className="p-2 font-medium">S/Y Wanderer</TableCell>
                            <TableCell className="p-2 text-right"><Badge variant="outline">Past</Badge></TableCell>
                        </TableRow>
                         <TableRow className="border-none hover:bg-white/5">
                            <TableCell className="p-2 font-medium">M/Y Eclipse</TableCell>
                            <TableCell className="p-2 text-right"><Badge variant="outline">Past</Badge></TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
  },
  {
    icon: <Globe className="h-8 w-8 text-accent" />,
    title: 'Interactive World Map',
    description: 'Chart your voyages on a stunning, interactive hex map. See your global experience come to life and track your passages across the world.',
    component: (
        <Card className="h-full bg-card/80 backdrop-blur-sm border-white/10 text-white flex flex-col shadow-2xl">
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="h-5 w-5 text-accent" />
                    Interactive Map
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-grow flex items-center justify-center">
                <Route className="h-16 w-16 text-white/50" />
            </CardContent>
        </Card>
    )
  },
  {
    icon: <FileText className="h-8 w-8 text-accent" />,
    title: 'Effortless Documentation',
    description: 'Generate and export professional sea time reports and signed testimonials, ready for your next certificate application.',
    component: (
        <Card className="h-full bg-card/80 backdrop-blur-sm border-white/10 text-white flex flex-col shadow-2xl">
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-5 w-5 text-accent" />
                    Documentation
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-grow space-y-2">
                <div className="flex items-center justify-between text-sm p-2 rounded-md hover:bg-white/5">
                    <span>Sea Time Report.pdf</span>
                    <FileDown className="h-4 w-4" />
                </div>
                <div className="flex items-center justify-between text-sm p-2 rounded-md hover:bg-white/5">
                    <span>Testimonial_Capt_Smith.pdf</span>
                    <CheckCircle className="h-4 w-4 text-green-400" />
                </div>
            </CardContent>
        </Card>
    )
  },
];

export default function DashboardOfferingPage() {
  const [activeFeatureIndex, setActiveFeatureIndex] = useState(0);
  const featureRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = parseInt(entry.target.getAttribute('data-index') || '0', 10);
            setActiveFeatureIndex(index);
          }
        });
      },
      { rootMargin: '-50% 0px -50% 0px' }
    );

    featureRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => {
      featureRefs.current.forEach((ref) => {
        if (ref) observer.unobserve(ref);
      });
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        {/* Interactive Dummy Dashboard Section */}
        <section className="relative overflow-hidden bg-header text-header-foreground py-20 sm:py-28">
            <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center">
                    <h1 className="font-headline text-4xl font-bold tracking-tight text-white sm:text-6xl">
                        Your Career Command Center
                    </h1>
                    <p className="mt-6 max-w-3xl mx-auto text-lg leading-8 text-header-foreground/80">
                        This is a preview of the powerful dashboard you'll unlock as a premium member. Visualize your sea time, manage your fleet, and chart your course to success.
                    </p>
                </div>
                
                 <div className="mt-16 [perspective:2000px]">
                    <div className="rounded-xl border-4 border-white/10 bg-black/20 p-4 shadow-2xl transition-transform duration-500 hover:[transform:rotateY(-10deg)_scale(1.05)] [transform-style:preserve-3d] [transform:rotateY(-10deg)]">
                       <Image src="/dashboard-preview.png" alt="SeaJourney Dashboard Preview" width={1200} height={800} className="rounded-lg" />
                    </div>
                </div>

                 <div className="mt-16 flex items-center justify-center gap-4">
                    <Button asChild size="lg" className="rounded-full bg-accent hover:bg-accent/90 text-white">
                        <Link href="/signup">Get Started & Unlock Your Dashboard</Link>
                    </Button>
                </div>
            </div>
        </section>

        {/* Interactive Features Section */}
        <section id="features" className="py-16 sm:py-24 bg-header text-header-foreground">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">
                All Your Data, Beautifully Organized
              </h2>
              <p className="mt-4 text-lg leading-8 text-header-foreground/80">
                The SeaJourney dashboard provides everything you need to take control of your maritime career records.
              </p>
            </div>
            
            <div className="mt-20 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-start">
              <div className="lg:sticky lg:top-24">
                <div className="[perspective:2000px] aspect-[4/3]">
                    {features.map((feature, index) => (
                        <div
                            key={feature.title}
                            className={cn(
                                'absolute inset-0 transition-opacity duration-500',
                                activeFeatureIndex === index ? 'opacity-100' : 'opacity-0'
                            )}
                        >
                            <div className={cn(
                                'h-full w-full transition-transform duration-500 [transform-style:preserve-3d]',
                                activeFeatureIndex === index ? '[transform:rotateY(0deg)]' : '[transform:rotateY(-15deg)]'
                            )}>
                                {feature.component}
                            </div>
                        </div>
                    ))}
                </div>
              </div>

              <div className="space-y-24">
                {features.map((feature, index) => (
                   <div
                    key={feature.title}
                    ref={(el) => (featureRefs.current[index] = el)}
                    data-index={index}
                    className="flex flex-col items-start"
                   >
                     <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 mb-4">
                        {feature.icon}
                     </div>
                     <h3 className="font-headline text-2xl font-bold text-white">{feature.title}</h3>
                     <p className="mt-4 text-lg text-header-foreground/80">{feature.description}</p>
                   </div>
                ))}
              </div>
            </div>
          </div>
        </section>


        {/* CTA Section */}
        <section id="cta" className="bg-header text-header-foreground border-t border-white/10">
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
