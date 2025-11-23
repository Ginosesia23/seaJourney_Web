
'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LayoutDashboard } from 'lucide-react';
import MainChart from '@/components/dashboard/main-chart';

const chartData = [
    { month: "Jan", underway: 10, inPort: 5, atAnchor: 2 }, { month: "Feb", underway: 12, inPort: 8, atAnchor: 0 }, 
    { month: "Mar", underway: 20, inPort: 5, atAnchor: 0 }, { month: "Apr", underway: 15, inPort: 7, atAnchor: 3 }, 
    { month: "May", underway: 22, inPort: 8, atAnchor: 0 }, { month: "Jun", underway: 12, inPort: 6, atAnchor: 4 },
    { month: "Jul", underway: 25, inPort: 3, atAnchor: 0 }, { month: "Aug", underway: 18, inPort: 6, atAnchor: 2 }, 
    { month: "Sep", underway: 14, inPort: 5, atAnchor: 1 }, { month: "Oct", underway: 20, inPort: 7, atAnchor: 0 }, 
    { month: "Nov", underway: 19, inPort: 4, atAnchor: 2 }, { month: "Dec", underway: 26, inPort: 5, atAnchor: 0 }
];

export default function DashboardPreview() {

  return (
    <section className="bg-header text-header-foreground py-16 sm:py-24 border-y border-primary/10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
            <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Your Career Command Center
            </h2>
            <p className="mt-6 max-w-2xl mx-auto text-lg leading-8 text-header-foreground/80">
                This is more than a logbook; it's a powerful toolkit to navigate your maritime career, with a dashboard that puts all your key information at your fingertips.
            </p>
        </div>

        <div className="relative mt-16 max-w-4xl mx-auto p-2 border border-primary/20 rounded-xl bg-black/20 backdrop-blur-sm">
            <div className="absolute -top-px -left-px h-4 w-4 border-t-2 border-l-2 border-accent rounded-tl-xl"></div>
            <div className="absolute -top-px -right-px h-4 w-4 border-t-2 border-r-2 border-accent rounded-tr-xl"></div>
            <div className="absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-accent rounded-bl-xl"></div>
            <div className="absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-accent rounded-br-xl"></div>
            
            <Card className="h-full bg-transparent border-none shadow-none flex flex-col">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2 text-white/80">
                        <LayoutDashboard className="h-5 w-5" />
                        Dashboard Overview
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <MainChart data={chartData} />
                </CardContent>
            </Card>
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
