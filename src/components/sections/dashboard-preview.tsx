
'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const chartData = [
    { name: 'Jan', value: 80 }, { name: 'Feb', value: 120 },
    { name: 'Mar', value: 180 }, { name: 'Apr', value: 150 },
    { name: 'May', value: 220 }, { name: 'Jun', value: 140 },
    { name: 'Jul', value: 250 }, { name: 'Aug', value: 190 },
    { name: 'Sep', value: 160 }, { name: 'Oct', value: 200 },
    { name: 'Nov', value: 210 }, { name: 'Dec', value: 280 }
];

const AnimatedBarChart = () => {
    const maxValue = Math.max(...chartData.map(d => d.value));

    return (
        <div className="w-full h-full p-4 flex flex-col bg-primary-foreground/5 rounded-lg border border-primary-foreground/10">
            <h3 className="text-white/80 font-semibold mb-4">Sea Day Analytics</h3>
            <div className="flex-grow flex items-end justify-around gap-2">
                {chartData.map((bar, index) => (
                    <motion.div
                        key={bar.name}
                        className="w-full rounded-t-md bg-accent/60 hover:bg-accent"
                        initial={{ height: '0%' }}
                        animate={{ height: `${(bar.value / maxValue) * 100}%` }}
                        transition={{ duration: 0.5, delay: index * 0.05, ease: 'easeOut' }}
                        whileHover={{ scale: 1.05 }}
                    >
                         <AnimatePresence>
                            <motion.div
                                className="relative h-full"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.5 + index * 0.05 }}
                            >
                                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-white/50">{bar.name}</span>
                            </motion.div>
                        </AnimatePresence>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};


export default function DashboardPreview() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);


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
            <div className="aspect-video w-full rounded-lg bg-transparent flex items-center justify-center p-4">
               {isClient && <AnimatedBarChart />}
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
