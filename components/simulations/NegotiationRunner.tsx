
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SimulationMeta, NegotiationScenario, Counterparty, Mission, CharacterEntity, EnvoyResult, EntityType, EssenceEntity } from '../../types';
import { getEntitiesByType, getEntityById } from '../../data';
import { rankEnvoys } from '../../lib/negotiation/choose';
import { StabilityChart } from '../charts/StabilityChart';
import { HistogramChart } from '../charts/HistogramChart';
import { WaterfallChart } from '../charts/WaterfallChart';
import { TornadoChart } from '../charts/TornadoChart';
import { ParetoChart } from '../charts/ParetoChart';
import { Tabs } from '../Tabs';
import { simulateCharacter } from '../../lib/simulate';
import { getEvidenceById } from '../../data/evidence';
import { getSourceById } from '../../data/sources';
import { flattenObject } from '../../lib/param-utils';
import { ArchetypeBuilder } from '../ArchetypeBuilder';
import { CustomCharacterFromSnippet } from '../CustomCharacterFromSnippet';
import { useSandbox } from '../../contexts/SandboxContext';

const clip = (val: number, min: number, max: number) => Math.max(min, Math.min(val, max));

const NegotiationResultDetail: React.FC<{ result: EnvoyResult, mission: Mission, counterparty: Counterparty }> = ({ result, mission, counterparty }) => {
    
    const [stabilityData, setStabilityData] = useState<any[]>([]);
    const [tornadoData, setTornadoData] = useState<any[]>([]);

    useEffect(() => {
        const postMissionEntity = JSON.parse(JSON.stringify(result.entity));
        
        // Apply deltas
        postMissionEntity.body.acute.stress = (postMissionEntity.body.acute.stress || 40) + result.metrics.postDelta.stress;
        if (!postMissionEntity.social.audience_reputation) {
            postMissionEntity.social.audience_reputation = [];
        }
        if (postMissionEntity.social.audience_reputation.length === 0) {
            postMissionEntity.social.audience_reputation.push({ segment: 'general', score: 50 });
        }
        postMissionEntity.social.audience_reputation[0].score = (postMissionEntity.social.audience_reputation[0].score || 50) + result.metrics.postDelta.pv * 0.2;

        const flatPostMissionParams = flattenObject(postMissionEntity);

        const evidenceIds = result.entity.evidenceIds || [];
        const entityEvidence = evidenceIds.map(id => getEvidenceById(id)).filter(Boolean);
        let trustFactor = 1.0;
        if (entityEvidence.length > 0) {
            const alpha = 0.2, tau = 0.25;
            const reliabilitySum = entityEvidence.reduce((sum, ev) => {
                const source = getSourceById(ev!.source.id);
                return sum + (source?.reliability || 0);
            }, 0);
            trustFactor = clip(1 + alpha * reliabilitySum, 1 - tau, 1 + tau);
        }

        const simOutput = simulateCharacter(
          postMissionEntity,
          flatPostMissionParams,
          {
            horizonDays: 90,
            dt: 0.25,
            ensemble: 64,
            rngSeed: result.entity.entityId.charCodeAt(0),
            blackSwans: []
          },
          trustFactor
        );
        setStabilityData(simOutput.mean);

        const baseParams = flattenObject(result.entity);
        const tornadoParams = ['state.will', 'competencies.competence_core', 'state.loyalty', 'body.acute.stress', 'cognitive.utility_shape.risk_aversion'];
        
        const sensitivities = tornadoParams.map(key => {
            const originalValue = baseParams[key] || 0;
            
            if (key === 'cognitive.utility_shape.risk_aversion') {
                 const createModifiedParams = (modifier: number) => ({ ...baseParams, 'cognitive.utility_shape.risk_aversion': originalValue * modifier });
                  const highResult = rankEnvoys([result.entity], counterparty, mission, createModifiedParams(1.1));
                  const lowResult = rankEnvoys([result.entity], counterparty, mission, createModifiedParams(0.9));
                   return { name: 'accountability', impact: -((highResult[0]?.score || 0) - (lowResult[0]?.score || 0)) };
            }

            const createModifiedParams = (modifier: number) => ({ ...baseParams, [key]: originalValue * modifier });

            const highResult = rankEnvoys([result.entity], counterparty, mission, createModifiedParams(1.1));
            const lowResult = rankEnvoys([result.entity], counterparty, mission, createModifiedParams(0.9));

            const impact = (highResult[0]?.score || 0) - (lowResult[0]?.score || 0);
            const shortName = key.split('.').pop() || key;
            return { name: shortName, impact };
        }).sort((a,b) => Math.abs(b.impact) - Math.abs(a.impact));

        setTornadoData(sensitivities);

    }, [result, mission, counterparty]);

    const histogramData = result.metrics.simulationRuns.filter(r => r.accepted).map(r => ({ value: r.dealValue }));
    
    const waterfallData = [
        { name: 'E[Ценность]', value: result.metrics.expectedDealValue },
        { name: 'CVaR Убыток', value: -0.7 * result.metrics.cvar10 },
        { name: 'ΔS@30д', value: 0.5 * result.metrics.postDelta.S30 },
    ];

    const summaryTab = (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="bg-canon-bg p-3 rounded-lg"><div className="text-xs text-canon-text-light">Оценка</div><div className="text-xl font-bold font-mono">{result.score.toFixed(2)}</div></div>
            <div className="bg-canon-bg p-3 rounded-lg"><div className="text-xs text-canon-text-light">P(Сделка)</div><div className="text-xl font-bold font-mono text-canon-green">{(result.metrics.dealProb * 100).toFixed(1)}%</div></div>
            <div className="bg-canon-bg p-3 rounded-lg"><div className="text-xs text-canon-text-light">P(Скандал)</div><div className="text-xl font-bold font-mono text-canon-red">{(result.metrics.scandalProb * 100).toFixed(1)}%</div></div>
            <div className="bg-canon-bg p-3 rounded-lg"><div className="text-xs text-canon-text-light">E[Ценность]</div><div className="text-xl font-bold font-mono text-canon-blue">{result.metrics.expectedDealValue.toFixed(2)}</div></div>
            <div className="bg-canon-bg p-3 rounded-lg"><div className="text-xs text-canon-text-light">CVaR(10%)</div><div className="text-xl font-bold font-mono text-canon-red">{result.metrics.cvar10.toFixed(2)}</div></div>
            <div className="bg-canon-bg p-3 rounded-lg"><div className="text-xs text-canon-text-light">Ср. время</div><div className="text-xl font-bold font-mono">{result.metrics.timeToDealAvg.toFixed(1)}д</div></div>
            <div className="bg-canon-bg p-3 rounded-lg"><div className="text-xs text-canon-text-light">ΔS@7д</div><div className="text-xl font-bold font-mono">{result.metrics.postDelta.S7.toFixed(2)}</div></div>
            <div className="bg-canon-bg p-3 rounded-lg"><div className="text-xs text-canon-text-light">ΔS@30д</div><div className="text-xl font-bold font-mono">{result.metrics.postDelta.S30.toFixed(2)}</div></div>
        </div>
    );

    const tabs = [
        { label: "Сводка", content: summaryTab },
        { label: "Прогноз стабильности", content: <div className="h-80"><StabilityChart data={stabilityData} /></div> },
        { label: "Распределение ценности", content: <div className="h-80"><HistogramChart data={histogramData} xAxisLabel="Ценность сделки" color="#00aaff" /></div> },
        { label: "Факторы оценки", content: <div className="h-80"><WaterfallChart data={waterfallData} /></div> },
        { label: "Чувствительность", content: <div className="h-80"><TornadoChart data={tornadoData} /></div> },
    ];

    return <Tabs tabs={tabs} />;
};


