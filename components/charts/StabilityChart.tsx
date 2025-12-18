import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, ReferenceArea, ReferenceLine, Label, ComposedChart } from 'recharts';
import { SimulationPoint, BlackSwanEvent } from '../../types';

interface StabilityChartProps {
    data: SimulationPoint[];
    events?: BlackSwanEvent[];
}

const modeColors: Record<string, string> = {
    normal: 'transparent',
    burnout: '#ff444433',
    dark: '#9333ea33',
    apophenia: '#f59e0b33',
    corruption: '#4c1d9533',
};

export const StabilityChart: React.FC<StabilityChartProps> = ({ data, events }) => {
    
    const modeSegments = useMemo(() => {
        if (!data || data.length === 0) return [];

        const segments: { x1: number, x2: number, fill: string, label: string }[] = [];
        if (!data[0]?.mode) return [];

        let currentMode = data[0].mode;
        let startDay = data[0].day;

        for (let i = 1; i < data.length; i++) {
            if (data[i].mode !== currentMode) {
                segments.push({
                    x1: startDay,
                    x2: data[i].day,
                    fill: modeColors[currentMode] || '#88888811',
                    label: currentMode,
                });
                currentMode = data[i].mode!;
                startDay = data[i].day;
            }
        }
        segments.push({
            x1: startDay,
            x2: data[data.length - 1].day,
            fill: modeColors[currentMode] || '#88888811',
            label: currentMode,
        });
        return segments;
    }, [data]);
    
    return (
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 30, left: -10, bottom: 20 }}>
                 <defs>
                    <linearGradient id="muGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00aaff" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#00aaff" stopOpacity={0.0}/>
                    </linearGradient>
                    <linearGradient id="sStarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#33ff99" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#33ff99" stopOpacity={0.0}/>
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                <XAxis 
                    dataKey="day" 
                    tick={{ fill: '#888888', fontSize: 12 }} 
                    stroke="#444444"
                    label={{ value: 'Дни', position: 'insideBottom', offset: -10, fill: '#888' }}
                />
                <YAxis 
                    tick={{ fill: '#888888', fontSize: 12 }} 
                    stroke="#444444"
                    domain={[0, 100]}
                    unit="%"
                />
                <Tooltip 
                    contentStyle={{ 
                        backgroundColor: '#1e1e1e', 
                        border: '1px solid #3a3a3a',
                        fontSize: 12
                    }} 
                    labelStyle={{ color: '#d1d1d1' }}
                    formatter={(value: number | undefined, name: string) => [
                        typeof value === 'number' ? value.toFixed(1) : 'N/A', 
                        name
                    ]}
                />
                
                {modeSegments.map((seg, index) => (
                    <ReferenceArea key={index} x1={seg.x1} x2={seg.x2} fill={seg.fill} stroke={seg.fill} strokeOpacity={0.5} ifOverflow="visible" />
                ))}


                <Area type="monotone" dataKey="mu" name="μ (Цель)" stroke="#00aaff" fill="url(#muGradient)" strokeWidth={1} dot={false} strokeDasharray="3 5" />
                <Area type="monotone" dataKey="S_star" name="S* (Равновесие)" stroke="#33ff99" fill="url(#sStarGradient)" strokeWidth={1} dot={false} strokeDasharray="5 5" />
                <Line type="monotone" dataKey="S" name="S (Стабильность)" stroke="#ffffff" strokeWidth={2} dot={false} />

                {events && events.map(event => (
                    <ReferenceLine 
                        key={event.id} 
                        x={event.day} 
                        stroke="#ff4444" 
                        strokeDasharray="4 4"
                    >
                         <Label value={event.label} angle={-90} position="insideTopLeft" fill="#ff4444" fontSize={10} style={{ textAnchor: 'start' }} offset={10} />
                    </ReferenceLine>
                ))}
            </ComposedChart>
        </ResponsiveContainer>
    );
};