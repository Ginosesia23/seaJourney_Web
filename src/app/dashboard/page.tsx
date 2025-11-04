'use client';

import { useUser, useAuth } from '@/firebase';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { UserProfileCard } from '@/components/dashboard/user-profile';
import { Award, CalendarDays, LifeBuoy, LogOut, Ship } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

const stats = [
  { name: 'Total Sea Days', value: '1,284', icon: CalendarDays },
  { name: 'Vessels Served On', value: '12', icon: Ship },
  { name: 'Certificates Held', value: '8', icon: Award },
  { name: 'Testimonials Rec.', value: '23', icon: LifeBuoy },
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
    <div className="dark flex min-h-screen flex-col bg-background">
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
             <div>
                <h1 className="font-headline text-3xl font-bold tracking-tight text-primary sm:text-4xl">
                Dashboard
                </h1>
                <p className="mt-2 text-lg text-muted-foreground">
                Welcome back, {user?.displayName || user?.email || 'User'}!
                </p>
             </div>
             <Button onClick={handleSignOut} variant="outline" className="bg-card border-border hover:bg-muted">
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
            </Button>
          </div>

          {/* Stats Grid */}
          <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.name} className="overflow-hidden rounded-xl bg-card shadow-lg transition-transform hover:-translate-y-1 hover:shadow-primary/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.name}
                  </CardTitle>
                  <stat.icon className="h-5 w-5 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-foreground">{stat.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          {/* Main content grid */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Left Column */}
            <div className="space-y-8 lg:col-span-2">
               <Card className="rounded-xl bg-card shadow-lg">
                <CardHeader>
                  <CardTitle className="font-headline">Recent Activity</CardTitle>
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

              <Card className="rounded-xl bg-card shadow-lg">
                <CardHeader>
                  <CardTitle className="font-headline">Next Certificate Progress</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between mb-1">
                                <span className="text-base font-medium text-primary">Officer of the Watch (Yachts less than 3000gt)</span>
                                <span className="text-sm font-medium text-primary">75%</span>
                            </div>
                             <Progress value={75} className="h-3 [&>div]:bg-accent" />
                        </div>
                        <p className="text-sm text-muted-foreground">You need 90 more sea days to be eligible for your OOW 3000gt oral exam.</p>
                    </div>
                </CardContent>
              </Card>

            </div>
            
            {/* Right Column */}
            <div className="space-y-8">
              <UserProfileCard />
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
