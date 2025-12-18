
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { RunLog, CharacterEntity, MatrixRunResult } from '../../types';
import { getEntityById } from '../../data';

interface MultiLineChartProps {
    results: MatrixRunResult[];
    dataKey: keyof RunLog;
    title: string;
}

const COLORS = ['#00aaff', '#33ff99', '#ffaa00', '#ff4444', '#a855f7', '#2dd4bf', '#facc15', '#a3e635', '#22d3ee', '#f472b6'];

export const MultiLineChart: React.FC<MultiLineChartProps> = ({ results, dataKey, title }) => {
    
    const { chartData, seriesNames } = useMemo(() => {
        if (!results || results.length === 0) return { chartData: [], seriesNames: [] };

        const seriesMap = new Map<string, { [time: number]: number[] }>();

        for (const run of results) {
            for (const agentId in run.logs) {
                const agentName = getEntityById(agentId)?.title.split(' ')[0] || agentId;
                const seriesName = `${agentName} - ${run.sid.split('-')[0]} - ${run.strategy}`;

                if (!seriesMap.has(seriesName)) {
                    seriesMap.set(seriesName, {});
                }
                const series = seriesMap.get(seriesName)!;
                const logs = run.logs[agentId];

                for (const log of logs) {
                    if (!series[log.t]) {
                        series[log.t] = [];
                    }
                    const value = log[dataKey];
                    if (typeof value === 'number') {
                        series[log.t].push(value);
                    }
                }
            }
        }

        const horizon = results[0]?.logs[Object.keys(results[0].logs)[0]]?.length || 0;
        if (horizon === 0) return { chartData: [], seriesNames: [] };
        
        const finalChartData = [];

        for (let t = 0; t < horizon; t++) {
            const dataPoint: { t: number, [key: string]: number } = { t };
            seriesMap.forEach((series, name) => {
                if (series[t] && series[t].length > 0) {
                    const avg = series[t].reduce((a, b) => a + b, 0) / series[t].length;
                    dataPoint[name] = avg;
                }
            });
            finalChartData.push(dataPoint);
        }

        return { chartData: finalChartData, seriesNames: Array.from(seriesMap.keys()) };

    }, [results, dataKey]);

    return (
        <div className="w-full h-full flex flex-col">
            <h3 className="font-bold text-lg text-canon-text mb-4 text-center">{title}</h3>
            <div className="flex-grow">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                        <XAxis 
                            dataKey="t" 
                            tick={{ fill: '#888888', fontSize: 12 }} 
                            stroke="#444444"
                            label={{ value: 'Шаги симуляции (t)', position: 'insideBottom', offset: -10, fill: '#888' }}
                        />
                        <YAxis 
                            tick={{ fill: '#888888', fontSize: 12 }} 
                            stroke="#444444"
                            domain={[0, 'auto']}
                        />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a', fontSize: 12 }} 
                            labelStyle={{ color: '#d1d1d1' }}
                            formatter={(value: number) => typeof value === 'number' ? value.toFixed(2) : 'N/A'}
                        />
                        <Legend wrapperStyle={{fontSize: "12px", bottom: 0}} />
                        
                        {seriesNames.map((name, index) => (
                            <Line 
                                key={name}
                                type="monotone" 
                                dataKey={name} 
                                stroke={COLORS[index % COLORS.length]} 
                                strokeWidth={2} 
                                dot={false}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
