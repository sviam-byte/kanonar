import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label } from 'recharts';

interface HistogramChartProps {
    data: { value: number }[];
    bins?: number;
    xAxisLabel: string;
    color: string;
}

export const HistogramChart: React.FC<HistogramChartProps> = ({ data, bins = 10, xAxisLabel, color }) => {
    const histogramData = useMemo(() => {
        if (data.length === 0) return [];

        const values = data.map(d => d.value).filter(v => isFinite(v));
        if (values.length === 0) return [];

        const min = Math.min(...values);
        const max = Math.max(...values);
        
        // Handle case where all values are the same
        const effectiveMax = max > min ? max : min + 1;
        const binWidth = (effectiveMax - min) / bins;

        const binCounts = Array(bins).fill(0).map((_, i) => ({
            range: `${(min + i * binWidth).toFixed(1)}-${(min + (i + 1) * binWidth).toFixed(1)}`,
            count: 0,
        }));

        for (const value of values) {
            let binIndex = binWidth > 0 ? Math.floor((value - min) / binWidth) : 0;
            if (binIndex === bins) binIndex--; // Include max value in the last bin
            binIndex = Math.max(0, Math.min(bins - 1, binIndex));
            if (binCounts[binIndex]) {
               binCounts[binIndex].count++;
            }
        }
        return binCounts;

    }, [data, bins]);

    if (!histogramData || histogramData.length === 0) {
        return <div className="text-xs text-canon-text-light text-center pt-8">Нет данных</div>;
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogramData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <defs>
                    <linearGradient id={`histGradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.8}/>
                        <stop offset="95%" stopColor={color} stopOpacity={0.3}/>
                    </linearGradient>
                </defs>
                <XAxis dataKey="range" tick={{ fill: '#888888', fontSize: 9 }} stroke="#3a3a3a" />
                <YAxis tick={{ fill: '#888888', fontSize: 10 }} stroke="#3a3a3a" allowDecimals={false} />
                <Tooltip 
                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                    contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a', borderRadius: '4px', fontSize: 12 }}
                    labelStyle={{ color: '#d1d1d1' }}
                    formatter={(value: number) => [value, 'Количество']}
                    labelFormatter={(label) => `${xAxisLabel}: ${label}`}
                />
                <Bar dataKey="count" fill={`url(#histGradient-${color.replace('#', '')})`} radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
};