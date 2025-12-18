
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Label, Cell, CartesianGrid } from 'recharts';
import { SimulationMeta, CharacterEntity, EntityType, EssenceEntity, MeetingResult, GoalAlignmentMetrics } from '../../types';
import { getEntitiesByType } from '../../data';
import { runMeetingSimulation } from '../../lib/negotiation/simulateHeadToHead';
import { Tabs } from '../Tabs';
import { MetricDisplay } from '../MetricDisplay';
import { ArchetypeBuilder } from '../ArchetypeBuilder';
import { useSandbox } from '../../contexts/SandboxContext';

type Negotiator = CharacterEntity | EssenceEntity;

const outcomeText: Record<string, { text: string, color: string, colorHex: string }> = {
    agreement: { text: 'Соглашение', color: 'text-canon-green', colorHex: '#33ff99' },
    partial_agreement: { text: 'Частичное соглашение', color: 'text-canon-blue', colorHex: '#00ccff' },
    delay: { text: 'Отсрочка', color: 'text-yellow-500', colorHex: '#f59e0b' },
    refuse: { text: 'Отказ', color: 'text-yellow-600', colorHex: '#d97706' },
    conflict: { text: 'Конфликт', color: 'text-canon-red', colorHex: '#ff4444' },
    successful_deception: { text: 'Успешный обман', color: 'text-purple-400', colorHex: '#a855f7' },
    failed_deception: { text: 'Неудачный обман', color: 'text-yellow-400', colorHex: '#eab308' },
    coalition: { text: 'Коалиция', color: 'text-teal-400', colorHex: '#2dd4bf' },
};

const PerceptionDetailsTab: React.FC<{ result: MeetingResult }> = ({ result }) => {
    const metricsToShow = [
        { key: 'Agency_t', name: 'Агентность', cat: 'v42metrics' },
        { key: 'delegability', name: 'Делегирование', cat: 'tomMetrics' },
        { key: 'cred_commit', name: 'Надежность обещаний', cat: 'tomV2Metrics' },
        { key: 'decep_incentive', name: 'Стимул к обману', cat: 'tomV2Metrics' },
        { key: 'detect_power', name: 'Сила обнаружения', cat: 'tomV2Metrics' },
        { key: 'rationality_fit', name: 'Рациональность', cat: 'tomV2Metrics' },
        { key: 'time_horizon', name: 'Горизонт', cat: 'tomV2Metrics' },
        { key: 'TailRisk_t', name: 'Хвост. риск', cat: 'v42metrics' },
        { key: 'PlanRobust_t', name: 'Робастность', cat: 'v42metrics' },
    ];
    
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
            <h4 className="font-bold text-center mb-2 md:col-span-1">{result.p1_metrics.modifiableCharacter.title} (Self)</h4>
            <h4 className="font-bold text-center mb-2 md:col-span-1">{result.p2_perceived_metrics.modifiableCharacter.title} (Perceived by P1)</h4>
            {metricsToShow.map(m => {
                const p1_val = (result.p1_metrics[m.cat as keyof typeof result.p1_metrics] as any)?.[m.key] ?? 0;
                const p2_val = (result.p2_perceived_metrics[m.cat as keyof typeof result.p2_perceived_metrics] as any)?.[m.key] ?? 0;
                return (
                    <React.Fragment key={m.key}>
                        <MetricDisplay name={m.name} value={p1_val.toFixed(3)} />
                        <MetricDisplay name={m.name} value={p2_val.toFixed(3)} />
                    </React.Fragment>
                )
            })}
        </div>
    );
};

const GoalAlignmentTab: React.FC<{ alignment: GoalAlignmentMetrics }> = ({ alignment }) => {
    const metrics = [
        { name: "Косинусное сходство", value: alignment.cosine, tooltip: "Геометрическое сходство векторов целей." },
        { name: "Ранговая корреляция", value: alignment.rankCorrelation, tooltip: "Насколько совпадают приоритеты (порядок) целей." },
        { name: "Допустимое пересечение", value: alignment.feasibleOverlap, tooltip: "Доля общих целей, не заблокированных клятвами/капами." },
        { name: "Цена компромисса", value: alignment.compromiseCost, tooltip: "Насколько далеко нужно отойти от своих целей для компромисса." },
        { name: "Заблокированная масса", value: alignment.blockedMass, tooltip: "Доля целей одного, заблокированных правилами другого." },
    ];
    return (
        <div className="space-y-2">
            <h4 className="font-bold text-canon-text mb-2">Совпадение целей</h4>
            {metrics.map(m => <MetricDisplay key={m.name} name={m.name} value={m.value.toFixed(3)} tooltip={m.tooltip} />)}
        </div>
    )
};

