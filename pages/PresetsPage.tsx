
import React, { useState, useMemo } from 'react';
import { getEntitiesByType } from '../data';
import { EntityType, CharacterEntity } from '../types';
import { encodeCharacterToSnippet } from '../lib/character-snippet';
import { DyadRelationPresetV1, CompatibilityPresetV1, TomViewPreset, RelationFlavor, CompatRule, CompatSlotId } from '../lib/presets/types';
import { encodeDyadPreset, encodeCompatPreset } from '../lib/presets/encoding';
import { Tabs } from '../components/Tabs';
import { Slider } from '../components/Slider';
import { characterSchema } from '../data/character-schema';

const TomSliderGroup: React.FC<{ view: TomViewPreset, onChange: (v: TomViewPreset) => void, title: string }> = ({ view, onChange, title }) => (
    <div className="bg-canon-bg/50 p-3 rounded border border-canon-border/30">
        <h4 className="text-xs font-bold text-canon-accent mb-2 uppercase">{title}</h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Slider label="Trust" value={view.trust} setValue={v => onChange({ ...view, trust: v })} min={0} max={1} step={0.05} />
            <Slider label="Respect" value={view.respect} setValue={v => onChange({ ...view, respect: v })} min={0} max={1} step={0.05} />
            <Slider label="Fear" value={view.fear} setValue={v => onChange({ ...view, fear: v })} min={0} max={1} step={0.05} />
            <Slider label="Closeness" value={view.closeness} setValue={v => onChange({ ...view, closeness: v })} min={0} max={1} step={0.05} />
            <Slider label="Liking (-1..1)" value={view.liking} setValue={v => onChange({ ...view, liking: v })} min={-1} max={1} step={0.1} />
            <Slider label="Dominance (-1..1)" value={view.dominance} setValue={v => onChange({ ...view, dominance: v })} min={-1} max={1} step={0.1} />
        </div>
    </div>
);

