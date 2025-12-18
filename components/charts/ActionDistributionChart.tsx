
import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { RunLog, MatrixRunResult } from '../../types';
import { getEntityById } from '../../data';

interface ActionDistributionChartProps {
    results: MatrixRunResult[];
}

const COLORS = ['#00aaff', '#33ff99', '#ffaa00', '#ff4444', '#a855f7', '#2dd4bf', '#facc15', '#a3e635', '#22d3ee', '#f472b6'];

export const ActionDistributionChart: React.FC<ActionDistributionChartProps> = ({ results }) => {

    const actionCounts = useMemo(() => {
        const groupData = new Map<string, { [action: string]: number }>();
        const allActions = new Set<string>();

        for (const run of results) {
            for (const agentId in run.logs) {
                 const agentName = getEntityById(agentId)?.title.split(' ')[0] || agentId;
                 const groupName = `${agentName} - ${run.strategy}`;

                 if (!groupData.has(groupName)) {
                     groupData.set(groupName, {});
                 }
                 const groupActions = groupData.get(groupName)!;

                 for (const log of run.logs[agentId]) {
                     if (log.action && log.action !== 'none') {
                         groupActions[log.action] = (groupActions[log.action] || 0) + 1;
                         allActions.add(log.action);
                     }
                 }
            }
        }

        const chartData = Array.from(groupData.entries()).map(([name, actions]) => ({
            name,
            ...actions
        }));
        
        return { chartData, actionKeys: Array.from(allActions) };

    }, [results]);

    if (!actionCounts.chartData || actionCounts.chartData.length === 0) {
        return null;
    }

    return (
        <div className="w-full h-full flex flex-col">
            <h3 className="font-bold text-lg text-canon-text mb-4 text-center">Распределение Действий (Частота)</h3>
            <div className="flex-grow">
                <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={actionCounts.chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a"/>
                        <XAxis dataKey="name" tick={{ fill: '#888888', fontSize: 10 }} />
                        <YAxis tick={{ fill: '#888888', fontSize: 12 }} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a' }}
                            cursor={{fill: 'rgba(255,255,255,0.05)'}}
                        />
                        <Legend wrapperStyle={{fontSize: "12px"}}/>
                        {actionCounts.actionKeys.map((key, index) => (
                            <Bar key={key} dataKey={key} stackId="a" fill={COLORS[index % COLORS.length]} />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