const RapportTab: React.FC<{ result: MeetingResult }> = ({ result }) => {
    return (
        <div>
             <h4 className="font-bold text-canon-text mb-2">Rapport</h4>
             <div className="space-y-2">
                <MetricDisplay name="Доверие (Trust)" value={result.interaction.trust.toFixed(3)} tooltip="Насколько P1 доверяет P2."/>
                <MetricDisplay name="Надежность (Credibility)" value={result.interaction.credibility.toFixed(3)} tooltip="Воспринимаемая надежность обещаний P2." />
                <MetricDisplay name="Риск обмана (Deception Risk)" value={result.interaction.deceptionRisk.toFixed(3)} colorClass="text-yellow-400" tooltip="Вероятность того, что P2 обманет, а P1 не заметит." />
                <MetricDisplay name="Конфликт норм (Norm Conflict)" value={result.interaction.normConflict.toFixed(3)} colorClass="text-yellow-500" tooltip="Насколько нормы P2 (как их видит P1) противоречат нормам P1." />
             </div>
        </div>
    );
};

const RiskAndPolicyTab: React.FC<{ result: MeetingResult }> = ({ result }) => {
    if (!result.metrics_snapshot) return null;
    const { risk, policy } = result.metrics_snapshot;
    return (
        <div>
            <h4 className="font-bold text-canon-text mb-2">Risk & Policy (P1)</h4>
            <div className="space-y-2">
                <MetricDisplay name="Хвостовой риск (сцена)" value={risk.tail_risk_scene.toFixed(3)} colorClass="text-canon-red" tooltip="Собственный риск катастрофического провала P1 в контексте этой встречи." />
                <MetricDisplay name="Запас обратимости (сцена)" value={risk.r_margin_scene.toFixed(3)} colorClass="text-canon-green" tooltip="Способность P1 отменить или смягчить последствия своих решений в этой встрече." />
                <MetricDisplay name="Склонность к делегированию" value={policy.del_rate.toFixed(3)} tooltip="Вероятность, с которой P1 передаст задачу, а не будет выполнять ее сам." />
            </div>
        </div>
    )
};

const OutcomeTab: React.FC<{ probabilities: { outcome: string, score: number }[] }> = ({ probabilities }) => (
    <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={probabilities} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3a3a3a" />
                <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fill: '#888' }} />
                <YAxis type="category" dataKey="outcome" tickFormatter={v => outcomeText[v]?.text || v} tick={{ fill: '#d1d1d1' }} width={150} />
                <Tooltip 
                    contentStyle={{ backgroundColor: '#1e1e1e', border: '1px solid #3a3a3a' }}
                    formatter={(val: number) => [`${(val * 100).toFixed(1)}%`, 'Вероятность']}
                    labelFormatter={label => outcomeText[label]?.text || label}
                />
                <Bar dataKey="score">
                     {probabilities.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={outcomeText[entry.outcome]?.colorHex || '#00aaff'} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    </div>
);

const SummaryTab: React.FC<{ result: MeetingResult }> = ({ result }) => {
    const p1 = result.p1_metrics.modifiableCharacter;
    const p2 = result.p2_perceived_metrics.modifiableCharacter;
    const outcomeInfo = outcomeText[result.outcomes.final];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className={`bg-canon-bg p-4 rounded-lg text-center border-l-4`} style={{ borderColor: outcomeInfo.colorHex }}>
                <div className="text-xs text-canon-text-light">Итог</div>
                <div className={`text-2xl font-bold ${outcomeInfo.color}`}>{outcomeInfo.text}</div>
            </div>
            <div className="bg-canon-bg border border-canon-border/50 rounded-lg p-3 text-xs space-y-2">
                <h4 className="font-bold text-sm text-canon-text-light mb-1">Последствия</h4>
                <div className="flex justify-between"><span>ΔСтресс ({p1?.title}):</span> <span className={`font-mono ${result.deltas.p1.stress > 0 ? 'text-canon-red' : 'text-canon-green'}`}>{result.deltas.p1.stress.toFixed(1)}</span></div>
                <div className="flex justify-between"><span>ΔРепутация ({p1?.title}):</span> <span className={`font-mono ${result.deltas.p1.reputation > 0 ? 'text-canon-green' : 'text-canon-red'}`}>{result.deltas.p1.reputation.toFixed(1)}</span></div>
                <div className="flex justify-between"><span>ΔСтресс ({p2?.title}):</span> <span className={`font-mono ${result.deltas.p2.stress > 0 ? 'text-canon-red' : 'text-canon-green'}`}>{result.deltas.p2.stress.toFixed(1)}</span></div>
                <div className="flex justify-between"><span>ΔРепутация ({p2?.title}):</span> <span className={`font-mono ${result.deltas.p2.reputation > 0 ? 'text-canon-green' : 'text-canon-red'}`}>{result.deltas.p2.reputation.toFixed(1)}</span></div>
            </div>
        </div>
    );
};