const DyadBuilder: React.FC = () => {
    const characters = useMemo(() => (getEntitiesByType(EntityType.Character) as CharacterEntity[]).concat(getEntitiesByType(EntityType.Essence) as CharacterEntity[]), []);
    
    const [charAId, setCharAId] = useState(characters[0]?.entityId);
    const [charBId, setCharBId] = useState(characters[1]?.entityId);
    
    const [flavor, setFlavor] = useState<RelationFlavor>('ally');
    const [tomAB, setTomAB] = useState<TomViewPreset>({ trust: 0.5, respect: 0.5, fear: 0, closeness: 0, liking: 0, dominance: 0 });
    const [tomBA, setTomBA] = useState<TomViewPreset>({ trust: 0.5, respect: 0.5, fear: 0, closeness: 0, liking: 0, dominance: 0 });
    const [output, setOutput] = useState('');

    const handleGenerate = () => {
        const charA = characters.find(c => c.entityId === charAId);
        const charB = characters.find(c => c.entityId === charBId);
        if (!charA || !charB) return;

        const snippetA = encodeCharacterToSnippet({ meta: { id: charA.entityId, title: charA.title }, vector_base: charA.vector_base || {}, body: charA.body, identity: charA.identity });
        const snippetB = encodeCharacterToSnippet({ meta: { id: charB.entityId, title: charB.title }, vector_base: charB.vector_base || {}, body: charB.body, identity: charB.identity });

        const preset: DyadRelationPresetV1 = {
            v: 'kanonar4-rel-v1',
            meta: { label: `${charA.title} & ${charB.title} (${flavor})` },
            actors: { a_snippet: snippetA, b_snippet: snippetB },
            baseRelation: { flavor, affinity: 0, tension: 0, commitment: 0, history_strength: 0.5 },
            tom_a_about_b: tomAB,
            tom_b_about_a: tomBA,
        };

        setOutput(encodeDyadPreset(preset));
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="text-xs text-canon-text-light">Actor A</label>
                    <select className="w-full bg-canon-bg border border-canon-border rounded p-1 text-sm" value={charAId} onChange={e => setCharAId(e.target.value)}>
                        {characters.map(c => <option key={c.entityId} value={c.entityId}>{c.title}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-canon-text-light">Actor B</label>
                    <select className="w-full bg-canon-bg border border-canon-border rounded p-1 text-sm" value={charBId} onChange={e => setCharBId(e.target.value)}>
                        {characters.map(c => <option key={c.entityId} value={c.entityId}>{c.title}</option>)}
                    </select>
                </div>
            </div>

            <div>
                 <label className="text-xs text-canon-text-light">Relation Flavor</label>
                 <select className="w-full bg-canon-bg border border-canon-border rounded p-1 text-sm" value={flavor} onChange={e => setFlavor(e.target.value as any)}>
                     {['ally', 'friend', 'rival', 'enemy', 'mentor', 'student', 'romantic_crush', 'cold_professional', 'indifferent'].map(f => <option key={f} value={f}>{f}</option>)}
                 </select>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TomSliderGroup view={tomAB} onChange={setTomAB} title={`A (${charAId}) -> B`} />
                <TomSliderGroup view={tomBA} onChange={setTomBA} title={`B (${charBId}) -> A`} />
            </div>

            <button onClick={handleGenerate} className="w-full py-3 bg-canon-accent text-canon-bg font-bold rounded shadow-lg hover:bg-opacity-90 transition-colors">
                Сгенерировать Код Сцены
            </button>
            
            {output && (
                <textarea readOnly value={output} className="w-full h-32 bg-canon-bg border border-canon-border rounded p-2 text-[10px] font-mono text-canon-green focus:outline-none" onClick={e => (e.target as any).select()} />
            )}
        </div>
    );
};

const CompatBuilder: React.FC = () => {
    const characters = useMemo(() => (getEntitiesByType(EntityType.Character) as CharacterEntity[]).concat(getEntitiesByType(EntityType.Essence) as CharacterEntity[]), []);
    const [ownerId, setOwnerId] = useState(characters[0]?.entityId);
    const [rules, setRules] = useState<CompatRule[]>([]);
    const [output, setOutput] = useState('');

    const [currentSlot, setCurrentSlot] = useState<CompatSlotId>('ideal_partner');
    const [targetAxis, setTargetAxis] = useState('vector_base.A_Legitimacy_Procedure');
    const [targetWeight, setTargetWeight] = useState(1.0);
    const [ruleWeights, setRuleWeights] = useState<Record<string, number>>({});
    const [ruleTom, setRuleTom] = useState<TomViewPreset>({ trust: 0.8, respect: 0.8, fear: 0, closeness: 0.5, liking: 0.5, dominance: 0 });

    const allAxes = useMemo(() => {
        const axes: string[] = [];
        Object.values(characterSchema).forEach((group: any) => {
            Object.keys(group).forEach(k => axes.push(group[k].path || `vector_base.${k}`));
        });
        return axes;
    }, []);

    const addWeight = () => {
        setRuleWeights(prev => ({ ...prev, [targetAxis]: targetWeight }));
    };

    const addRule = () => {
        const newRule: CompatRule = {
            id: `rule-${Date.now()}`,
            slot: currentSlot,
            name: `${currentSlot} rule`,
            weights: { ...ruleWeights },
            tom_view: { ...ruleTom },
            defaultFlavor: 'ally'
        };
        setRules(prev => [...prev, newRule]);
        setRuleWeights({});
    };

    const handleGenerate = () => {
        const owner = characters.find(c => c.entityId === ownerId);
        if (!owner) return;
        
        const snippet = encodeCharacterToSnippet({ meta: { id: owner.entityId, title: owner.title }, vector_base: owner.vector_base || {}, body: owner.body, identity: owner.identity });
        const preset: CompatibilityPresetV1 = {
            v: 'kanonar4-compat-v1',
            owner_snippet: snippet,
            meta: { label: `Compatibility: ${owner.title}` },
            rules: rules,
        };
        setOutput(encodeCompatPreset(preset));
    };

    return (
        <div className="space-y-6">
             <div>
                <label className="text-xs text-canon-text-light">Owner Character</label>
                <select className="w-full bg-canon-bg border border-canon-border rounded p-1 text-sm" value={ownerId} onChange={e => setOwnerId(e.target.value)}>
                    {characters.map(c => <option key={c.entityId} value={c.entityId}>{c.title}</option>)}
                </select>
            </div>

            <div className="border border-canon-border/50 rounded-lg p-4 bg-canon-bg/30">
                <h3 className="text-sm font-bold text-canon-text mb-4">Создать Правило</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                     <div>
                        <label className="text-xs text-canon-text-light">Слот (роль)</label>
                        <select className="w-full bg-canon-bg border border-canon-border rounded p-1 text-sm" value={currentSlot} onChange={e => setCurrentSlot(e.target.value as any)}>
                            {['ideal_partner', 'toxic_partner', 'easy_ally', 'natural_rival', 'idol', 'scapegoat', 'tool'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div className="flex gap-2 items-end">
                         <div className="flex-1">
                            <label className="text-xs text-canon-text-light">Целевая ось</label>
                            <select className="w-full bg-canon-bg border border-canon-border rounded p-1 text-sm" value={targetAxis} onChange={e => setTargetAxis(e.target.value)}>
                                {allAxes.map(a => <option key={a} value={a}>{a.split('.').pop()}</option>)}
                            </select>
                        </div>
                        <div className="w-20">
                             <label className="text-xs text-canon-text-light">Вес</label>
                             <input type="number" className="w-full bg-canon-bg border border-canon-border rounded p-1 text-sm" value={targetWeight} onChange={e => setTargetWeight(parseFloat(e.target.value))} step={0.1} />
                        </div>
                        <button onClick={addWeight} className="bg-canon-bg-light border border-canon-border rounded px-3 py-1 text-sm hover:bg-canon-accent hover:text-canon-bg transition-colors">+</button>
                    </div>
                </div>
                
                {Object.keys(ruleWeights).length > 0 && (
                    <div className="mb-4 text-xs bg-black/20 p-2 rounded border border-canon-border/30">
                        {Object.entries(ruleWeights).map(([k, w]) => <div key={k} className="font-mono">{k}: {(w as number) > 0 ? '+' : ''}{w}</div>)}
                    </div>
                )}

                <TomSliderGroup view={ruleTom} onChange={setRuleTom} title="Восприятие (ToM) при совпадении" />
                
                <button onClick={addRule} className="w-full mt-4 py-2 bg-canon-blue/20 border border-canon-blue/50 text-canon-blue rounded font-bold hover:bg-canon-blue/30 transition-colors">
                    Добавить Правило
                </button>
            </div>

            <div className="space-y-2">
                {rules.map((r, i) => (
                    <div key={i} className="bg-canon-bg p-2 rounded border border-canon-border/50 text-xs flex justify-between items-center">
                        <div><span className="font-bold text-canon-accent">{r.slot}</span> <span className="text-canon-text-light">({Object.keys(r.weights).length} criteria)</span></div>
                        <button onClick={() => setRules(p => p.filter((_, idx) => idx !== i))} className="text-canon-red hover:text-white font-bold px-2">×</button>
                    </div>
                ))}
            </div>

             <button onClick={handleGenerate} disabled={rules.length === 0} className="w-full py-3 bg-canon-accent text-canon-bg font-bold rounded shadow-lg hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Сгенерировать Код Пресета
            </button>
             {output && (
                <textarea readOnly value={output} className="w-full h-32 bg-canon-bg border border-canon-border rounded p-2 text-[10px] font-mono text-canon-green focus:outline-none" onClick={e => (e.target as any).select()} />
            )}
        </div>
    );
}

export const PresetsPage: React.FC = () => {
    return (
        <div className="p-8 max-w-5xl mx-auto">
            <div className="text-center mb-8">
                <h2 className="text-3xl font-bold text-canon-text mb-2">Конструктор Пресетов</h2>
                <p className="text-canon-text-light text-sm">Создание портативных конфигураций отношений и правил совместимости.</p>
            </div>
            
            <Tabs tabs={[
                { label: "1. Сцена (Dyad)", content: <DyadBuilder /> },
                { label: "2. Совместимость (Rules)", content: <CompatBuilder /> }
            ]} />
        </div>
    );
};
