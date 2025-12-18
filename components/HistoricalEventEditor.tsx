
import React, { useState, useEffect, useCallback } from 'react';
import { PersonalEvent, CharacterEntity, IdentityCaps, EntityType, TraumaKind } from '../types';
import { allEventTemplates } from '../data/event-templates';
import { oathTemplates } from '../data/oaths-data';
import { Slider } from './Slider';
import { getEntitiesByType } from '../data';
import { GOAL_AXIS_NAMES } from '../data/archetypes';
import { characterSchema } from '../data/character-schema';
import { METRIC_NAMES } from '../lib/archetypes/metrics';

interface HistoricalEventEditorProps {
    events: PersonalEvent[];
    onEventsChange: (events: PersonalEvent[], newIdentity?: IdentityCaps) => void;
    character: CharacterEntity;
}

const Section: React.FC<{ title: string, children: React.ReactNode, isOpen?: boolean, onToggle?: () => void }> = ({ title, children, isOpen = true, onToggle }) => (
    <div className="bg-canon-bg border border-canon-border/50 rounded-lg overflow-hidden mb-3 transition-all">
        <button 
            className="w-full flex justify-between items-center p-3 bg-canon-bg-light/50 hover:bg-canon-bg-light text-xs font-bold text-canon-text uppercase tracking-wider transition-colors"
            onClick={onToggle}
        >
            <span>{title}</span>
            <span>{isOpen ? '▼' : '▶'}</span>
        </button>
        {isOpen && <div className="p-3 border-t border-canon-border/30">{children}</div>}
    </div>
);