export const NegotiationRunner: React.FC<{ sim: SimulationMeta }> = ({ sim }) => {
    const payload = sim.payload as NegotiationScenario;
    const { characters: sandboxCharactersRaw, addCharacter } = useSandbox(); 
    const sandboxCharacters = sandboxCharactersRaw as (CharacterEntity | EssenceEntity)[];

    const [selectedCp, setSelectedCp] = useState<Counterparty>(payload.counterparties[0]);
    const [selectedMission, setSelectedMission] = useState<Mission>(payload.missions[0]);
    const [results, setResults] = useState<EnvoyResult[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedEnvoy, setSelectedEnvoy] = useState<EnvoyResult | null>(null);
    const [addedArchetypes, setAddedArchetypes] = useState<(CharacterEntity | EssenceEntity)[]>([]);
    
    const [searchParams] = useSearchParams();
    const highlightedCharacterId = searchParams.get('characterId');

    const characters = useMemo(() => {
        const baseChars = getEntitiesByType(EntityType.Character).concat(getEntitiesByType(EntityType.Essence)) as (CharacterEntity | EssenceEntity)[];
        const uniqueArchetypes = Array.from(new Map(addedArchetypes.map(a => [a.entityId, a])).values()) as (CharacterEntity | EssenceEntity)[];
        
        const map = new Map<string, CharacterEntity | EssenceEntity>();
        baseChars.forEach(c => map.set(c.entityId, c));
        
        // Explicitly iterate sandboxCharacters as typed list
        (sandboxCharacters as (CharacterEntity | EssenceEntity)[]).forEach((c) => map.set(c.entityId, c));
        
        uniqueArchetypes.forEach(c => map.set(c.entityId, c));

        return Array.from(map.values());
    }, [addedArchetypes, sandboxCharacters]);

    const handleAddArchetype = useCallback((archetype: CharacterEntity) => {
        setAddedArchetypes(prev => [...prev, archetype]);
        // Also add to sandbox to persist across views
        addCharacter(archetype);
    }, [addCharacter]);
    
    const handleAddCustomCharacter = useCallback((ch: CharacterEntity) => {
        addCharacter(ch);
    }, [addCharacter]);

    const handleRunSimulation = useCallback(() => {
        setIsLoading(true);
        setSelectedEnvoy(null);
        setTimeout(() => {
            const ranked = rankEnvoys(characters, selectedCp, selectedMission);
            setResults(ranked);
            const highlightedEnvoy = ranked.find(r => r.id === highlightedCharacterId);
            setSelectedEnvoy(highlightedEnvoy || (ranked.length > 0 ? ranked[0] : null));
            setIsLoading(false);
        }, 500);
    }, [characters, selectedCp, selectedMission, highlightedCharacterId]);

    const paretoData = useMemo(() => {
        if (!results) return [];
        return results.map(r => ({
            x: r.metrics.cvar10,
            y: r.metrics.expectedDealValue,
            z: r.score,
            name: r.entity.title
        }));
    }, [results]);
    
    const getRowClass = (result: EnvoyResult) => {
        let classes = 'cursor-pointer hover:bg-canon-accent/10';
        if (selectedEnvoy?.id === result.id) {
            classes += ' bg-canon-accent/20';
        } else if (highlightedCharacterId === result.id) {
            classes += ' bg-canon-blue/10';
        }
        return classes;
    };

    return (
        <div className="space-y-6">
            {/* Setup */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                    <label className="text-sm text-canon-text-light">Контрагент</label>
                    <select value={selectedCp.id} onChange={e => setSelectedCp(payload.counterparties.find(c => c.id === e.target.value)!)} className="w-full bg-canon-bg border border-canon-border rounded p-2 mt-1">
                        {payload.counterparties.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-sm text-canon-text-light">Миссия</label>
                    <select value={selectedMission.id} onChange={e => setSelectedMission(payload.missions.find(m => m.id === e.target.value)!)} className="w-full bg-canon-bg border border-canon-border rounded p-2 mt-1">
                        {payload.missions.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                </div>
                <button onClick={handleRunSimulation} disabled={isLoading} className="w-full bg-canon-accent text-canon-bg font-bold rounded p-2 hover:bg-opacity-80 transition-colors disabled:bg-canon-border disabled:cursor-wait">
                    {isLoading ? 'Симуляция...' : 'Найти лучшего переговорщика'}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-canon-bg p-4 rounded-lg border border-canon-border/50">
                    <h3 className="text-lg font-bold text-canon-text mb-3">Добавить архетип</h3>
                    <ArchetypeBuilder onAddArchetype={handleAddArchetype} />
                </div>
                <div className="bg-canon-bg p-4 rounded-lg border border-canon-border/50">
                     <h3 className="text-lg font-bold text-canon-text mb-3">Импорт из кода</h3>
                     <CustomCharacterFromSnippet onAdd={handleAddCustomCharacter} />
                </div>
            </div>

            {isLoading && <div className="text-center p-8">Запуск ансамблевых симуляций для {characters.length} кандидатов...</div>}

            {results && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="xl:col-span-1 space-y-4 self-start">
                        <div className="h-64 bg-canon-bg border border-canon-border rounded-lg p-2">
                           <h4 className="font-bold text-sm text-center mb-1">Профиль Риск/Доходность</h4>
                           <ParetoChart data={paretoData} />
                        </div>
                        <div className="max-h-[450px] overflow-y-auto bg-canon-bg border border-canon-border rounded-lg">
                             <table className="w-full text-left text-sm">
                                <thead className="sticky top-0 bg-canon-bg-light">
                                    <tr>
                                        <th className="p-2">Ранг</th>
                                        <th className="p-2">Переговорщик</th>
                                        <th className="p-2">Оценка</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((r, i) => (
                                        <tr key={r.id} onClick={() => setSelectedEnvoy(r)} className={getRowClass(r)}>
                                            <td className="p-2 font-mono text-center">{i + 1}</td>
                                            <td className="p-2 font-bold">{r.entity.title}</td>
                                            <td className="p-2 font-mono">{r.score.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="xl:col-span-2">
                        {selectedEnvoy ? (
                            <div className="bg-canon-bg border border-canon-border rounded-lg p-4">
                               <h3 className="text-xl font-bold mb-4">Детальный анализ: {selectedEnvoy.entity.title}</h3>
                               <NegotiationResultDetail result={selectedEnvoy} mission={selectedMission} counterparty={selectedCp} />
                            </div>
                        ) : (
                            <div className="text-center p-8 text-canon-text-light">Выберите переговорщика для просмотра детальных результатов.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
