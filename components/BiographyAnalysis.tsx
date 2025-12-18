
import React, { useState, useMemo } from 'react';
import { CharacterEntity, PersonalEvent, Biography, SocialEventEntity } from '../types';
import { getEffectiveCharacterBasis, mapPersonalToBio, EVENT_FEATURE_MAP, timeDecay, DEFAULT_BIOGRAPHY_PARAMS, computeBiographyLatent } from '../lib/biography';
import { BIO_TO_VECTOR_WEIGHTS } from '../lib/biography/biography-to-traits';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { BiographyTimeline } from './BiographyTimeline';
import { formalizeEvent, FormalizedEvent } from '../lib/biography/history-formalizer';
import { computeBioLogitsV3 } from '../lib/life-goals/life-from-biography';
import { computeExposureTraces, computeWorldview } from '../lib/biography/exposure';
import { GOAL_AXES, MATRIX_B_BIO } from '../lib/life-goals/v3-params';
import { GOAL_AXIS_NAMES } from '../data/archetypes';
import { useAccess } from '../contexts/AccessContext';
import { EntitySecurityGate, RedactedBlock } from './EntitySecurityGate';
import { getEntityById } from '../data';
import { BioRelationsView } from './BioRelationsView';

interface BiographyAnalysisProps {
    character: CharacterEntity;
    events: PersonalEvent[]; 
}

const BIO_LABELS = ['TRAUMA', 'TRUST', 'POWER', 'AGENCY', 'ORDER', 'CHAOS'];

const ModelExplanation: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    
    return (
        <div className="border border-canon-border/50 rounded-lg bg-canon-bg/30 overflow-hidden text-xs">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full text-left px-4 py-2 bg-canon-bg/50 hover:bg-canon-bg transition-colors flex justify-between items-center text-canon-text-light"
            >
                <span className="font-bold">📚 Справка: Как работает модель биографии?</span>
                <span>{isOpen ? '▲' : '▼'}</span>
            </button>
            
            {isOpen && (
                <div className="p-4 space-y-4 text-canon-text-light">
                    <div>
                        <h5 className="text-canon-accent font-bold mb-1">1. Вход: События</h5>
                        <p>Каждое событие имеет <code>domain</code> (тип), <code>tags</code>, <code>intensity</code> и <code>valence</code>. Эти параметры определяют "сигнатуру" влияния. Например, "Травма" даёт импульс в <strong>TRAUMA</strong>, а "Клятва" — в <strong>ORDER</strong>.</p>
                    </div>
                    <div>
                        <h5 className="text-canon-accent font-bold mb-1">2. Затухание (Time Decay)</h5>
                        <p>Влияние события угасает экспоненциально. Свежие события имеют 100% силы. События 5-летней давности значительно слабее. <em>Исключение: Ключевые воспоминания (Core Memories) и Травмы почти не угасают.</em></p>
                    </div>
                    <div>
                        <h5 className="text-canon-accent font-bold mb-1">3. Слой Латентов (Bio Latent)</h5>
                        <p>Все события суммируются в 6 базовых каналов опыта (TRAUMA, TRUST...). Это "накопленный багаж" персонажа. Функция <code>tanh()</code> насыщает значения, чтобы бесконечное число травм не сломало математику.</p>
                    </div>
                    <div>
                        <h5 className="text-canon-accent font-bold mb-1">4. Выход: Сдвиг Личности и Драйв</h5>
                        <p>Био-латенты делают две вещи: а) Сдвигают 44 оси личности (например, снижают <em>Safety_Care</em>), б) Формируют <strong>Биографический Драйв</strong> — прямую мотивацию по 10 осям целей (Власть, Истина, Забота).</p>
                    </div>
                </div>
            )}
        </div>
    );
};

