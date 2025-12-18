
import React, { useMemo, useState } from 'react';
import { CharacterEntity, AgentPsychState } from '../types';
import { explainSelfVectorShift } from '../lib/archetypes/system';
import { computeBiographyLatent } from '../lib/biography/lifeGoalsEngine';
import { METRIC_NAMES } from '../lib/archetypes/metrics';
import { allArchetypes } from '../data/archetypes';

interface Props {
    agent: CharacterEntity;
    psych?: AgentPsychState;
}

// --- New/Moved helpers ---
function euclideanDistance(vec1: number[], vec2: number[]): number {
    let sum = 0;
    for (let i = 0; i < vec1.length; i++) {
        sum += Math.pow((vec1[i] || 0) - (vec2[i] || 0), 2);
    }
    return Math.sqrt(sum);
}

const getArchetypeDetails = (id: string | undefined | null) => {
    if (!id) return null;
    const arch = allArchetypes.find(a => a.id === id);
    // Ensure metrics are returned as an array in the correct order
    const metricsVector = arch ? Object.keys(METRIC_NAMES).map(key => arch.metrics[key] ?? 0.5) : [];
    return arch ? { name: arch.data.name, id: arch.id, metrics: metricsVector } : null;
};
// ---

const ShiftReason: React.FC<{ axis: string, delta: number, reasons: string[] }> = ({ axis, delta, reasons }) => {
    const isPositive = delta > 0;
    const colorClass = isPositive ? 'text-canon-green' : 'text-canon-red';
    
    return (
        <div className="flex flex-col py-2 border-b border-canon-border/20 last:border-0">
            <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-xs text-canon-text">{METRIC_NAMES[axis as keyof typeof METRIC_NAMES] || axis}</span>
                <span className={`font-mono font-bold text-xs ${colorClass}`}>
                    {isPositive ? '+' : ''}{delta.toFixed(2)}
                </span>
            </div>
            <ul className="text-[10px] text-canon-text-light space-y-0.5 pl-2 border-l-2 border-canon-border/30">
                {reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                ))}
            </ul>
        </div>
    );
};

const VectorComparison: React.FC<{ label: string, values: number[], color: string }> = ({ label, values, color }) => (
    <div className="flex-1">
        <div className="text-center text-[10px] font-bold mb-2 uppercase tracking-wider" style={{ color }}>{label}</div>
        <div className="h-32 flex items-end justify-center gap-1 bg-canon-bg/30 rounded p-2 border border-canon-border/30">
             {values.map((v, i) => {
                 const axisKey = Object.keys(METRIC_NAMES)[i];
                 const axisName = METRIC_NAMES[axisKey as keyof typeof METRIC_NAMES];
                 return (
                 <div key={i} className="w-full bg-canon-bg-light rounded-t-sm relative group">
                     <div 
                        className="absolute bottom-0 left-0 right-0 transition-all duration-500 rounded-t-sm"
                        style={{ height: `${v * 100}%`, backgroundColor: color }}
                     />
                     <div className="opacity-0 group-hover:opacity-100 absolute bottom-full left-1/2 -translate-x-1/2 text-[9px] bg-black p-1 rounded mb-1 z-10 pointer-events-none whitespace-nowrap border border-white/10">
                        {axisName}: {v.toFixed(2)}
                     </div>
                 </div>
             )})}
        </div>
    </div>
);

const MatchComparison: React.FC<{ selfVector: number[], archVector: number[], archName: string }> = ({ selfVector, archVector, archName }) => {
    return (
        <div className="flex gap-2 items-center">
            {/* Self vector */}
            <div className="h-8 flex-1 flex items-end justify-center gap-px bg-canon-bg/50 p-1 rounded">
                {selfVector.map((v, i) => <div key={i} className="w-full bg-canon-accent" style={{ height: `${v * 100}%` }} title={`Self: ${v.toFixed(2)}`} />)}
            </div>
            {/* Arch vector */}
            <div className="h-8 flex-1 flex items-end justify-center gap-px bg-canon-bg/50 p-1 rounded">
                {archVector.map((v, i) => <div key={i} className="w-full bg-canon-green" style={{ height: `${v * 100}%` }} title={`${archName}: ${v.toFixed(2)}`} />)}
            </div>
        </div>
    );
};

