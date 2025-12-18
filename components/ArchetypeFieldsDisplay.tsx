
import React from 'react';
import { ArchetypeFieldMetrics, FIELD_METRIC_LABELS } from '../lib/archetypes/structural-metrics';

interface Props {
    metrics: ArchetypeFieldMetrics;
}

const FieldBlock: React.FC<{ title: string, keys: (keyof ArchetypeFieldMetrics)[], metrics: ArchetypeFieldMetrics, color: string }> = ({ title, keys, metrics, color }) => (
    <div className="bg-canon-bg border border-canon-border/50 rounded-lg p-3">
        <h4 className="text-xs font-bold text-canon-text-light uppercase mb-3 text-center tracking-wider">{title}</h4>
        <div className="space-y-4">
            {keys.map(key => {
                const val = metrics[key];
                return (
                    <div key={key}>
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-canon-text truncate pr-2">{FIELD_METRIC_LABELS[key]}</span>
                            <span className="font-mono font-bold" style={{ color }}>{(val ?? 0).toFixed(2)}</span>
                        </div>
                        <div className="w-full bg-canon-bg-light h-1.5 rounded-full overflow-hidden border border-canon-border/30">
                            <div 
                                className="h-full rounded-full transition-all duration-500" 
                                style={{ width: `${(val ?? 0) * 100}%`, backgroundColor: color }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    </div>
);

export const ArchetypeFieldsDisplay: React.FC<Props> = ({ metrics }) => {
    if (!metrics) return null;

    return (
        <div className="space-y-4">
            <h3 className="text-xl font-bold text-canon-accent mb-2">Структурная Диагностика</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FieldBlock 
                    title="SELF (Я)" 
                    keys={['SELF_SUBJECT', 'SELF_INTEGRITY']} 
                    metrics={metrics} 
                    color="#00aaff" 
                />
                <FieldBlock 
                    title="WORLD (Мир)" 
                    keys={['WORLD_ACCEPTANCE', 'WORLD_CHANGE_STYLE']} 
                    metrics={metrics} 
                    color="#f59e0b" 
                />
                <FieldBlock 
                    title="OTHERS (Люди)" 
                    keys={['OTHERS_CARE', 'OTHERS_DEPENDENCE']} 
                    metrics={metrics} 
                    color="#33ff99" 
                />
                <FieldBlock 
                    title="SYSTEM (Порядок)" 
                    keys={['SYSTEM_FORMALITY', 'SYSTEM_LOYALTY']} 
                    metrics={metrics} 
                    color="#a855f7" 
                />
            </div>
        </div>
    );
};
