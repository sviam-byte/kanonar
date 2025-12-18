
// components/charts/DiagnosticChart.tsx
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CharacterDiagnosticTimeseries } from '../../lib/diagnostics/types';
import { getEntityById } from '../../data';

interface DiagnosticChartProps {
    title: string;
    timeseries: Record<string, CharacterDiagnosticTimeseries>;
    dataKey: keyof Omit<CharacterDiagnosticTimeseries, 'tick' | 'trustTo' | 'conflictTo' | 'mode'>;
}

const COLORS = ['#00aaff', '#33ff99', '#ffaa00', '#ff4444', '#a855f7', '#2dd4bf'];

export const DiagnosticChart: React.FC<DiagnosticChartProps> = ({ title, timeseries, dataKey }) => {
    
    const chartData = useMemo(() => {
        const characterIds = Object.keys(timeseries);
        if (characterIds.length === 0) return [];
        
        const firstCharTs = timeseries[characterIds[0]];
        if (!firstCharTs || !firstCharTs.tick) return [];

        const data = firstCharTs.tick.map((t, i) => {
            const point: Record<string, number> = { tick: t };
            for (const id of characterIds) {
                const charName = getEntityById(id)?.title || id;
                const value = (timeseries[id][dataKey] as number[])[i] ?? 0;
                // For shadowProb, which is 0-1, scale to 0-100 for better axis display with other metrics
                point[charName] = (dataKey === 'shadowProb' || dataKey === 'prMonstro' || dataKey === 'EW') ? value * 100 : value;
            }
            return point;
        });
        return data;
    }, [timeseries, dataKey]);

    const characterNames = Object.keys(timeseries).map(id => getEntityById(id)?.title || id);
    const yAxisUnit = (dataKey === 'shadowProb' || dataKey === 'prMonstro' || dataKey === 'EW') ? '%' : undefined;


    return (
        <div className="w-full h-full flex flex-col">
            <h4 className="font-bold text-xs text-canon-text-light mb-2 text-center">{title}</h4>
            <div className="flex-grow">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                        <XAxis dataKey="tick" tick={{ fill: '#888', fontSize: 10 }} stroke="#444444" />
                        <YAxis tick={{ fill: '#888', fontSize: 10 }} stroke="#444444" unit={yAxisUnit} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a', fontSize: 12 }} 
                            labelStyle={{ color: '#d1d1d1' }}
                            formatter={(value: number) => typeof value === 'number' ? `${value.toFixed(2)}${yAxisUnit || ''}` : 'N/A'}
                        />
                        <Legend wrapperStyle={{fontSize: "10px", bottom: -10}} />
                        {characterNames.map((name, i) => (
                             <Line 
                                key={name}
                                type="monotone" 
                                dataKey={name} 
                                stroke={COLORS[i % COLORS.length]} 
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
