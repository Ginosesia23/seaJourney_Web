'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const data = [
  { month: 'Jan', seaDays: 30, goal: 35 },
  { month: 'Feb', seaDays: 28, goal: 35 },
  { month: 'Mar', seaDays: 45, goal: 35 },
  { month: 'Apr', seaDays: 42, goal: 35 },
  { month: 'May', seaDays: 50, goal: 40 },
  { month: 'Jun', seaDays: 48, goal: 40 },
  { month: 'Jul', seaDays: 55, goal: 40 },
  { month: 'Aug', seaDays: 60, goal: 45 },
  { month: 'Sep', seaDays: 58, goal: 45 },
  { month: 'Oct', seaDays: 62, goal: 45 },
  { month: 'Nov', seaDays: 55, goal: 50 },
  { month: 'Dec', seaDays: 70, goal: 50 },
];

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border bg-background p-2 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col space-y-1">
              <span className="text-[0.70rem] uppercase text-muted-foreground">
                Month
              </span>
              <span className="font-bold text-muted-foreground">
                {label}
              </span>
            </div>
            <div className="flex flex-col space-y-1">
              <span className="text-[0.70rem] uppercase text-muted-foreground">
                Sea Days
              </span>
              <span className="font-bold text-foreground">
                {payload[0].value}
              </span>
            </div>
          </div>
        </div>
      );
    }
  
    return null;
  };

export default function MainChart() {
  return (
    <Card className="rounded-xl bg-card shadow-sm">
      <CardHeader>
        <CardTitle>Sea Days Overview</CardTitle>
        <CardDescription>Your monthly sea day count for the last 12 months.</CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <defs>
                    <linearGradient id="colorSeaDays" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                </defs>
                <XAxis 
                    dataKey="month" 
                    tickLine={false} 
                    axisLine={false} 
                    tickMargin={8}
                    tickFormatter={(value) => value.slice(0, 3)}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                />
                <YAxis 
                    tickLine={false} 
                    axisLine={false} 
                    tickMargin={8}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                />
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
                <Area 
                    type="monotone" 
                    dataKey="seaDays"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorSeaDays)"
                />
            </AreaChart>
            </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
