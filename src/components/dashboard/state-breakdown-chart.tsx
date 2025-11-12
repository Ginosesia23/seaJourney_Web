
'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';

interface ChartData {
    name: string;
    days: number;
    fill: string;
}

interface StateBreakdownChartProps {
    data: ChartData[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border bg-background p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2 items-center">
            <div className="font-bold text-foreground">{payload[0].payload.name}</div>
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

  return (
    <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>
            <BarChart layout="vertical" data={data} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                <XAxis type="number" hide />
                <YAxis 
                    type="category" 
                    dataKey="name" 
                    tickLine={false} 
                    axisLine={false}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    width={120}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))' }}/>
                <Bar dataKey="days" radius={[0, 4, 4, 0]}>
                    <LabelList 
                        dataKey="days" 
                        position="right" 
                        formatter={(value: number) => `${value}`}
                        className="font-bold fill-foreground"
                    />
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    </div>
  );
}

    