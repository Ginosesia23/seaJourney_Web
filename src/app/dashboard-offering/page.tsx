
'use client';

import { useState } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { BarChart2, Ship, Globe, FileText, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import MainChart from '@/components/dashboard/main-chart';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';

const features = [
  {
    id: 'analytics',
    icon: BarChart2,
    title: 'Advanced Analytics',
    description: 'Visualize your sea time with interactive charts, track progress, and gain insights into your career.',
    component: (
      <Card className="h-full bg-transparent border-none shadow-none flex flex-col">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-white/80">
            <BarChart2 className="h-5 w-5" />
            Sea Day Analytics
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
    id: 'vessels',
    icon: Ship,
    title: 'Vessel Management',
    description: 'Keep a comprehensive log of every vessel you\'ve worked on and build your complete maritime history.',
     component: (
        <Card className="h-full bg-transparent border-none shadow-none flex flex-col">
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-white/80">
                    <Ship className="h-5 w-5" />
                    Vessel Fleet
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-grow">
                <Table>
                    <TableBody>
                        <TableRow className="border-none hover:bg-white/5">
                            <TableCell className="p-2 font-medium text-white">M/Y Odyssey</TableCell>
                            <TableCell className="p-2 text-right"><Badge variant="secondary">Current</Badge></TableCell>
                        </TableRow>
                        <TableRow className="border-none hover:bg-white/5">
                            <TableCell className="p-2 font-medium text-white">S/Y Wanderer</TableCell>
                            <TableCell className="p-2 text-right"><Badge variant="outline">Past</Badge></TableCell>
                        </TableRow>
                         <TableRow className="border-none hover:bg-white/5">
                            <TableCell className="p-2 font-medium text-white">M/Y Eclipse</TableCell>
                            <TableCell className="p-2 text-right"><Badge variant="outline">Past</Badge></TableCell>
                        </TableRow>
                         <TableRow className="border-none hover:bg-white/5">
                            <TableCell className="p-2 font-medium text-white">Catamaran Zenith</TableCell>
                            <TableCell className="p-2 text-right"><Badge variant="outline">Past</Badge></TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    )
  },
  {
    id: 'map',
    icon: Globe,
    title: 'Interactive World Map',
    description: 'Chart your voyages on a stunning hex map and see your global experience come to life.',
    component: (
        <Card className="h-full bg-transparent border-none shadow-none flex flex-col items-center justify-center">
             <div className="w-48 h-48 rounded-full bg-primary/10 flex items-center justify-center relative overflow-hidden">
                <Globe className="h-24 w-24 text-primary/50" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-t-2 border-primary/50 animate-spin" style={{animationDuration: '10s'}}></div>
             </div>
        </Card>
    )
  },
  {
    id: 'docs',
    icon: FileText,
    title: 'Effortless Documentation',
    description: 'Generate professional sea time reports and signed testimonials, ready for certificate applications.',
    component: (
        <Card className="h-full bg-transparent border-none shadow-none flex flex-col">
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-white/80">
                    <FileText className="h-5 w-5" />
                    Export Center
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-grow space-y-3">
                <div className="flex items-center justify-between text-sm p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer">
                    <span className="text-white">Full Sea Time Report.pdf</span>
                    <ArrowRight className="h-4 w-4 text-white/50" />
                </div>
                <div className="flex items-center justify-between text-sm p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer">
                    <span className="text-white">Testimonial_Capt_Smith.pdf</span>
                    <ArrowRight className="h-4 w-4 text-white/50" />
                </div>
                 <div className="flex items-center justify-between text-sm p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer">
                    <span className="text-white">Career_Summary.pdf</span>
                    <ArrowRight className="h-4 w-4 text-white/50" />
                </div>
            </CardContent>
        </Card>
    )
  },
];

export default function DashboardOfferingPage() {
    const [activeFeature, setActiveFeature] = useState(features[0].id);
    const ActiveComponent = features.find(f => f.id === activeFeature)?.component;

  return (
    <div className="flex min-h-screen flex-col bg-header">
      <Header />
      <main className="flex-1">
        
        {/* Interactive Showcase Section */}
        <section className="relative overflow-hidden bg-header text-header-foreground py-20 sm:py-28">
            <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(to_bottom,white_10%,transparent_70%)]"></div>

            <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center lg:text-left">
                    <h1 className="font-headline text-4xl font-bold tracking-tight text-white sm:text-6xl">
                        Your Career Command Center
                    </h1>
                    <p className="mt-6 max-w-2xl mx-auto lg:mx-0 text-lg leading-8 text-header-foreground/80">
                        This is a preview of the powerful dashboard you'll unlock. Select a feature to see it in action.
                    </p>
                </div>

                <div className="mt-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Left: Feature Selector */}
                    <div className="lg:col-span-4 space-y-4">
                        {features.map((feature) => {
                            const Icon = feature.icon;
                            const isActive = activeFeature === feature.id;
                            return (
                                <button
                                    key={feature.id}
                                    onClick={() => setActiveFeature(feature.id)}
                                    className={cn(
                                        "w-full text-left p-4 rounded-xl transition-all duration-300 border",
                                        isActive 
                                            ? "bg-primary/30 border-primary/50 ring-2 ring-primary" 
                                            : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                                    )}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={cn(
                                            "flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-lg",
                                            isActive ? "bg-primary/80" : "bg-white/10"
                                        )}>
                                            <Icon className={cn("h-5 w-5", isActive ? "text-white" : "text-white/70")} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-white">{feature.title}</h3>
                                            <p className="text-sm text-white/60">{feature.description}</p>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Right: Dashboard Preview */}
                    <div className="lg:col-span-8 [perspective:2000px]">
                        <div className={cn(
                            "relative aspect-[4/3] w-full rounded-2xl border-2 border-primary/30 bg-black/30 p-4 shadow-2xl backdrop-blur-sm",
                            "transition-transform duration-500 [transform-style:preserve-3d] [transform:rotateY(-10deg)]"
                        )}>
                            <div className="absolute -inset-px rounded-2xl border-2 border-primary/50 opacity-20 animate-pulse"></div>
                             {ActiveComponent}
                        </div>
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
                    Sign up for a premium account today and unlock instant access to the full dashboard.
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
       <style jsx global>{`
        .bg-grid-white\\/5 {
          background-image:
            linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px);
          background-size: 40px 40px;
        }
      `}</style>
    </div>
  );
}

