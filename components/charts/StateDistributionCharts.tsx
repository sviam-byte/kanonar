import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Label } from 'recharts';
import { CharacterState } from '../../types';
// FIX: Correctly import stabilityScore from lib/simulate
import { stabilityScore } from '../../lib/simulate';

interface StateDistributionChartsProps {
    finalStates: CharacterState[];
    simulationHorizon: number;
    // FIX: Add params to props to calculate stability score
    params: Record<string, number>;
}
// Helper to create histogram data
const createHistogramData = (values: number[], bins = 15, domain: [number, number] = [0, 100]) => {
    if (values.length === 0) return [];
    const [min, max] = domain;
    const binWidth = (max - min) / bins;
    const binCounts = Array(bins).fill(0).map((_, i) => ({
        range: min + i * binWidth,
        count: 0,
    }));
    for (const value of values) {
        let binIndex = Math.floor((value - min) / binWidth);
        binIndex = Math.max(0, Math.min(bins - 1, binIndex));
        if (binCounts[binIndex]) {
           binCounts[binIndex].count++;
        }
    }
    return binCounts;
};

const MiniHistogram: React.FC<{data: any[], color: string, domain: [number, number]}> = ({data, color, domain}) => {
    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <XAxis dataKey="range" type="number" domain={domain} tick={false} axisLine={false} tickLine={false} />
                <YAxis tick={false} axisLine={false} tickLine={false} allowDecimals={false} />
                <Bar dataKey="count" fill={color} fillOpacity={0.6} />
            </BarChart>
        </ResponsiveContainer>
    );
}

export const StateDistributionCharts: React.FC<StateDistributionChartsProps> = ({ finalStates, simulationHorizon, params }) => {
    const distributions = useMemo(() => {
        if (!finalStates || finalStates.length === 0) return null;
        
        // FIX: Calculate final S values using the provided params
        const finalSValues = finalStates.map(s => stabilityScore(s, params));
        const finalStressValues = finalStates.map(s => s.stress);
        const finalVsigmaValues = finalStates.map(s => s.vsigma);
        const finalReputationValues = finalStates.map(s => s.reputation);

        return {
            S: createHistogramData(finalSValues),
            stress: createHistogramData(finalStressValues),
            vsigma: createHistogramData(finalVsigmaValues),
            reputation: createHistogramData(finalReputationValues),
        };
    }, [finalStates, params]);

    if (!distributions) return null;

    const charts = [
        { title: `S на день ${simulationHorizon}`, data: distributions.S, color: '#33ff99', domain: [0, 100] as [number, number] },
        { title: 'Стресс (финал)', data: distributions.stress, color: '#ff4444', domain: [0, 100] as [number, number] },
        { title: 'Vσ (финал)', data: distributions.vsigma, color: '#f59e0b', domain: [0, 100] as [number, number] },
        { title: 'Репутация (финал)', data: distributions.reputation, color: '#00ccff', domain: [0, 100] as [number, number] },
    ];

    return (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 h-full">
            {charts.map(chart => (
                <div key={chart.title} className="flex flex-col">
                    <h4 className="font-bold text-canon-text-light text-xs mb-1 text-center">{chart.title}</h4>
                    <div className="w-full flex-grow">
                        <MiniHistogram data={chart.data} color={chart.color} domain={chart.domain} />
                    </div>
                </div>
            ))}
        </div>
    );
};