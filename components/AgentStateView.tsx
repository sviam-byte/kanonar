
import React, { useMemo } from 'react';
import { AgentState, WorldState, TomEntry } from '../types';
import { system1Weight } from '../lib/psych/system1';
import { ARCHETYPE_STEREOTYPES } from '../lib/archetypes/stereotypes';
import { allArchetypes, FUNCTION_NAMES } from '../data/archetypes';
import { AgentNarrativeView } from './AgentNarrativeView';
import { PsychStateView } from './PsychStateView';
import { GOAL_DEFS } from '../lib/goals/space';
import { computeArchetypeEffects } from '../lib/archetypes/effects';
import { calculateArchetypeMetricsFromVectorBase } from '../lib/archetypes/metrics';

interface AgentStateViewProps {
    agent: AgentState;
    world: WorldState; 
}

// ... (Keep helpers: MU_DISPLAY, NARRATIVE_ROLES, getArchetypeDetails, calculateMixtureOnTheFly, StatBar, TagPill)
const MU_DISPLAY: Record<string, { label: string, icon: string, color: string, bg: string }> = {
    'SR': { label: 'Радикал / Герой', icon: '🔥', color: 'text-red-400', bg: 'bg-red-500/10' },
    'OR': { label: 'Изгой / Жертва', icon: '🌀', color: 'text-orange-400', bg: 'bg-orange-500/10' },
    'SN': { label: 'Правитель / Норма', icon: '⚖️', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    'ON': { label: 'Инструмент / Функция', icon: '⚙️', color: 'text-gray-300', bg: 'bg-gray-500/10' },
};

const NARRATIVE_ROLES: Record<string, string> = {
    'hero': 'Герой',
    'martyr': 'Мученик',
    'savior': 'Спаситель',
    'monster': 'Монстр',
    'tool': 'Инструмент',
    'observer': 'Наблюдатель'
};

const getArchetypeDetails = (id: string | undefined | null) => {
    if (!id) return null;
    const arch = allArchetypes.find(a => a.id === id);
    if (!arch) return { name: id, mu: 'ON', desc: 'Данные не найдены', id, lambda: '?', f: 0 };
    
    const funcName = FUNCTION_NAMES[arch.f - 1] || 'Функция';
    const data = arch.data as any;
    let desc = "Нет описания";
    
    if (data.tagline && typeof data.tagline === 'string') {
        desc = data.tagline;
    } else if (data.summary && typeof data.summary === 'string') {
        desc = (data.summary.split?.('.')[0] || data.summary) + '.';
    } else if (data.description && typeof data.description === 'string') {
         const quoteMatch = data.description.match(/«(.*?)»/);
         if (quoteMatch) {
             desc = quoteMatch[1];
         } else {
             const plain = data.description.replace(/<[^>]*>?/gm, '');
             desc = (plain?.split?.('.')[0] || plain) + '.';
         }
    }

    return {
        name: `${funcName}: ${arch.data.name}`,
        mu: arch.mu,
        lambda: arch.lambda,
        f: arch.f,
        desc: desc,
        fullData: arch.data,
        id: arch.id
    };
};

function calculateMixtureOnTheFly(agent: AgentState) {
    const currentMetrics = calculateArchetypeMetricsFromVectorBase(agent);
    const scores: { id: string, score: number }[] = [];

    for (const arch of allArchetypes) {
        let distSq = 0;
        for (const key in currentMetrics) {
            const val = currentMetrics[key] ?? 0.5;
            const archVal = arch.metrics[key] ?? 0.5;
            distSq += Math.pow(val - archVal, 2);
        }
        const similarity = 1 / (1 + Math.sqrt(distSq));
        scores.push({ id: arch.id, score: similarity });
    }
    
    const maxScore = Math.max(...scores.map(s => s.score));
    const beta = 15;
    const exps = scores.map(s => Math.exp(beta * (s.score - maxScore)));
    const sumExp = exps.reduce((a: number, b: number) => a + b, 0);
    
    const mixture: Record<string, number> = {};
    scores.forEach((s, i) => {
        mixture[s.id] = exps[i] / sumExp;
    });
    
    return mixture;
}

const StatBar: React.FC<{ label: string; value: number; max?: number; colorClass: string }> = ({ label, value, max = 100, colorClass }) => {
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    return (
        <div className="w-full">
            <div className="flex justify-between text-[10px] uppercase font-bold mb-0.5 text-canon-text-light">
                <span>{label}</span>
                <span>{value.toFixed(0)}</span>
            </div>
            <div className="h-1.5 w-full bg-canon-bg rounded-full overflow-hidden border border-canon-border/30">
                <div className={`h-full transition-all duration-500 ${colorClass}`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
};

const TagPill: React.FC<{ label: string; active?: boolean }> = ({ label, active }) => (
    <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${active ? 'bg-canon-accent/20 border-canon-accent text-canon-accent' : 'bg-canon-bg border-canon-border text-canon-text-light'}`}>
        {label}
    </span>
);

// EXPORTED SUB-COMPONENT
export const AgentInternalStateView: React.FC<{ agent: AgentState }> = ({ agent }) => {
    const stress = (agent.body?.acute?.stress as number) ?? 0;
    const will = agent.state?.will ?? 50;
    const system1Alpha = system1Weight(stress / 100);

    return (
        <div className="bg-canon-bg/40 border border-canon-border/50 rounded-lg p-3">
            <h3 className="text-xs font-bold text-canon-text-light uppercase mb-3 tracking-wider">Внутренний Ресурс</h3>
            
            <div className="grid grid-cols-2 gap-4 mb-2">
                <StatBar label="Стресс (Stress)" value={stress} colorClass={stress > 60 ? 'bg-red-500' : 'bg-yellow-400'} />
                <StatBar label="Воля (Will)" value={will} colorClass="bg-canon-blue" />
            </div>
            
            {/* Control Mode Indicator */}
            <div className="flex items-center gap-2 mt-3 bg-black/30 p-1.5 rounded border border-white/5">
                <div className={`w-2 h-2 rounded-full ${system1Alpha > 0.6 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
                <div className="flex-1 flex justify-between text-[10px]">
                    <span className={system1Alpha < 0.4 ? 'text-green-400 font-bold' : 'text-gray-500'}>System 2 (Logic)</span>
                    <span className="font-mono text-white/50">{(system1Alpha * 100).toFixed(0)}%</span>
                    <span className={system1Alpha > 0.6 ? 'text-red-400 font-bold' : 'text-gray-500'}>System 1 (Impulse)</span>
                </div>
            </div>
        </div>
    );
};


export const AgentStateView: React.FC<AgentStateViewProps> = ({ agent, world }) => {
    
    // ... (Logic for mixture, etc. remains, just simplified render using sub-component)
    const mixture = agent.archetype?.mixture && Object.keys(agent.archetype.mixture).length > 0
        ? agent.archetype.mixture 
        : calculateMixtureOnTheFly(agent);

    const sortedArchetypes = Object.entries(mixture)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 3) 
        .map(([id, weight]) => ({ ...getArchetypeDetails(id), weight: weight as number }))
        .filter(a => a.name !== 'Неопределен');

    const dominant = sortedArchetypes[0];
    const muStyle = dominant ? (MU_DISPLAY[dominant.mu] || MU_DISPLAY['ON']) : MU_DISPLAY['ON'];
    
    const shadowArchId = agent.archetype?.shadowId;
    const shadowActivation = agent.archetype?.shadowActivation ?? 0;
    const shadowDetails = getArchetypeDetails(shadowArchId);
    
    const roleKey = agent.psych?.narrative.role || 'observer';
    const plotKey = agent.psych?.narrative.plot || 'survival';
    const roleLabel = NARRATIVE_ROLES[roleKey] || roleKey;
    
    const effects = computeArchetypeEffects(agent);
    const topGoals = agent.goalEcology?.execute?.slice(0, 3) || [];
    const plan = agent.planState;
    const drivingGoal = agent.drivingGoalId ? GOAL_DEFS[agent.drivingGoalId]?.label_ru : 'Нет';

    return (
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-2 custom-scrollbar">
            
            {/* 1. IDENTITY HEADER */}
            <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4 relative overflow-hidden">
                <div className={`absolute top-0 right-0 p-2 px-3 rounded-bl-lg text-[10px] font-bold uppercase tracking-wider border-l border-b border-canon-border ${muStyle.bg} ${muStyle.color}`}>
                    {muStyle.icon} {muStyle.label}
                </div>

                <div className="flex flex-col gap-1 mb-4">
                    <h2 className="text-2xl font-bold text-canon-text flex items-center gap-2">
                        {agent.title}
                        {agent.effectiveRole && (
                            <span className="px-2 py-0.5 text-[10px] rounded border border-canon-border text-canon-text-light">
                                {agent.effectiveRole}
                            </span>
                        )}
                    </h2>
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-canon-accent font-bold uppercase">{roleLabel}</span>
                        <span className="text-canon-text-light">•</span>
                        <span className="text-canon-text-light italic">Сюжет: {plotKey}</span>
                    </div>
                </div>

                {/* Archetype Spectrum */}
                <div className="space-y-3 border-t border-canon-border/50 pt-3">
                    <div className="space-y-2">
                        {sortedArchetypes.map((arch, idx) => (
                            <div key={arch.id} className="relative">
                                <div className="flex justify-between items-baseline text-xs mb-0.5 z-10 relative">
                                    <span className={`font-bold ${idx === 0 ? 'text-canon-text' : 'text-canon-text-light'}`}>
                                        {arch.name}
                                    </span>
                                    <span className="font-mono text-[10px] opacity-70">{(arch.weight * 100).toFixed(1)}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-canon-bg rounded-full overflow-hidden border border-canon-border/20">
                                    <div 
                                        className={`h-full ${idx === 0 ? 'bg-canon-accent' : 'bg-canon-text-light/30'}`} 
                                        style={{ width: `${arch.weight * 100}%` }} 
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    {shadowActivation > 0.6 && shadowDetails && (
                        <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs flex items-center gap-2">
                             <span className="text-lg">🌑</span>
                             <div>
                                 <span className="text-red-400 font-bold block">ТЕНЬ ЗАХВАТЫВАЕТ КОНТРОЛЬ</span>
                                 <span className="text-red-300/70 text-[10px]">Смещение к архетипу: {shadowDetails.name}</span>
                             </div>
                        </div>
                    )}
                </div>
            </div>

             {/* 2. COGNITION & PLANNING */}
             <div className="bg-canon-bg/40 border border-canon-border/50 rounded-lg p-3">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xs font-bold text-canon-text-light uppercase tracking-wider">Когнитивный Процесс</h3>
                     <div className="flex gap-2 text-[10px]">
                        <span className={`px-1.5 rounded border ${agent.useSystem1 ? 'bg-red-500/20 border-red-500 text-red-300' : 'bg-canon-bg border-canon-border text-canon-text-light opacity-50'}`}>SYS-1</span>
                        <span className={`px-1.5 rounded border ${!agent.useSystem1 ? 'bg-green-500/20 border-green-500 text-green-300' : 'bg-canon-bg border-canon-border text-canon-text-light opacity-50'}`}>SYS-2</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                        <div className="text-[9px] text-canon-text-light uppercase mb-1">Ведущая Цель (Drive)</div>
                        <div className="text-xs font-bold text-canon-accent truncate" title={agent.drivingGoalId}>{drivingGoal}</div>
                    </div>
                    <div>
                        <div className="text-[9px] text-canon-text-light uppercase mb-1">Когнит. Бюджет</div>
                        <div className="w-full h-2 bg-canon-bg rounded-full overflow-hidden border border-canon-border/30 mt-1">
                             <div className="h-full bg-blue-400" style={{ width: `${agent.cognitiveBudget ?? 0}%` }} />
                        </div>
                    </div>
                </div>

                {plan && plan.status === 'active' && (
                    <div className="bg-black/20 rounded border border-canon-border/30 p-2">
                        <div className="flex justify-between items-center mb-2">
                             <span className="text-[10px] font-bold text-green-400 uppercase">Активный План</span>
                             <span className="text-[9px] font-mono text-canon-text-light">Осталось шагов: {plan.steps.length - plan.cursor}</span>
                        </div>
                        <div className="space-y-1">
                            {plan.steps.map((step, i) => (
                                <div key={i} className={`flex items-center gap-2 text-[10px] ${i === plan.cursor ? 'opacity-100' : 'opacity-40'}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${i < plan.cursor ? 'bg-green-500' : i === plan.cursor ? 'bg-yellow-400 animate-pulse' : 'bg-canon-border'}`} />
                                    <span className={i === plan.cursor ? 'font-bold text-canon-text' : 'text-canon-text-light'}>
                                        {step.actionId} {step.targetId ? `→ ...${step.targetId.slice(-4)}` : ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
             </div>

             {/* 3. INTERNAL STATE (Used shared component) */}
             <AgentInternalStateView agent={agent} />

             {/* 4. DRIVES & GOALS */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="bg-canon-bg/40 border border-canon-border/50 rounded-lg p-3">
                     <h3 className="text-xs font-bold text-canon-text-light uppercase mb-2 tracking-wider">Драйверы</h3>
                     <div className="flex flex-wrap gap-1.5">
                         {effects.preferredTags.map(t => <TagPill key={t} label={`+${t}`} active />)}
                         {effects.avoidedTags.map(t => <TagPill key={t} label={`-${t}`} />)}
                     </div>
                 </div>
                 <div className="bg-canon-bg/40 border border-canon-border/50 rounded-lg p-3">
                     <h3 className="text-xs font-bold text-canon-text-light uppercase mb-2 tracking-wider">Приоритеты</h3>
                     <div className="space-y-1.5">
                         {topGoals.map(g => (
                             <div key={g.id} className="flex justify-between items-center text-xs">
                                 <span className="text-canon-text truncate pr-2">{GOAL_DEFS[g.id]?.label_ru || g.id}</span>
                                 <span className={`font-mono font-bold ${g.priority > 0.5 ? 'text-canon-accent' : 'text-canon-text-light'}`}>
                                     {g.priority.toFixed(2)}
                                 </span>
                             </div>
                         ))}
                     </div>
                 </div>
             </div>

             {/* 5. FULL PSYCH VIEW */}
            {agent.psych && (
                <PsychStateView psych={agent.psych} />
            )}
        </div>
    );
};
