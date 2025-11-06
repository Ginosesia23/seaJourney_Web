'use client';

import { UserProfileCard } from '@/components/dashboard/user-profile';
import { Ship, LifeBuoy, ArrowUp, ArrowDown, BarChart2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import MainChart from '@/components/dashboard/main-chart';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const totalLikesData = {
  total: '1,284',
  trend: [
    { x: 1, y: 400 }, { x: 2, y: 300 }, { x: 3, y: 500 }, { x: 4, y: 450 }, { x: 5, y: 600 }, { x: 6, y: 550 },
    { x: 7, y: 700 }, { x: 8, y: 650 }, { x: 9, y: 800 }, { x: 10, y: 750 }, { x: 11, y: 900 }, { x: 12, y: 850 },
  ],
  breakdown: [
    { name: 'Deck', value: 60, color: 'hsl(var(--primary))' },
    { name: 'Engine', value: 30, color: 'hsl(var(--accent))' },
    { name: 'Interior', value: 10, color: 'hsl(var(--muted-foreground))' },
  ],
};

const testimonialData = {
    total: 23,
    breakdown: [
        { name: 'Positive', value: 80, color: 'hsl(var(--primary))'},
        { name: 'Neutral', value: 15, color: 'hsl(var(--accent))' },
        { name: 'Negative', value: 5, color: 'hsl(var(--muted-foreground))'},
    ]
}

const recentActivity = [
    { vessel: 'M/Y "Odyssey"', days: 14, date: '2024-06-15' },
    { vessel: 'S/Y "Wanderer"', days: 32, date: '2024-05-02' },
    { vessel: 'M/Y "Eclipse"', days: 7, date: '2024-03-20' },
    { vessel: 'M/Y "Stardust"', days: 90, date: '2024-02-10' },
    { vessel: 'S/Y "Zephyr"', days: 21, date: '2023-11-28' },
]

export default function DashboardPage() {
  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
      <div className="grid gap-8 md:col-span-2">
        <div className="grid gap-8 sm:grid-cols-2">
           <Card className="rounded-2xl shadow-sm bg-gradient-to-br from-blue-500 to-cyan-400 text-white">
                <CardHeader>
                    <CardTitle className="flex justify-between items-center text-white/90">
                        <span>Total Sea Days</span>
                        <Ship />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-5xl font-bold">{totalLikesData.total}</p>
                </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
                <CardHeader>
                    <CardTitle className="flex justify-between items-center text-card-foreground/80">
                        <span>Testimonials</span>
                        <LifeBuoy />
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                    <div className="text-5xl font-bold">{testimonialData.total}</div>
                    <div className="w-32 h-32">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie 
                                data={testimonialData.breakdown} 
                                cx="50%" 
                                cy="50%" 
                                innerRadius={35} 
                                outerRadius={50} 
                                dataKey="value"
                                stroke="none"
                            >
                                {testimonialData.breakdown.map((entry) => (
                                    <Cell key={entry.name} fill={entry.color} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
        </div>
        
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
              <CardTitle>Vessel Stats</CardTitle>
          </CardHeader>
          <CardContent>
              <MainChart />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-8">
        <UserProfileCard />
      </div>
    </div>
  );
}
