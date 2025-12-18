import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { METRIC_NAMES } from '../lib/archetypes/metrics';

interface ArchetypeMetricsPanelProps {
    metrics: Record<string, number>;
    title?: string;
}

const getMetricColor = (value: number) => {
    const t = value; // value is already 0-1
    if (t > 0.66) return '#33ff99'; // green
    if (t < 0.33) return '#ff4444'; // red
    return '#f59e0b'; // yellow
};

export const ArchetypeMetricsPanel: React.FC<ArchetypeMetricsPanelProps> = ({ metrics, title }) => {

    const chartData = Object.entries(metrics).map(([key, value]) => ({
        name: METRIC_NAMES[key] || key,
        value: value,
    }));

    return (
        <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
            {title && <h3 className="font-bold mb-4 text-canon-text">{title}</h3>}
            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
                        <XAxis type="number" domain={[0, 1]} tick={{ fill: '#888' }} />
                        <YAxis type="category" dataKey="name" tick={{ fill: '#d1d1d1', fontSize: 10 }} width={120} interval={0} />
                        <Tooltip
                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                            contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a' }}
                            formatter={(value: number | undefined) => [typeof value === 'number' ? value.toFixed(3) : 'N/A', 'Value']}
                        />
                        <Bar dataKey="value" barSize={15}>
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={getMetricColor(entry.value as number)} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};