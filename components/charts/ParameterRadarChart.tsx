import React, { useMemo } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Parameter } from '../../types';

interface ParameterRadarChartProps {
    parameters: Parameter[];
    paramValues: Record<string, number>;
}

export const ParameterRadarChart: React.FC<ParameterRadarChartProps> = ({ parameters, paramValues }) => {

    const chartData = useMemo(() => {
        return parameters.map(p => {
            const value = paramValues[p.key] || 0;
            const normalizedValue = (value - p.min) / (p.max - p.min) * 100;
            return {
                subject: p.name.length > 15 ? p.key : p.name,
                value: normalizedValue,
                fullMark: 100
            };
        });
    }, [parameters, paramValues]);

    return (
        <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                <PolarGrid stroke="#3a3a3a"/>
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#888888', fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: 'none' }} axisLine={{ stroke: 'none' }}/>
                <Radar name="Value" dataKey="value" stroke="#00aaff" fill="#00aaff" fillOpacity={0.6} />
                 <Tooltip 
                    contentStyle={{ 
                        backgroundColor: '#1e1e1e', 
                        border: '1px solid #3a3a3a',
                        fontSize: 12
                    }} 
                    formatter={(value: number) => [`${value.toFixed(1)}%`, 'Normalized']}
                />
            </RadarChart>
        </ResponsiveContainer>
    );
};
