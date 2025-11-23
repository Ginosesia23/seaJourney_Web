
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { BarChart2, Ship, Globe, FileText, ArrowRight, LifeBuoy, Users, Fingerprint, Bot, LayoutDashboard, Route, Anchor, ShipWheel } from 'lucide-react';
import { cn } from '@/lib/utils';
import MainChart from '@/components/dashboard/main-chart';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const chartData = [
    { month: "Jan", underway: 10, inPort: 5, atAnchor: 2 }, { month: "Feb", underway: 12, inPort: 8, atAnchor: 0 }, 
    { month: "Mar", underway: 20, inPort: 5, atAnchor: 0 }, { month: "Apr", underway: 15, inPort: 7, atAnchor: 3 }, 
    { month: "May", underway: 22, inPort: 8, atAnchor: 0 }, { month: "Jun", underway: 12, inPort: 6, atAnchor: 4 },
    { month: "Jul", underway: 25, inPort: 3, atAnchor: 0 }, { month: "Aug", underway: 18, inPort: 6, atAnchor: 2 }, 
    { month: "Sep", underway: 14, inPort: 5, atAnchor: 1 }, { month: "Oct", underway: 20, inPort: 7, atAnchor: 0 }, 
    { month: "Nov", underway: 19, inPort: 4, atAnchor: 2 }, { month: "Dec", underway: 26, inPort: 5, atAnchor: 0 }
];

const features = [
    {
    id: 'dashboard',
    icon: LayoutDashboard,
    title: 'Dashboard',
    description: 'Your career at a glance.',
    component: (
        <Card className="h-full bg-transparent border-none shadow-none flex flex-col">
             <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-white/80">
                    <LayoutDashboard className="h-5 w-5" />
                    Dashboard Overview
                </CardTitle>
                <CardDescription className="text-white/50">Your career command center.</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-center">
                    {[
                        { icon: Ship, label: 'Total Sea Days', value: '421' },
                        { icon: LifeBuoy, label: 'Testimonials', value: '12' },
                        { icon: Route, label: 'Passages Logged', value: '34' },
                        { icon: Anchor, label: 'Vessels Logged', value: '4' }
                    ].map(stat => (
                        <div key={stat.label} className="p-2 rounded-lg bg-white/5 border border-white/10">
                            <stat.icon className="h-4 w-4 text-white/70 mx-auto mb-1" />
                            <div className="text-xl font-bold text-white">{stat.value}</div>
                            <div className="text-[10px] text-white/60 uppercase tracking-wider">{stat.label}</div>
                        </div>
                    ))}
                </div>
                 <div className="h-[150px] w-full mt-2">
                    <MainChart data={chartData} />
                </div>
            </CardContent>
        </Card>
    )
  },
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
            <MainChart data={chartData} />
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
        <div className="w-full max-w-lg aspect-video rounded-lg bg-primary/5 flex items-center justify-center relative overflow-hidden p-4">
          <svg viewBox="0 0 800 400" className="w-full h-full">
            <defs>
              <pattern id="hex-bg-preview" patternUnits="userSpaceOnUse" width="14" height="24.25" patternTransform="scale(1) rotate(0)">
                <g>
                <polygon points="7,0 0,4.04 0,12.12 7,16.16 14,12.12 14,4.04" fill="hsl(var(--primary-foreground) / 0.05)" stroke="hsl(var(--primary-foreground) / 0.1)" strokeWidth="0.5"></polygon>
                <polygon points="7,16.16 0,20.2 0,28.28 7,32.32 14,28.28 14,20.2" fill="hsl(var(--primary-foreground) / 0.05)" stroke="hsl(var(--primary-foreground) / 0.1)" strokeWidth="0.5"></polygon>
                </g>
              </pattern>
            </defs>
            <rect width="800" height="400" fill="url(#hex-bg-preview)"></rect>
            <path d="M 240 250 C 350 180, 550 180, 680 280" stroke="hsl(var(--accent))" strokeWidth="2" fill="none" strokeDasharray="4 6" className="opacity-70 animate-dash" />
            <path d="M 280 310 C 400 380, 600 380, 750 290" stroke="hsl(var(--accent))" strokeWidth="1.5" fill="none" strokeDasharray="3 4" className="opacity-50 animate-dash-reverse" />
          </svg>
        </div>
        <CardTitle className="text-lg flex items-center gap-2 text-white/80 mt-6">World Map</CardTitle>
        <CardDescription className="text-white/50">Visualize Your Global Journeys</CardDescription>
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
                        <FileText className="h-4 w-4 text-white/70" />
                        <span className="text-white">Career_Summary_2024.pdf</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-white/50" />
                </div>
            </CardContent>
        </Card>
    )
  }
];

export default function DashboardPreview() {
  const [activeFeature, setActiveFeature] = useState(features[0].id);

  return (
    <section className="bg-header text-header-foreground py-16 sm:py-24 border-y border-primary/10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
            <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Your Career Command Center
            </h2>
            <p className="mt-6 max-w-2xl mx-auto text-lg leading-8 text-header-foreground/80">
                This is more than a logbook; it's a powerful toolkit to navigate your maritime career. Select a feature to see it in action.
            </p>
        </div>

        <div className="relative mt-16 max-w-6xl mx-auto p-2 border border-primary/20 rounded-xl bg-black/20 backdrop-blur-sm">
            <div className="absolute -top-px -left-px h-4 w-4 border-t-2 border-l-2 border-accent rounded-tl-xl"></div>
            <div className="absolute -top-px -right-px h-4 w-4 border-t-2 border-r-2 border-accent rounded-tr-xl"></div>
            <div className="absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-accent rounded-bl-xl"></div>
            <div className="absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-accent rounded-br-xl"></div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
                <div className="lg:col-span-3 p-4 space-y-2 border-r border-primary/10">
                    {features.map((feature) => {
                        const Icon = feature.icon;
                        const isActive = activeFeature === feature.id;
                        return (
                            <button
                                key={feature.id}
                                onClick={() => setActiveFeature(feature.id)}
                                className={cn(
                                    "w-full relative text-left p-3 rounded-xl transition-all duration-300 border overflow-hidden group",
                                    isActive 
                                        ? "bg-primary/30 border-primary/50" 
                                        : "bg-white/5 border-transparent hover:bg-white/10 hover:border-white/20"
                                )}
                            >
                                <div className="absolute top-0 left-0 h-full w-px bg-accent/50 transition-all duration-500 ease-in-out" style={{transform: isActive ? 'scaleY(1)' : 'scaleY(0)', transformOrigin: 'top'}}></div>
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

                <div className="lg:col-span-9 p-4">
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

        <div className="mt-16 text-center">
            <Button asChild size="lg" className="rounded-full bg-accent hover:bg-accent/90 text-white">
                <Link href="/dashboard-offering">Explore All Features &rarr;</Link>
            </Button>
        </div>
      </div>
    </section>
  );
}
