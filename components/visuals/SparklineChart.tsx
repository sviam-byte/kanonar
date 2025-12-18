
import React from 'react';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { SimulationPoint } from '../../types';

interface SparklineChartProps {
    title: string;
    data: SimulationPoint[];
    dataKey: keyof SimulationPoint;
    color: string;
    domain?: [number | string, number | string];
}

export const SparklineChart: React.FC<SparklineChartProps> = ({ title, data, dataKey, color, domain = ['auto', 'auto'] }) => {
    
    const lastValue = data.length > 0 ? data[data.length - 1][dataKey] : 0;
    const numberValue = typeof lastValue === 'number' ? lastValue : 0;

    const chartData = data.map(d => ({ ...d, value: d[dataKey] }));
    
    return (
        <div className="h-20 flex flex-col">
            <div className="flex justify-between items-baseline text-xs">
                <h4 className="font-bold text-canon-text-light">{title}</h4>
                <span className="font-mono font-bold" style={{ color }}>{numberValue.toFixed(2)}</span>
            </div>
            <div className="flex-grow">
                 <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                         <defs>
                            <linearGradient id={`gradient-${String(dataKey)}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={color} stopOpacity={0.4}/>
                                <stop offset="95%" stopColor={color} stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <YAxis domain={domain} hide={true}/>
                         <Tooltip 
                            contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a', fontSize: 10, padding: '2px 5px' }} 
                            labelStyle={{ color: '#d1d1d1' }}
                            formatter={(value: number | undefined | null) => [typeof value === 'number' ? value.toFixed(3) : 'N/A', '']}
                            labelFormatter={(label) => `Day ${label}`}
                        />
                        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill={`url(#gradient-${String(dataKey)})`} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
