
'use client';

import { Ship, LifeBuoy, Route, Anchor } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import MainChart from '@/components/dashboard/main-chart';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const totalSeaDaysData = {
  total: '1,284',
};

const testimonialData = {
    total: 23,
    breakdown: [
        { name: 'Positive', value: 80, color: 'hsl(var(--primary))'},
        { name: 'Neutral', value: 15, color: 'hsl(var(--accent))' },
        { name: 'Negative', value: 5, color: 'hsl(var(--muted-foreground))'},
    ]
}

const passagesData = {
    total: 48,
};

const vesselsData = {
    total: 7,
}

const recentActivity = [
    { vessel: 'M/Y "Odyssey"', days: 14, date: '2024-06-15', type: 'Motor Yacht' },
    { vessel: 'S/Y "Wanderer"', days: 32, date: '2024-05-02', type: 'Sailing Yacht' },
    { vessel: 'M/Y "Eclipse"', days: 7, date: '2024-03-20', type: 'Motor Yacht' },
    { vessel: 'M/Y "Stardust"', days: 90, date: '2024-02-10', type: 'Motor Yacht' },
    { vessel: 'S/Y "Zephyr"', days: 21, date: '2023-11-28', type: 'Sailing Yacht' },
]

const sampleYears = ['All Years', '2024', '2023', '2022'];
const sampleVessels = [
    { id: 'all', name: 'All Vessels' },
    { id: 'vessel-1', name: 'M/Y "Odyssey"' },
    { id: 'vessel-2', name: 'S/Y "Wanderer"' },
    { id: 'vessel-3', name: 'M/Y "Eclipse"' },
    { id: 'vessel-4', name: 'M/Y "Stardust"' },
    { id: 'vessel-5', name: 'S/Y "Zephyr"' },
];
const sampleVesselTypes = ['All Types', 'Motor Yacht', 'Sailing Yacht', 'Commercial'];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
            <CardTitle className="text-2xl">Dashboard</CardTitle>
            <CardDescription>Your career at a glance.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <Select defaultValue={sampleYears[0]}>
                <SelectTrigger className="w-full sm:w-[150px]">
                    <SelectValue placeholder="Filter by year..." />
                </SelectTrigger>
                <SelectContent>
                    {sampleYears.map(year => (
                        <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Select defaultValue={sampleVessels[0].id}>
                <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filter by vessel..." />
                </SelectTrigger>
                <SelectContent>
                    {sampleVessels.map(vessel => (
                        <SelectItem key={vessel.id} value={vessel.id}>{vessel.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Select defaultValue={sampleVesselTypes[0]}>
                <SelectTrigger className="w-full sm:w-[150px]">
                    <SelectValue placeholder="Filter by type..." />
                </SelectTrigger>
                <SelectContent>
                    {sampleVesselTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
         <Card className="rounded-xl shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Sea Days</CardTitle>
                  <Ship className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold">{totalSeaDaysData.total}</div>
                  <p className="text-xs text-muted-foreground">+5.2% from last month</p>
              </CardContent>
          </Card>

          <Card className="rounded-xl shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Testimonials</CardTitle>
                  <LifeBuoy className="h-4 w-4 text-muted-foreground"/>
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold">{testimonialData.total}</div>
                  <p className="text-xs text-muted-foreground">3 new positive reviews</p>
              </CardContent>
          </Card>
          
          <Card className="rounded-xl shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Passages Logged</CardTitle>
                  <Route className="h-4 w-4 text-muted-foreground"/>
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold">{passagesData.total}</div>
                  <p className="text-xs text-muted-foreground">+2 since last week</p>
              </CardContent>
          </Card>

          <Card className="rounded-xl shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Vessels Logged</CardTitle>
                  <Anchor className="h-4 w-4 text-muted-foreground"/>
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold">{vesselsData.total}</div>
                  <p className="text-xs text-muted-foreground">1 new vessel added</p>
              </CardContent>
          </Card>
      </div>
      
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <Card className="rounded-xl shadow-sm lg:col-span-2">
            <CardHeader>
                <CardTitle>Sea Day Analytics</CardTitle>
                <CardDescription>Your sea days logged over the past year.</CardDescription>
            </CardHeader>
            <CardContent>
                <MainChart />
            </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm">
            <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Your most recently logged sea time.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Vessel</TableHead>
                            <TableHead className="text-right">Date</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {recentActivity.map((activity, index) => (
                        <TableRow key={index}>
                            <TableCell>
                                <div className="font-medium">{activity.vessel}</div>
                                <div className="text-sm text-muted-foreground">{activity.days} days</div>
                            </TableCell>
                            <TableCell className="text-right">{format(new Date(activity.date), 'dd MMM, yyyy')}</TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </div>
    </div>
  );
}
