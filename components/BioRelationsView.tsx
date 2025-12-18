
import React, { useMemo } from 'react';
import { PersonalEvent } from '../types';
import { extractRelationalBioFeatures } from '../lib/biography/features';
import { getEntityById } from '../data';
import { RelationalBioFeatureId } from '../lib/life-goals/v4-types';

interface Props {
    events: PersonalEvent[];
}

const REL_LABELS: Record<RelationalBioFeatureId, string> = {
    'B_rel_saved': 'Спасение (актор)',
    'B_rel_failed_save': 'Неудачное спасение',
    'B_rel_harmed': 'Нанесение вреда',
    'B_rel_betrayed_by': 'Предательство (жертва)',
    'B_rel_obeyed': 'Подчинение',
    'B_rel_controlled_by': 'Под контролем',
    'B_rel_humiliated_by': 'Унижение (жертва)',
    'B_rel_care_from': 'Получена забота',
    'B_rel_shared_trauma': 'Общая травма',
    'B_rel_approval_deprivation': 'Отвержение',
    'B_rel_devotion': 'Преданность (Devotion)',
    'B_rel_romance': 'Романтика',
    'B_rel_friendship': 'Дружба'
};

const REL_VECTOR_IMPACT: Partial<Record<RelationalBioFeatureId, string>> = {
    'B_rel_romance': '↑Care, ↑Trust, ↓Autonomy',
    'B_rel_devotion': '↑Loyalty, ↑Order, ↓Self',
    'B_rel_betrayed_by': '↑Paranoia, ↓Trust, ↑Isolation',
    'B_rel_shared_trauma': '↑Bond, ↑Cohesion',
    'B_rel_humiliated_by': '↑Shame, ↑Revenge/Submission',
    'B_rel_obeyed': '↑Discipline, ↑Formalism',
    'B_rel_saved': '↑Agency, ↑Heroism',
    'B_rel_care_from': '↑Trust, ↓Anxiety',
    'B_rel_friendship': '↑Reciprocity, ↑Trust'
};

const REL_COLORS: Partial<Record<RelationalBioFeatureId, string>> = {
    'B_rel_romance': 'text-pink-400 border-pink-500/30 bg-pink-900/20',
    'B_rel_devotion': 'text-purple-400 border-purple-500/30 bg-purple-900/20',
    'B_rel_betrayed_by': 'text-red-400 border-red-500/30 bg-red-900/20',
    'B_rel_humiliated_by': 'text-orange-400 border-orange-500/30 bg-orange-900/20',
    'B_rel_friendship': 'text-green-400 border-green-500/30 bg-green-900/20',
    'B_rel_shared_trauma': 'text-blue-400 border-blue-500/30 bg-blue-900/20',
};

export const BioRelationsView: React.FC<Props> = ({ events }) => {
    const relationships = useMemo(() => {
        const participants = new Set<string>();
        
        events.forEach(ev => {
            if (ev.participants) ev.participants.forEach(p => participants.add(p));
            if ((ev.payload as any)?.targetId) participants.add((ev.payload as any).targetId);
            if ((ev.payload as any)?.otherId) participants.add((ev.payload as any).otherId);
        });

        const results = [];
        for (const targetId of participants) {
            if (!targetId) continue;
            const features = extractRelationalBioFeatures(events, targetId);
            
            // Filter out zero weights
            const activeFeatures = Object.entries(features)
                .filter(([_, weight]) => weight > 0.05)
                .sort((a, b) => b[1] - a[1]);

            if (activeFeatures.length > 0) {
                results.push({ targetId, features: activeFeatures });
            }
        }
        return results;
    }, [events]);

    if (relationships.length === 0) {
        return <div className="text-sm text-canon-text-light italic p-4">Нет значимых социальных связей в биографии.</div>;
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {relationships.map(({ targetId, features }) => {
                const targetEntity = getEntityById(targetId);
                const targetName = targetEntity?.title || targetId;

                return (
                    <div key={targetId} className="bg-canon-bg border border-canon-border rounded-lg p-3 hover:border-canon-accent/50 transition-colors">
                        <div className="flex justify-between items-start mb-3 border-b border-canon-border/30 pb-2">
                            <div>
                                <div className="font-bold text-sm text-canon-text">{targetName}</div>
                                <div className="text-[10px] text-canon-text-light font-mono">{targetId}</div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            {features.map(([key, weight]) => {
                                const k = key as RelationalBioFeatureId;
                                const style = REL_COLORS[k] || 'text-canon-text-light border-canon-border/30 bg-canon-bg-light';
                                const impact = REL_VECTOR_IMPACT[k];

                                return (
                                    <div key={k} className={`text-xs border rounded px-2 py-1.5 ${style}`}>
                                        <div className="flex justify-between items-center mb-0.5">
                                            <span className="font-bold">{REL_LABELS[k] || k}</span>
                                            <span className="font-mono font-bold">{weight.toFixed(2)}</span>
                                        </div>
                                        {impact && (
                                            <div className="text-[9px] opacity-70 font-mono mt-1 border-t border-white/10 pt-0.5">
                                                Вектор: {impact}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
