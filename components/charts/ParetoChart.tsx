import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label, ZAxis } from 'recharts';

interface ParetoChartProps {
    data: { x: number; y: number; z: number; name: string }[];
}

export const ParetoChart: React.FC<ParetoChartProps> = ({ data }) => {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                <CartesianGrid stroke="#3a3a3a" />
                <XAxis type="number" dataKey="x" name="CVaR (Риск)" unit="" tick={{ fill: '#888888', fontSize: 10 }} stroke="#444444">
                    <Label value="CVaR (Риск →)" offset={-15} position="insideBottom" fill="#888888" fontSize={12} />
                </XAxis>
                <YAxis type="number" dataKey="y" name="E[Ценность]" unit="" tick={{ fill: '#888888', fontSize: 10 }} stroke="#444444">
                    <Label value="E[Ценность]" angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fill: '#888888', fontSize: 12 }} />
                </YAxis>
                <ZAxis type="number" dataKey="z" range={[60, 400]} name="Оценка" unit="" />
                <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }} 
                    contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a' }}
                    itemStyle={{ color: '#d1d1d1' }}
                    labelStyle={{ color: '#888888' }}
                />
                <Scatter name="Переговорщики" data={data} fill="#00aaff" fillOpacity={0.7} shape="circle" />
            </ScatterChart>
        </ResponsiveContainer>
    );
};