export const NegotiationHeadToHeadRunner: React.FC<{ sim: SimulationMeta }> = ({ sim }) => {
    const { stakes, deadline } = sim.payload;
    const { characters: sandboxCharactersRaw, addCharacter } = useSandbox();
    const sandboxCharacters = sandboxCharactersRaw as Negotiator[];
    
    const [addedArchetypes, setAddedArchetypes] = useState<Negotiator[]>([]);

    const negotiators = useMemo(() => {
        const baseChars = (getEntitiesByType(EntityType.Character) as CharacterEntity[])
            .concat(getEntitiesByType(EntityType.Essence) as EssenceEntity[]);
        const uniqueArchetypes = Array.from(new Map(addedArchetypes.map(a => [a.entityId, a])).values()) as Negotiator[];
        
        const map = new Map<string, Negotiator>();
        baseChars.forEach(c => map.set(c.entityId, c));
        
        // Explicit casting and iteration
        (sandboxCharacters as Negotiator[]).forEach(c => map.set(c.entityId, c));
        
        uniqueArchetypes.forEach(c => map.set(c.entityId, c));
        
        return Array.from(map.values());
    }, [addedArchetypes, sandboxCharacters]);
    
    const [p1Id, setP1Id] = useState<string>(negotiators[0]?.entityId || '');
    const [p2Id, setP2Id] = useState<string>(negotiators[1]?.entityId || '');
    const [result, setResult] = useState<MeetingResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleRun = useCallback(() => {
        const p1 = negotiators.find(n => n.entityId === p1Id);
        const p2 = negotiators.find(n => n.entityId === p2Id);
        if (p1 && p2) {
            setIsLoading(true);
            setResult(null);
            setTimeout(() => {
                setResult(runMeetingSimulation(p1, p2, stakes, deadline));
                setIsLoading(false);
            }, 50);
        }
    }, [negotiators, p1Id, p2Id, stakes, deadline]);

    const handleAddArchetype = useCallback((archetype: CharacterEntity) => {
        setAddedArchetypes(prev => [...prev, archetype]);
        // Also add to sandbox
        addCharacter(archetype);
        setP2Id(archetype.entityId);
    }, [addCharacter]);

    useEffect(() => {
        if (!negotiators.find(n => n.entityId === p1Id) && negotiators.length > 0) setP1Id(negotiators[0].entityId);
        if (!negotiators.find(n => n.entityId === p2Id) && negotiators.length > 1) setP2Id(negotiators[1].entityId);
    }, [negotiators, p1Id, p2Id]);
    
    const tabs = result ? [
        { label: "Сводка", content: <SummaryTab result={result} /> },
        { label: "Rapport & Goals", content: <div className="grid grid-cols-1 md:grid-cols-2 gap-6"><RapportTab result={result} /><GoalAlignmentTab alignment={result.interaction.goalAlignment} /></div> },
        { label: "Risk & Policy", content: <RiskAndPolicyTab result={result} /> },
        { label: "Вероятности исходов", content: <OutcomeTab probabilities={result.outcomes.probabilities} /> },
        { label: "Детали перцепции", content: <PerceptionDetailsTab result={result} /> },
    ] : [];

    return (
        <div className="space-y-6">
            {/* Setup */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                    <label className="text-sm text-canon-text-light">Переговорщик 1 (Наблюдатель)</label>
                    <select value={p1Id} onChange={e => setP1Id(e.target.value)} className="w-full bg-canon-bg border border-canon-border rounded p-2 mt-1">
                        {negotiators.map(c => <option key={c.entityId} value={c.entityId}>{c.title}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-sm text-canon-text-light">Переговорщик 2 (Цель)</label>
                    <select value={p2Id} onChange={e => setP2Id(e.target.value)} className="w-full bg-canon-bg border border-canon-border rounded p-2 mt-1">
                        {negotiators.map(c => <option key={c.entityId} value={c.entityId}>{c.title}</option>)}
                    </select>
                </div>
                <button onClick={handleRun} disabled={isLoading || !p1Id || !p2Id || p1Id === p2Id} className="w-full bg-canon-accent text-canon-bg font-bold rounded p-2 hover:bg-opacity-80 transition-colors disabled:bg-canon-border disabled:cursor-wait">
                    {isLoading ? 'Моделирование...' : 'Начать встречу'}
                </button>
            </div>
            
            <div className="bg-canon-bg p-4 rounded-lg border border-canon-border/50">
                <h3 className="text-lg font-bold text-canon-text mb-3">Добавить архетип в симуляцию</h3>
                <ArchetypeBuilder onAddArchetype={handleAddArchetype} />
            </div>

            {p1Id === p2Id && <p className="text-center text-canon-red">Пожалуйста, выберите двух разных участников.</p>}
            
            {isLoading && <div className="text-center p-8">Запуск симуляции ToM...</div>}

            {result && (
                <div className="bg-canon-bg border border-canon-border rounded-lg p-4">
                     <Tabs tabs={tabs} />
                </div>
            )}
        </div>
    );
};
