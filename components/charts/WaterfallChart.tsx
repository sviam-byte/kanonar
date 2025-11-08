import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface WaterfallChartProps {
    data: { name: string; value: number }[];
}

const CustomWaterfallBar = (props: any) => {
    const { x, y, width, height, payload } = props;

    // Robust guard against invalid/NaN layout props from recharts which can cause crashes.
    if (x === null || y === null || width === null || height === null || isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height) || width < 0 || height < 0) {
        return null;
    }

    const color = payload.name === 'Итог. оценка' ? '#00aaff' : (payload.value >= 0 ? '#33ff99' : '#ff4444');
    return <rect x={x} y={y} width={width} height={height} fill={color} />;
};

export const WaterfallChart: React.FC<WaterfallChartProps> = ({ data }) => {
    
    const processedData = useMemo(() => {
        let cumulative = 0;
        const result = data.map(entry => {
            const start = cumulative;
            cumulative += entry.value;
            return {
                name: entry.name,
                value: entry.value,
                range: [start, cumulative]
            };
        });
        
        result.push({ name: 'Итог. оценка', value: cumulative, range: [0, cumulative] });
        return result;
    }, [data]);

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={processedData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                <XAxis dataKey="name" tick={{ fill: '#888888', fontSize: 12 }} stroke="#444444" />
                <YAxis tick={{ fill: '#888888', fontSize: 12 }} stroke="#444444" />
                <Tooltip 
                     contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a' }}
                     formatter={(value, name, props) => {
                         if (props.payload.name === 'Итог. оценка') {
                             return [props.payload.value.toFixed(2), "Итоговая оценка"];
                         }
                         return [props.payload.value.toFixed(2), "Вклад"];
                     }}
                />
                <ReferenceLine y={0} stroke="#canon-border" />
                <Bar dataKey="range" shape={CustomWaterfallBar} />
            </BarChart>
        </ResponsiveContainer>
    );
};