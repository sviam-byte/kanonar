

import React, { useState, useMemo, useEffect } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Cell, ReferenceLine } from 'recharts';
import { CharacterEntity, FullCharacterMetrics, AgentState, EntityType } from '../../types';
import { getEntitiesByType, getEntityById } from '../../data';
import { 
  CharacterDossier, Observation, 
  initTomGeneral, updateTomGeneral, deriveTomParams, 
  deriveDyadFeaturesFromObserverHistory,
  buildTargetTruthPreGoalsVec,
  TomOutputs,
  TomEntryGeneral,
  TomParams,
  DyadFeatures,
  ProjectionBreakdown,
  ArchetypeMatchCandidate
} from '../../lib/tom/noncontextTom';
import { convertAgentToDossier, convertEventToObservation, buildObservationsFromHistory } from '../../lib/tom/mapper';
import { calculateAllCharacterMetrics } from '../../lib/metrics';
import { Branch } from '../../types';
import { Tabs } from '../Tabs';
import { allSocialEvents } from '../../data/social-events';
import { calculateArchetypeMetricsFromVectorBase } from '../../lib/archetypes/metrics';
import { allArchetypes, getArchetypeData, FUNCTION_NAMES } from '../../data/archetypes';
import { Link } from 'react-router-dom';
import { computeTomOrderChain, TomOrderLayer } from '../../lib/tom/second_order';
import { useAccess } from '../../contexts/AccessContext';
import { filterCharactersForActiveModule } from '../../lib/modules/visibility';

interface Props {
  observerId: string;
  observerEntityOverride?: CharacterEntity;
  observerMetricsOverride?: FullCharacterMetrics | null;
}

// --- UI Helpers ---

const LATENT_DESCRIPTIONS: Record<string, { label: string, desc: string }> = {
    CH: { label: 'Гигиена (CH)', desc: 'Правда, причинность' },
    SD: { label: 'Дисциплина (SD)', desc: 'Порядок, контроль' },
    RP: { label: 'Риск (RP)', desc: 'Смелость, азарт' },
    SO: { label: 'Открытость (SO)', desc: 'Новизна, сигнал' },
    EW: { label: 'Этика (EW)', desc: 'Забота, совесть' },
    CL: { label: 'Сеть (CL)', desc: 'Связи, влияние' },
    AGENCY: { label: 'Воля (AGENCY)', desc: 'Субъектность' },
    SCOPE: { label: 'Масштаб (SCOPE)', desc: 'Стратегия' },
    MANIP: { label: 'Манипул. (MANIP)', desc: 'Хитрость' },
    ACCEPT: { label: 'Принятие (ACCEPT)', desc: 'Согласие' },
    ACTION: { label: 'Действие (ACTION)', desc: 'Активность' },
    RADICAL: { label: 'Радикал (RADICAL)', desc: 'Перемены' },
    TRUTH: { label: 'Истина (TRUTH)', desc: 'Познание' },
    CARE: { label: 'Забота (CARE)', desc: 'Опека' },
    FORMAL: { label: 'Форма (FORMAL)', desc: 'Процедура' },
};

const Card: React.FC<{ title: string; icon?: string; children: React.ReactNode; className?: string }> = ({ title, icon, children, className = "" }) => (
    <div className={`bg-canon-bg border border-canon-border/50 rounded-lg p-4 ${className}`}>
        <div className="flex items-center gap-2 mb-3 border-b border-canon-border/30 pb-2">
            {icon && <span className="text-lg">{icon}</span>}
            <h4 className="text-xs font-bold text-canon-text uppercase tracking-wider">{title}</h4>
        </div>
        {children}
    </div>
);

interface FButtonProps {
    id: string;
    title: string;
    formula: string;
    variables?: Record<string, number>;
    activeId: string | null;
    onToggle: (id: string | null) => void;
}

