
import React from 'react';
import { CalculatedMetrics, AnyEntity, LintIssue, EntityType, DerivedMetrics } from '../types';
import { DoseManometer } from './visuals/DoseManometer';
import { TSealBarcode } from './visuals/TSealBarcode';
import { LintBadges } from './visuals/LintBadges';
import { VsigmaThermometer } from './visuals/VsigmaThermometer';
import { ScenarioDisplay } from './ScenarioDisplay';
import { VsigmaBreakdown } from './visuals/VsigmaBreakdown';
import { EquilibriumModel } from './visuals/EquilibriumModel';
import { StateDynamicsWaterfall } from './charts/StateDynamicsWaterfall';
import { V42MetricsDisplay } from './V42MetricsDisplay';
import { MetricDisplay } from './MetricDisplay';
import { BehavioralAdvisor } from './BehavioralAdvisor';

interface RiskPanelProps {
    metrics: DerivedMetrics;
}

const RiskBadge: React.FC<{label: string, value: number, tooltip: string}> = ({ label, value, tooltip }) => {
    const intensity = Math.abs(value - 0.5) * 2; // 0 to 1
    const color = `rgba(255, 68, 68, ${intensity * 0.8})`;

    return (
        <div className="bg-canon-bg border border-canon-border rounded-md px-2 py-1 text-center" title={tooltip}>
            <div className="text-xs text-canon-text-light">{label}</div>
            <div className="font-mono font-bold" style={{ color }}>{value.toFixed(2)}</div>
        </div>
    )
}

const RiskPanel: React.FC<RiskPanelProps> = ({ metrics }) => {
    if (!metrics) return null;
    
    const riskMetrics = [
        { key: 'rho', label: 'ρ', tooltip: 'Рисковость' },
        { key: 'lambda', label: 'λ', tooltip: 'Эмо-лабильность' },
        { key: 'iota', label: 'ι', tooltip: 'Импульсивность' },
        { key: 'chaosPressure', label: 'χ', tooltip: 'Хаос-давление' },
        { key: 'socialFriction', label: 'φ', tooltip: 'Соц. трение' },
        { key: 'reputationFragility', label: 'ℱ', tooltip: 'Реп. хрупкость' },
        { key: 'darkTendency', label: 'δ', tooltip: 'Тёмная тяга' },
    ];

    return (
        <div className="grid grid-cols-7 gap-2">
            {riskMetrics.map(m => (
                <RiskBadge key={m.key} label={m.label} value={metrics[m.key as keyof DerivedMetrics] as number} tooltip={m.tooltip} />
            ))}
        </div>
    )
}

interface MetricsDashboardProps {
    metrics: CalculatedMetrics;
    entity: AnyEntity;
    linterIssues: LintIssue[];
}

export const MetricsDashboard: React.FC<MetricsDashboardProps> = ({ metrics, entity, linterIssues }) => {
    
    const isObject = entity.type === EntityType.Object;
    const isCharacter = entity.type === EntityType.Character || entity.type === EntityType.Essence;
    const { derivedMetrics } = metrics;

    return (
        <div className="space-y-4">
            {/* Top row: Core Visuals */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-canon-bg-light border border-canon-border rounded-lg p-3 flex flex-col items-center justify-between space-y-2">
                    <h4 className="text-sm font-bold text-canon-text-light">Хаотичность (Vσ)</h4>
                    <VsigmaThermometer vsigma={metrics.Vsigma} />
                    {metrics.vsigma_components && <VsigmaBreakdown components={metrics.vsigma_components} />}
                </div>
                 <div className="bg-canon-bg-light border border-canon-border rounded-lg p-3 flex flex-col items-center justify-center space-y-2">
                    <h4 className="text-sm font-bold text-canon-text-light">Стационарная точка (S*)</h4>
                    <EquilibriumModel breakdown={metrics.stability} />
                </div>
                 <div className="bg-canon-bg-light border border-canon-border rounded-lg p-3 flex flex-col items-center justify-center space-y-2">
                     <h4 className="text-sm font-bold text-canon-text-light">Психическое состояние</h4>
                     <div className="flex-grow flex flex-col items-center justify-center space-y-4">
                         <MetricDisplay name="Напряжение" value={derivedMetrics?.goalTension.toFixed(2) || 'N/A'} colorClass="text-canon-red" tooltip="Конфликт между активными целями." />
                         <MetricDisplay name="Фрустрация" value={derivedMetrics?.frustration.toFixed(2) || 'N/A'} colorClass="text-yellow-400" tooltip="Разрыв между желаемым и достигнутым." />
                     </div>
                </div>
                 <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4 flex flex-col">
                     <h3 className="font-bold mb-3 text-sm text-canon-text-light">Вклад в ΔS</h3>
                      <StateDynamicsWaterfall metrics={metrics} />
                </div>
            </div>
            
            {/* Behavioral Advisor Panel */}
            {isCharacter && metrics.behavioralAdvice && (
                <BehavioralAdvisor advice={metrics.behavioralAdvice} />
            )}

            {/* Risk Panel */}
            {metrics.derivedMetrics && (
                 <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                     <h3 className="font-bold mb-3 text-canon-text">Риск-панель</h3>
                     <RiskPanel metrics={metrics.derivedMetrics} />
                </div>
            )}

            {/* Scenarios */}
            <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                 <h3 className="font-bold mb-3 text-canon-text">Годность по сценариям</h3>
                 <ScenarioDisplay results={metrics.scenarioFitness} />
            </div>

            {/* V4.2 Metrics */}
            {metrics.v42metrics && (
                <V42MetricsDisplay metrics={metrics.v42metrics} />
            )}
        </div>
    );
};
