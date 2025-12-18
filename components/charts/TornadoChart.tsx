
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Label } from 'recharts';

interface TornadoChartProps {
    data: { name: string; impact: number }[];
}

export const TornadoChart: React.FC<TornadoChartProps> = ({ data }) => {
    
    const processedData = useMemo(() => {
        return data.map(item => ({
            name: item.name,
            positive: item.impact > 0 ? item.impact : null,
            negative: item.impact <= 0 ? item.impact : null,
        }));
    }, [data]);

    const maxImpact = useMemo(() => {
        return data.length > 0 ? Math.max(...data.map(d => Math.abs(d.impact))) : 1;
    }, [data]);

    const domain = [-maxImpact * 1.1, maxImpact * 1.1];

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart
                layout="vertical"
                data={processedData}
                margin={{ top: 5, right: 30, left: 40, bottom: 20 }}
            >
                <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                <XAxis type="number" domain={domain} tick={{ fill: '#888888', fontSize: 12 }} stroke="#444444">
                   <Label value="Влияние на оценку" offset={-15} position="insideBottom" fill="#888888" fontSize={12}/>
                </XAxis>
                <YAxis type="category" dataKey="name" width={100} tick={{ fill: '#d1d1d1', fontSize: 10 }} stroke="#444444" interval={0} />
                <Tooltip 
                     contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a', fontSize: 12 }}
                     formatter={(value: number, name: string, props: any) => {
                        const originalValue = props.payload.positive ?? props.payload.negative;
                        if (originalValue === null || originalValue === undefined) return [0, 'Изменение оценки'];
                        return [originalValue.toFixed(2), 'Изменение оценки'];
                     }}
                     labelFormatter={(label) => label}
                />
                <ReferenceLine x={0} stroke="#canon-border" />
                <Bar dataKey="positive" fill="#33ff99" stackId="a" />
                <Bar dataKey="negative" fill="#ff4444" stackId="a" />
            </BarChart>
        </ResponsiveContainer>
    );
};
