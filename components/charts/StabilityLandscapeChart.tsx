
import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot, ReferenceLine, Label } from 'recharts';
import { CalculatedMetrics } from '../../types';

interface StabilityLandscapeChartProps {
    metrics: CalculatedMetrics;
}

export const StabilityLandscapeChart: React.FC<StabilityLandscapeChartProps> = ({ metrics }) => {
    const { stability, S } = metrics;
    const { kappa, h, mu, S_star } = stability;

    const potentialData = useMemo(() => {
        if (kappa === undefined || h === undefined || mu === undefined) {
            return [];
        }

        const data = [];
        for (let s_val = 0; s_val <= 100; s_val += 2) {
            const s_norm = s_val / 100;
            // V(S) = - ∫ F(S) dS = - ∫ (-κμ + (κ+h)S) dS = κμS - 0.5(κ+h)S²
            const potential = (kappa * mu * s_norm) - 0.5 * (kappa + h) * Math.pow(s_norm, 2);
            data.push({ S: s_val, V: potential });
        }
        return data;
    }, [kappa, h, mu]);

    if (potentialData.length === 0) {
        return <div className="h-full flex items-center justify-center text-canon-text-light text-sm">Нет данных для построения ландшафта.</div>;
    }

    const currentPotential = (kappa! * mu! * (S/100)) - 0.5 * (kappa! + h!) * Math.pow((S/100), 2);

    return (
        <ResponsiveContainer width="100%" height="90%">
            <AreaChart data={potentialData} margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                 <defs>
                    <linearGradient id="potentialGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4c1d95" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#4c1d95" stopOpacity={0.1}/>
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                <XAxis dataKey="S" name="Стабильность (S)" unit="%" tick={{ fill: '#888888', fontSize: 10 }} stroke="#444444">
                    <Label value="Пространство состояний стабильности (S)" offset={-15} position="insideBottom" fill="#888888" fontSize={12} />
                </XAxis>
                <YAxis dataKey="V" name="Потенциал (V)" tick={{ fill: '#888888', fontSize: 10 }} stroke="#444444" domain={['auto', 'auto']}>
                     <Label value="Потенциал V(S)" angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fill: '#888888', fontSize: 12 }} />
                </YAxis>
                <Tooltip 
                    contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a' }}
                    formatter={(value: number) => [typeof value === 'number' ? value.toFixed(4) : 'N/A', "Потенциал"]}
                />
                <Area type="monotone" dataKey="V" stroke="#8b5cf6" fill="url(#potentialGradient)" />
                
                {S_star != null && (
                     <ReferenceLine x={S_star} stroke="#33ff99" strokeDasharray="3 3">
                        <Label value={`S*=${S_star.toFixed(1)}`} position="top" fill="#33ff99" fontSize={12} />
                     </ReferenceLine>
                )}
               
                <ReferenceDot x={S} y={currentPotential} r={8} fill="#ffffff" stroke="#000000" strokeWidth={2}>
                     <Label value="S" position="top" fill="#ffffff" fontSize={12} dy={-10} />
                </ReferenceDot>

            </AreaChart>
        </ResponsiveContainer>
    );
};
