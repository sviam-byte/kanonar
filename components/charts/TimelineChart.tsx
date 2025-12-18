
import React from 'react';
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Area, Line, ReferenceArea, Label } from 'recharts';
import { SimulationPoint, VisualizationPlanStep } from '../../types';

interface TimelineChartProps {
    data: SimulationPoint[];
    plan: VisualizationPlanStep[];
}

export const TimelineChart: React.FC<TimelineChartProps> = ({ data, plan }) => {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                <XAxis dataKey="day" tick={{ fill: '#888888', fontSize: 12 }} stroke="#444444" unit="d" />
                <YAxis yAxisId="left" orientation="left" domain={[0, 100]} tick={{ fill: '#ffffff', fontSize: 12 }} stroke="#444444" unit="%" />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#888888', fontSize: 12 }} stroke="#444444" />
                <Tooltip 
                    contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a' }} 
                    formatter={(value: number) => typeof value === 'number' ? value.toFixed(2) : 'N/A'}
                />
                <Legend wrapperStyle={{fontSize: "12px"}}/>

                {plan.map(step => (
                    <ReferenceArea 
                        key={`${step.goal.id}-${step.t0}`} 
                        yAxisId="left" 
                        x1={step.t0} 
                        x2={step.t1} 
                        stroke="#00aaff" 
                        strokeOpacity={0.5} 
                        fill="#00aaff" 
                        fillOpacity={0.1}
                    >
                         <Label value={step.goal.name} position="insideTop" fill="#00aaff" fontSize={10} angle={-90} dx={10} />
                    </ReferenceArea>
                ))}

                <Area yAxisId="left" type="monotone" dataKey="S" name="Стабильность" fill="#ffffff" stroke="#ffffff" fillOpacity={0.1} strokeWidth={2} />
                <Line yAxisId="left" type="monotone" dataKey="stress" name="Стресс" stroke="#ff4444" dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="fatigue" name="Усталость" stroke="#f59e0b" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="debts.attention" name="Долг (Внимание)" stroke="#888888" strokeDasharray="3 3" dot={false} />
                 <Line yAxisId="right" type="monotone" dataKey="debts.risk" name="Долг (Риск)" stroke="#cccccc" strokeDasharray="5 5" dot={false} />
            </ComposedChart>
        </ResponsiveContainer>
    );
};
