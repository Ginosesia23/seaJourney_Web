'use client';

import { PieChart, Pie, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts';

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
      <div className="rounded-lg border bg-background p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2 items-center">
            <div className="font-bold text-foreground">{payload[0].name}</div>
            <div className="font-bold text-foreground text-right">{`${payload[0].value} days`}</div>
        </div>
      </div>
    );
  }

  return null;
};

const CustomLegend = (props: any) => {
    const { payload } = props;
    return (
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {payload.map((entry: any, index: number) => (
                <li key={`item-${index}`} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span>{entry.value}</span>
                </li>
            ))}
        </ul>
    );
}

export default function StateBreakdownChart({ data }: StateBreakdownChartProps) {
  if (!data || data.length === 0) {
    return <p className="text-muted-foreground text-sm text-center py-8">No data to display.</p>;
  }

  const totalDays = data.reduce((acc, curr) => acc + curr.days, 0);
  const maxState = data.reduce((max, current) => (current.days > max.days ? current : max), data[0]);

  return (
    <div style={{ width: '100%', height: 250 }} className="relative">
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
                >
                    {data.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.fill} 
                          stroke={entry.fill}
                          style={{
                            transform: entry.name === maxState.name ? 'scale(1.05)' : 'scale(1)',
                            transformOrigin: 'center center',
                            transition: 'transform 0.2s ease-in-out',
                          }}
                        />
                    ))}
                </Pie>
                <Legend content={<CustomLegend />} verticalAlign="bottom" wrapperStyle={{ paddingTop: 20 }}/>
            </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-4xl font-bold text-foreground">{totalDays}</span>
            <span className="text-sm text-muted-foreground">Total Days</span>
        </div>
    </div>
  );
}
