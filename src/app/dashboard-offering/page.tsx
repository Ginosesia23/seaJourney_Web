
'use client';

import { useState } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { BarChart2, Ship, Globe, FileText, ArrowRight, LifeBuoy, Route, Anchor } from 'lucide-react';
import { cn } from '@/lib/utils';
import MainChart from '@/components/dashboard/main-chart';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const features = [
  {
    id: 'analytics',
    icon: BarChart2,
    title: 'Advanced Analytics',
    description: 'Visualize your sea time with interactive charts, track progress, and gain insights into your career.',
    component: (
      <Card className="h-full bg-transparent border-none shadow-none flex flex-col">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-white/80">
            <BarChart2 className="h-5 w-5" />
            Sea Day Analytics
          </CardTitle>
          <CardDescription className="text-white/50">Your sea days logged over the past year.</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow flex items-center justify-center">
            <MainChart data={[
                { month: "Jan", seaDays: 15 }, { month: "Feb", seaDays: 20 }, { month: "Mar", seaDays: 25 },
                { month: "Apr", seaDays: 22 }, { month: "May", seaDays: 30 }, { month: "Jun", seaDays: 18 }
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
                <CardTitle className="text-lg flex items-center gap-2 text-white/80">
                    <Ship className="h-5 w-5" />
                    Vessel Fleet
                </CardTitle>
                <CardDescription className="text-white/50">Your managed vessels and their status.</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
                <Table>
                    <TableHeader>
                        <TableRow className="border-white/10 hover:bg-transparent">
                            <TableHead className="text-white/80">Vessel</TableHead>
                            <TableHead className="text-white/80">Status</TableHead>
                            <TableHead className="text-white/80 text-right">Total Days</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow className="border-white/10 hover:bg-white/5">
                            <TableCell className="font-medium text-white">M/Y Odyssey</TableCell>
                            <TableCell><Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">Current</Badge></TableCell>
                            <TableCell className="text-right text-white">421</TableCell>
                        </TableRow>
                        <TableRow className="border-white/10 hover:bg-white/5">
                            <TableCell className="font-medium text-white">S/Y Wanderer</TableCell>
                            <TableCell><Badge variant="outline" className="border-white/20 text-white/60">Past</Badge></TableCell>
                            <TableCell className="text-right text-white">189</TableCell>
                        </TableRow>
                         <TableRow className="border-white/10 hover:bg-white/5">
                            <TableCell className="font-medium text-white">M/Y Eclipse</TableCell>
                            <TableCell><Badge variant="outline" className="border-white/20 text-white/60">Past</Badge></TableCell>
                            <TableCell className="text-right text-white">256</TableCell>
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
                <Globe className="h-24 w-24 text-primary/50 animate-pulse" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-t-2 border-primary/50 rounded-full animate-spin" style={{animationDuration: '10s'}}></div>
             </div>
             <CardTitle className="text-lg flex items-center gap-2 text-white/80 mt-6">World Map</CardTitle>
             <CardDescription className="text-white/50">Visualize Your Journeys</CardDescription>
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
                <CardTitle className="text-lg flex items-center gap-2 text-white/80">
                    <FileText className="h-5 w-5" />
                    Export Center
                </CardTitle>
                 <CardDescription className="text-white/50">One-click professional documents.</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow space-y-3">
                <div className="flex items-center justify-between text-sm p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer transition-colors">
                    <span className="text-white">Full Sea Time Report.pdf</span>
                    <ArrowRight className="h-4 w-4 text-white/50" />
                </div>
                <div className="flex items-center justify-between text-sm p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer transition-colors">
                    <span className="text-white">Testimonial_Capt_Smith.pdf</span>
                    <ArrowRight className="h-4 w-4 text-white/50" />
                </div>
                 <div className="flex items-center justify-between text-sm p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer transition-colors">
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

  return (
    <div className="flex min-h-screen flex-col bg-header">
      <Header />
      <main className="flex-1">
        
        {/* Interactive Showcase Section */}
        <section className="relative overflow-hidden bg-header text-header-foreground py-20 sm:py-28">
            <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(to_bottom,white_10%,transparent_70%)]"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-black/20 via-transparent to-primary/20"></div>

            <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center">
                    <h1 className="font-headline text-4xl font-bold tracking-tight text-white sm:text-6xl">
                        Your Career Command Center
                    </h1>
                    <p className="mt-6 max-w-2xl mx-auto text-lg leading-8 text-header-foreground/80">
                        This is more than a logbook; it's a powerful toolkit to navigate your maritime career. Select a feature to see it in action.
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
                                        "w-full relative text-left p-4 rounded-xl transition-all duration-300 border overflow-hidden group",
                                        isActive 
                                            ? "bg-primary/30 border-primary/50 ring-2 ring-primary" 
                                            : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                                    )}
                                >
                                    <div className="absolute top-0 left-0 h-full w-1 bg-primary/70 transition-all duration-300 scale-y-0 group-hover:scale-y-100 origin-bottom"></div>
                                    <div className={cn("absolute top-0 left-0 h-px w-full bg-gradient-to-r from-primary/50 via-primary/30 to-transparent transition-transform duration-500 -translate-x-full group-hover:translate-x-0", isActive && 'translate-x-0')}></div>
                                    
                                    <div className="flex items-center gap-4">
                                        <div className={cn(
                                            "flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-lg transition-colors",
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
                            "relative aspect-[4/3] w-full rounded-2xl border-2 border-primary/30 bg-black/50 p-4 shadow-2xl shadow-primary/10 backdrop-blur-sm",
                            "transition-transform duration-500 [transform-style:preserve-3d] [transform:rotateY(-10deg)]"
                        )}>
                            <div className="absolute -inset-px rounded-2xl border-2 border-primary/50 opacity-20 animate-pulse"></div>
                             
                             {features.map(feature => (
                                <div key={feature.id} className={cn(
                                    "absolute inset-4 transition-opacity duration-500",
                                    activeFeature === feature.id ? 'opacity-100' : 'opacity-0'
                                )}>
                                    {feature.component}
                                </div>
                             ))}
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
