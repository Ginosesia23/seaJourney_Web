'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const data = [
  { month: 'Jan', seaDays: 30 },
  { month: 'Feb', seaDays: 28 },
  { month: 'Mar', seaDays: 45 },
  { month: 'Apr', seaDays: 42 },
  { month: 'May', seaDays: 50 },
  { month: 'Jun', seaDays: 48 },
  { month: 'Jul', seaDays: 55 },
  { month: 'Aug', seaDays: 60 },
  { month: 'Sep', seaDays: 58 },
  { month: 'Oct', seaDays: 62 },
  { month: 'Nov', seaDays: 55 },
  { month: 'Dec', seaDays: 70 },
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
    <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 5 }}>
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
            <Bar 
                dataKey="seaDays"
                radius={[4, 4, 0, 0]}
                fill="hsl(var(--primary))"
                
            />
        </BarChart>
        </ResponsiveContainer>
    </div>
  );
}