export const ArchetypeDerivation: React.FC<Props> = ({ agent, psych }) => {
    const [isOpen, setIsOpen] = useState(false);

    const derivations = useMemo(() => {
        if (!agent.identity.arch_true || !psych) return null;
        
        const bio = computeBiographyLatent(agent.historicalEvents);

        return explainSelfVectorShift(
            agent.identity.arch_true,
            psych.distortion,
            psych.trauma,
            psych.moral,
            bio
        );
    }, [agent, psych]);
    
    const matchingAnalysis = useMemo(() => {
        if (!agent.identity.arch_self) return null;
        
        const selfVector = agent.identity.arch_self;
        
        const distances = allArchetypes.map(arch => ({
            arch,
            dist: euclideanDistance(selfVector, Object.values(arch.metrics))
        })).sort((a,b) => a.dist - b.dist);

        const top3 = distances.slice(0, 3);
        
        const dominantId = agent.identity.arch_self_dominant_id;
        if (dominantId && !top3.some(item => item.arch.id === dominantId)) {
            const dominantArch = allArchetypes.find(a => a.id === dominantId);
            if (dominantArch) {
                const dominantDist = euclideanDistance(selfVector, Object.values(dominantArch.metrics));
                top3.unshift({ arch: dominantArch, dist: dominantDist });
            }
        }

        return top3.slice(0,3).map(item => ({
            ...getArchetypeDetails(item.arch.id),
            dist: item.dist
        }));

    }, [agent.identity.arch_self, agent.identity.arch_self_dominant_id]);

    if (!derivations || !psych || !agent.identity.arch_true || !agent.identity.arch_self) {
        return null;
    }

    const hasShifts = derivations.length > 0;

    return (
        <div className="bg-canon-bg-light border border-canon-border rounded-lg overflow-hidden transition-all duration-300">
            {/* Header / Toggle */}
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className="p-4 flex justify-between items-center cursor-pointer hover:bg-canon-bg/50 transition-colors"
            >
                <div>
                    <h4 className="font-bold text-sm text-canon-accent uppercase tracking-wider flex items-center gap-2">
                        <span>🎭</span> Происхождение Маски (Self)
                    </h4>
                    <p className="text-[10px] text-canon-text-light mt-0.5">
                        True (Natura) → [Искажения] → Self (Persona) → Dominant Archetype
                    </p>
                </div>
                <div className="text-xs font-bold text-canon-text-light flex items-center gap-2">
                    {hasShifts ? (
                        <span className="text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/30">
                            {derivations.length} сдвигов
                        </span>
                    ) : (
                        <span className="text-canon-green bg-canon-green/10 px-2 py-0.5 rounded border border-canon-green/30">
                            Совпадает
                        </span>
                    )}
                    <span className="text-lg transform transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                        ▼
                    </span>
                </div>
            </div>

            {/* Content */}
            {isOpen && (
                <div className="p-4 border-t border-canon-border/50 space-y-6 bg-canon-bg/20 animate-fade-in">
                    
                    <div className="flex gap-4 items-center">
                        <VectorComparison 
                            label="Истинный (Natura)" 
                            values={agent.identity.arch_true} 
                            color="#33ff99"
                        />
                        <div className="flex flex-col items-center justify-center text-canon-text-light opacity-50 text-xs font-bold">
                             <span>+</span>
                             <span>Δ</span>
                             <span>➔</span>
                        </div>
                        <VectorComparison 
                            label="Маска (Persona)" 
                            values={agent.identity.arch_self} 
                            color="#00aaff"
                        />
                    </div>
                    
                    <div className="bg-canon-bg border border-canon-border/30 rounded p-3">
                         <h5 className="text-xs font-bold text-canon-text-light mb-2 uppercase tracking-wider border-b border-canon-border/20 pb-1">
                             Анализ искажений (Почему Маска отличается?)
                         </h5>
                         <div className="max-h-64 overflow-y-auto custom-scrollbar pr-2">
                             {derivations.length === 0 ? (
                                 <div className="text-center text-canon-text-light italic text-xs py-4">
                                     Нет значимых искажений. Персонаж видит себя таким, какой он есть.
                                 </div>
                             ) : (
                                 derivations.map((d) => (
                                     <ShiftReason key={d.axis} {...d} />
                                 ))
                             )}
                         </div>
                    </div>

                    {matchingAnalysis && (
                        <div className="bg-canon-bg border border-canon-border/30 rounded p-3">
                             <h5 className="text-xs font-bold text-canon-text-light mb-3 uppercase tracking-wider border-b border-canon-border/20 pb-1">
                                 Подбор ближайшего архетипа для Маски (Persona)
                             </h5>
                             <div className="space-y-4">
                                 {matchingAnalysis.map((match, idx) => {
                                     if (!match) return null;
                                     const isDominant = match.id === agent.identity.arch_self_dominant_id;
                                     return (
                                         <div key={match.id}>
                                             <div className="flex justify-between items-center text-xs mb-2">
                                                 <span className={`font-bold ${isDominant ? 'text-canon-accent' : 'text-canon-text'}`}>
                                                     {idx+1}. {match.name} {isDominant && '⭐'}
                                                 </span>
                                                 <span className="font-mono text-canon-text-light">
                                                     Расстояние: {match.dist.toFixed(3)}
                                                 </span>
                                             </div>
                                             <MatchComparison selfVector={agent.identity.arch_self!} archVector={match.metrics} archName={match.name} />
                                         </div>
                                     );
                                 })}
                                  <div className="flex gap-4 text-[10px] items-center justify-center pt-2 border-t border-canon-border/20">
                                      <div className="flex items-center gap-1"><div className="w-2 h-2 bg-canon-accent rounded-sm"/><span>Вектор Маски</span></div>
                                      <div className="flex items-center gap-1"><div className="w-2 h-2 bg-canon-green rounded-sm"/><span>Вектор Архетипа</span></div>
                                  </div>
                             </div>
                        </div>
                    )}
                    
                    <div className="grid grid-cols-3 gap-4 text-[10px] text-canon-text-light pt-4">
                         <div className="text-center bg-canon-bg p-2 rounded border border-canon-border/20">
                            <div className="uppercase text-[9px] opacity-70 mb-1">Самообвинение</div>
                            <div className="font-mono font-bold text-canon-text text-sm">{(psych.distortion.selfBlameBias * 100).toFixed(0)}%</div>
                         </div>
                         <div className="text-center bg-canon-bg p-2 rounded border border-canon-border/20">
                            <div className="uppercase text-[9px] opacity-70">Травма (Сумма)</div>
                            <div className="font-mono font-bold text-red-400 text-sm">
                                {((psych.trauma.self + psych.trauma.others + psych.trauma.system + psych.trauma.world)).toFixed(2)}
                            </div>
                         </div>
                         <div className="text-center bg-canon-bg p-2 rounded border border-canon-border/20">
                            <div className="uppercase text-[9px] opacity-70">Стыд (Shame)</div>
                            <div className="font-mono font-bold text-orange-400 text-sm">{(psych.shame! * 100).toFixed(0)}%</div>
                         </div>
                    </div>

                    <div className="text-[10px] text-canon-text-light italic text-center opacity-70">
                        Маска (Self) используется для принятия решений и социальных проекций. 
                        Истинный вектор (True) используется для расчета реальной совместимости и стресса от притворства.
                    </div>
                </div>
            )}
        </div>
    );
};
