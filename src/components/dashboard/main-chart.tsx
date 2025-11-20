'use client';

import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border bg-background p-2 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-foreground">
                {label}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {payload.slice().reverse().map((p: any, index: number) => (
                 <div key={index} className="flex justify-between items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full" style={{backgroundColor: p.fill}}></div>
                        <span className="text-[0.70rem] uppercase text-muted-foreground">
                            {p.name}
                        </span>
                    </div>
                    <span className="font-bold text-foreground">
                        {p.value}
                    </span>
                 </div>
            ))}
          </div>
        </div>
      );
    }
  
    return null;
  };

interface MainChartProps {
    data: { month: string; [key: string]: number | string }[];
}

const dataKeys = [
    { key: "underway", color: "hsl(var(--chart-blue))" },
    { key: "inPort", color: "hsl(var(--chart-green))" },
    { key: "atAnchor", color: "hsl(var(--chart-orange))" },
    { key: "onLeave", color: "hsl(var(--chart-gray))" },
    { key: "inYard", color: "hsl(var(--chart-red))" }
];

export default function MainChart({ data }: MainChartProps) {
  return (
    <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 5 }}>
            <XAxis 
                dataKey="month" 
                tickLine={false} 
                axisLine={false} 
                tickMargin={8}
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
            
            {dataKeys.map((item, index) => (
                <Bar 
                    key={item.key}
                    dataKey={item.key} 
                    stackId="a"
                    fill={item.color}
                    radius={index === dataKeys.length - 1 ? [4, 4, 0, 0] : [0,0,0,0]}
                />
            ))}
        </BarChart>
        </ResponsiveContainer>
    </div>
  );
}
