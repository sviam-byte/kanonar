import React from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Label, Cell } from 'recharts';
import { SimulationPoint } from '../../types';

interface PhasePortraitChartProps {
    data: SimulationPoint[];
}

const modeColors: Record<string, string> = {
    normal: '#00aaff',
    burnout: '#ff4444',
    dark: '#9333ea',
    apophenia: '#f59e0b',
};

export const PhasePortraitChart: React.FC<PhasePortraitChartProps> = ({ data }) => {
    
    const chartData = data.filter(p => p.v !== undefined && p.S !== undefined);

    if (chartData.length === 0) {
        return <div className="text-center text-canon-text-light">Недостаточно данных для построения графика.</div>;
    }
    
    return (
        <ResponsiveContainer width="100%" height="90%">
            <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                <CartesianGrid stroke="#3a3a3a" />
                <XAxis type="number" dataKey="S" name="Стабильность (S)" unit="%" domain={[0, 100]} tick={{ fill: '#888888', fontSize: 10 }} stroke="#444444">
                    <Label value="Стабильность (S)" offset={-15} position="insideBottom" fill="#888888" fontSize={12} />
                </XAxis>
                <YAxis type="number" dataKey="v" name="Скорость (v)" domain={['auto', 'auto']} tick={{ fill: '#888888', fontSize: 10 }} stroke="#444444">
                    <Label value="Скорость (v)" angle={-90} position="insideLeft" style={{ textAnchor: 'middle', fill: '#888888', fontSize: 12 }} />
                </YAxis>
                <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }} 
                    contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a' }}
                    itemStyle={{ color: '#d1d1d1' }}
                    labelStyle={{ color: '#888888' }}
                    formatter={(value, name, props) => {
                        const point = props.payload;
                        const formattedValue = typeof value === 'number' ? value.toFixed(4) : value;
                        const day = `День: ${point.day}`;
                        const mode = `Режим: ${point.mode}`;
                        return [<span>{formattedValue}<br/>{day}<br/>{mode}</span>, name];
                    }}
                />
                <Scatter name="Траектория" data={chartData} fill="#8884d8" shape="circle" line={{ stroke: '#4a4a4a', strokeWidth: 1 }} lineType="joint">
                    {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={modeColors[entry.mode || 'normal']} />
                    ))}
                </Scatter>
            </ScatterChart>
        </ResponsiveContainer>
    );
};