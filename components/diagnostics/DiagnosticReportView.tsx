// components/diagnostics/DiagnosticReportView.tsx
import React from 'react';
// FIX: Add missing import for CharacterDiagnosticTimeseries.
import { DiagnosticReport, CharacterDiagnosticTimeseries } from '../../lib/diagnostics/types';
import { Tabs } from '../Tabs';
import { DiagnosticChart } from '../charts/DiagnosticChart';
import { getEntityById } from '../../data';

export const DiagnosticReportView: React.FC<{ report: DiagnosticReport }> = ({ report }) => {
    const { summary, timeseries, characters } = report;

    const summaryTab = (
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
                <thead className="bg-canon-bg text-canon-text-light">
                    <tr>
                        <th className="p-2">Персонаж</th>
                        <th className="p-2 text-center">Срыв (тик)</th>
                        <th className="p-2 text-center">Время в 'dark'</th>
                        <th className="p-2 text-center">Макс. тень</th>
                        <th className="p-2 text-center">Δ Самооценка</th>
                    </tr>
                </thead>
                <tbody>
                    {characters.map(id => {
                        const charSummary = summary[id];
                        if (!charSummary) return null;
                        return (
                            <tr key={id} className="border-t border-canon-border/50">
                                <td className="p-2 font-bold">{getEntityById(id)?.title}</td>
                                <td className="p-2 text-center font-mono">{charSummary.timeToBreakdown ?? 'N/A'}</td>
                                <td className="p-2 text-center font-mono">{charSummary.timeInDark}</td>
                                <td className="p-2 text-center font-mono">{(charSummary.maxShadowProb * 100).toFixed(1)}%</td>
                                <td className="p-2 text-center font-mono">
                                    {(charSummary.axesShift['G_Self_concept_strength'] ?? 0).toFixed(3)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );

    const metricsForChart: { key: keyof Omit<CharacterDiagnosticTimeseries, 'tick' | 'mode' | 'trustTo' | 'conflictTo'>, name: string }[] = [
        { key: 'S', name: 'Стабильность (S)' },
        { key: 'stress', name: 'Стресс' },
        { key: 'shadowProb', name: 'Вероятность тени' },
        { key: 'EW', name: 'Этическая масса (EW)' },
        { key: 'prMonstro', name: 'P(Монстр)' },
    ];

    const chartsTab = (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {metricsForChart.map(metric => (
                <div key={metric.key} className="h-64 bg-canon-bg p-2 rounded border border-canon-border/50">
                    <DiagnosticChart 
                        title={metric.name}
                        timeseries={timeseries}
                        dataKey={metric.key}
                    />
                </div>
            ))}
        </div>
    );

    const tabs = [
        { label: 'Сводка', content: summaryTab },
        { label: 'Графики', content: chartsTab },
    ];

    return (
        <div>
            <h3 className="text-xl font-bold mb-4">Отчет: <span className="text-canon-accent">{report.scenarioId}</span></h3>
            <Tabs tabs={tabs} />
        </div>
    );
};