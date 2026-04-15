
// components/ScenarioMetricsDisplay.tsx
import React from 'react';
import { ScenarioState } from '../types';

interface MetricProps {
    label: string;
    value: string | number;
    color?: string;
    isBar?: boolean;
    max?: number;
}
const Metric: React.FC<MetricProps> = ({ label, value, color, isBar, max = 100 }) => {
    // Clamp the value for bar width calculation to be within [0, max] for CSS validity
    const clampedValueForBar = Math.max(0, Number(value));
    // The bar width should not exceed 100% even if value > max
    const barPercentage = Math.min(100, (clampedValueForBar / max) * 100);
    const barWidth = isBar ? `${barPercentage}%` : '0%';
    const barColor = isBar ? color || '#00aaff' : 'transparent';

    // Format the displayed value for readability
    let displayValue: string;
    if (isBar) {
        // For bars, always show as integer percentage, but use original value
        displayValue = `${Number(value).toFixed(0)}%`;
    } else if (typeof value === 'number') {
        // For non-bars, show one decimal if it's a float, otherwise show as integer
        if (Math.abs(value - Math.round(value)) < 0.001) {
            displayValue = value.toFixed(0);
        } else {
            displayValue = value.toFixed(1);
        }
    } else {
        displayValue = String(value);
    }

    return (
        <div className="text-xs">
            <div className="flex justify-between items-baseline mb-0.5">
                <span className="text-canon-text-light">{label}</span>
                <span className="font-mono font-bold" style={{ color }}>{displayValue}</span>
            </div>
            {isBar && (
                <div className="w-full bg-canon-bg rounded-full h-1.5 border border-canon-border/50">
                    <div className="bg-canon-blue h-full rounded-full transition-all duration-300" style={{ width: barWidth, backgroundColor: barColor }}></div>
                </div>
            )}
        </div>
    );
};


export const ScenarioMetricsDisplay: React.FC<{ scene: ScenarioState }> = ({ scene }) => {
    const { scenarioDef, metrics, outcome, currentPhaseId } = scene;
    
    const currentPhase = scenarioDef.phases?.find(p => p.id === currentPhaseId);

    if (!metrics) return null;

    return (
        <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4 space-y-4">
            <div>
                <h3 className="font-bold text-canon-text">{scenarioDef.title}</h3>
                {currentPhase && <p className="text-xs text-canon-text-light font-mono uppercase">Фаза: {currentPhase.label}</p>}
            </div>

            {currentPhase && (currentPhase.allowedActionTags || currentPhase.bannedActionTags) && (
                <div className="bg-canon-bg border border-canon-border/30 rounded p-2 text-[10px] space-y-1">
                     <div className="font-bold text-canon-text-light uppercase">Правила вовлечения</div>
                     {currentPhase.allowedActionTags && (
                         <div className="flex flex-wrap gap-1">
                             <span className="text-canon-green font-bold mr-1">ALLOW:</span>
                             {currentPhase.allowedActionTags.map(t => <span key={t} className="bg-green-900/30 text-green-300 px-1 rounded">{t}</span>)}
                         </div>
                     )}
                     {currentPhase.bannedActionTags && (
                         <div className="flex flex-wrap gap-1">
                             <span className="text-canon-red font-bold mr-1">BAN:</span>
                             {currentPhase.bannedActionTags.map(t => <span key={t} className="bg-red-900/30 text-red-300 px-1 rounded">{t}</span>)}
                         </div>
                     )}
                </div>
            )}
            
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                    <Metric label="Таймер" value={metrics.timer} />
                    {metrics.threat !== undefined && <Metric label="Угроза" value={metrics.threat} color="#ff4444" isBar max={scenarioDef.metrics.threat?.max || 100} />}
                </div>
                
                {/* Context-specific metrics display */}
                {scenarioDef.id === 'council_simple' ? (
                    <div className="space-y-2">
                        <Metric label="Согласие" value={metrics.consensus} isBar max={100} color="#33ff99" />
                        <Metric label="Конфликт" value={metrics.conflict} isBar max={100} color="#ff4444" />
                        <Metric label="Легитимность" value={metrics.legitimacy} isBar max={100} color="#a855f7" />
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        <Metric label="Дисциплина" value={metrics.discipline} isBar max={scenarioDef.metrics.discipline?.max || 100} />
                        {metrics.route_known !== undefined && <Metric label="Маршрут" value={metrics.route_known} isBar max={100} />}
                    </div>
                )}

                {(scenarioDef.id === 'cave_rescue' || scenarioDef.id === 'training_evac') && (
                     <div className="border-t border-canon-border/50 pt-3">
                        <h4 className="text-xs font-bold text-canon-text-light mb-2">Раненые</h4>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                            <Metric label="Всего" value={metrics.wounded_total} />
                            <Metric label="Не отсортировано" value={metrics.wounded_unsorted} color="#f59e0b"/>
                            <Metric label="Стабильны" value={metrics.wounded_stable} color="#00ccff"/>
                            <Metric label="Эвакуированы" value={metrics.wounded_evacuated} color="#33ff99"/>
                            <Metric label="Погибли" value={metrics.wounded_dead} color="#ff4444"/>
                        </div>
                     </div>
                )}
            </div>

            {outcome && (
                <div className="mt-4 pt-4 border-t border-canon-border">
                    <h3 className="font-bold text-lg text-canon-accent mb-2">Сценарий завершен!</h3>
                    <p className="text-sm whitespace-pre-wrap">{outcome.summary}</p>
                </div>
            )}
        </div>
    );
};
