
import React, { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, Label } from 'recharts';
import { PersonalEvent } from '../types';
import { computeBiographyLatent, mapPersonalToBio, BIO_FEATURES, BioFeatureId } from '../lib/biography';

interface BiographyTimelineProps {
    events: PersonalEvent[];
}

const FEATURE_COLORS: Record<BioFeatureId, string> = {
    TRAUMA: '#ff4444',
    TRUST: '#33ff99',
    POWER: '#f59e0b',
    AGENCY: '#00aaff',
    ORDER: '#a855f7',
    CHAOS: '#d946ef'
};

export const BiographyTimeline: React.FC<BiographyTimelineProps> = ({ events }) => {
    const sortedEvents = useMemo(() => {
        return [...events].sort((a, b) => (b.years_ago ?? 0) - (a.years_ago ?? 0)); // Oldest first
    }, [events]);

    const chartData = useMemo(() => {
        if (sortedEvents.length === 0) return [];

        // Determine time range. Max years ago + buffer to 0 (present)
        const maxYears = Math.max(...sortedEvents.map(e => e.years_ago ?? 0), 1) + 1;
        const now = Date.now();
        
        // Generate time points
        const points = [];
        const STEPS = 60;
        
        for (let i = 0; i <= STEPS; i++) {
            const t = (i / STEPS); // 0 to 1
            const yearsAgo = maxYears * (1 - t); // Max to 0
            
            // To simulate the state "at that time", we define a "Simulation Now"
            const simTime = now - (yearsAgo * 365 * 24 * 60 * 60 * 1000);
            
            // We only include events that happened BEFORE or AT 'simTime'
            // An event happened if its timestamp < simTime
            // event.t is calculated as now - years_ago * year_ms
            // So event.t < simTime means event happened before the simulation point?
            // Wait. 
            // Event T: 1990. Sim T: 2000. 1990 < 2000. Correct.
            
            const activeEvents = sortedEvents.filter(e => e.t <= simTime);
            
            // We pass these active events to the engine, but we set the engine's "NOW" to simTime.
            // This allows the engine to calculate decay correctly relative to that moment in history.
            
            const bio = {
                characterId: 'temp',
                events: activeEvents.map(mapPersonalToBio)
            };
            
            const latentVector = computeBiographyLatent(bio, simTime);
            
            const point: any = { yearsAgo: -yearsAgo }; // Negative for X-axis (Past -> Present)
            
            BIO_FEATURES.forEach((feat, idx) => {
                point[feat] = latentVector[idx];
            });
            
            points.push(point);
        }
        
        return points;

    }, [sortedEvents]);

    if (sortedEvents.length === 0) {
        return <div className="text-canon-text-light text-sm italic p-4">Нет событий для отображения временной шкалы.</div>;
    }

    return (
        <div className="h-64 w-full bg-canon-bg border border-canon-border rounded-lg p-4">
            <h4 className="text-sm font-bold text-canon-text mb-2">Эволюция Латента (Накопленный опыт)</h4>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                    <XAxis 
                        dataKey="yearsAgo" 
                        type="number" 
                        domain={['auto', 0]} 
                        tickFormatter={(val) => `${Math.abs(val).toFixed(1)}y`} 
                        tick={{ fill: '#888', fontSize: 10 }} 
                        stroke="#444444"
                    >
                         <Label value="Время (лет назад)" offset={-15} position="insideBottom" fill="#888888" fontSize={10} />
                    </XAxis>
                    <YAxis domain={[-1, 1]} tick={{ fill: '#888', fontSize: 10 }} stroke="#444444" />
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a', fontSize: 11 }}
                        labelFormatter={(val) => `${Math.abs(Number(val)).toFixed(1)} лет назад`}
                        formatter={(value: number) => value.toFixed(2)}
                    />
                    <Legend wrapperStyle={{fontSize: '10px', bottom: -10}} />
                    
                    {BIO_FEATURES.map(feat => (
                        <Line 
                            key={feat} 
                            type="monotone" 
                            dataKey={feat} 
                            stroke={FEATURE_COLORS[feat]} 
                            strokeWidth={2} 
                            dot={false} 
                        />
                    ))}
                    
                    {sortedEvents.map((ev, idx) => (
                        <ReferenceLine 
                            key={idx} 
                            x={-(ev.years_ago ?? 0)} 
                            stroke="#444" 
                            strokeDasharray="3 3"
                        >
                             <Label 
                                value={ev.name} 
                                position="insideTop" 
                                angle={-90} 
                                fill="#666" 
                                fontSize={9} 
                                offset={10}
                                style={{textAnchor: 'start'}}
                             />
                        </ReferenceLine>
                    ))}
                    
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};
