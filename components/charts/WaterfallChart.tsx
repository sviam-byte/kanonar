
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Label } from 'recharts';

interface WaterfallChartProps {
    data: { name: string; value: number }[];
}


export const WaterfallChart: React.FC<WaterfallChartProps> = ({ data }) => {
    
    const processedData = useMemo(() => {
        let cumulative = 0;
        const result = data.map(entry => {
            const start = cumulative;
            cumulative += entry.value;
            return {
                name: entry.name,
                value: entry.value,
                // For stacked bar: [transparent base, visible bar]
                bar: entry.value >= 0 ? [start, entry.value] : [cumulative, -entry.value],
            };
        });
        
        result.push({ 
            name: 'Итог. оценка', 
            value: cumulative,
            bar: cumulative >= 0 ? [0, cumulative] : [cumulative, -cumulative]
        });
        return result;
    }, [data]);
    
    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={processedData} margin={{ top: 5, right: 20, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                <XAxis dataKey="name" tick={{ fill: '#888888', fontSize: 10 }} stroke="#444444" interval={0} angle={-25} textAnchor="end" height={40} />
                <YAxis tick={{ fill: '#888888', fontSize: 12 }} stroke="#444444">
                   <Label value="Вклад в оценку" angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fill: '#888888', fontSize: 12 }} />
                </YAxis>
                <Tooltip 
                     contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a' }}
                     formatter={(value, name, props) => {
                         // The value from recharts will be the array [start, height]. We want to show the original value.
                         const val = props?.payload?.value;
                         return [typeof val === 'number' ? val.toFixed(2) : 'N/A', "Value"];
                     }}
                     labelFormatter={(label) => label}
                />
                <ReferenceLine y={0} stroke="#canon-border" />
                <Bar dataKey="bar" stackId="a">
                    {processedData.map((entry, index) => {
                         const isTotal = entry.name === 'Итог. оценка';
                         const color = isTotal ? '#00aaff' : (entry.value >= 0 ? '#33ff99' : '#ff4444');
                        return <Bar key={`cell-${index}`} fill={color} fillOpacity={0.7} />;
                    })}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
};
