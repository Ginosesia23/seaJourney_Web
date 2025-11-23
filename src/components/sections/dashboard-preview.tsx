
'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function DashboardPreview() {
  return (
    <section className="bg-header text-header-foreground py-16 sm:py-24 border-y border-primary/10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="font-headline text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Your Career Command Center
          </h2>
          <p className="mt-6 max-w-2xl mx-auto text-lg leading-8 text-header-foreground/80">
            This is more than a logbook; it's a powerful toolkit to navigate
            your maritime career, with a dashboard that puts all your key
            information at your fingertips.
          </p>
        </div>

        <div className="relative mt-16 max-w-4xl mx-auto">
          <div className="relative rounded-xl p-2 border border-primary/20 bg-black/20 backdrop-blur-sm">
            <div className="absolute -top-px -left-px h-4 w-4 border-t-2 border-l-2 border-accent rounded-tl-xl"></div>
            <div className="absolute -top-px -right-px h-4 w-4 border-t-2 border-r-2 border-accent rounded-tr-xl"></div>
            <div className="absolute -bottom-px -left-px h-4 w-4 border-b-2 border-l-2 border-accent rounded-bl-xl"></div>
            <div className="absolute -bottom-px -right-px h-4 w-4 border-b-2 border-r-2 border-accent rounded-br-xl"></div>
            <div className="aspect-video w-full rounded-lg bg-primary/5 flex items-center justify-center p-4">
               <svg viewBox="0 0 800 450" className="w-full h-full">
                  {/* Background Grid */}
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(var(--primary-foreground) / 0.05)" strokeWidth="1"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />

                  {/* Chart */}
                  <g transform="translate(50, 50)">
                    <rect width="700" height="350" fill="hsl(var(--primary-foreground) / 0.03)" rx="8" />
                     <text x="20" y="40" fontFamily="sans-serif" fontSize="18" fill="hsl(var(--primary-foreground) / 0.8)">Sea Day Analytics</text>
                     {/* Bars */}
                     <g transform="translate(50, 300)">
                        {[...Array(12)].map((_, i) => (
                          <rect key={i} x={i * 54} y={-(Math.random() * 150 + 50)} width="30" height={Math.random() * 150 + 50} fill="hsl(var(--accent) / 0.6)" rx="4"/>
                        ))}
                     </g>
                     {/* Y-axis */}
                     <line x1="0" y1="0" x2="0" y2="350" stroke="hsl(var(--primary-foreground) / 0.1)" strokeWidth="1"/>
                      {/* X-axis */}
                     <line x1="0" y1="350" x2="700" y2="350" stroke="hsl(var(--primary-foreground) / 0.1)" strokeWidth="1"/>
                  </g>
                </svg>
            </div>
          </div>
        </div>


        <div className="mt-16 text-center">
          <Button
            asChild
            size="lg"
            className="rounded-full bg-accent hover:bg-accent/90 text-white"
          >
            <Link href="/dashboard-offering">Explore All Features &rarr;</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
