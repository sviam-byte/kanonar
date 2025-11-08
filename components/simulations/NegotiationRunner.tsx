import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SimulationMeta, NegotiationScenario, Counterparty, Mission, CharacterEntity, EnvoyResult, EntityType } from '../../types';
import { getEntitiesByType } from '../../data';
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

const clip = (val: number, min: number, max: number) => Math.max(min, Math.min(val, max));

const NegotiationResultDetail: React.FC<{ result: EnvoyResult, mission: Mission, counterparty: Counterparty }> = ({ result, mission, counterparty }) => {
    
    const [stabilityData, setStabilityData] = useState<any[]>([]);
    const [tornadoData, setTornadoData] = useState<any[]>([]);

    useEffect(() => {
        // Post-mission stability simulation
        const baseParams = Object.fromEntries(result.entity.parameters.map(p => [p.key, p.defaultValue]));
        const postMissionParams = {
            ...baseParams,
            stress: (baseParams.stress || 40) + result.metrics.postDelta.stress,
            reputation: (baseParams.reputation || 50) + result.metrics.postDelta.pv * 0.2,
        };

        // FIX: Calculate trustFactor to pass to simulateCharacter
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

        // FIX: Pass trustFactor as the third argument to simulateCharacter.
        const simOutput = simulateCharacter(
          postMissionParams,
          {
            horizonDays: 90,
            dt: 0.25,
            ensemble: 64,
            rngSeed: result.entity.entityId.charCodeAt(0),
          },
          trustFactor
        );
        setStabilityData(simOutput.mean);

        // Tornado chart sensitivity analysis
        const tornadoParams = ['will', 'competence_neg', 'loyalty', 'stress', 'accountability', 'ideology_rigidity'];
        
        const sensitivities = tornadoParams.map(key => {
            const param = result.entity.parameters.find(p => p.key === key);
            if (!param) return { name: key, impact: 0 };
            
            const originalValue = baseParams[key];
            
            const createModifiedEntity = (modifier: number): CharacterEntity => {
                const newParams = { ...baseParams, [key]: originalValue * modifier };
                return {
                    ...result.entity,
                    parameters: result.entity.parameters.map(p => ({
                        ...p,
                        defaultValue: newParams[p.key] ?? p.defaultValue
                    }))
                };
            };

            const highResult = rankEnvoys([createModifiedEntity(1.1)], counterparty, mission);
            const lowResult = rankEnvoys([createModifiedEntity(0.9)], counterparty, mission);

            const impact = (highResult[0]?.score || 0) - (lowResult[0]?.score || 0);

            return { name: param.name, impact };
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
        { label: "Распределение ценности", content: <div className="h-80"><HistogramChart data={histogramData} /></div> },
        { label: "Факторы оценки", content: <div className="h-80"><WaterfallChart data={waterfallData} /></div> },
        { label: "Чувствительность", content: <div className="h-80"><TornadoChart data={tornadoData} /></div> },
    ];

    return <Tabs tabs={tabs} />;
};


export const NegotiationRunner: React.FC<{ sim: SimulationMeta }> = ({ sim }) => {
    const payload = sim.payload as NegotiationScenario;
    const [selectedCp, setSelectedCp] = useState<Counterparty>(payload.counterparties[0]);
    const [selectedMission, setSelectedMission] = useState<Mission>(payload.missions[0]);
    const [results, setResults] = useState<EnvoyResult[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedEnvoy, setSelectedEnvoy] = useState<EnvoyResult | null>(null);
    
    const [searchParams] = useSearchParams();
    const highlightedCharacterId = searchParams.get('characterId');

    const characters = useMemo(() => getEntitiesByType(EntityType.Character) as CharacterEntity[], []);

    const handleRunSimulation = useCallback(() => {
        setIsLoading(true);
        setSelectedEnvoy(null);
        // Simulate async work
        setTimeout(() => {
            const ranked = rankEnvoys(characters, selectedCp, selectedMission);
            setResults(ranked);
            const highlightedEnvoy = ranked.find(r => r.id === highlightedCharacterId);
            setSelectedEnvoy(highlightedEnvoy || ranked[0]);
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
            classes += ' bg-canon-blue/10'; // A different highlight for the character from the entity page
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
                            <div className="text-center p-8">Выберите переговорщика для просмотра детальных результатов.</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};