// Helper for editing Key-Value pairs (Weights)
const MapEditor: React.FC<{ 
    data: Record<string, number>; 
    onChange: (newData: Record<string, number>) => void;
    options: { value: string, label: string }[];
    label: string;
}> = ({ data, onChange, options, label }) => {
    const [addKey, setAddKey] = useState(options[0]?.value || '');
    const [addVal, setAddVal] = useState(0.1);

    const handleAdd = () => {
        if (addKey) {
            onChange({ ...data, [addKey]: addVal });
        }
    };

    const handleRemove = (key: string) => {
        const next = { ...data };
        delete next[key];
        onChange(next);
    };

    return (
        <div className="space-y-2">
            <div className="text-[10px] font-bold text-canon-text-light uppercase mb-1">{label}</div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
                {Object.entries(data).map(([k, v]) => (
                    <div key={k} className="flex justify-between items-center bg-black/20 px-2 py-1 rounded text-xs">
                        <span className="truncate w-3/4" title={k}>{k}</span>
                        <div className="flex items-center gap-2">
                             <span className={`font-mono ${(v as number) > 0 ? 'text-green-400' : 'text-red-400'}`}>{(v as number) > 0 ? '+' : ''}{v}</span>
                             <button onClick={() => handleRemove(k)} className="text-canon-text-light hover:text-white">×</button>
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex gap-2 mt-2">
                <select value={addKey} onChange={e => setAddKey(e.target.value)} className="w-full bg-canon-bg border border-canon-border rounded text-[10px] p-1">
                    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <input 
                    type="number" 
                    step={0.1} 
                    value={addVal} 
                    onChange={e => setAddVal(Number(e.target.value))} 
                    className="w-16 bg-canon-bg border border-canon-border rounded text-[10px] p-1 text-center"
                />
                <button onClick={handleAdd} className="px-2 bg-canon-accent text-black font-bold rounded text-xs">+</button>
            </div>
        </div>
    );
};

export const HistoricalEventEditor: React.FC<HistoricalEventEditorProps> = ({ events, onEventsChange, character }) => {
    const personalEventTemplates = allEventTemplates.filter(t => !t.id.startsWith('GOAL.'));
    const allCharacters = (getEntitiesByType(EntityType.Character) as CharacterEntity[]).concat(getEntitiesByType(EntityType.Essence) as CharacterEntity[]);
    
    const [templateId, setTemplateId] = useState<string>(personalEventTemplates[0]?.id || '');
    const selectedTemplate = personalEventTemplates.find(t => t.id === templateId);

    // Sections State
    const [sections, setSections] = useState({
        core: true,
        psych: false,
        context: false,
        trauma: false,
        calibration: false
    });

    const toggleSection = (key: keyof typeof sections) => setSections(p => ({ ...p, [key]: !p[key] }));

    // Core Data
    const [name, setName] = useState('');
    const [domain, setDomain] = useState('other');
    const [yearsAgo, setYearsAgo] = useState<number>(5);
    const [duration, setDuration] = useState<number>(0);
    
    // Psych Matrix
    const [intensity, setIntensity] = useState<number>(0.5);
    const [valence, setValence] = useState<number>(0);
    const [surprise, setSurprise] = useState<number>(0.5);
    const [controllability, setControllability] = useState<number>(0.5);
    const [responsibility, setResponsibility] = useState<number>(0.5);

    // Context
    const [secrecy, setSecrecy] = useState('private');
    const [selectedParticipantId, setSelectedParticipantId] = useState<string>('');
    const [participants, setParticipants] = useState<string[]>([]);

    // Trauma
    const [hasTrauma, setHasTrauma] = useState(false);
    const [traumaDomain, setTraumaDomain] = useState<'self' | 'others' | 'world' | 'system'>('self');
    const [traumaSeverity, setTraumaSeverity] = useState(0.8);
    const [traumaKind, setTraumaKind] = useState<TraumaKind>('betrayal_by_peer');

    // Calibration (Weights)
    const [axisWeights, setAxisWeights] = useState<Record<string, number>>({});
    const [lifeGoalWeights, setLifeGoalWeights] = useState<Record<string, number>>({});

    // Load Template Defaults
    const loadTemplate = (id: string) => {
        const t = personalEventTemplates.find(tpl => tpl.id === id);
        if (t) {
            setTemplateId(id);
            setName(t.name);
            setDomain(t.domain);
            setYearsAgo(t.default_years_ago);
            setDuration(t.default_duration_days ?? 0);
            setIntensity(t.default_intensity);
            setValence(t.default_valence);
            setSurprise(t.default_surprise ?? 0.5);
            setControllability(t.default_controllability ?? 0.5);
            setResponsibility(t.default_responsibility_self ?? 0.5);
            setParticipants([]);
            setHasTrauma(!!t.tags.includes('trauma'));
            // Cast t.deltas to Record<string, number>
            setAxisWeights(t.deltas ? Object.fromEntries(Object.entries(t.deltas as Record<string, number>).map(([k,v]) => [`vector_base.${k}`, v])) : {}); 
            setLifeGoalWeights(t.lifeGoalWeights || {});
        }
    };

    // Init
    useEffect(() => {
        if (templateId && !name) loadTemplate(templateId);
    }, []);

    const addParticipant = () => {
        if (selectedParticipantId && !participants.includes(selectedParticipantId)) {
            setParticipants([...participants, selectedParticipantId]);
        }
    };

    const removeParticipant = (id: string) => {
        setParticipants(participants.filter(p => p !== id));
    }
    
    const handleAdd = () => {
        const newEvent: PersonalEvent = {
            id: `personal-${Date.now()}`,
            name: name || 'Unnamed Event',
            t: Date.now() - (yearsAgo * 365 * 24 * 60 * 60 * 1000),
            years_ago: yearsAgo,
            domain,
            tags: selectedTemplate?.tags || [domain],
            valence,
            intensity,
            duration_days: duration,
            surprise,
            controllability,
            responsibility_self: responsibility,
            secrecy: secrecy,
            participants: participants.length > 0 ? participants : undefined,
            axisWeights: Object.keys(axisWeights).length > 0 ? axisWeights : undefined,
            lifeGoalWeights: Object.keys(lifeGoalWeights).length > 0 ? lifeGoalWeights : undefined,
            trauma: hasTrauma ? { domain: traumaDomain, severity: traumaSeverity, kind: traumaKind } : undefined
        };

        let newIdentity: IdentityCaps | undefined = undefined;

        // Handle Oath Template specific logic (Legacy support)
        if (selectedTemplate?.id === 'OATH_TAKE') {
            // ... (Oath logic preserved if needed, or integrated into weights)
        }
        
        onEventsChange([...events, newEvent], newIdentity);
    };

    const handleRemoveEvent = (id: string) => {
        const newEvents = events.filter(e => e.id !== id);
        onEventsChange(newEvents);
    };

    // Options for Calibration
    const axisOptions = [
        ...Object.keys(characterSchema.A || {}).map(k => ({ value: `vector_base.${k}`, label: k })),
        ...Object.keys(characterSchema.B || {}).map(k => ({ value: `vector_base.${k}`, label: k })),
        ...Object.keys(characterSchema.C || {}).map(k => ({ value: `vector_base.${k}`, label: k })),
        ...Object.keys(characterSchema.G || {}).map(k => ({ value: `vector_base.${k}`, label: k })),
    ];
    
    const lifeGoalOptions = Object.entries(GOAL_AXIS_NAMES).map(([k, v]) => ({ value: k, label: v }));

    return (
        <div className="h-full flex flex-col">
            <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar space-y-2">
                
                {/* 1. CORE */}
                <Section title="1. Сюжет (Narrative)" isOpen={sections.core} onToggle={() => toggleSection('core')}>
                     <div className="space-y-3">
                        <div>
                            <label className="text-xs text-canon-text-light">Шаблон (Template)</label>
                            <select value={templateId} onChange={e => loadTemplate(e.target.value)} className="w-full bg-canon-bg border border-canon-border text-xs rounded p-1 mt-1">
                                {personalEventTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                        <div>
                             <label className="text-xs text-canon-text-light">Название события</label>
                             <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-canon-bg border border-canon-border text-xs rounded p-1 mt-1 font-bold text-canon-text" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                             <Slider label="Давность (лет)" value={yearsAgo} setValue={setYearsAgo} min={0} max={80} step={0.5} />
                             <Slider label="Длительность (дней)" value={duration} setValue={setDuration} min={0} max={3650} step={1} />
                        </div>
                        <div>
                             <label className="text-xs text-canon-text-light">Тип (Domain)</label>
                             <select value={domain} onChange={e => setDomain(e.target.value)} className="w-full bg-canon-bg border border-canon-border text-xs rounded p-1 mt-1">
                                 {['achievement', 'failure', 'trauma', 'loss', 'betrayal', 'bonding', 'service', 'conflict', 'mystery', 'goal_embrace', 'oath_take'].map(d => <option key={d} value={d}>{d.toUpperCase()}</option>)}
                             </select>
                        </div>
                     </div>
                </Section>

                {/* 2. PSYCHOLOGY */}
                <Section title="2. Психология (Matrix)" isOpen={sections.psych} onToggle={() => toggleSection('psych')}>
                    <div className="space-y-1">
                         <Slider label="Интенсивность (Сила)" value={intensity} setValue={setIntensity} />
                         <Slider label="Валентность (-1..1)" value={valence} setValue={setValence} min={-1} max={1} step={0.1} />
                         <div className="pt-2 border-t border-canon-border/20"></div>
                         <Slider label="Неожиданность" value={surprise} setValue={setSurprise} />
                         <Slider label="Контролируемость" value={controllability} setValue={setControllability} />
                         <Slider label="Ответственность (Я)" value={responsibility} setValue={setResponsibility} />
                    </div>
                </Section>

                {/* 3. CONTEXT */}
                <Section title="3. Контекст и Участники" isOpen={sections.context} onToggle={() => toggleSection('context')}>
                    <div className="space-y-3">
                         <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-canon-text-light">Секретность</label>
                                <select value={secrecy} onChange={e => setSecrecy(e.target.value)} className="w-full bg-canon-bg border border-canon-border text-xs rounded p-1 mt-1">
                                    <option value="private">Личное (Private)</option>
                                    <option value="ingroup">Для своих (Ingroup)</option>
                                    <option value="public">Публичное (Public)</option>
                                </select>
                            </div>
                         </div>
                         
                         <div>
                            <label className="text-xs text-canon-text-light">Участники / Цели</label>
                            <div className="flex gap-2 mt-1">
                                <select 
                                    value={selectedParticipantId} 
                                    onChange={e => setSelectedParticipantId(e.target.value)} 
                                    className="w-full bg-canon-bg border border-canon-border text-xs rounded p-1"
                                >
                                    <option value="">Выберите персонажа...</option>
                                    {allCharacters.filter(c => c.entityId !== character.entityId).map(c => (
                                        <option key={c.entityId} value={c.entityId}>{c.title}</option>
                                    ))}
                                </select>
                                <button onClick={addParticipant} className="bg-canon-accent text-black px-2 rounded font-bold text-xs">+</button>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-2">
                                {participants.map(pid => {
                                     const charName = allCharacters.find(c => c.entityId === pid)?.title || pid;
                                     return (
                                         <span key={pid} className="inline-flex items-center gap-1 px-2 py-0.5 bg-canon-blue/20 border border-canon-blue/50 rounded text-[10px] text-canon-blue">
                                             {charName}
                                             <button onClick={() => removeParticipant(pid)} className="hover:text-white">×</button>
                                         </span>
                                     )
                                })}
                            </div>
                        </div>
                    </div>
                </Section>

                {/* 4. TRAUMA */}
                <Section title="4. Травма (Опционально)" isOpen={sections.trauma} onToggle={() => toggleSection('trauma')}>
                     <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                             <input type="checkbox" checked={hasTrauma} onChange={e => setHasTrauma(e.target.checked)} className="accent-canon-red" />
                             <label className="text-xs text-canon-text font-bold">Это травмирующее событие</label>
                        </div>
                        
                        {hasTrauma && (
                            <div className="pl-4 border-l-2 border-canon-red/50 space-y-3">
                                <div>
                                    <label className="text-xs text-canon-text-light">Домен травмы</label>
                                    <select value={traumaDomain} onChange={e => setTraumaDomain(e.target.value as any)} className="w-full bg-canon-bg border border-canon-border text-xs rounded p-1 mt-1">
                                        <option value="self">SELF (Беспомощность)</option>
                                        <option value="others">OTHERS (Предательство)</option>
                                        <option value="world">WORLD (Хаос)</option>
                                        <option value="system">SYSTEM (Произвол)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-canon-text-light">Тип (Kind)</label>
                                    <select value={traumaKind} onChange={e => setTraumaKind(e.target.value as any)} className="w-full bg-canon-bg border border-canon-border text-xs rounded p-1 mt-1">
                                        <option value="betrayal_by_peer">Betrayal (Peer)</option>
                                        <option value="betrayal_by_leader">Betrayal (Leader)</option>
                                        <option value="torture">Torture / Abuse</option>
                                        <option value="moral_compromise">Moral Injury</option>
                                        <option value="mass_casualties">Mass Casualties</option>
                                        <option value="random_catastrophe">Catastrophe</option>
                                    </select>
                                </div>
                                <Slider label="Тяжесть (Severity)" value={traumaSeverity} setValue={setTraumaSeverity} />
                            </div>
                        )}
                     </div>
                </Section>

                {/* 5. CALIBRATION */}
                <Section title="5. Тонкая Настройка (Веса)" isOpen={sections.calibration} onToggle={() => toggleSection('calibration')}>
                     <div className="space-y-4">
                         <MapEditor 
                            label="Влияние на Вектор (Axis Deltas)" 
                            data={axisWeights} 
                            onChange={setAxisWeights} 
                            options={axisOptions}
                         />
                         <MapEditor 
                            label="Влияние на Цели (Goal Boosts)" 
                            data={lifeGoalWeights} 
                            onChange={setLifeGoalWeights} 
                            options={lifeGoalOptions}
                         />
                     </div>
                </Section>

            </div>
            
            <div className="pt-4 border-t border-canon-border mt-2">
                <button
                    onClick={handleAdd}
                    className="w-full py-2 bg-canon-accent text-canon-bg font-bold rounded hover:bg-opacity-80 transition-colors text-sm shadow-lg"
                >
                    Добавить в Биографию
                </button>

                {events.length > 0 && (
                    <div className="mt-4 max-h-32 overflow-y-auto pr-1 space-y-1">
                        <div className="text-[10px] font-bold text-canon-text-light uppercase mb-1">История ({events.length})</div>
                        {events.slice().reverse().map(ev => (
                            <div key={ev.id} className="flex justify-between items-center bg-canon-bg border border-canon-border/30 px-2 py-1 rounded text-xs group hover:border-canon-accent/50">
                                <span className="truncate max-w-[70%]">{ev.name}</span>
                                <div className="flex items-center gap-2">
                                     <span className="text-[10px] font-mono opacity-50">-{ev.years_ago}y</span>
                                     <button onClick={() => handleRemoveEvent(ev.id)} className="text-canon-red hover:text-white font-bold">×</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
