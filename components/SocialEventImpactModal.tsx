
import React from 'react';
import { FullCharacterMetrics, SocialEventEntity, CharacterEntity } from '../types';
import { getNestedValue } from '../lib/param-utils';

interface SocialEventImpactModalProps {
    report: {
        before: FullCharacterMetrics;
        after: FullCharacterMetrics;
        event: SocialEventEntity;
        target: CharacterEntity;
    };
    onClose: () => void;
}

const MetricRow: React.FC<{ label: string; before: number; after: number; format?: (v: number) => string; tooltip?: string; }> = ({ label, before, after, format = (v) => (v ?? 0).toFixed(3), tooltip }) => {
    const delta = after - before;
    const deltaColor = delta > 1e-6 ? 'text-canon-green' : delta < -1e-6 ? 'text-canon-red' : 'text-canon-text-light';
    const deltaSign = delta > 1e-6 ? '+' : '';
  
    return (
      <tr className="border-b border-canon-border/30" title={tooltip}>
        <td className="py-2 text-canon-text-light">{label}</td>
        <td className="py-2 text-center font-mono">{format(before)}</td>
        <td className="py-2 text-center font-mono">{format(after)}</td>
        <td className={`py-2 text-center font-mono ${deltaColor}`}>
          {Math.abs(delta) > 1e-6 ? `${deltaSign}${format(delta)}` : '-'}
        </td>
      </tr>
    );
};

export const SocialEventImpactModal: React.FC<SocialEventImpactModalProps> = ({ report, onClose }) => {
    const { before, after, event, target } = report;
    const observer = before.modifiableCharacter;
    const targetId = target.entityId;

    const rapportMetrics = [
        { 
            label: "Доверие", 
            // FIX: Add type cast because getNestedValue now returns 'any'.
            before: (getNestedValue(before.modifiableCharacter, `social.dynamic_ties.${targetId}.trust`) as number | undefined) ?? 0.5,
            after: (getNestedValue(after.modifiableCharacter, `social.dynamic_ties.${targetId}.trust`) as number | undefined) ?? 0.5,
            tooltip: "Как наблюдатель доверяет цели."
        },
        { 
            label: "Надежность",
            // FIX: Add type cast because getNestedValue now returns 'any'.
            before: (getNestedValue(before.modifiableCharacter, `tom.perceived.${targetId}.cred_commit`) as number | undefined) ?? 0.5,
            after: (getNestedValue(after.modifiableCharacter, `tom.perceived.${targetId}.cred_commit`) as number | undefined) ?? 0.5,
            tooltip: "Воспринимаемая надежность обещаний цели."
        },
        { 
            label: "Конфликт норм",
            // FIX: Add type cast because getNestedValue now returns 'any'.
            before: (getNestedValue(before.modifiableCharacter, `tom.perceived.${targetId}.norm_conflict`) as number | undefined) ?? 0.5,
            after: (getNestedValue(after.modifiableCharacter, `tom.perceived.${targetId}.norm_conflict`) as number | undefined) ?? 0.5,
            tooltip: "Насколько нормы цели (как их видит наблюдатель) противоречат его собственным."
        },
        { 
            label: "P(Adopt)",
            // FIX: Add type cast because getNestedValue now returns 'any'.
            before: (getNestedValue(before.modifiableCharacter, `tom.perceived.${targetId}.p_adopt_from`) as number | undefined) ?? 0.5,
            after: (getNestedValue(after.modifiableCharacter, `tom.perceived.${targetId}.p_adopt_from`) as number | undefined) ?? 0.5,
            tooltip: "Вероятность, с которой наблюдатель переймет цели у цели."
        },
    ];

    const selfMetrics = [
        { label: "Стресс", before: before.modifiableCharacter.body?.acute?.stress ?? 0, after: after.modifiableCharacter.body?.acute?.stress ?? 0, format: (v: number) => v.toFixed(1) },
        { label: "Делегирование", before: before.tomMetrics?.delegability ?? 0, after: after.tomMetrics?.delegability ?? 0 },
        { label: "RAP", before: before.v42metrics?.RAP_t ?? 0, after: after.v42metrics?.RAP_t ?? 0, tooltip: "Производительность с поправкой на риск." },
    ];

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center animate-fade-in">
            <div className="bg-canon-bg-light border border-canon-border rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-canon-border">
                    <h3 className="text-lg font-bold text-canon-accent">Отчет о влиянии события</h3>
                    <p className="text-sm text-canon-text-light">Событие: <span className="font-mono">{event.title}</span></p>
                </div>

                <div className="p-4 overflow-y-auto">
                    <div className="space-y-6 text-sm">
                        <div>
                            <h4 className="font-bold text-canon-text mb-2">Влияние на Восприятие ({observer.title} → {target.title})</h4>
                            <table className="w-full">
                                <thead>
                                    <tr className="text-xs text-canon-text-light">
                                        <th className="text-left py-1">Метрика</th>
                                        <th className="text-center py-1">До</th>
                                        <th className="text-center py-1">После</th>
                                        <th className="text-center py-1">Δ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rapportMetrics.map(m => <MetricRow key={m.label} {...m} />)}
                                </tbody>
                            </table>
                        </div>
                         <div>
                            <h4 className="font-bold text-canon-text mb-2">Влияние на Наблюдателя ({observer.title})</h4>
                            <table className="w-full">
                                <thead>
                                     <tr className="text-xs text-canon-text-light">
                                        <th className="text-left py-1">Метрика</th>
                                        <th className="text-center py-1">До</th>
                                        <th className="text-center py-1">После</th>
                                        <th className="text-center py-1">Δ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selfMetrics.map(m => <MetricRow key={m.label} {...m} />)}
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
