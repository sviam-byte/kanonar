
import React from 'react';
import { ToMReport, RecvScoreComponent } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Label } from 'recharts';

interface ToMReportModalProps {
    report: ToMReport | null;
    onClose: () => void;
}

const MetricRow: React.FC<{ label: string; value: number; format?: (v: number) => string; tooltip?: string; }> = ({ label, value, format = (v) => (v ?? 0).toFixed(3), tooltip }) => (
    <div className="flex justify-between items-baseline" title={tooltip}>
        <span className="text-canon-text-light">{label}:</span>
        <span className="font-mono font-bold">{format(value)}</span>
    </div>
);

const ContributionChart: React.FC<{ data: RecvScoreComponent[] }> = ({ data }) => {
    const chartData = data.map(d => ({
        name: d.name,
        contribution: d.contribution,
        color: d.weight > 0 ? '#33ff99' : '#ff4444'
    })).sort((a,b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    return (
        <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 120, bottom: 5 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fill: '#d1d1d1', fontSize: 10 }} width={120} interval={0} />
                <Tooltip 
                    cursor={{fill: '#ffffff10'}}
                    contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a', fontSize: 12 }}
                    formatter={(val: number) => [(val ?? 0).toFixed(3), 'Вклад']}
                />
                <Bar dataKey="contribution">
                    {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
};


export const ToMReportModal: React.FC<ToMReportModalProps> = ({ report, onClose }) => {
    if (!report) return null;
    
    const { observer, target, donationProbability, recvScore, recvScoreBreakdown, trust, goalAlignment, normConflict } = report;

    const probColor = donationProbability > 0.66 ? 'text-canon-green' : donationProbability > 0.33 ? 'text-yellow-400' : 'text-canon-red';

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center animate-fade-in" onClick={onClose}>
            <div className="bg-canon-bg-light border border-canon-border rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-canon-border">
                    <h3 className="text-lg font-bold text-canon-accent">Отчет "Теории Разума"</h3>
                    <p className="text-sm text-canon-text-light">
                        Как <span className="font-bold text-canon-text">{observer.title}</span> воспринимает <span className="font-bold text-canon-text">{target.title}</span>
                    </p>
                </div>

                <div className="p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                    {/* Left Column: Summary */}
                    <div className="space-y-4">
                        <div className="bg-canon-bg border border-canon-border/50 rounded-lg p-4 text-center">
                            <h4 className="text-sm font-semibold text-canon-text-light mb-1">Вероятность донорства целей (j → i)</h4>
                            <p className={`font-mono text-5xl font-bold ${probColor}`}>
                                {(donationProbability * 100).toFixed(1)}%
                            </p>
                            <p className="text-xs text-canon-text-light mt-1">
                                (RecvScore: {recvScore.toFixed(3)})
                            </p>
                        </div>
                         <div className="bg-canon-bg border border-canon-border/50 rounded-lg p-4 space-y-2">
                             <h4 className="font-bold text-canon-text mb-2">Ключевые метрики Rapport</h4>
                            <MetricRow label="Доверие (Trust)" value={trust} />
                            <MetricRow label="Совпадение целей (Cosine)" value={goalAlignment.cosine} />
                            <MetricRow label="Конфликт норм" value={normConflict} />
                        </div>
                    </div>

                    {/* Right Column: Breakdown */}
                    <div className="bg-canon-bg border border-canon-border/50 rounded-lg p-4">
                         <h4 className="font-bold text-canon-text mb-2">Причины: Вклад в RecvScore</h4>
                         <p className="text-xs text-canon-text-light mb-2">Показывает, какие факторы оказали наибольшее положительное (зеленый) или отрицательное (красный) влияние на итоговую оценку.</p>
                         <div className="h-64">
                            <ContributionChart data={recvScoreBreakdown} />
                         </div>
                         <div className="max-h-48 overflow-y-auto mt-2 text-xs border-t border-canon-border/50 pt-2">
                             <table className="w-full">
                                <thead>
                                    <tr className="font-semibold text-canon-text-light">
                                        <th className="text-left py-1">Фактор</th>
                                        <th className="text-right py-1">Значение</th>
                                        <th className="text-right py-1">Вес</th>
                                        <th className="text-right py-1">Вклад</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recvScoreBreakdown.map(item => (
                                        <tr key={item.name} title={item.tooltip} className="hover:bg-canon-border/20">
                                            <td className="py-0.5">{item.name}</td>
                                            <td className="text-right font-mono py-0.5">{(item.value ?? 0).toFixed(2)}</td>
                                            <td className="text-right font-mono py-0.5">{(item.weight ?? 0).toFixed(2)}</td>
                                            <td className={`text-right font-mono py-0.5 ${item.contribution >= 0 ? 'text-canon-green' : 'text-canon-red'}`}>
                                                {(item.contribution ?? 0).toFixed(3)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                             </table>
                         </div>
                    </div>
                </div>

                <div className="p-4 border-t border-canon-border text-right">
                    <button onClick={onClose} className="bg-canon-accent text-canon-bg font-bold rounded px-4 py-2 hover:bg-opacity-80 transition-colors text-sm">
                        Закрыть
                    </button>
                </div>
            </div>
        </div>
    );
};
