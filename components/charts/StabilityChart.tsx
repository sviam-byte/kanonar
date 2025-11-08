import React from 'react';
// FIX: Import 'Label' from 'recharts' to resolve the 'Cannot find name' error.
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, ReferenceArea, ReferenceLine, Label } from 'recharts';
import { SimulationPoint } from '../../types';
import { MissionEvent } from '../../types';

interface EventMark {
    t: number;
    description: string;
}
interface StabilityChartProps {
    data: SimulationPoint[];
    events?: EventMark[];
}

export const StabilityChart: React.FC<StabilityChartProps> = ({ data, events }) => {
    const hasBands = data.length > 0 && data[0].bands !== undefined;
    
    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                 <defs>
                    <linearGradient id="stabilityBandGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00aaff" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#00aaff" stopOpacity={0.05}/>
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                <XAxis 
                    dataKey="day" 
                    tick={{ fill: '#888888', fontSize: 12 }} 
                    stroke="#444444" 
                />
                <YAxis 
                    tick={{ fill: '#888888', fontSize: 12 }} 
                    stroke="#444444"
                    domain={[0, 100]}
                />
                <Tooltip 
                    contentStyle={{ 
                        backgroundColor: '#1e1e1e', 
                        border: '1px solid #3a3a3a',
                        fontSize: 12
                    }} 
                    labelStyle={{ color: '#d1d1d1' }}
                />
                
                {/* Stability Regime Zones */}
                <ReferenceArea y1={70} y2={100} fill="#33ff99" fillOpacity={0.05} label={{ value: 'Normal', position: 'insideTopLeft', fill: '#33ff99', fontSize: 10, dy: 10, dx: 10 }} />
                <ReferenceArea y1={40} y2={70} fill="#f59e0b" fillOpacity={0.05} label={{ value: 'Pre-Monster', position: 'insideTopLeft', fill: '#f59e0b', fontSize: 10, dy: 10, dx: 10 }}/>
                <ReferenceArea y1={0} y2={40} fill="#ff4444" fillOpacity={0.05} label={{ value: 'Crisis', position: 'insideTopLeft', fill: '#ff4444', fontSize: 10, dy: 10, dx: 10 }}/>

                {hasBands && (
                    <>
                        <Area
                            type="monotone"
                            dataKey="bands.p90"
                            stroke="none"
                            fill="url(#stabilityBandGradient)"
                            isAnimationActive={false}
                        />
                         <Area
                            type="monotone"
                            dataKey="bands.p10"
                            stroke="none"
                            fill="#101010" // canon-bg color to "erase" the area below p10
                            fillOpacity={1}
                            isAnimationActive={false}
                        />
                    </>
                )}

                <Line type="monotone" dataKey="S" stroke="#00aaff" strokeWidth={2} dot={false} isAnimationActive={!hasBands} />

                {events && events.map(event => (
                    <ReferenceLine 
                        key={event.t} 
                        x={event.t} 
                        stroke="#ff4444" 
                        strokeDasharray="3 3"
                    >
                         <Label value={event.description} angle={-90} position="insideTopLeft" fill="#ff4444" fontSize={10} style={{ textAnchor: 'start' }} />
                    </ReferenceLine>
                ))}
            </LineChart>
        </ResponsiveContainer>
    );
};