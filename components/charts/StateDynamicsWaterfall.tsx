import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Label, Cell } from 'recharts';
import { CalculatedMetrics } from '../../types';

interface WaterfallChartProps {
    metrics: CalculatedMetrics;
}

export const StateDynamicsWaterfall: React.FC<WaterfallChartProps> = ({ metrics }) => {
    
    const processedData = useMemo(() => {
        if (!metrics.simulationData || metrics.simulationData.length === 0) {
            return { data: [], total: 0 };
        }
        const initialPoint = metrics.simulationData[0];
        
        const data = [
            { name: 'Инерция', value: initialPoint.deltaS_inertia || 0 },
            { name: 'Восстан.', value: initialPoint.deltaS_restoring || 0 },
            { name: 'Разруш.', value: initialPoint.deltaS_destroyer || 0 },
            { name: 'Шок', value: initialPoint.deltaS_shock || 0 },
        ].filter(d => Math.abs(d.value) > 1e-6); // Filter out zero-value contributions

        let cumulative = 0;
        const result = data.map(entry => {
            const start = cumulative;
            cumulative += entry.value;
            const isPositive = entry.value >= 0;
            return {
                name: entry.name,
                value: entry.value,
                range: isPositive ? [start, start + entry.value] : [start + entry.value, start],
            };
        });
        
        result.unshift({ name: 'S(t)', value: initialPoint.S || 0, range: [0, initialPoint.S || 0] });
        result.push({ name: 'S(t+1)', value: cumulative + (initialPoint.S || 0), range: [0, cumulative + (initialPoint.S || 0)] });

        return { data: result, total: cumulative };

    }, [metrics]);

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={processedData.data} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                <XAxis dataKey="name" tick={{ fill: '#888888', fontSize: 10 }} stroke="#444444" />
                <YAxis tick={{ fill: '#888888', fontSize: 10 }} stroke="#444444" unit="%" domain={['auto', 'auto']}/>
                <Tooltip 
                     contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a', fontSize: 12 }}
                     formatter={(value, name, props) => [`${(props.payload.value).toFixed(2)}%`, props.payload.name]}
                     labelFormatter={() => ''}
                />
                <ReferenceLine y={0} stroke="#canon-border" />
                <Bar dataKey="range">
                    {processedData.data.map((entry, index) => {
                         const isStartOrEnd = entry.name === 'S(t)' || entry.name === 'S(t+1)';
                         const isPositive = entry.value >= 0;
                         const color = isStartOrEnd ? '#00aaff' : (isPositive ? '#33ff99' : '#ff4444');
                        return <Cell key={`cell-${index}`} fill={color} fillOpacity={0.7} />;
                    })}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
};