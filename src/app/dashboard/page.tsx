'use client';

import { useUser, useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { UserProfileCard } from '@/components/dashboard/user-profile';
import { Award, CalendarDays, LifeBuoy, LogOut, Ship, ArrowUp, ArrowDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
import MainChart from '@/components/dashboard/main-chart';


const chartData = [
    { name: 'Jan', value: 20 }, { name: 'Feb', value: 40 }, { name: 'Mar', value: 30 },
    { name: 'Apr', value: 60 }, { name: 'May', value: 50 }, { name: 'Jun', value: 80 },
  ];

const StatCard = ({ title, value, change, changeType, data }: { title?: string, value: string, change: string, changeType: 'up' | 'down', data: any[] }) => {
    const uniqueId = title ? title.replace(/\s/g, '') : Math.random().toString(36).substring(7);
    return (
    <Card className="rounded-xl bg-card shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <div className="text-3xl font-bold text-foreground">{value}</div>
          <div className={`flex items-center text-sm font-semibold ${changeType === 'up' ? 'text-green-500' : 'text-red-500'}`}>
            {changeType === 'up' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            {change}
          </div>
        </div>
        <div className="h-16 w-full -ml-4 mt-2">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
                    <defs>
                        <linearGradient id={`color${uniqueId}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      fillOpacity={1} 
                      fill={`url(#color${uniqueId})`} 
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
    )
};

const stats = [
  { name: 'Total Sea Days', value: '1,284', change: '12.5%', changeType: 'up', data: [ { value: 10 }, { value: 15 }, { value: 12 }, { value: 20 }, { value: 18 }, { value: 25 } ] },
  { name: 'Vessels Served On', value: '12', change: '2.1%', changeType: 'up', data: [ { value: 5 }, { value: 4 }, { value: 6 }, { value: 7 }, { value: 5 }, { value: 8 } ]},
  { name: 'Certificates Held', value: '8', change: '0%', changeType: 'up', data: [ { value: 8 }, { value: 8 }, { value: 8 }, { value: 8 }, { value: 8 }, { value: 8 } ]},
  { name: 'Testimonials Rec.', value: '23', change: '5.2%', changeType: 'down', data: [ { value: 30 }, { value: 28 }, { value: 29 }, { value: 26 }, { value: 27 }, { value: 23 } ]},
];

const recentActivity = [
    { vessel: 'M/Y "Odyssey"', days: 14, date: '2024-06-15' },
    { vessel: 'S/Y "Wanderer"', days: 32, date: '2024-05-02' },
    { vessel: 'M/Y "Eclipse"', days: 7, date: '2024-03-20' },
]

export default function DashboardPage() {
  const { user } = useUser();
  const auth = useAuth();
  const router = useRouter();

  const handleSignOut = () => {
    if (auth) {
      auth.signOut();
      router.push('/');
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 bg-card px-4 md:px-6">
        <SidebarTrigger className="md:hidden" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Dashboard
          </h1>
        </div>
        <Button onClick={handleSignOut} variant="outline" className="bg-card border-border hover:bg-muted">
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </header>
      <main className="flex-1 space-y-8 p-4 pt-6 sm:p-6 lg:p-8">
        <p className="text-lg text-muted-foreground">
            Welcome back, {user?.displayName || user?.email || 'User'}!
        </p>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
                <StatCard key={stat.name} title={stat.name} {...stat} />
            ))}
        </div>
        
        {/* Main content grid */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Left Column */}
            <div className="space-y-8 lg:col-span-2">
                <MainChart />

                <Card className="rounded-xl bg-card shadow-sm">
                <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                    <ul className="divide-y divide-border">
                    {recentActivity.map(activity => (
                        <li key={activity.vessel} className="flex items-center justify-between py-3">
                            <div>
                                <p className="font-semibold text-foreground">{activity.vessel}</p>
                                <p className="text-sm text-muted-foreground">Logged on {activity.date}</p>
                            </div>
                            <p className="font-mono text-lg font-medium text-primary">{activity.days} days</p>
                        </li>
                    ))}
                    </ul>
                </CardContent>
                </Card>
            </div>
            
            {/* Right Column */}
            <div className="space-y-8">
                <UserProfileCard />
                <Card className="rounded-xl bg-card shadow-sm">
                    <CardHeader>
                        <CardTitle>Next Certificate Progress</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between mb-1">
                                    <span className="text-base font-medium text-foreground">OOW (Yachts &lt; 3000gt)</span>
                                    <span className="text-sm font-medium text-foreground">75%</span>
                                </div>
                                <Progress value={75} className="h-3 [&>div]:bg-primary" />
                            </div>
                            <p className="text-sm text-muted-foreground">You need 90 more sea days to be eligible for your OOW 3000gt oral exam.</p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>

      </main>
    </div>
  );
}
