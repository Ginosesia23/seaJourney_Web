
'use client';

import { useState } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { BarChart2, Ship, Globe, FileText, ArrowRight, LifeBuoy, Route, Anchor, CheckCircle, Fingerprint, UserPlus, Search, Code, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import MainChart from '@/components/dashboard/main-chart';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const features = [
  {
    id: 'analytics',
    icon: BarChart2,
    title: 'Analytics',
    description: 'Visualize your career trajectory.',
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
                { month: "Apr", seaDays: 22 }, { month: "May", seaDays: 30 }, { month: "Jun", seaDays: 18 },
                 { month: "Jul", seaDays: 28 }, { month: "Aug", seaDays: 24 }, { month: "Sep", seaDays: 19 },
                  { month: "Oct", seaDays: 27 }, { month: "Nov", seaDays: 23 }, { month: "Dec", seaDays: 31 }
            ]} />
        </CardContent>
      </Card>
    )
  },
  {
    id: 'vessels',
    icon: Ship,
    title: 'Vessels',
    description: 'Manage your entire fleet.',
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
                         <TableRow className="border-white/10 hover:bg-white/5">
                            <TableCell className="font-medium text-white">Catamaran Ceta</TableCell>
                             <TableCell><Badge variant="outline" className="border-white/20 text-white/60">Past</Badge></TableCell>
                            <TableCell className="text-right text-white">88</TableCell>
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
    title: 'World Map',
    description: 'Chart your global experience.',
    component: (
        <Card className="h-full bg-transparent border-none shadow-none flex flex-col items-center justify-center">
             <div className="w-64 h-64 rounded-full bg-primary/5 flex items-center justify-center relative overflow-hidden">
                <Globe className="h-32 w-32 text-primary/30" />
                <div className="absolute inset-0 bg-grid-white/5 [mask-image:radial-gradient(ellipse_at_center,white_20%,transparent_80%)]"></div>
                {/* Animated path */}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
                    <path d="M 20 50 Q 50 20 80 50" stroke="hsl(var(--accent))" strokeWidth="1" fill="none" strokeDasharray="5 5" className="animate-pulse" />
                     <path d="M 25 60 Q 50 80 75 60" stroke="hsl(var(--accent))" strokeWidth="0.5" fill="none" strokeDasharray="2 3" className="animate-pulse" />
                </svg>
             </div>
             <CardTitle className="text-lg flex items-center gap-2 text-white/80 mt-6">World Map</CardTitle>
             <CardDescription className="text-white/50">Visualize Your Journeys</CardDescription>
        </Card>
    )
  },
  {
    id: 'docs',
    icon: FileText,
    title: 'Documents',
    description: 'Generate professional reports.',
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
                    <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-white/70" />
                        <span className="text-white">Full Sea Time Report.pdf</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-white/50" />
                </div>
                <div className="flex items-center justify-between text-sm p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer transition-colors">
                     <div className="flex items-center gap-3">
                        <LifeBuoy className="h-4 w-4 text-white/70" />
                        <span className="text-white">Testimonial_Capt_Smith.pdf</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-white/50" />
                </div>
                 <div className="flex items-center justify-between text-sm p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer transition-colors">
                     <div className="flex items-center gap-3">
                        <Route className="h-4 w-4 text-white/70" />
                        <span className="text-white">Career_Summary_2024.pdf</span>
                    </div>
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

                {/* Main Interactive Display */}
                <div className="relative mt-16 max-w-6xl mx-auto p-2 border border-primary/20 rounded-xl bg-black/20 backdrop-blur-sm">
                    {/* Corner Brackets */}
                    <div className="absolute -top-px -left-px h-4 w-4 border-t-2 border-l-2 border-accent rounded-tl-xl"></div>
                    <div className="absolute -top-px -right-px h-4 w-4 border-t-2 border-r-2 border-accent rounded-tr-xl"></div>
                    <div className="absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-accent rounded-bl-xl"></div>
                    <div className="absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-accent rounded-br-xl"></div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
                        {/* Left: Feature Selector */}
                        <div className="lg:col-span-3 p-4 space-y-2 border-r border-primary/10">
                            {features.map((feature) => {
                                const Icon = feature.icon;
                                const isActive = activeFeature === feature.id;
                                return (
                                    <button
                                        key={feature.id}
                                        onClick={() => setActiveFeature(feature.id)}
                                        className={cn(
                                            "w-full relative text-left p-3 rounded-lg transition-all duration-300 border overflow-hidden group",
                                            isActive 
                                                ? "bg-primary/30 border-primary/50" 
                                                : "bg-white/5 border-transparent hover:bg-white/10 hover:border-white/20"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "flex-shrink-0 h-8 w-8 flex items-center justify-center rounded-md transition-colors",
                                                isActive ? "bg-accent" : "bg-white/10"
                                            )}>
                                                <Icon className={cn("h-4 w-4", isActive ? "text-white" : "text-white/70")} />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-sm text-white">{feature.title}</h3>
                                                <p className="text-xs text-white/60">{feature.description}</p>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Right: Dashboard Preview */}
                        <div className="lg:col-span-9 p-4">
                            {/* Dashboard Header */}
                             <div className="flex items-center justify-between pb-2 border-b border-primary/10 mb-4">
                                <div className="flex items-center gap-2 text-xs text-green-400">
                                    <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse"></div>
                                    SYSTEM ONLINE
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="text-sm text-white/70">Capt. Jane Doe</div>
                                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-white font-bold text-xs">JD</div>
                                </div>
                             </div>

                            <div className="relative aspect-video w-full">
                                {features.map(feature => (
                                    <div key={feature.id} className={cn(
                                        "absolute inset-0 transition-opacity duration-500",
                                        activeFeature === feature.id ? 'opacity-100' : 'opacity-0 pointer-events-none'
                                    )}>
                                        {feature.component}
                                    </div>
                                ))}
                            </div>
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