const FormalizationTab: React.FC<{ formalized: FormalizedEvent }> = ({ formalized }) => {
    const { domain, social, observations } = formalized;

    return (
        <div className="space-y-6">
            {/* Domain Layer */}
            <div className="bg-canon-bg border border-canon-border/30 rounded p-3">
                <div className="text-[10px] text-canon-accent font-bold uppercase mb-2">1. Domain Layer (Action)</div>
                <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                        <span className="text-canon-text-light block">Action ID:</span>
                        <span className="font-mono text-canon-text font-bold">{domain?.actionId}</span>
                    </div>
                    <div>
                        <span className="text-canon-text-light block">Context:</span>
                        <span className="font-mono text-canon-text">{domain?.ctx?.scenarioKind} ({domain?.ctx?.public ? 'Public' : 'Private'})</span>
                    </div>
                     <div>
                        <span className="text-canon-text-light block">Actor:</span>
                        <span className="font-mono text-canon-text">{domain?.actorId}</span>
                    </div>
                     <div>
                        <span className="text-canon-text-light block">Target:</span>
                        <span className="font-mono text-canon-text">{domain?.targetId || '—'}</span>
                    </div>
                </div>
            </div>

            {/* Social Layer */}
            <div className="bg-canon-bg border border-canon-border/30 rounded p-3">
                <div className="text-[10px] text-green-400 font-bold uppercase mb-2">2. Social Layer (Meaning)</div>
                <div className="space-y-2">
                    {social?.map((soc, i) => (
                        <div key={i} className="border-l-2 border-green-500/50 pl-2 py-1">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-bold text-canon-text">
                                    {String(soc?.domain || 'unknown').toUpperCase()}
                                </span>
                                <div className="flex gap-1">
                                    {soc?.tags?.map(t => <span key={t} className="px-1 bg-green-900/30 text-[9px] rounded text-green-300">{t}</span>)}
                                </div>
                            </div>
                            {(soc as any).deltas && (soc as any).deltas.length > 0 && (
                                <div className="mt-1 text-[10px] font-mono text-canon-text-light">
                                    {(soc as any).deltas.map((d: any, idx: number) => (
                                        <div key={idx}>
                                            {d.ledgerId?.toUpperCase()}: {d.from ? `${d.from} -> ` : ''}{d.to || 'Self'} <span className={d.amount > 0 ? 'text-green-400' : 'text-red-400'}>{d.amount > 0 ? '+' : ''}{d.amount}</span> ({d.reason})
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                    {(!social || social.length === 0) && <div className="text-xs italic text-canon-text-light">Нет социальных эффектов.</div>}
                </div>
            </div>

            {/* ToM Layer */}
            <div className="bg-canon-bg border border-canon-border/30 rounded p-3">
                <div className="text-[10px] text-blue-400 font-bold uppercase mb-2">3. ToM Layer (Observations)</div>
                 <div className="space-y-2">
                    {observations?.map((obs, i) => (
                        <div key={i} className="flex items-start gap-3 text-xs border-b border-canon-border/20 pb-2 last:border-0">
                            <div className="w-24 font-bold text-canon-text truncate" title={obs.observerId}>{obs.observerId}</div>
                            <div className="flex-1 font-mono text-canon-text-light">
                                {obs.updates?.join(', ')}
                            </div>
                        </div>
                    ))}
                     {(!observations || observations.length === 0) && <div className="text-xs italic text-canon-text-light">Нет наблюдений.</div>}
                </div>
            </div>
        </div>
    );
};

const EventAnalysisModal: React.FC<{ event: PersonalEvent, characterAge: number, onClose: () => void }> = ({ event, characterAge, onClose }) => {
    const ageYears = event.years_ago ?? 0;
    const decayFactor = Math.exp(-0.0005 * (ageYears * 365)); 
    const w = (event.intensity ?? 0.5) * decayFactor;
    
    const [activeTab, setActiveTab] = useState<'impact' | 'formalization'>('impact');

    // 1. Get Bio Features
    let featureMap: Partial<Record<string, number>> = EVENT_FEATURE_MAP[event.domain] || {};
    if (Object.keys(featureMap).length === 0 && event.tags) {
         if (event.tags.includes('trauma')) featureMap = { TRAUMA: 0.8 };
         else if (event.tags.includes('achievement')) featureMap = { AGENCY: 0.6, POWER: 0.2 };
         else if (event.tags.includes('failure')) featureMap = { AGENCY: -0.4, TRAUMA: 0.2 };
    }

    // 2. Calculate Impacts
    const impacts: { feature: string, val: number, shifts: { axis: string, delta: number }[] }[] = [];
    
    for (const [feat, weight] of Object.entries(featureMap)) {
        const wVal = weight as number | undefined;
        const impactVal = w * (wVal ?? 0);

        const vecWeights = BIO_TO_VECTOR_WEIGHTS[`bio_${feat.toLowerCase()}`] || BIO_TO_VECTOR_WEIGHTS[`bio_${feat.toLowerCase()}_exposure`] || {};
        const shifts = Object.entries(vecWeights).map(([axis, coeff]) => {
             const cVal = coeff as number | undefined;
             return {
                 axis,
                 delta: (cVal ?? 0) * impactVal * 0.15 
             };
        }).sort((a,b) => Math.abs(b.delta) - Math.abs(a.delta));

        impacts.push({ feature: feat, val: impactVal, shifts });
    }
    
    // 3. Formalization
    const formalized = useMemo(() => formalizeEvent(event), [event]);

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center" onClick={onClose}>
            <div className="bg-canon-bg-light border border-canon-border rounded-lg p-6 max-w-xl w-full shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-4 border-b border-canon-border pb-2">
                    <div>
                        <h3 className="text-xl font-bold text-canon-text">{event.name}</h3>
                        <div className="flex gap-2 mt-1 text-xs font-mono text-canon-text-light">
                            <span>{event.domain}</span>
                            <span>•</span>
                            <span>{event.years_ago} лет назад</span>
                            <span>•</span>
                            <span className={decayFactor < 0.5 ? 'text-canon-text-light' : 'text-green-400'}>
                                Актуальность: {(decayFactor * 100).toFixed(0)}%
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-canon-text-light hover:text-white font-bold text-xl">×</button>
                </div>
                
                <div className="flex gap-4 mb-4 border-b border-canon-border/30 text-sm">
                    <button onClick={() => setActiveTab('impact')} className={`pb-1 ${activeTab === 'impact' ? 'text-canon-accent border-b-2 border-canon-accent' : 'text-canon-text-light'}`}>Влияние</button>
                    <button onClick={() => setActiveTab('formalization')} className={`pb-1 ${activeTab === 'formalization' ? 'text-canon-accent border-b-2 border-canon-accent' : 'text-canon-text-light'}`}>Социальная Формализация</button>
                </div>

                {activeTab === 'impact' && (
                    <div className="space-y-4">
                        {impacts.map((item) => (
                            <div key={item.feature} className="bg-canon-bg border border-canon-border/50 rounded p-3">
                                <div className="flex justify-between items-center mb-2">
                                    <div className="font-bold text-sm text-canon-accent">{item.feature}</div>
                                    <div className="font-mono text-xs bg-canon-bg-light px-1.5 py-0.5 rounded">+{item.val.toFixed(2)}</div>
                                </div>
                                <div className="text-xs text-canon-text-light space-y-1">
                                    {item.shifts.slice(0, 4).map(s => (
                                        <div key={s.axis} className="flex justify-between">
                                            <span>{s.axis}</span>
                                            <span className={s.delta > 0 ? 'text-green-400' : 'text-red-400'}>{s.delta > 0 ? '+' : ''}{s.delta.toFixed(3)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {impacts.length === 0 && <div className="text-sm text-canon-text-light italic">Нет прямых проекций на вектор.</div>}
                    </div>
                )}
                
                {activeTab === 'formalization' && formalized && <FormalizationTab formalized={formalized} />}
            </div>
        </div>
    );
};

const BioDriveVisualizer: React.FC<{ events: PersonalEvent[] }> = ({ events }) => {
    const bioLogits = useMemo(() => {
        const exposures = computeExposureTraces(events);
        const worldview = computeWorldview(exposures);
        
        // Compute mock psych state just for bio logits
        const mockPsych: any = { exposures, worldview };
        return computeBioLogitsV3(mockPsych);
    }, [events]);
    
    // Transform to sorted array
    const data = GOAL_AXES.map(axis => ({
        id: axis,
        name: GOAL_AXIS_NAMES[axis] || axis,
        value: bioLogits[axis] || 0
    })).sort((a,b) => b.value - a.value);

    return (
        <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
             <h4 className="text-sm font-bold text-canon-accent mb-3">Биографический Драйв (10 Осей)</h4>
             <p className="text-xs text-canon-text-light mb-4">
                 Кумулятивное влияние истории на приоритеты целей. Положительное значение = драйвер, Отрицательное = избегание.
             </p>
             <div className="space-y-2">
                 {data.slice(0, 6).map(item => {
                     const width = Math.min(100, Math.abs(item.value) * 10);
                     const color = item.value > 0 ? 'bg-canon-blue' : 'bg-red-400';
                     return (
                         <div key={item.id} className="flex items-center gap-3 text-xs">
                             <div className="w-32 text-right pr-2 truncate text-canon-text-light" title={item.name}>{item.name}</div>
                             <div className="flex-1 h-1.5 bg-canon-bg rounded-full overflow-hidden flex items-center">
                                 <div className="w-full flex">
                                     <div className="w-1/2 flex justify-end">
                                         {item.value < 0 && <div className={`h-full ${color}`} style={{ width: `${width}%` }} />}
                                     </div>
                                     <div className="w-px h-full bg-canon-border/50"></div>
                                     <div className="w-1/2 flex justify-start">
                                         {item.value > 0 && <div className={`h-full ${color}`} style={{ width: `${width}%` }} />}
                                     </div>
                                 </div>
                             </div>
                             <div className="w-8 font-mono text-right opacity-70">{item.value.toFixed(1)}</div>
                         </div>
                     )
                 })}
             </div>
        </div>
    )
}

export const BiographyAnalysis: React.FC<BiographyAnalysisProps> = ({ character, events }) => {
    // IMPORTANT: Use full timeline up to now
    const { vectorBase, bioState } = useMemo(() => getEffectiveCharacterBasis(character), [character, events]);
    const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
    const { activeModule, clearanceLevel } = useAccess();
    
    if (!bioState) return <div className="p-4 text-canon-text-light italic">Биографические данные отсутствуют.</div>;
    
    const { latent, axisDeltas } = bioState;
    const selectedEvent = events.find(e => e.id === selectedEventId);

    // Filter events for display
    const visibleEvents = useMemo(() => {
        return events.filter(ev => {
            // Strict Key Check
            if (ev.security?.requiredKey) {
                if (!activeModule) return false;
                const key = ev.security.requiredKey;
                const hasKey = activeModule.id === key || activeModule.codes.includes(key);
                if (!hasKey) return false;
            }
            // Tag check
            if (ev.tags?.includes('module_only') && !activeModule) {
                return false;
            }
            return true;
        }).sort((a,b) => (b.years_ago??0) - (a.years_ago??0));
    }, [events, activeModule]);


    // FIX: Access runtime array on latent by casting to any, properly checking type
    const chartData: {name: string, value: number, fill: string}[] = BIO_LABELS.map(label => {
        const vector = (latent as any).vector as number[] | undefined;
        const idx = BIO_LABELS.indexOf(label);
        let val = 0;
        if (vector && vector[idx] !== undefined) {
            val = vector[idx];
        } else {
            const namedVal = (latent as any)[label] ?? 0;
            val = (namedVal - 0.5) * 2; 
        }
        
        return {
            name: label,
            value: Number(val),
            fill: '#8884d8'
        };
    });

    // Sort Deltas by magnitude
    const deltaData = Object.entries(axisDeltas)
        .sort((a, b) => Math.abs(b[1] as number) - Math.abs(a[1] as number))
        .slice(0, 10)
        .map(([key, val]) => ({ name: key.replace('vector_base.', ''), value: val }));

    // NEW: агрегируем «личные места» по событиям персонажа
    const locationStats = useMemo(() => {
        type Acc = { num: number; den: number; count: number };
        const acc = new Map<string, Acc>();

        for (const ev of events) {
            const payload: any = ev.payload || {};
            const locationId: string | undefined =
                payload.locationId ||
                payload.location_id ||
                payload.location?.id ||
                payload.locationIdManual;

            if (!locationId) continue;

            const v = typeof ev.valence === 'number' ? ev.valence : 0;
            const intensity = typeof ev.intensity === 'number' ? ev.intensity : 0.5;
            const w = Math.max(0.05, Math.abs(intensity));

            const prev = acc.get(locationId) || { num: 0, den: 0, count: 0 };
            prev.num += v * w;
            prev.den += w;
            prev.count += 1;
            acc.set(locationId, prev);
        }

        const out = Array.from(acc.entries()).map(([locationId, st]) => {
            const avg = st.den > 0 ? st.num / st.den : 0;
            const ent = getEntityById(locationId);
            const name = (ent as any)?.title || (ent as any)?.name || locationId;
            return {
                locationId,
                name,
                valence: Math.max(-1, Math.min(1, avg)),
                weight: st.den,
                count: st.count,
            };
        });

        out.sort((a, b) => {
            const ma = Math.abs(a.valence) * Math.log(1 + a.count);
            const mb = Math.abs(b.valence) * Math.log(1 + b.count);
            return mb - ma;
        });

        return out;
    }, [events]);

    return (
        <div className="space-y-6">
            {/* 1. TIMELINE & EXPLANATION */}
            <div className="flex flex-col gap-4">
                <BiographyTimeline events={visibleEvents} />
                <ModelExplanation />
            </div>

            {/* 2. BIO RELATIONS VIEW (NEW) */}
            <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                <h4 className="text-sm font-bold text-canon-text mb-3">Социальный Слой Биографии</h4>
                <p className="text-xs text-canon-text-light mb-4">Агрегированные веса отношений, сформированные историческими событиями.</p>
                <BioRelationsView events={visibleEvents} />
            </div>

            {/* 3. EVENT LIST (Clickable) */}
            <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                <h4 className="text-sm font-bold text-canon-text mb-3">Хроника (Нажмите для анализа)</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                    {visibleEvents.map(ev => {
                         const isRedacted = ev.security?.requiredLevel !== undefined && clearanceLevel < ev.security.requiredLevel;
                         const isRomance = ev.tags?.includes('romance') || ev.tags?.includes('love');
                         const isFriend = ev.tags?.includes('friend') || ev.tags?.includes('friendship') || ev.tags?.includes('ally');
                         const isMentor = ev.tags?.includes('mentor') || ev.tags?.includes('protege');

                         // Extract target name if available in payload or participants
                         const participants = ev.participants || [];
                         const targetId = (ev.payload as any)?.targetId || (ev.payload as any)?.otherId || participants[0];
                         const targetName = targetId ? (getEntityById(targetId)?.title || targetId) : null;


                         if (isRedacted) {
                             return (
                                <div key={ev.id} className="bg-black/40 border border-canon-border/30 p-2 rounded cursor-not-allowed select-none">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono text-canon-text-light whitespace-nowrap">-{ev.years_ago}y</span>
                                            <span className="text-sm font-bold text-canon-text-light/20 blur-[2px]">REDACTED EVENT</span>
                                        </div>
                                        <span className="text-[8px] font-mono text-red-500 border border-red-500/50 px-1 rounded">L{ev.security?.requiredLevel}</span>
                                    </div>
                                </div>
                             )
                         }

                         return (
                            <div 
                                key={ev.id} 
                                onClick={() => setSelectedEventId(ev.id)}
                                className={`
                                    flex justify-between items-center bg-canon-bg border p-2 rounded cursor-pointer transition-colors group
                                    ${isRomance ? 'border-pink-500/50 bg-pink-900/10 hover:border-pink-400' :
                                      isFriend ? 'border-green-500/50 bg-green-900/10 hover:border-green-400' :
                                      isMentor ? 'border-purple-500/50 bg-purple-900/10 hover:border-purple-400' :
                                      'border-canon-border/50 hover:border-canon-accent'}
                                `}
                            >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <span className="text-xs font-mono text-canon-text-light whitespace-nowrap opacity-60">-{ev.years_ago}y</span>
                                    <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-2">
                                            {isRomance && <span className="text-xs" title="Romance">❤️</span>}
                                            {isFriend && <span className="text-xs" title="Friendship">🤝</span>}
                                            {isMentor && <span className="text-xs" title="Mentorship">🎓</span>}
                                            <span className="text-sm font-bold text-canon-text truncate group-hover:text-canon-accent transition-colors">{ev.name}</span>
                                        </div>
                                        {targetName && (isRomance || isFriend || isMentor) && (
                                            <div className="text-[10px] text-canon-text-light opacity-80">
                                                with <span className="text-canon-accent">{targetName}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-2 text-[10px]">
                                    <span className="bg-canon-bg-light px-1.5 py-0.5 rounded text-canon-text-light">{ev.domain}</span>
                                    <span className="bg-canon-bg-light px-1.5 py-0.5 rounded text-canon-blue font-mono">{(ev.intensity ?? 0).toFixed(1)}</span>
                                </div>
                            </div>
                        );
                    })}
                    {visibleEvents.length === 0 && <div className="text-sm text-canon-text-light italic text-center">События скрыты или отсутствуют.</div>}
                </div>
            </div>

            {/* 4. LATENT & SHIFT CHARTS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-canon-bg border border-canon-border rounded-lg p-4 h-64 flex flex-col">
                    <h4 className="text-sm font-bold text-canon-text mb-2 text-center">Накопленный Био-Латент (Total)</h4>
                    <div className="flex-grow min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} layout="vertical" margin={{ left: 40 }}>
                                <XAxis type="number" domain={[-1, 1]} hide />
                                <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 10, fill: '#bbb' }} interval={0}/>
                                <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a' }} />
                                <ReferenceLine x={0} stroke="#666" />
                                <Bar dataKey="value" barSize={12}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={(entry.value > 0) ? '#33ff99' : '#ff4444'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-canon-bg border border-canon-border rounded-lg p-4 h-64 flex flex-col">
                    <h4 className="text-sm font-bold text-canon-text mb-2 text-center">Итоговый Сдвиг Личности</h4>
                    <div className="flex-grow min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={deltaData} layout="vertical" margin={{ left: 100 }}>
                                <XAxis type="number" domain={[-0.3, 0.3]} hide />
                                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9, fill: '#bbb' }} interval={0}/>
                                <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a' }} />
                                <ReferenceLine x={0} stroke="#666" />
                                <Bar dataKey="value" barSize={10}>
                                    {deltaData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={(entry.value as number) > 0 ? '#00aaff' : '#ffaa00'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
            
            {/* 5. BIO DRIVE */}
            <BioDriveVisualizer events={visibleEvents} />

            {/* 6. ЛИЧНЫЕ МЕСТА (DEBUG) */}
            {locationStats.length > 0 && (
                <div className="bg-canon-bg border border-canon-border/30 rounded p-4">
                    <div className="text-[10px] text-canon-accent font-bold uppercase mb-2">
                        6. Личные места (Location Valence Debug)
                    </div>
                    <p className="text-xs text-canon-text-light mb-3">
                        Черновой индикатор того, какие места для персонажа ассоциированы с положительным
                        и отрицательным опытом. Считается по сумме событий с привязкой к <code>payload.locationId</code>.
                    </p>
                    <div className="space-y-1">
                        {locationStats.slice(0, 8).map((loc) => {
                            const v = loc.valence;
                            const width = Math.min(100, Math.abs(v) * 100);
                            const positive = v >= 0;
                            return (
                                <div key={loc.locationId} className="flex items-center gap-3 text-xs">
                                    <div
                                        className="w-40 truncate text-canon-text-light"
                                        title={`${loc.name} (${loc.locationId})`}
                                    >
                                        {loc.name}
                                    </div>
                                    <div className="flex-1 h-1.5 bg-canon-bg rounded-full overflow-hidden flex items-center">
                                        <div className="w-full flex">
                                            <div className="w-1/2 flex justify-end">
                                                {!positive && (
                                                    <div className="h-full bg-red-500" style={{ width: `${width}%` }} />
                                                )}
                                            </div>
                                            <div className="w-1/2 flex justify-start">
                                                {positive && (
                                                    <div className="h-full bg-canon-blue" style={{ width: `${width}%` }} />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-16 text-right font-mono text-[10px] text-canon-text-light">
                                        {v.toFixed(2)} · {loc.count}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* MODAL */}
            {selectedEvent && (
                <EventAnalysisModal 
                    event={selectedEvent} 
                    characterAge={character.context?.age ?? 30} 
                    onClose={() => setSelectedEventId(null)} 
                />
            )}
        </div>
    );
};
