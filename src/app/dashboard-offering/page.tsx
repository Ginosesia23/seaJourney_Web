

'use client';

import { useState, useRef, useEffect } from 'react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { BarChart2, Ship, Globe, FileText, ArrowRight, LifeBuoy, Users, Fingerprint, Bot, CheckCircle, ShieldCheck, AreaChart, ShipWheel, LayoutDashboard, Route, Anchor } from 'lucide-react';
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
                            <TableHead className="text-white/80">Total Days</TableHead>
                            <TableHead className="text-white/80">Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow className="border-white/10 hover:bg-white/5">
                            <TableCell className="font-medium text-white">M/Y Odyssey</TableCell>
                            <TableCell className="text-white">421</TableCell>
                            <TableCell><Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">Current</Badge></TableCell>
                        </TableRow>
                        <TableRow className="border-white/10 hover:bg-white/5">
                            <TableCell className="font-medium text-white">S/Y Wanderer</TableCell>
                             <TableCell className="text-white">189</TableCell>
                            <TableCell><Badge variant="outline" className="border-white/20 text-white/60">Past</Badge></TableCell>
                        </TableRow>
                         <TableRow className="border-white/10 hover:bg-white/5">
                            <TableCell className="font-medium text-white">M/Y Eclipse</TableCell>
                             <TableCell className="text-white">256</TableCell>
                            <TableCell><Badge variant="outline" className="border-white/20 text-white/60">Past</Badge></TableCell>
                        </TableRow>
                         <TableRow className="border-white/10 hover:bg-white/5">
                            <TableCell className="font-medium text-white">Catamaran Ceta</TableCell>
                            <TableCell className="text-white">88</TableCell>
                             <TableCell><Badge variant="outline" className="border-white/20 text-white/60">Past</Badge></TableCell>
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
        <div className="w-full max-w-lg aspect-video rounded-lg bg-primary/5 flex items-center justify-center relative overflow-hidden p-4">
          <svg viewBox="0 0 800 400" className="w-full h-full">
            <defs>
              <pattern id="hex-bg" patternUnits="userSpaceOnUse" width="14" height="24.25" patternTransform="scale(1) rotate(0)">
                <g>
                <polygon points="7,0 0,4.04 0,12.12 7,16.16 14,12.12 14,4.04" fill="hsl(var(--primary-foreground) / 0.05)" stroke="hsl(var(--primary-foreground) / 0.1)" strokeWidth="0.5"></polygon>
                <polygon points="7,16.16 0,20.2 0,28.28 7,32.32 14,28.28 14,20.2" fill="hsl(var(--primary-foreground) / 0.05)" stroke="hsl(var(--primary-foreground) / 0.1)" strokeWidth="0.5"></polygon>
                </g>
              </pattern>
            </defs>
            <rect width="800" height="400" fill="url(#hex-bg)"></rect>
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
  },
  {
    id: 'crew',
    icon: Users,
    title: 'Crew',
    description: 'Manage your crew members.',
    component: (
        <Card className="h-full bg-transparent border-none shadow-none flex flex-col">
            <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-white/80">
                    <Users className="h-5 w-5" />
                    Crew Management
                </CardTitle>
                <CardDescription className="text-white/50">Oversee your crew's status and sea time.</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
                <div className="space-y-3">
                    {[{name: 'Alex Johnson', role: 'First Mate', status: 'On Watch'}, {name: 'Samantha Lee', role: 'Chief Engineer', status: 'On Leave'}, {name: 'David Chen', role: 'Captain', status: 'At Anchor'}].map(crew => (
                        <div key={crew.name} className="flex items-center justify-between text-sm p-3 rounded-lg border border-white/10 bg-white/5">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-white/80 font-bold text-xs">{crew.name.split(' ').map(n=>n[0]).join('')}</div>
                                <div>
                                    <div className="text-white font-medium">{crew.name}</div>
                                    <div className="text-xs text-white/60">{crew.role}</div>
                                </div>
                            </div>
                            <Badge variant={crew.status === 'On Watch' ? 'secondary' : 'outline'} className={cn(crew.status === 'On Watch' && 'bg-green-500/20 text-green-400 border-green-500/30', crew.status === 'On Leave' && 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', 'border-white/20 text-white/60')}>{crew.status}</Badge>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
  },
  {
    id: 'verification',
    icon: Fingerprint,
    title: 'Verification',
    description: 'Ensure document authenticity.',
    component: (
      <Card className="h-full bg-transparent border-none shadow-none flex flex-col items-center justify-center">
        <CardHeader className="text-center">
            <CardTitle className="text-lg flex items-center justify-center gap-2 text-white/80">
                <Fingerprint className="h-5 w-5" />
                Verification Hub
            </CardTitle>
            <CardDescription className="text-white/50">Instantly verify documents with QR codes.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-4">
             <div className="p-4 bg-white rounded-lg">
                <svg width="100" height="100" viewBox="0 0 33 33" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0 0H11V11H0V0Z" fill="black"/><path d="M5.5 5.5H8.25V8.25H5.5V5.5Z" fill="white"/><path d="M22 0H33V11H22V0Z" fill="black"/><path d="M27.5 5.5H30.25V8.25H27.5V5.5Z" fill="white"/><path d="M0 22H11V33H0V22Z" fill="black"/><path d="M5.5 27.5H8.25V30.25H5.5V27.5Z" fill="white"/><path d="M16.5 0V2.75H13.75V0H11V11H13.75V8.25H16.5V11H19.25V8.25H22V5.5H19.25V2.75H22V0H16.5Z" fill="black"/><path d="M19.25 13.75H13.75V16.5H11V13.75H8.25V19.25H11V22H13.75V19.25H19.25V24.75H16.5V27.5H22V24.75H24.75V22H27.5V19.25H24.75V13.75H22V11H19.25V13.75Z" fill="black"/><path d="M2.75 13.75H0V16.5H5.5V13.75H2.75Z" fill="black"/><path d="M33 13.75H27.5V11H24.75V13.75H22V16.5H24.75V19.25H30.25V16.5H33V13.75Z" fill="black"/><path d="M2.75 19.25H5.5V22H0V19.25H2.75Z" fill="black"/><path d="M13.75 22V24.75H11V27.5H5.5V24.75H8.25V22H13.75Z" fill="black"/><path d="M27.5 27.5H24.75V30.25H27.5V33H33V27.5H27.5Z" fill="black"/><path d="M30.25 22H27.5V24.75H30.25V22Z" fill="black"/></svg>
             </div>
             <p className="text-sm text-white/70">Scan to verify document: <strong className="text-white">#SJ-8A4B2F</strong></p>
        </CardContent>
      </Card>
    )
  },
  {
    id: 'ai',
    icon: Bot,
    title: 'AI Co-Pilot',
    description: 'Leverage AI for insights.',
    component: (
      <Card className="h-full bg-transparent border-none shadow-none flex flex-col">
        <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-white/80">
                <Bot className="h-5 w-5" />
                AI Co-Pilot
            </CardTitle>
            <CardDescription className="text-white/50">Your intelligent maritime assistant.</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow space-y-4 flex flex-col justify-end">
            <div className="p-3 rounded-lg bg-white/5 border border-white/10 max-w-[80%] self-start">
                <p className="text-sm text-white">Generate a summary of my time on M/Y Odyssey for 2023.</p>
            </div>
             <div className="p-3 rounded-lg bg-accent/10 border border-accent/20 max-w-[80%] self-end">
                <p className="text-sm text-white/90 font-mono animate-pulse">Generating report...</p>
            </div>
        </CardContent>
      </Card>
    )
  }
];

export default function DashboardOfferingPage() {
    const [activeFeature, setActiveFeature] = useState(features[0].id);

  return (
    <div className="flex min-h-screen flex-col bg-header">
      <Header />
      <main className="flex-1">
        
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

                <div className="container mx-auto px-4 sm:px-6 lg:px-8 mt-20 sm:mt-28">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                        <div className="text-center">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 mb-4">
                                <ShieldCheck className="h-6 w-6 text-accent" />
                            </div>
                            <h3 className="font-headline text-xl font-bold text-white">Verifiable Records</h3>
                            <p className="mt-2 text-header-foreground/80">Generate official, tamper-proof documents with unique QR codes for instant verification by authorities.</p>
                        </div>
                        <div className="text-center">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 mb-4">
                                <AreaChart className="h-6 w-6 text-accent" />
                            </div>
                            <h3 className="font-headline text-xl font-bold text-white">Career Analytics</h3>
                            <p className="mt-2 text-header-foreground/80">Visualize your sea time, track progress towards your next certificate, and gain insights into your career trajectory.</p>
                        </div>
                        <div className="text-center">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 mb-4">
                                <ShipWheel className="h-6 w-6 text-accent" />
                            </div>
                            <h3 className="font-headline text-xl font-bold text-white">All-in-One Management</h3>
                            <p className="mt-2 text-header-foreground/80">From single crew members to entire fleets, our dashboard provides the tools to manage everything in one place.</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

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
        @keyframes dash {
          to {
            stroke-dashoffset: -100;
          }
        }
        @keyframes dash-reverse {
            from {
              stroke-dashoffset: -100;
            }
            to {
              stroke-dashoffset: 0;
            }
          }
        .animate-dash {
            animation: dash 5s linear infinite;
        }
        .animate-dash-reverse {
            animation: dash-reverse 3s linear infinite;
        }
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
