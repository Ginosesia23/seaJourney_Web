
'use client';

import { PieChart, Pie, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Waves, Anchor, Building, Briefcase, Ship } from 'lucide-react';

const vesselStates: { value: string; label: string, color: string, icon: React.FC<any> }[] = [
    { value: 'underway', label: 'Underway', color: 'hsl(var(--chart-blue))', icon: Waves },
    { value: 'at-anchor', label: 'At Anchor', color: 'hsl(var(--chart-orange))', icon: Anchor },
    { value: 'in-port', label: 'In Port', color: 'hsl(var(--chart-green))', icon: Building },
    { value: 'on-leave', label: 'On Leave', color: 'hsl(var(--chart-gray))', icon: Briefcase },
    { value: 'in-yard', label: 'In Yard', color: 'hsl(var(--chart-red))', icon: Ship },
];

interface ChartData {
    name: string;
    days: number;
    fill: string;
}

interface StateBreakdownChartProps {
    data: ChartData[];
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border bg-background p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2 items-center">
            <div className="font-bold text-foreground">{payload[0].name}</div>
            <div className="font-bold text-foreground text-right">{`${payload[0].value} days`}</div>
        </div>
      </div>
    );
  }

  return null;
};


export default function StateBreakdownChart({ data }: StateBreakdownChartProps) {
  if (!data || data.length === 0) {
    return <p className="text-muted-foreground text-sm text-center py-8">No data to display.</p>;
  }

  const totalDays = data.reduce((acc, curr) => acc + curr.days, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div className="relative h-[200px] w-full">
            <ResponsiveContainer>
                <PieChart>
                    <Tooltip content={<CustomTooltip />} />
                    <Pie
                        data={data}
                        dataKey="days"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius="60%"
                        outerRadius="80%"
                        paddingAngle={5}
                        stroke="hsl(var(--border))"
                        strokeWidth={2}
                    >
                        {data.map((entry, index) => (
                            <Cell 
                            key={`cell-${index}`} 
                            fill={entry.fill} 
                            />
                        ))}
                    </Pie>
                </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-4xl font-bold text-foreground">{totalDays}</span>
                <span className="text-sm text-muted-foreground">Total Days</span>
            </div>
        </div>
        <div className="space-y-4">
            {vesselStates.map(stateInfo => {
                const stateData = data.find(d => d.name === stateInfo.label);
                const days = stateData?.days || 0;
                const percentage = totalDays > 0 ? (days / totalDays) * 100 : 0;
                const Icon = stateInfo.icon;

                return (
                    <div key={stateInfo.value}>
                        <div className="flex justify-between items-center mb-1 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Icon className="h-4 w-4" style={{color: stateInfo.color}}/>
                                <span>{stateInfo.label}</span>
                            </div>
                            <span className="font-medium text-foreground">{days} days</span>
                        </div>
                        <Progress 
                          value={percentage} 
                          indicatorStyle={{ backgroundColor: stateInfo.color }}
                        />
                    </div>
                )
            })}
        </div>
    </div>
  );
}
