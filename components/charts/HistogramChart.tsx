import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label } from 'recharts';

interface HistogramChartProps {
    data: { value: number }[];
    bins?: number;
}

export const HistogramChart: React.FC<HistogramChartProps> = ({ data, bins = 10 }) => {
    const histogramData = useMemo(() => {
        if (data.length === 0) return [];

        const values = data.map(d => d.value);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const binWidth = (max - min) / bins;

        const binCounts = Array(bins).fill(0).map((_, i) => ({
            range: `${(min + i * binWidth).toFixed(1)}-${(min + (i + 1) * binWidth).toFixed(1)}`,
            count: 0,
        }));

        for (const value of values) {
            let binIndex = Math.floor((value - min) / binWidth);
            if (binIndex === bins) binIndex--; // Include max value in the last bin
            if (binCounts[binIndex]) {
               binCounts[binIndex].count++;
            }
        }
        return binCounts;

    }, [data, bins]);

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogramData} margin={{ top: 5, right: 20, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                <XAxis dataKey="range" tick={{ fill: '#888888', fontSize: 10 }} stroke="#444444">
                   <Label value="Deal Value" offset={-15} position="insideBottom" fill="#888888" fontSize={12}/>
                </XAxis>
                <YAxis tick={{ fill: '#888888', fontSize: 12 }} stroke="#444444">
                   <Label value="Frequency" angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fill: '#888888', fontSize: 12 }} />
                </YAxis>
                <Tooltip 
                    contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a', fontSize: 12 }}
                    labelStyle={{ color: '#d1d1d1' }}
                    formatter={(value: number) => [value, 'Count']}
                />
                <Bar dataKey="count" fill="#00aaff" fillOpacity={0.7} />
            </BarChart>
        </ResponsiveContainer>
    );
};