const FButton: React.FC<FButtonProps> = ({ id, title, formula, variables, activeId, onToggle }) => {
    const isOpen = activeId === id;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isOpen && !(event.target as Element).closest(`.f-btn-${id}`)) {
                onToggle(null);
            }
        };
        if (isOpen) {
            document.addEventListener('click', handleClickOutside);
        }
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, [isOpen, id, onToggle]);

    return (
        <div className={`relative inline-block ml-1 align-middle f-btn-${id}`}>
            <button 
                onClick={(e) => { e.stopPropagation(); onToggle(isOpen ? null : id); }} 
                className={`flex items-center justify-center w-3.5 h-3.5 text-[8px] font-serif italic rounded-full transition-colors ${
                    isOpen 
                    ? 'bg-canon-accent text-canon-bg font-bold' 
                    : 'text-canon-text-light hover:text-white bg-canon-border/30 hover:bg-canon-accent/50'
                }`}
                title={`Формула: ${title}`}
            >
                ƒ
            </button>
            {isOpen && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-canon-bg border border-canon-border shadow-xl rounded p-3 z-[9999] text-xs animate-fade-in">
                    <div className="flex justify-between items-center mb-2 pb-1 border-b border-canon-border/30">
                        <span className="font-bold text-canon-accent">{title}</span>
                        <button onClick={(e) => { e.stopPropagation(); onToggle(null); }} className="text-canon-text-light hover:text-white">✕</button>
                    </div>
                    <div className="font-mono text-[10px] text-canon-text-light whitespace-pre-wrap break-words leading-relaxed mb-2">
                        {formula}
                    </div>
                    {variables && Object.keys(variables).length > 0 && (
                        <div className="bg-black/20 rounded p-2 border border-canon-border/20 space-y-1">
                            <div className="text-[9px] text-canon-text-light uppercase font-bold mb-1">Значения:</div>
                            {Object.entries(variables).map(([key, val]) => (
                                <div key={key} className="flex justify-between text-[10px] font-mono">
                                    <span className="text-canon-text-light">{key}:</span>
                                    <span className="text-canon-text font-bold">{(val as number).toFixed(3)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const ValueBar: React.FC<{ label: string; value: number; max?: number; color?: string; subtext?: string; f?: React.ReactNode }> = ({ label, value, max = 1, color = 'bg-canon-blue', subtext, f }) => {
    const safeValue = value ?? 0;
    return (
        <div className="mb-2">
            <div className="flex justify-between text-[10px] text-canon-text-light uppercase tracking-wider mb-0.5">
                <div className="flex items-center gap-1">
                    <span>{label}</span>
                    {f}
                </div>
                <div className="flex items-baseline gap-2">
                    {subtext && <span className="text-[9px] opacity-50 normal-case">{subtext}</span>}
                    <span className="font-mono font-bold text-canon-text">{safeValue.toFixed(2)}</span>
                </div>
            </div>
            <div className="h-1.5 w-full bg-canon-bg-light/50 border border-canon-border/30 rounded-full overflow-hidden">
                <div className={`h-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, (safeValue / max) * 100))}%` }}></div>
            </div>
        </div>
    );
};

const DiffBar: React.FC<{ label: string; belief: number; truth: number | null; f?: React.ReactNode }> = ({ label, belief, truth, f }) => {
    const safeBelief = belief ?? 0;
    const safeTruth = truth ?? 0;
    const delta = truth !== null ? safeBelief - safeTruth : 0;
    const hasTruth = truth !== null;
    
    return (
        <div className="mb-2 text-xs">
            <div className="flex justify-between mb-1">
                <div className="flex items-center gap-1 max-w-[50%]">
                    <span className="text-canon-text truncate" title={label}>{label}</span>
                    {f}
                </div>
                <div className="flex gap-2 font-mono text-[10px]">
                    <span className="text-canon-blue" title="Belief">{safeBelief.toFixed(2)}</span>
                    {hasTruth && <span className="text-yellow-500" title="Truth">{safeTruth.toFixed(2)}</span>}
                    {hasTruth && <span className={Math.abs(delta) > 0.1 ? 'text-red-400' : 'text-green-400'} title="Delta">{delta > 0 ? '+' : ''}{delta.toFixed(2)}</span>}
                </div>
            </div>
            <div className="relative h-1.5 w-full bg-canon-bg-light rounded-full overflow-hidden">
                {/* Truth Marker */}
                {hasTruth && (
                    <div className="absolute top-0 bottom-0 w-0.5 bg-yellow-500 z-10" style={{ left: `${Math.min(100, Math.max(0, safeTruth * 100))}%` }} />
                )}
                {/* Belief Bar */}
                <div className="absolute top-0 bottom-0 bg-canon-blue/80" style={{ width: `${Math.min(100, Math.max(0, safeBelief * 100))}%` }} />
            </div>
        </div>
    );
};

const StubBlock: React.FC<{ title: string; desc: string }> = ({ title, desc }) => (
    <div className="border border-dashed border-canon-border/50 rounded p-4 text-center opacity-50 bg-canon-bg/20">
        <h4 className="text-sm font-bold text-canon-text-light mb-1">{title}</h4>
        <p className="text-xs text-canon-text-light/70 italic">{desc}</p>
        <span className="text-[10px] uppercase tracking-wider text-red-400/50 mt-2 block">[Заглушка]</span>
    </div>
);

const ArchetypeRow: React.FC<{ item: ArchetypeMatchCandidate, rank: number, isProjection?: boolean }> = ({ item, rank, isProjection }) => {
    if (!item) return null;
    const { id, name, dist6, dist9 } = item;
    const parts = id.split('-');
    const mu = parts[2];
    const funcName = FUNCTION_NAMES[parseInt(parts[1]) - 1] || 'Function';
    
    const muLabel = mu === 'SR' ? 'Радикал' : mu === 'OR' ? 'Изгой' : mu === 'SN' ? 'Норма' : 'Инструмент';
    const colorClass = mu === 'SR' ? 'text-red-400' : mu === 'OR' ? 'text-orange-400' : mu === 'SN' ? 'text-blue-400' : 'text-gray-400';
    
    return (
        <Link to={`/character/ARCHETYPE::${id}`} className="flex items-center justify-between py-1 hover:bg-canon-bg-light/50 px-1 rounded group">
             <div className="flex flex-col w-3/4">
                <div className="flex items-baseline gap-2">
                    <span className="text-[10px] font-mono opacity-50 w-3">{rank}.</span>
                    <span className={`text-xs font-bold truncate ${colorClass}`}>{name}</span>
                </div>
                 <div className="text-[9px] text-canon-text-light pl-5 truncate opacity-70 group-hover:opacity-100">
                    {muLabel} • {funcName} ({id})
                 </div>
             </div>
             <div className="text-right flex flex-col text-[9px] font-mono opacity-70">
                 <span title="Distance (6 Latents)">d6: {dist6.toFixed(3)}</span>
                 <span title="Distance (9 Metrics)" className="opacity-50">d9: {dist9.toFixed(3)}</span>
             </div>
        </Link>
    )
}

const ArchetypeList: React.FC<{ title: string, candidates?: ArchetypeMatchCandidate[], isProjection?: boolean }> = ({ title, candidates, isProjection }) => {
    if (!candidates || candidates.length === 0) return null;
    
    const borderColorClass = isProjection ? 'border-cyan-500/30' : 'border-purple-500/30';
    const bgColorClass = isProjection ? 'bg-cyan-900/10' : 'bg-purple-900/10';

    return (
        <div className={`rounded border ${borderColorClass} ${bgColorClass} p-2 flex flex-col h-full`}>
            <div className="text-[10px] font-bold text-canon-text-light uppercase mb-2 text-center tracking-wider">{title}</div>
            <div className="space-y-1 flex-grow">
                {candidates.slice(0, 3).map((item, i) => (
                    <ArchetypeRow key={item.id} item={item} rank={i + 1} isProjection={isProjection} />
                ))}
            </div>
        </div>
    )
}

// --- Tab Content Components ---

interface SharedTabProps {
    dossier: CharacterDossier;
    params: TomParams;
    agent: AgentState;
    outputs: TomOutputs;
    activeTooltip: string | null;
    onToggleTooltip: (id: string | null) => void;
    observations: Observation[];
    dyad: DyadFeatures;
    tom: TomEntryGeneral;
}

const TabObserver: React.FC<SharedTabProps> = ({ dossier, params, agent, outputs, activeTooltip, onToggleTooltip, dyad, observations }) => {
    const biases = params.biases || {};
    const psy = dossier.analysis?.psych_profile || {};
    
    // Read calculated error profile from output if available, else calc locally
    const errorProfile = outputs.errorProfile || {
        paranoia: (biases.hostile_attribution || 0) * 0.7 + (biases.trauma_reenactment || 0) * 0.6,
        naivete: (1 - (biases.cynicism || 0)) * 0.5,
        cynicism: (biases.cynicism || 0) * 0.8 + (biases.confirmation || 0) * 0.4,
        self_blame: (psy.distortion?.personalization || 0) * 0.5 + (biases.anchoring || 0) * 0.3
    };
    
    const affect = psy.affect || { fear: 0, anger: 0, hope: 0, shame: 0 };
    const exhaustion = (agent.v42metrics?.ExhaustRisk_t ?? 0);
    const stress = agent.body?.acute?.stress ? agent.body.acute.stress / 100 : 0;
    const load = agent.v42metrics?.DriveU_t ?? 0;
    const vol = agent.derivedMetrics?.lambda ?? 0;
    const toMQ = agent.tomMetrics?.toM_Quality ?? 0.5;
    
    // Helper for Source Archetypes display
    const proj = outputs.characterModel?.projectionBreakdown;
    const selfId = agent.identity.arch_self_dominant_id;
    const shadowId = agent.archetype?.shadowId;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
            <Card title="1. Искажения (Biases)" icon="👓">
                <ValueBar label="Враждебность (Hostile)" value={biases.hostile_attribution} color="bg-red-500" 
                    f={<FButton id="bias_hostile" title="Враждебная атрибуция" 
                        activeId={activeTooltip} onToggle={onToggleTooltip}
                        formula="max(ThreatBias, 1-WorldTrust) + 0.3 * Aggression"
                        variables={{ 
                            ThreatBias: psy.distortion?.threatBias || 0, 
                            WorldTrust: (dossier.analysis?.worldview?.people_trust || 0),
                            Aggression: (psy.coping?.aggression || 0)
                        }}
                    />} 
                />
                <ValueBar label="Подтверждение (Confirm)" value={biases.confirmation} color="bg-yellow-500" 
                     f={<FButton id="bias_conf" title="Склонность к подтверждению" 
                        activeId={activeTooltip} onToggle={onToggleTooltip}
                        formula="Из психопрофиля: Distortion.ConfirmationBias"
                        variables={{ ConfirmationBias: psy.distortion?.confirmationBias || 0 }}
                     />}
                />
                <ValueBar label="Якорение (Anchoring)" value={biases.anchoring} color="bg-blue-500" 
                    f={<FButton id="bias_anchor" title="Эффект якоря" 
                        activeId={activeTooltip} onToggle={onToggleTooltip}
                        formula="0.1 + 0.35*(1-ToM_Q) + 0.25*MindReading"
                        variables={{ ToM_Q: toMQ, MindReading: psy.distortion?.mindReading || 0 }}
                    />}
                />
                <ValueBar label="Цинизм (Cynicism)" value={biases.cynicism} color="bg-orange-500" 
                    f={<FButton id="bias_cynic" title="Цинизм" 
                        activeId={activeTooltip} onToggle={onToggleTooltip}
                        formula="0.55*TrustBias + 0.45*ThreatBias"
                        variables={{ TrustBias: psy.distortion?.trustBias || 0, ThreatBias: psy.distortion?.threatBias || 0 }}
                    />}
                />
                <ValueBar label="Травма (Trauma Reenact)" value={biases.trauma_reenactment} color="bg-purple-500" 
                    f={<FButton id="bias_trauma" title="Отыгрывание травмы" 
                        activeId={activeTooltip} onToggle={onToggleTooltip}
                        formula="max(0, TraumaLoad)"
                        variables={{ TraumaLoad: psy.trauma?.self || 0 }} 
                    />}
                />
                <ValueBar label="Негатив (Negativity Bias)" value={params.negativityBoost} color="bg-red-400" 
                    f={<FButton id="bias_neg" title="Сдвиг к негативу" 
                        activeId={activeTooltip} onToggle={onToggleTooltip}
                        formula="1.1 * (0.55*Hostile + 0.45*Catastrophizing)"
                        variables={{ Hostile: biases.hostile_attribution || 0, Catastrophizing: psy.distortion?.catastrophizing || 0 }}
                    />}
                />
            </Card>

            <Card title="2. Профиль Ошибок (Error Profile)" icon="⚠️">
                 <div className="grid grid-cols-2 gap-3 mb-2">
                    <div className="bg-red-900/20 border border-red-500/30 p-2 rounded text-center">
                        <div className="text-lg font-bold text-red-400">{errorProfile.paranoia.toFixed(2)}</div>
                        <div className="text-[9px] text-red-200 uppercase flex justify-center items-center gap-1">
                            Паранойя
                            <FButton id="err_paranoia" title="Паранойя" activeId={activeTooltip} onToggle={onToggleTooltip} 
                                formula="0.7*Hostile + 0.6*TraumaReenactment" 
                                variables={{ Hostile: biases.hostile_attribution || 0, TraumaReenact: biases.trauma_reenactment || 0 }}
                            />
                        </div>
                    </div>
                    <div className="bg-green-900/20 border border-green-500/30 p-2 rounded text-center">
                        <div className="text-lg font-bold text-green-400">{errorProfile.naivete.toFixed(2)}</div>
                        <div className="text-[9px] text-green-200 uppercase flex justify-center items-center gap-1">
                            Наивность
                            <FButton id="err_naivete" title="Наивность" activeId={activeTooltip} onToggle={onToggleTooltip}
                                formula="0.5 * (1 - Cynicism)"
                                variables={{ Cynicism: biases.cynicism || 0 }}
                            />
                        </div>
                    </div>
                     <div className="bg-orange-900/20 border border-orange-500/30 p-2 rounded text-center">
                        <div className="text-lg font-bold text-orange-400">{errorProfile.cynicism.toFixed(2)}</div>
                        <div className="text-[9px] text-orange-200 uppercase flex justify-center items-center gap-1">
                            Цинизм
                            <FButton id="err_cynicism" title="Цинизм" activeId={activeTooltip} onToggle={onToggleTooltip}
                                formula="0.8*Cynicism + 0.4*Confirmation"
                                variables={{ Cynicism: biases.cynicism || 0, Confirmation: biases.confirmation || 0 }}
                            />
                        </div>
                    </div>
                     <div className="bg-blue-900/20 border border-blue-500/30 p-2 rounded text-center">
                        <div className="text-lg font-bold text-blue-400">{errorProfile.self_blame.toFixed(2)}</div>
                        <div className="text-[9px] text-blue-200 uppercase flex justify-center items-center gap-1">
                            Вина (Self-Blame)
                            <FButton id="err_selfblame" title="Самообвинение" activeId={activeTooltip} onToggle={onToggleTooltip}
                                formula="0.5*Personalization + 0.3*Anchoring"
                                variables={{ Personalization: psy.distortion?.personalization || 0, Anchoring: biases.anchoring || 0 }}
                            />
                        </div>
                    </div>
                 </div>
            </Card>
            
            <Card title="3. Аффект Наблюдателя (Affect_i)" icon="🌡️">
                 <ValueBar label="Страх (Fear)" value={affect.fear} color="bg-purple-500" f={<FButton id="aff_fear" title="Страх" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Calculated in Psych Layer" variables={{ Value: affect.fear }}/>} />
                 <ValueBar label="Гнев (Anger)" value={affect.anger} color="bg-red-500" f={<FButton id="aff_anger" title="Гнев" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Calculated in Psych Layer" variables={{ Value: affect.anger }}/>} />
                 <ValueBar label="Стыд (Shame)" value={affect.shame} color="bg-orange-500" f={<FButton id="aff_shame" title="Стыд" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Calculated in Psych Layer" variables={{ Value: affect.shame }}/>} />
                 <ValueBar label="Надежда (Hope)" value={affect.hope} color="bg-green-500" f={<FButton id="aff_hope" title="Надежда" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Calculated in Psych Layer" variables={{ Value: affect.hope }}/>} />
                 <ValueBar label="Истощение (Exhaustion)" value={exhaustion} color="bg-gray-500" f={<FButton id="aff_exh" title="Истощение" activeId={activeTooltip} onToggle={onToggleTooltip} formula="ExhaustRisk_t (V4.2 Metric)" variables={{ ExhaustRisk: exhaustion }}/>} />
            </Card>

            <Card title="4. Профиль Стресса (Stress_i)" icon="⚡">
                 <ValueBar label="Нагрузка (Load/DriveU)" value={load} color="bg-yellow-400" f={<FButton id="str_load" title="Нагрузка" activeId={activeTooltip} onToggle={onToggleTooltip} formula="DriveU_t (V4.2 Metric)" variables={{ DriveU: load }}/>} />
                 <ValueBar label="Острый Стресс (Stress)" value={stress} color="bg-red-500" f={<FButton id="str_stress" title="Стресс" activeId={activeTooltip} onToggle={onToggleTooltip} formula="body.acute.stress / 100" variables={{ Stress: stress }}/>} />
                 <ValueBar label="Волатильность (Volatility)" value={vol} color="bg-fuchsia-400" f={<FButton id="str_vol" title="Волатильность" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Lambda (Derived Metric)" variables={{ Lambda: vol }}/>} />
            </Card>

            <Card title="5. Self Latents_i" icon="🧘">
                 <ValueBar label="Правда (Self-Truth/CH)" value={dossier.analysis?.latents?.CH ?? 0.5} f={<FButton id="self_ch" title="Causal Hygiene" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Latent CH" variables={{ CH: dossier.analysis?.latents?.CH ?? 0 }}/>} />
                 <ValueBar label="Агентность (Self-Agency/SD)" value={dossier.analysis?.latents?.SD ?? 0.5} f={<FButton id="self_sd" title="Stability Discipline" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Latent SD" variables={{ SD: dossier.analysis?.latents?.SD ?? 0 }}/>} />
                 <ValueBar label="Масштаб (Self-Scope)" value={agent.vector_base?.G_Narrative_agency ?? 0.5} f={<FButton id="self_scope" title="Narrative Agency" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Vector G_Narrative_agency" variables={{ Scope: agent.vector_base?.G_Narrative_agency ?? 0 }}/>} />
            </Card>
            
             <Card title="6. Профиль Обновления (Updating)" icon="🔄">
                 <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                     <div className="flex justify-between"><span>Neg. Boost:</span><span className="font-mono">{params.negativityBoost.toFixed(2)}</span></div>
                     <div className="flex justify-between"><span>Pos. Disc:</span><span className="font-mono">{params.positivityDiscount.toFixed(2)}</span></div>
                     <div className="flex justify-between"><span>Conf. Up:</span><span className="font-mono">{params.confirmationUpWeight.toFixed(2)}</span></div>
                     <div className="flex justify-between"><span>Conf. Down:</span><span className="font-mono">{params.confirmationDownWeight.toFixed(2)}</span></div>
                     <div className="flex justify-between"><span>Forget λ:</span><span className="font-mono">{params.lambdaForget.toFixed(3)}</span></div>
                 </div>
                 <div className="mt-2 pt-2 border-t border-canon-border/30 text-[10px] text-canon-text-light italic">
                     Параметры, влияющие на скорость изменения убеждений (Bayesian Update).
                 </div>
            </Card>

             <Card title="7. Внутренние Источники (Sources)" icon="👁️">
                  <div className="space-y-2 text-xs text-canon-text-light">
                      <div className="flex justify-between">
                          <span>Self Archetype:</span>
                          <span className="text-canon-text font-bold">{selfId || '—'}</span>
                      </div>
                       <div className="flex justify-between">
                          <span>Shadow Archetype:</span>
                          <span className="text-red-400 font-bold">{shadowId || '—'}</span>
                      </div>
                       <div className="flex justify-between border-t border-canon-border/20 pt-1">
                          <span>W_Self (Proj):</span>
                          <span className="text-purple-400 font-mono">{(proj?.wSelf ?? 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                          <span>W_Shadow (Proj):</span>
                          <span className="text-red-400 font-mono">{(proj?.wShadow ?? 0).toFixed(2)}</span>
                      </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-canon-border/30">
                      <ValueBar label="Shadow Activation" value={agent.archetype?.shadowActivation ?? 0} color="bg-purple-500" f={<FButton id="self_shadow" title="Активация Тени" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Sigmoid(Crisis + Conflict)" variables={{ Activation: agent.archetype?.shadowActivation ?? 0 }}/>} />
                  </div>
            </Card>
        </div>
    );
};

const TabPerception: React.FC<SharedTabProps> = ({ outputs, tom, activeTooltip, onToggleTooltip, observations }) => {
    const debug = outputs.projectionDebug;
    const unc = tom.toM_Unc;
    const effNorms = outputs.effectiveNorms || { system: 0.5, human: 0.5, autonomy: 0.5, harshness: 0.5 };
    const [jsonOpen, setJsonOpen] = useState(false);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
            {/* Col 1: Projections */}
            <div className="lg:col-span-1 space-y-6">
                 
                 <Card title="12. Воспринимаемые Архетипы (i→j)" icon="👤">
                     <div className="grid grid-cols-2 gap-2 items-stretch">
                        <div className='border-r border-canon-border/30 pr-2 flex flex-col'>
                            <div className="text-[10px] text-canon-text-light uppercase font-bold mb-2 text-center">Final Belief (Mixed)</div>
                            <ArchetypeList title="Top 3 (Mixed)" candidates={debug?.posteriorMatches} isProjection={false} />
                        </div>
                        <div className='pl-2 flex flex-col'>
                            <div className="text-[10px] text-cyan-300 uppercase font-bold mb-2 text-center">Pure Prior (Projected)</div>
                            <ArchetypeList title="Top 3 (Prior)" candidates={debug?.priorCandidates} isProjection={true} />
                        </div>
                     </div>
                     
                     {debug && (
                         <div className="mt-3 pt-2 border-t border-canon-border/30 text-[10px] space-y-1">
                             <div className="flex justify-between">
                                 <span>Distance to Prior:</span> 
                                 <span className="font-mono text-cyan-300">
                                     {debug.dist_prior !== undefined ? debug.dist_prior.toFixed(3) : 'N/A'}
                                 </span>
                             </div>
                             <div className="flex justify-between">
                                 <span>Mix Weight (Prior):</span> 
                                 <span className="font-mono text-yellow-500">
                                     {debug.mix_penalty !== undefined ? (1 - debug.mix_penalty).toFixed(3) : 'N/A'}
                                 </span>
                             </div>
                         </div>
                    )}
                 </Card>
                 
                 <Card title="19. Эмоции цели (Affect_j Belief)" icon="😰">
                    {outputs.affectBelief ? (
                        <>
                            <ValueBar label="Страх (Fear)" value={outputs.affectBelief.fear} color="bg-purple-500" f={<FButton id="bel_fear" title="Belief Fear" activeId={activeTooltip} onToggle={onToggleTooltip} formula="σ(10*(Conflict - 0.2) + 5*(Unc - 0.5))" variables={{Conflict: outputs.normConflict, Unc: unc}} />} />
                            <ValueBar label="Гнев (Anger)" value={outputs.affectBelief.anger} color="bg-red-500" f={<FButton id="bel_anger" title="Belief Anger" activeId={activeTooltip} onToggle={onToggleTooltip} formula="σ(10*(Conflict - 0.4))" variables={{Conflict: outputs.normConflict}} />} />
                            <ValueBar label="Стыд (Shame)" value={outputs.affectBelief.shame} color="bg-orange-500" f={<FButton id="bel_shame" title="Belief Shame" activeId={activeTooltip} onToggle={onToggleTooltip} formula="σ(10*(NormDistance - 0.3))" variables={{NormDist: outputs.normConflict}} />} />
                            <ValueBar label="Надежда (Hope)" value={outputs.affectBelief.hope} color="bg-green-500" f={<FButton id="bel_hope" title="Belief Hope" activeId={activeTooltip} onToggle={onToggleTooltip} formula="σ(5*(Trust - 0.5))" variables={{Trust: outputs.trustBase}} />} />
                        </>
                    ) : <div className="text-xs italic text-canon-text-light">Нет данных</div>}
                 </Card>
            </div>

            {/* Col 2: Belief vs Truth */}
            <div className="lg:col-span-2 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <Card title="8. Пред-цели (PreGoals)" icon="🎯">
                         <div className="max-h-64 overflow-y-auto custom-scrollbar pr-2">
                             {tom.truthVsBelief?.truthPreGoals?.map(g => (
                                 <DiffBar 
                                    key={g.preGoal} label={g.preGoal} belief={g.belief} truth={g.truth} 
                                    f={<FButton id={`pg_${g.preGoal}`} title={`Goal: ${g.preGoal}`} activeId={activeTooltip} onToggle={onToggleTooltip} formula="Delta = Belief - Truth" variables={{Belief: g.belief, Truth: g.truth, Delta: g.delta}} />}
                                 />
                             ))}
                         </div>
                    </Card>
                    <Card title="9. Типы Действий (Action Types)" icon="🎭">
                         <div className="max-h-64 overflow-y-auto custom-scrollbar pr-2">
                             {tom.truthVsBelief?.truthTypes?.map(t => (
                                     <DiffBar 
                                        key={t.type} label={t.type} belief={t.belief} truth={t.truth}
                                        f={<FButton id={`type_${t.type}`} title={`Type: ${t.type}`} activeId={activeTooltip} onToggle={onToggleTooltip} formula="Delta = Belief - Truth" variables={{Belief: t.belief, Truth: t.truth, Delta: t.delta}} />}
                                     />
                             ))}
                             {(!tom.truthVsBelief?.truthTypes || tom.truthVsBelief.truthTypes.length === 0) && (
                                 <div className="text-xs text-canon-text-light italic">Нет данных о типах действий.</div>
                             )}
                         </div>
                    </Card>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <Card title="10. Латенты: Декомпозиция (Latent Breakdown)" icon="🧬">
                        <div className="flex justify-between items-center mb-3">
                            <div className="text-[10px] text-canon-text-light flex gap-4 items-center flex-wrap">
                                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-gray-600 rounded-sm"/> <span>Projected (Main)</span></div>
                                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-purple-500 rounded-sm"/> <span>Mixed (Stick)</span></div>
                                <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"/> <span>True</span></div>
                                <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 bg-cyan-400 rounded-full"/> <span>Archetype (Prior Best)</span></div>
                            </div>
                            <button 
                                onClick={() => setJsonOpen(!jsonOpen)}
                                className="text-[10px] bg-canon-bg border border-canon-border px-2 py-0.5 rounded hover:text-canon-accent"
                            >
                                {jsonOpen ? "Hide Math" : "Show Math (JSON)"}
                            </button>
                        </div>

                        {jsonOpen && outputs.projectionDebug && (
                            <div className="mb-4 p-3 bg-black/20 rounded border border-canon-border/30 text-[10px] font-mono text-green-400 overflow-x-auto whitespace-pre">
                                {JSON.stringify(outputs.projectionDebug, null, 2)}
                            </div>
                        )}

                        <div className="max-h-96 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                             {tom.truthVsBelief?.truthLatents?.map(l => {
                                 const cm = outputs.characterModel;
                                 const projVal = cm?.projectedLatentsPure?.[l.key] ?? 0;
                                 // Use the archetype latents corresponding to the perceived archetype for the marker
                                 const archVal = cm?.archetypeLatentsPure?.[l.key] ?? 0.5;
                                 
                                 const mixedVal = cm?.projectedLatentsMixed?.[l.key] ?? l.belief;
                                 const trueVal = l.truth;
                                 
                                 const displayInfo = LATENT_DESCRIPTIONS[l.key] || { label: l.key, desc: 'Unknown' };
                                 const delta = mixedVal - trueVal;

                                 return (
                                 <div key={l.key} className="mb-2 text-xs">
                                    <div className="flex justify-between mb-1 items-end">
                                        <div className="w-28 flex flex-col justify-center" title={displayInfo.desc}>
                                            <span className="text-canon-text font-bold text-[10px]">{displayInfo.label}</span>
                                            <span className="text-[9px] text-canon-text-light opacity-70 truncate">{displayInfo.desc}</span>
                                        </div>
                                        
                                        <div className="flex-1 flex justify-between text-[10px] font-mono pl-4">
                                            <span className="text-gray-400" title="Projected">{projVal.toFixed(2)}</span>
                                            <div className="flex gap-2">
                                                <span className={`font-bold ${Math.abs(delta) > 0.1 ? 'text-red-400' : 'text-green-400'}`} title="Delta (Mixed - True)">Δ{delta > 0 ? '+' : ''}{delta.toFixed(2)}</span>
                                                <span className="text-purple-400 font-bold" title="Mixed">{mixedVal.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="relative h-5 w-full bg-canon-bg-light/30 rounded overflow-hidden border border-canon-border/30">
                                        {/* True Marker (Yellow Dot) */}
                                        <div className="absolute top-1/2 -mt-1 w-1.5 h-1.5 bg-yellow-500 rounded-full z-30 shadow-[0_0_4px_rgba(234,179,8,0.8)]" style={{ left: `${Math.min(100, Math.max(0, trueVal * 100))}%` }} title="True Value" />
                                        
                                        {/* Archetype Marker (Cyan Dot + Checkmark if close to mixed) */}
                                        <div className="absolute top-0 bottom-0 flex items-center justify-center pointer-events-none" style={{ left: `${Math.min(100, Math.max(0, archVal * 100))}%`, transform: 'translateX(-50%)' }}>
                                            <div className="w-0.5 h-full bg-cyan-400/50"></div>
                                            <div className="absolute top-0 -mt-1 text-cyan-300 text-[10px]">▼</div>
                                        </div>
                                        
                                        {/* Projected Bar (Grey - Main Bar) */}
                                        <div className="absolute top-1 bottom-1 bg-gray-600 z-10" style={{ left: 0, width: `${Math.min(100, Math.max(0, projVal * 100))}%` }} title="Projected Value" />

                                        {/* Mixed Marker (Purple Stick) */}
                                        <div className="absolute top-0 bottom-0 w-1 bg-purple-500 z-40 shadow-[0_0_6px_rgba(168,85,247,0.8)]" style={{ left: `${Math.min(100, Math.max(0, mixedVal * 100))}%` }} title="Mixed Result" />
                                    </div>
                                </div>
                             )})}
                         </div>
                    </Card>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <Card title="11. Жизненные Цели (Life Goals)" icon="🌟">
                        <div className="max-h-64 overflow-y-auto custom-scrollbar pr-2">
                             {tom.truthVsBelief?.truthLifeGoals?.map(g => (
                                 <DiffBar 
                                    key={g.goalId} label={g.goalId} belief={g.belief} truth={g.truth}
                                    f={<FButton id={`lg_${g.goalId}`} title={`LifeGoal: ${g.goalId}`} activeId={activeTooltip} onToggle={onToggleTooltip} formula="Mapped from PreGoals" variables={{Belief: g.belief, Truth: g.truth}} />}
                                 />
                             ))}
                         </div>
                    </Card>

                    {/* 15. Normative Profile Card */}
                     <Card title="15. Нормативный Профиль (Norms)" icon="⚖️">
                         <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                             <div className="border-b border-canon-border/30 pb-2 mb-2 flex justify-between items-center text-xs">
                                 <div className="font-bold text-canon-text-light">Profile Diffs</div>
                                 <div className="flex gap-2 font-mono text-[10px]">
                                     <span className="text-orange-400" title="Est. Conflict">{outputs.normConflict.toFixed(2)}</span>
                                     <span className="text-yellow-500" title="True Conflict">{(outputs.normConflict_truth ?? 0).toFixed(2)}</span>
                                 </div>
                             </div>
                             {tom.truthVsBelief?.truthNorms?.map(n => (
                                 <DiffBar 
                                     key={n.key} label={n.label} belief={n.belief} truth={n.truth} 
                                     f={<FButton id={`norm_${n.key}`} title={`Norm: ${n.label}`} activeId={activeTooltip} onToggle={onToggleTooltip} formula="Delta = Belief - Truth" variables={{Belief: n.belief, Truth: n.truth, Delta: n.delta}} />}
                                 />
                             ))}
                             
                             <div className="mt-2 pt-2 border-t border-canon-border/30">
                                 <ValueBar label="Эгоизм (Egoism)" value={outputs.egoism} color="bg-blue-400" f={<FButton id="egoism" title="Egoism" activeId={activeTooltip} onToggle={onToggleTooltip} formula="SelfRaw / Total" variables={{Ego: outputs.egoism}} />} />
                                 <ValueBar label="Альтруизм (Altruism)" value={outputs.altruism} color="bg-green-400" f={<FButton id="altruism" title="Altruism" activeId={activeTooltip} onToggle={onToggleTooltip} formula="OtherRaw / Total" variables={{Alt: outputs.altruism}} />} />
                             </div>
                         </div>
                     </Card>
                </div>
            </div>
        </div>
    );
};

const TabDynamics: React.FC<SharedTabProps> = ({ outputs, tom, activeTooltip, onToggleTooltip, dyad, observations }) => {
    const fingerprintData = outputs.tomVectorFingerprint.axes.map(a => ({
        subject: a.id.replace('_', '/'),
        A: a.value,
        fullMark: 1
    }));
    
    const unc = tom.toM_Unc;
    const trustBase = outputs.trustBase;
    const goalAlign = outputs.goalAlignment;
    const normConf = outputs.normConflict;

    // NEW: берём последнее наблюдение и показываем контекст места/публичности
    const lastObs = observations.length > 0 ? observations[observations.length - 1] : undefined;
    const contextEntries = useMemo(
        () => lastObs?.context ? Object.entries(lastObs.context).sort((a, b) => Math.abs(b[1] as number) - Math.abs(a[1] as number)) : [],
        [lastObs]
    );
    const lastLocation = lastObs?.locationId ? getEntityById(lastObs.locationId) : undefined;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
            {/* Col 1: Visuals */}
            <div className="lg:col-span-1 space-y-6">
                <Card title="23. Отпечаток Отношения (Fingerprint)" icon="🕸️">
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={fingerprintData}>
                                <PolarGrid stroke="#333" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#888', fontSize: 9 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 1]} tick={false} axisLine={false} />
                                <Radar name="Fingerprint" dataKey="A" stroke="#00aaff" fill="#00aaff" fillOpacity={0.4} />
                                <Tooltip contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #333', fontSize: '12px' }} />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
                <Card title="29. Выравнивание (Alignment)" icon="🔗">
                    <ValueBar label="Целевое (Goals)" value={outputs.goalAlignment} color="bg-green-500" f={<FButton id="goal_align" title="Goal Alignment" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Cosine(SelfGoals, BelievedGoals)" variables={{Cosine: outputs.goalAlignment}} />} />
                    <ValueBar label="Нормативное (Norms)" value={1 - outputs.normConflict} color="bg-blue-500" f={<FButton id="norm_align" title="Norm Alignment" activeId={activeTooltip} onToggle={onToggleTooltip} formula="1 - NormDistance" variables={{Dist: outputs.normConflict}} />} />
                    <div className="pt-2 text-[10px] text-canon-text-light">
                        Истинное выравнивание: {(outputs.goalAlignment_truth ?? 0).toFixed(2)}
                    </div>
                </Card>
            </div>

            {/* Col 2: Probabilities */}
            <div className="lg:col-span-2 space-y-6">
                <Card title="24. Вероятности Действий (Probabilities)" icon="🔮">
                     <div className="grid grid-cols-2 gap-4">
                         <div>
                             <h5 className="text-[10px] font-bold text-canon-text-light uppercase mb-2">Кооперация</h5>
                             <ValueBar label="Следовать (Follow)" value={outputs.P_Follow} color="bg-green-500" f={<FButton id="p_follow" title="P_Follow" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Trust + Align + Authority - Cost" variables={{Trust: trustBase, Align: goalAlign}} />} />
                             <ValueBar label="Помочь (Donate)" value={outputs.P_DonateGoals} color="bg-green-500" f={<FButton id="p_donate" title="P_Donate" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Trust + Dependence + Altruism" variables={{Trust: trustBase, Dependence: dyad.dependence, Altruism: outputs.altruism}} />} />
                             <ValueBar label="Компромисс" value={outputs.P_Compromise} color="bg-blue-500" f={<FButton id="p_comp" title="P_Compromise" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Trust + Align - Risk" variables={{Trust: trustBase, Align: goalAlign}} />} />
                             <ValueBar label="Поддержка" value={outputs.P_PublicEndorse} color="bg-blue-500" f={<FButton id="p_endorse" title="P_PublicEndorse" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Approval + Trust" variables={{Approval: outputs.approval, Trust: trustBase}} />} />
                         </div>
                         <div>
                             <h5 className="text-[10px] font-bold text-canon-text-light uppercase mb-2">Риски и Конфликт</h5>
                             <ValueBar label="Эскалация" value={outputs.P_ConflictEscalation} color="bg-red-500" f={<FButton id="p_esc" title="P_Conflict" activeId={activeTooltip} onToggle={onToggleTooltip} formula="NormConflict + ThreatBias + Aggression" variables={{NormConf: normConf}} />} />
                             <ValueBar label="Предательство (Decep)" value={outputs.P_DeceptionByJ} color="bg-red-500" f={<FButton id="p_decep" title="P_Deception" activeId={activeTooltip} onToggle={onToggleTooltip} formula="DeceptionRisk (Honesty)" variables={{DecepRisk: outputs.deceptionRisk}} />} />
                             <ValueBar label="Отзыв Мандата" value={outputs.P_MandateRevoke} color="bg-orange-500" f={<FButton id="p_revoke" title="P_Revoke" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Risk + Conflict + Betrayal" variables={{Risk: outputs.deceptionRisk, Conflict: normConf}} />} />
                             <ValueBar label="Дистанция" value={outputs.P_PublicDistance} color="bg-orange-500" f={<FButton id="p_dist" title="P_Distance" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Risk + Conflict - Approval" variables={{Risk: outputs.deceptionRisk}} />} />
                         </div>
                     </div>
                </Card>
                
                <div className="grid grid-cols-2 gap-4">
                    <Card title="16. Доверие/Честность (Beta)" icon="🤝">
                         <div className="space-y-2">
                             <ValueBar label="Доверие (Trust)" value={outputs.trustBase} color="bg-green-500" subtext={`Var: ${outputs.trustVar.toFixed(3)}`} f={<FButton id="trust_mean" title="Trust Mean" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Alpha / (Alpha + Beta)" variables={{Alpha: tom.trust.alpha as number, Beta: tom.trust.beta as number}} />} />
                             <ValueBar label="Надежность (Cred)" value={outputs.promiseCredibility} color="bg-blue-500" f={<FButton id="cred" title="Credibility" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Trust * (1 - DeceptionRisk)" variables={{Trust: outputs.trustBase, DecepRisk: outputs.deceptionRisk}} />} />
                         </div>
                    </Card>
                    <Card title="17. Профиль Риска (Risk Profile)" icon="💣">
                         <ValueBar label="Риск Обмана" value={outputs.deceptionRisk} color="bg-red-500" f={<FButton id="risk_decep" title="Deception Risk" activeId={activeTooltip} onToggle={onToggleTooltip} formula="1 - HonestyMean" variables={{HonestyMean: 1-outputs.deceptionRisk}} />} />
                         <ValueBar label="Выживание Связи" value={outputs.P_TieSurvival} color="bg-green-600" f={<FButton id="risk_tie" title="Tie Survival" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Trust - Risk - Cost + Bond" variables={{Trust: trustBase, Bond: dyad.bond}} />} />
                         <ValueBar label="Риск Эскалации" value={outputs.P_ConflictEscalation} color="bg-orange-500" f={<FButton id="risk_esc" title="Escalation Risk" activeId={activeTooltip} onToggle={onToggleTooltip} formula="See P_Conflict" variables={{P: outputs.P_ConflictEscalation}} />} />
                    </Card>
                </div>

                <div className="grid grid-cols-2 gap-4">
                     <Card title="25-28. Факторы и Драйверы" icon="📊">
                         <div className="text-xs space-y-1">
                             <div className="font-bold text-canon-text-light">Top Reasons (Action Choice):</div>
                             {outputs.topReasons.map(r => <div key={r.label} className="pl-2 text-[10px]">{r.label}: {r.score.toFixed(2)}</div>)}
                             <div className="font-bold text-canon-text-light mt-2">Top Driving Goals:</div>
                             {outputs.topGoalsDriving.map(r => <div key={r.preGoal} className="pl-2 text-[10px]">{r.preGoal}: {r.score.toFixed(2)}</div>)}
                         </div>
                     </Card>
                     
                     <Card title="24. Контекст (место / публичность)" icon="📍">
                        {!lastObs && (
                            <div className="text-xs text-canon-text-light">
                                Пока нет ни одного наблюдения для пары i→j.
                            </div>
                        )}
                        {lastObs && (
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-canon-text-light">Последнее наблюдение t:</span>
                                    <span className="font-mono text-canon-text">{lastObs.t}</span>
                                </div>
                                {lastObs.locationId && (
                                    <div className="flex justify-between">
                                        <span className="text-canon-text-light">Место:</span>
                                        <span className="font-mono text-canon-text">
                                            {lastLocation?.title || lastLocation?.name || lastObs.locationId}
                                        </span>
                                    </div>
                                )}
                                <div className="mt-2 border-t border-canon-border/30 pt-2">
                                    <div className="text-[10px] text-canon-text-light mb-1">
                                        Нормализованный контекст (0–1)
                                    </div>
                                    {contextEntries.length === 0 && (
                                        <div className="text-[10px] text-canon-text-light/70">
                                            Для этого наблюдения ещё не задан числовой контекст.
                                        </div>
                                    )}
                                    <div className="space-y-1">
                                        {contextEntries.slice(0, 6).map(([key, value]) => {
                                            const v = Math.max(0, Math.min(1, value as number));
                                            return (
                                                <div key={key} className="flex items-center gap-2">
                                                    <div className="w-28 text-[10px] text-canon-text-light truncate" title={key}>
                                                        {key}
                                                    </div>
                                                    <div className="flex-1 h-1.5 bg-canon-bg rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-canon-blue"
                                                            style={{ width: `${v * 100}%` }}
                                                        />
                                                    </div>
                                                    <div className="w-8 text-right font-mono text-[10px] text-canon-text-light">
                                                        {v.toFixed(2)}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
};

const TabSecondOrder: React.FC<SharedTabProps> = ({ outputs, tom, activeTooltip, onToggleTooltip, observations }) => {
    const sec = outputs.secondOrderSelf;

    const orderChain: TomOrderLayer[] | null = useMemo(() => {
        if (!sec) return null;
        return computeTomOrderChain({
            outputs,
            characterModel: (outputs as any).characterModel,
            second: sec,
            entry: tom,
            maxOrder: 4,
        });
    }, [outputs, sec, tom]);

    if (!sec) {
        return <div className="text-center text-canon-text-light italic p-8">Нет данных ToM второго порядка (рефлексии).</div>;
    }

    const higherOrders = orderChain && orderChain.filter(l => l.order >= 3);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
            <Card title="1. Оценка Себя Глазами Другого (J's View of I)" icon="👁️">
                <div className="space-y-4">
                    <p className="text-xs text-canon-text-light italic">
                        «Как я думаю, что {outputs.characterModel ? 'цель' : 'он'} видит меня»
                    </p>
                    <ValueBar 
                        label="Воспринимаемое Доверие (q_trust)" 
                        value={sec.perceivedTrustFromTarget} 
                        color="bg-green-500"
                        f={<FButton id="q_trust" title="q_trust" activeId={activeTooltip} onToggle={onToggleTooltip} formula="σ(1.2*A + (1-Risk) + Alt + Bond)" variables={{Val: sec.perceivedTrustFromTarget}} />}
                    />
                    <ValueBar 
                        label="Воспринимаемое Согласие (q_align)" 
                        value={sec.perceivedAlignFromTarget} 
                        color="bg-blue-500"
                        f={<FButton id="q_align" title="q_align" activeId={activeTooltip} onToggle={onToggleTooltip} formula="σ(1.5*A + RoleBonus)" variables={{Val: sec.perceivedAlignFromTarget}} />}
                    />
                    <ValueBar 
                        label="Воспринимаемая Доминантность (q_dom)" 
                        value={sec.perceivedDominanceInTargetsView} 
                        color="bg-purple-500"
                        f={<FButton id="q_dom" title="q_dom" activeId={activeTooltip} onToggle={onToggleTooltip} formula="σ(1.2*Dom + 0.9*Hier)" variables={{Val: sec.perceivedDominanceInTargetsView}} />}
                    />
                    <ValueBar 
                        label="Воспринимаемая Неуверенность (q_unc)" 
                        value={sec.perceivedUncertaintyOfTarget} 
                        color="bg-gray-500"
                        f={<FButton id="q_unc" title="q_unc" activeId={activeTooltip} onToggle={onToggleTooltip} formula="σ(1.3*H_avg + 0.7*Hostile)" variables={{Val: sec.perceivedUncertaintyOfTarget}} />}
                    />
                </div>
            </Card>

            <Card title="2. Зеркало и Стыд (Reflection)" icon="🪞">
                <div className="space-y-4">
                    <p className="text-xs text-canon-text-light italic">
                        Сравнение «Я-концепции» с «Отражением в глазах другого».
                    </p>
                    <ValueBar 
                        label="Зеркальный Индекс (M)" 
                        value={sec.mirrorIndex} 
                        color="bg-fuchsia-500"
                        f={<FButton id="mirror_idx" title="Mirror Index (M)" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Cosine(SelfVec, SeenVec)" variables={{M: sec.mirrorIndex}} />}
                    />
                    <ValueBar 
                        label="Принятие Отражения (SelfAlign)" 
                        value={sec.selfAlign} 
                        color="bg-blue-400"
                        f={<FButton id="self_align" title="Self Align (A)" activeId={activeTooltip} onToggle={onToggleTooltip} formula="σ(2*M - 1.2*Shame - 0.8*Blame)" variables={{M: sec.mirrorIndex, A: sec.selfAlign}} />}
                    />
                    <DiffBar 
                        label="Дельта Стыда (Shame Delta)" 
                        belief={sec.shameDelta} 
                        truth={0} 
                        f={<FButton id="shame_delta" title="Shame Delta" activeId={activeTooltip} onToggle={onToggleTooltip} formula="A - M" variables={{Delta: sec.shameDelta}} />}
                    />
                    
                    <div className="mt-4 p-2 bg-black/20 rounded border border-canon-border/30">
                         <div className="text-[10px] font-bold text-canon-text-light uppercase mb-1">Интерпретация</div>
                         <p className="text-xs text-canon-text">
                             {sec.shameDelta < -0.1 ? "Я думаю, он видит меня хуже, чем я есть (Стыд)." :
                              sec.shameDelta > 0.1 ? "Я думаю, он идеализирует меня (Гордость/Самообман)." :
                              "Мой образ в его глазах совпадает с моим самоощущением."}
                         </p>
                    </div>
                </div>
            </Card>

            <Card title="3. ToM Высших Порядков (k ≥ 3)" icon="🎛️">
                <div className="space-y-4">
                    {!higherOrders || higherOrders.length === 0 ? (
                        <p className="text-xs text-canon-text-light italic">
                            Недостаточно данных, чтобы построить устойчивую цепочку порядков ToM.
                        </p>
                    ) : (
                        <>
                            <p className="text-xs text-canon-text-light italic">
                                Итеративное «пережёвывание» связки: «я о тебе» ↔ «я о том, как ты видишь меня».
                                Каждая ступень приближает нас к устойчивой точке рассуждений.
                            </p>
                            <div className="space-y-3">
                                {higherOrders.map(layer => (
                                    <div key={layer.order} className="p-2 rounded bg-black/20 border border-canon-border/30">
                                        <div className="text-[11px] font-semibold text-canon-text mb-1">
                                            Порядок k = {layer.order}
                                        </div>
                                        <ValueBar 
                                            label="Доверие" 
                                            value={layer.trust} 
                                            color="bg-green-500"
                                            f={<FButton id={`k${layer.order}_trust`} title={`ToM^${layer.order} trust`} 
                                                activeId={activeTooltip} onToggle={onToggleTooltip}
                                                formula="t_k = λ·t_{k-1} + (1-λ)·t_{k-2}" 
                                                variables={{k: layer.order, Val: layer.trust}} />}
                                        />
                                        <ValueBar 
                                            label="Согласие" 
                                            value={layer.align} 
                                            color="bg-blue-500"
                                            f={<FButton id={`k${layer.order}_align`} title={`ToM^${layer.order} align`} 
                                                activeId={activeTooltip} onToggle={onToggleTooltip}
                                                formula="a_k = λ·a_{k-1} + (1-λ)·a_{k-2}" 
                                                variables={{k: layer.order, Val: layer.align}} />}
                                        />
                                        <ValueBar 
                                            label="Доминантность" 
                                            value={layer.dominance} 
                                            color="bg-purple-500"
                                            f={<FButton id={`k${layer.order}_dom`} title={`ToM^${layer.order} dominance`} 
                                                activeId={activeTooltip} onToggle={onToggleTooltip}
                                                formula="d_k = λ·d_{k-1} + (1-λ)·d_{k-2}" 
                                                variables={{k: layer.order, Val: layer.dominance}} />}
                                        />
                                        <ValueBar 
                                            label="Неопределённость" 
                                            value={layer.uncertainty} 
                                            color="bg-gray-500"
                                            f={<FButton id={`k${layer.order}_unc`} title={`ToM^${layer.order} uncertainty`} 
                                                activeId={activeTooltip} onToggle={onToggleTooltip}
                                                formula="u_k = λ·u_{k-1} + (1-λ)·u_{k-2}" 
                                                variables={{k: layer.order, Val: layer.uncertainty}} />}
                                        />
                                    </div>
                                ))}
                            </div>
                            {higherOrders.length > 0 && (
                                <div className="mt-3 text-[11px] text-canon-text-light">
                                    Последний слой k = {higherOrders[higherOrders.length - 1].order} можно
                                    интерпретировать как приближение к «устойчивой» картине при бесконечной глубине рассуждений.
                                </div>
                            )}
                        </>
                    )}
                </div>
            </Card>
        </div>
    );
};


const TabMeta: React.FC<SharedTabProps> = ({ outputs, tom, activeTooltip, onToggleTooltip, observations }) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
             <div className="space-y-6">
                <Card title="30. Структурная Диагностика (Structural)" icon="🏗️">
                    <div className="space-y-2 text-xs">
                        <div className="flex justify-between"><span>SELF (Align):</span> <span className="font-mono text-canon-text">{outputs.tomStructuralDiagnosis.SELF.alignment.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>WORLD (Threat):</span> <span className="font-mono text-red-400">{outputs.tomStructuralDiagnosis.WORLD.threat.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>OTHERS (Trust):</span> <span className="font-mono text-green-400">{outputs.tomStructuralDiagnosis.OTHERS.trust.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>SYSTEM (Loyalty):</span> <span className="font-mono text-blue-400">{outputs.tomStructuralDiagnosis.SYSTEM.loyalty.toFixed(2)}</span></div>
                        <div className="mt-2 border-t border-canon-border/30 pt-1 text-[10px] text-canon-text-light">
                            SELF Split: {outputs.tomStructuralDiagnosis.SELF.split.toFixed(2)} | WORLD Radical: {outputs.tomStructuralDiagnosis.WORLD.radicalism.toFixed(2)}
                        </div>
                    </div>
                </Card>
                
                <Card title="32. Профиль Стресса (Target Belief)" icon="😫">
                     <div className="space-y-2">
                         <ValueBar label="Cognitive Load" value={outputs.tomStressProfile.state.cognitiveLoad} color="bg-yellow-400" f={<FButton id="stress_cog" title="Cognitive Load" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Believed CH" variables={{CH: outputs.tomStressProfile.state.cognitiveLoad}} />} />
                         <ValueBar label="Emo Depletion" value={outputs.tomStressProfile.state.emotionalDepletion} color="bg-red-400" f={<FButton id="stress_emo" title="Emotional Depletion" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Believed SD" variables={{SD: outputs.tomStressProfile.state.emotionalDepletion}} />} />
                         <ValueBar label="Volatility" value={outputs.tomStressProfile.state.volatility} color="bg-purple-400" f={<FButton id="stress_vol" title="Volatility" activeId={activeTooltip} onToggle={onToggleTooltip} formula="Believed CL" variables={{CL: outputs.tomStressProfile.state.volatility}} />} />
                         <div className="pt-2 border-t border-canon-border/30 text-[10px]">
                             <span className="text-canon-text-light">Coping: </span>
                             <span className="text-canon-accent font-bold">
                                 {outputs.tomStressProfile.coping.avoidance > 0.6 ? 'AVOIDANCE' : 
                                  outputs.tomStressProfile.coping.aggression > 0.6 ? 'AGGRESSION' : 
                                  outputs.tomStressProfile.coping.overcontrol > 0.6 ? 'CONTROL' : 'ADAPTIVE'}
                             </span>
                         </div>
                     </div>
                </Card>
             </div>
             
             <div className="space-y-6">
                 <div className="grid grid-cols-2 gap-4">
                     <StubBlock title="18. Role Profile" desc="Роль в отношениях (label + confidence)." />
                     <StubBlock title="21. Shame/Guilt" desc="Моральные регуляторы (Детально)." />
                     <StubBlock title="31. Derived Metrics" desc="Rho, Lambda, Iota (Belief)." />
                 </div>
                 
                 <Card title="33. Журнал Событий (Evidence Log)" icon="📜" className="h-96 overflow-y-auto custom-scrollbar">
                    <div className="space-y-2 font-mono text-xs">
                        {tom.evidenceLog.length === 0 && <div className="text-canon-text-light italic">Нет записей событий.</div>}
                        {[...tom.evidenceLog].reverse().map((ev, i) => (
                            <div key={i} className="p-2 bg-black/20 rounded border border-white/5 hover:border-canon-accent/30 transition-colors">
                                <div className="flex justify-between mb-1">
                                     <span className="font-bold text-canon-accent">{ev.kind.toUpperCase()}</span>
                                     <span className="text-canon-text-light text-[10px]">t={ev.t}</span>
                                </div>
                                <div className="flex gap-2 text-[10px] text-canon-text-light">
                                     <span>Int: {ev.intensity.toFixed(2)}</span>
                                     <span>W: {ev.weight_w.toFixed(2)}</span>
                                     <span className="text-canon-text">{ev.tags.join(', ')}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
             </div>
        </div>
    );
};

// --- Main Component ---

export const TomGeneralInspector: React.FC<Props> = ({ observerId, observerEntityOverride, observerMetricsOverride }) => {
    const [targetId, setTargetId] = useState<string>('');
    
    // Add shared tooltip state for exclusive visibility
    const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
    
    // 1. Resolve Observer
    const allChars = useMemo(() => {
        const chars = getEntitiesByType(EntityType.Character) as CharacterEntity[];
        const essences = getEntitiesByType(EntityType.Essence) as CharacterEntity[];
        return [...chars, ...essences];
    }, []);

    const { activeModule } = useAccess();
    const visibleChars = useMemo(
        () => filterCharactersForActiveModule(allChars, activeModule),
        [allChars, activeModule]
    );

    const observerChar = observerEntityOverride ?? visibleChars.find(c => c.entityId === observerId);

    // NEW: Ensure we have the fully calculated observer state including dominant archetype
    const calculatedObserver = useMemo(() => {
        if (!observerChar) return null;
        
        if (observerMetricsOverride && observerMetricsOverride.modifiableCharacter) {
             const c = observerMetricsOverride.modifiableCharacter;
             return {
                 ...c,
                 ...observerMetricsOverride,
                 identity: {
                     ...c.identity,
                     arch_true: observerMetricsOverride.modifiableCharacter.identity.arch_true,
                     arch_self: observerMetricsOverride.modifiableCharacter.identity.arch_self,
                     arch_true_dominant_id: observerMetricsOverride.modifiableCharacter.identity.arch_true_dominant_id,
                     arch_self_dominant_id: observerMetricsOverride.modifiableCharacter.identity.arch_self_dominant_id
                 }
             } as unknown as AgentState; 
        } else {
            const calculated = calculateAllCharacterMetrics(observerChar, Branch.Current, []);
            const c = calculated.modifiableCharacter;
             return {
                 ...c,
                 ...calculated,
                 identity: {
                     ...c.identity,
                     arch_true_dominant_id: c.identity.arch_true_dominant_id,
                     arch_self_dominant_id: c.identity.arch_self_dominant_id
                 }
             } as unknown as AgentState; 
        }
    }, [observerChar, observerMetricsOverride]);


    const observerDossier = useMemo(() => {
          if (!calculatedObserver) return null;
          return convertAgentToDossier(calculatedObserver);
    }, [calculatedObserver]);

    // 2. Resolve Target
    const targetChar = useMemo(() => visibleChars.find(c => c.entityId === targetId), [visibleChars, targetId]);
    const targetDossier = useMemo(() => {
        if (!targetChar) return undefined;
        const calculated = calculateAllCharacterMetrics(targetChar, Branch.Current, []);
        const agent: AgentState = { ...calculated.modifiableCharacter, ...calculated } as any;
        return convertAgentToDossier(agent);
    }, [targetChar]);

    // 3. Build Observations (History + Mock)
    const observations = useMemo(() => {
        if (!observerDossier || !targetId) return [];
        const hist = buildObservationsFromHistory(observerDossier, targetId);
        const auto = allSocialEvents.filter(ev => ev.actorId === targetId && ev.targetId === observerId)
            .map((ev, i) => convertEventToObservation(ev, hist.length + i + 1));
        return [...hist, ...auto];
    }, [observerDossier, targetId]);

    // 4. Run ToM Engine
    const preGoalSpace = useMemo(() => {
          if (!observerDossier?.explainability?.goal_definitions) return undefined;
          const defs = observerDossier.explainability.goal_definitions;
          return Array.from(new Set(defs.flatMap(g => Object.keys(g.preGoalWeights ?? {})))).sort();
    }, [observerDossier]);

    const tomState = useMemo(() => {
          if (!observerDossier || !targetId || !targetDossier) return null;
          let truthPre = preGoalSpace && targetDossier ? buildTargetTruthPreGoalsVec(targetDossier, preGoalSpace) : undefined;
          const init = initTomGeneral(observerDossier, targetId, { preGoalSpace, targetTruthPreGoalsVec: truthPre, maxLog: 240 });
          return updateTomGeneral(observerDossier, init, observations, { targetTruthDossier: targetDossier, maxLog: 240 });
    }, [observerDossier, targetId, observations, targetDossier, preGoalSpace]);

    const params = useMemo(() => {
        if (!observerDossier || !targetId) return null;
        const dyad = deriveDyadFeaturesFromObserverHistory(observerDossier, targetId);
        return deriveTomParams(observerDossier, dyad);
    }, [observerDossier, targetId]);
    
    const dyad = useMemo(() => {
        if (!observerDossier || !targetId) return { bond: 0, betrayal: 0, sharedCombat: 0, dependence: 0, perceivedAuthorityOfTarget: 0, ingroup: 0, outgroup: 0, traumaLinked: 0, isIngroup: false, isOutgroup: true, dominanceByI: 0, conflict: 0 };
        return deriveDyadFeaturesFromObserverHistory(observerDossier, targetId);
    }, [observerDossier, targetId]);

    // --- Handlers ---
    const downloadJson = () => {
        if (!tomState || !observerDossier || !targetDossier || !params) return;
        const blob = new Blob([JSON.stringify({ observer: observerDossier, target: targetDossier, tomState, params }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'tom_full_debug.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };
    
    const handleToggleTooltip = (id: string | null) => {
        setActiveTooltip(id);
    };

    if (!observerChar) return <div>Observer not found.</div>;
    
    const sharedProps = {
        dossier: observerDossier!,
        params: params!,
        agent: calculatedObserver!,
        outputs: tomState?.outputs!,
        activeTooltip,
        onToggleTooltip: handleToggleTooltip,
        dyad,
        tom: tomState!,
        observations // Pass observations to tabs
    };

    return (
        <div className="bg-canon-bg-light border border-canon-border rounded-lg p-6 shadow-xl min-h-[80vh]">
            
            {/* Control Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4 border-b border-canon-border pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-canon-text">Инспектор ToM (25 Блоков)</h2>
                    <p className="text-xs text-canon-text-light mt-1">Визуализация субъективной модели другого агента.</p>
                </div>
                
                <div className="flex items-center gap-4 bg-canon-bg p-2 rounded border border-canon-border/50">
                     <div className="text-sm text-canon-text-light">Наблюдатель:</div>
                     <div className="font-bold text-canon-accent">{observerChar.title}</div>
                     <div className="text-sm text-canon-text-light">➔ Цель:</div>
                     <select 
                        value={targetId} 
                        onChange={e => setTargetId(e.target.value)}
                        className="bg-canon-bg-light border border-canon-border rounded px-2 py-1 text-xs focus:border-canon-accent outline-none min-w-[150px]"
                    >
                        <option value="">[ Выберите цель ]</option>
                        {visibleChars.filter(c => c.entityId !== observerId).map(c => <option key={c.entityId} value={c.entityId}>{c.title}</option>)}
                    </select>
                </div>

                <button 
                    onClick={downloadJson} 
                    disabled={!tomState}
                    className="text-[10px] border border-canon-border px-3 py-1.5 rounded hover:bg-canon-accent hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-canon-bg"
                >
                    💾 Скачать JSON
                </button>
            </div>

            {tomState && params && targetDossier && calculatedObserver ? (
                <Tabs tabs={[
                    { label: "1. Наблюдатель (Observer)", content: <TabObserver {...sharedProps} /> },
                    { label: "2. Восприятие j (Perception)", content: <TabPerception {...sharedProps} /> },
                    { label: "3. Динамика (Dynamics)", content: <TabDynamics {...sharedProps} /> },
                    { label: "4. Второй порядок (ToM²)", content: <TabSecondOrder {...sharedProps} /> },
                    { label: "5. Мета & Лог (Logs)", content: <TabMeta {...sharedProps} /> }
                ]} />
            ) : (
                 <div className="h-64 flex items-center justify-center text-canon-text-light opacity-50 border-2 border-dashed border-canon-border/30 rounded-lg">
                     <div className="text-center">
                         <div className="text-4xl mb-2">🎭</div>
                         <p>Выберите цель из списка выше, чтобы запустить симуляцию ToM.</p>
                     </div>
                 </div>
            )}
        </div>
    );
};
