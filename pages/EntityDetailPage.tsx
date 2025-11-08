import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { getEntityById } from '../data';
import { AnyEntity, Parameter, EntityType, Evidence, CalculatedMetrics } from '../types';
import { useEntityMetrics } from '../hooks/useEntityMetrics';
import { MetricDisplay } from '../components/MetricDisplay';
import { useBranch } from '../contexts/BranchContext';

import { ParameterControl } from '../components/ParameterControl';
import { ActionButtons } from '../components/ActionButtons';
import { ScenarioDisplay } from '../components/ScenarioDisplay';
import { ExplanationBox } from '../components/ExplanationBox';
import { StabilityChart } from '../components/charts/StabilityChart';
import { StateDistributionCharts } from '../components/charts/StateDistributionCharts';
import { Tabs } from '../components/Tabs';
import { allSimulations } from '../data/simulations';
import { allEvidence, getEvidenceById } from '../data/evidence';
import { getSourceById } from '../data/sources';
import { SMSBDisplay } from '../components/SMSBDisplay';

const useEntityParams = (parameters: Parameter[]) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const paramValues = useMemo(() => {
    const values: Record<string, number> = {};
    parameters.forEach(p => {
      const urlValue = searchParams.get(p.key);
      values[p.key] = urlValue ? Number(urlValue) : p.defaultValue;
    });
    return values;
  }, [searchParams, parameters]);

  const setParamValue = useCallback((key: string, value: number) => {
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set(key, String(value));
    setSearchParams(newSearchParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const setAllParams = useCallback((newParams: Record<string, number>) => {
    const newSearchParams = new URLSearchParams();
    Object.entries(newParams).forEach(([key, value]) => {
      newSearchParams.set(key, String(value));
    });
    setSearchParams(newSearchParams, { replace: true });
  }, [setSearchParams]);
  
  // Initialize URL with default params if they don't exist
  useEffect(() => {
    const newSearchParams = new URLSearchParams(searchParams);
    let updated = false;
    parameters.forEach(p => {
      if (!newSearchParams.has(p.key)) {
        newSearchParams.set(p.key, String(p.defaultValue));
        updated = true;
      }
    });
    if (updated) {
      setSearchParams(newSearchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parameters, setSearchParams]);

  return { paramValues, setParamValue, setAllParams };
};

export const EntityDetailPage: React.FC = () => {
  const { entityId } = useParams<{ entityId: string }>();
  const { branch } = useBranch();
  
  const entity: AnyEntity | undefined = useMemo(() => entityId ? getEntityById(entityId) : undefined, [entityId]);
  
  const [simulationHorizon, setSimulationHorizon] = useState(90);

  if (!entity) {
    return <div className="p-8 text-canon-red">Сущность не найдена.</div>;
  }
  
  const { paramValues, setParamValue, setAllParams } = useEntityParams(entity.parameters);
  const metrics = useEntityMetrics(entity, paramValues, simulationHorizon);

  const groupedParams = useMemo(() => {
    const groups: Record<string, Parameter[]> = {};
    for (const param of entity.parameters) {
      const category = param.category || 'core';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(param);
    }
    return groups;
  }, [entity.parameters]);

  const entityStatus = useMemo(() => {
    if (metrics.monster_veto) {
      return {
        text: 'СТАТУС: УГРОЗА МОНСТРА (ВЕТО СИСТЕМЫ)',
        className: 'bg-red-900/50 border border-canon-red text-canon-red animate-pulse',
      };
    }
    if (metrics.Vsigma > 80) {
      return {
        text: 'СТАТУС: АНОМАЛИЯ (Vσ > 80)',
        className: 'bg-yellow-800/50 border-yellow-500/60 text-yellow-400',
      };
    }
    return null;
  }, [metrics.monster_veto, metrics.Vsigma]);

  if (!entity.versionTags.includes(branch)) {
    return (
        <div className="p-8 text-center">
            <h2 className="text-2xl font-bold text-canon-accent mb-4">Несовместимая ветка</h2>
            <p className="text-canon-text-light">
                Сущность '{entity.title}' не существует или имеет другие свойства в выбранной ветке '{branch}'.
            </p>
        </div>
    );
  }

  const privacyPenalty = (paramValues.privacy_cost_epsilon ?? 0) * 0.75;

  const simulationTab = (
     <div className="grid grid-cols-12 gap-6">
        {/* Left Control Panel */}
        <div className="col-span-12 lg:col-span-4 xl:col-span-3 bg-canon-bg-light border border-canon-border rounded-lg p-4 self-start">
          <ActionButtons entity={entity} setAllParams={setAllParams} />
          
          <div className="border-t border-canon-border pt-4 mt-4">
             <div className="flex items-center justify-between">
                <label className="text-sm text-canon-text-light">Горизонт симуляции:</label>
                <select value={simulationHorizon} onChange={e => setSimulationHorizon(Number(e.target.value))} className="bg-canon-bg border border-canon-border rounded px-2 py-1 text-sm">
                    <option value={30}>30д</option>
                    <option value={90}>90д</option>
                    <option value={180}>180д</option>
                </select>
             </div>
          </div>

          <div className="pt-2">
            {/* FIX: Refactored to use Object.keys to avoid type errors with Object.entries where the value can be inferred as 'unknown'. */}
            {Object.keys(groupedParams).map((category) => (
              <div key={category} className="border-t border-canon-border pt-4 mt-4">
                <h4 className="font-bold text-sm text-canon-text-light mb-2 capitalize">{category === 'core' ? 'Ключевые параметры' : category}</h4>
                {groupedParams[category].map(param => (
                  <ParameterControl
                    key={param.key}
                    parameter={param}
                    value={paramValues[param.key] || 0}
                    onValueChange={value => setParamValue(param.key, value)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Right Display Panel */}
        <div className="col-span-12 lg:col-span-8 xl:col-span-9 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 gap-2">
                <MetricDisplay name="Pv (Канон)" value={metrics.Pv.toFixed(3)} colorClass="text-canon-blue" tooltip="Канон-уровень: отражает статус объекта относительно канонической реальности. Высокий Pv означает высокую стабильность и признание Системой." />
                <MetricDisplay name="Vσ (Хаос)" value={metrics.Vsigma.toFixed(3)} colorClass={metrics.Vsigma > 50 ? 'text-canon-red' : 'text-canon-accent'} tooltip="Хаотичность/Монструозность: отражает энтропийную уязвимость и риски среды. Если слишком высока, Система рассматривает объект как аномалию."/>
                <MetricDisplay name="S (Стабильность)" value={metrics.S.toFixed(3)} colorClass={metrics.S > 60 ? 'text-canon-green' : 'text-canon-accent'} tooltip="Общая онтологическая стабильность сущности. Интегральная метрика, зависящая от Pv, Vσ и других факторов." />
                <MetricDisplay name="drift" value={metrics.drift.toFixed(3)} colorClass={Math.abs(metrics.drift) > 20 ? 'text-canon-red' : 'text-canon-text'} tooltip="Онтологический дрейф: случайные или систематические отклонения от канонического состояния."/>
                <MetricDisplay name="topo" value={metrics.topo.toFixed(3)} tooltip="Топологическая целостность: внутренняя структурная устойчивость сущности." />
                {entity.type === EntityType.Character && <MetricDisplay name="Influence" value={metrics.influence?.toFixed(3) || '0.000'} tooltip="Влияние: способность персонажа воздействовать на окружение и другие сущности."/>}
                {entity.type === EntityType.Character && <MetricDisplay name="Privacy Penalty" value={privacyPenalty.toFixed(2)} colorClass={privacyPenalty > 30 ? 'text-canon-red' : 'text-canon-text'} tooltip="Штраф за нарушение приватности при сборе данных." />}
                {entity.type === EntityType.Object && <MetricDisplay name="dose" value={metrics.dose.toFixed(3)} tooltip="Доза внимания: отношение текущего внимания (E) к оптимальному (A*)." />}
            </div>
            {entity.type === EntityType.Character && metrics.prMonstro !== undefined && (
              <div className="mt-2 flex justify-start">
                  <MetricDisplay name="Pr[monstro]" value={(metrics.prMonstro * 100).toFixed(2) + '%'} colorClass={metrics.prMonstro > 0.1 ? 'text-canon-red' : 'text-canon-text'} tooltip="Вероятность 'монструозного' сбоя, перехода в неконтролируемое, аномальное состояние." />
              </div>
            )}
            
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 bg-canon-bg-light border border-canon-border rounded-lg p-4">
                    <h3 className="font-bold mb-3 text-canon-text">Годность по сценариям</h3>
                    <ScenarioDisplay results={metrics.scenarioFitness} />
                </div>
                 <div className="space-y-6">
                    <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                        <h3 className="font-bold mb-3 text-canon-text">Аналитика СМСБ</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {metrics.analytics?.timeInCrisis !== undefined && (
                                <div className="text-center">
                                    <div className="text-xs text-canon-text-light">Временная справедливость</div>
                                    <div className={`font-mono text-xl font-bold ${metrics.analytics.timeInCrisis > 25 ? 'text-canon-red' : 'text-canon-text'}`}>
                                        {(metrics.analytics.timeInCrisis).toFixed(1)}%
                                    </div>
                                    <div className="text-xs text-canon-text-light" title="Percentage of days spent with Stability < 40">времени в кризисе</div>
                                </div>
                            )}
                            {metrics.analytics?.cvarS !== undefined && (
                                <div className="text-center">
                                    <div className="text-xs text-canon-text-light">CVaR(S) 10% (хвост)</div>
                                    <div className={`font-mono text-xl font-bold ${metrics.analytics.cvarS < 40 ? 'text-canon-red' : 'text-canon-text'}`}>
                                        {(metrics.analytics.cvarS).toFixed(1)}
                                    </div>
                                    <div className="text-xs text-canon-text-light" title="Conditional Value at Risk: Expected Stability in the 10% worst outcomes">ожидаемая S в худших случаях</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
             <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                <h3 className="font-bold mb-3 text-canon-text">Объяснение модели</h3>
                <ExplanationBox metrics={metrics} params={paramValues} entityType={entity.type}/>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
               <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4 h-80">
                   <h3 className="font-bold text-canon-text mb-2">Прогноз стабильности S ({simulationHorizon}д)</h3>
                   <StabilityChart data={metrics.simulationData} />
               </div>
               <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4 h-80">
                    <h3 className="font-bold text-canon-text mb-2">Распределения конечных состояний</h3>
                    {entity.type === EntityType.Character && metrics.finalStates ? (
                        // FIX: Pass paramValues to StateDistributionCharts to allow calculation of stability scores.
                        <StateDistributionCharts finalStates={metrics.finalStates} simulationHorizon={simulationHorizon} params={paramValues} />
                    ) : (
                        <div className="flex items-center justify-center h-full text-canon-text-light text-sm">
                            Данные о распределении доступны только для симуляций персонажей.
                        </div>
                    )}
               </div>
            </div>
        </div>
      </div>
  );

  const loreTab = (
    <div className="bg-canon-bg-light border border-canon-border rounded-lg p-6 max-w-4xl">
        <h3 className="text-xl font-bold text-canon-accent mb-4">Описание</h3>
        <p className="whitespace-pre-wrap text-canon-text-light leading-relaxed">{entity.description}</p>
        
        <h3 className="text-xl font-bold text-canon-accent mt-6 mb-4">Отношения</h3>
        {entity.relations.length > 0 ? (
            <ul className="list-disc list-inside space-y-2">
                {entity.relations.map(rel => (
                     <li key={rel.entityId} className="text-canon-text-light">
                        <span className="capitalize text-canon-text font-semibold">{rel.type}:</span>{' '}
                        <Link to={`/${getEntityById(rel.entityId)?.type}/${rel.entityId}`} className="text-canon-accent hover:underline">
                            {rel.entityTitle}
                        </Link>
                    </li>
                ))}
            </ul>
        ) : <p className="text-canon-text-light">Отношения не определены.</p>}

        {entity.smsb && (
          <div className="mt-6">
            <SMSBDisplay flags={entity.smsb} />
          </div>
        )}
    </div>
  );
  
  const characterSimulations = useMemo(() => {
    return allSimulations.filter(sim => sim.isCharacterCentric);
  }, []);

  const missionsTab = (
    <div className="bg-canon-bg-light border border-canon-border rounded-lg p-6 max-w-4xl">
        <h3 className="text-xl font-bold text-canon-accent mb-4">Доступные задания</h3>
        <div className="space-y-4">
            {characterSimulations.map(sim => (
                <Link 
                    key={sim.key}
                    to={`/simulations/${sim.key}?characterId=${entity.entityId}`}
                    className="block p-4 border border-canon-border rounded-lg hover:border-canon-accent transition-colors"
                >
                    <h4 className="font-bold text-canon-accent">{sim.title}</h4>
                    <p className="text-sm text-canon-text-light mt-1">{sim.description}</p>
                </Link>
            ))}
             {characterSimulations.length === 0 && <p className="text-canon-text-light">Для этого персонажа нет доступных заданий.</p>}
        </div>
    </div>
  );

  const mediaTab = (
     <div className="bg-canon-bg-light border border-canon-border rounded-lg p-6">
         <h3 className="text-xl font-bold text-canon-accent mb-4">Медиа</h3>
         {entity.media.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {entity.media.map((item, index) => (
                    <div key={index} className="border border-canon-border rounded-lg overflow-hidden">
                        {item.type === 'image' && <img src={item.url} alt={item.caption} className="w-full h-auto object-cover"/>}
                        <div className="p-3">
                            <p className="text-sm text-canon-text">{item.caption}</p>
                            {item.source && <p className="text-xs text-canon-text-light mt-1">Источник: {item.source}</p>}
                        </div>
                    </div>
                ))}
            </div>
         ) : <p className="text-canon-text-light">Для этой сущности нет медиафайлов.</p>}
     </div>
  );

  const entityEvidence = useMemo(() => {
      return (entity.evidenceIds || [])
        .map(id => getEvidenceById(id))
        .filter((e): e is Evidence => e !== undefined);
  }, [entity.evidenceIds]);

  const evidenceTab = (
    <div className="bg-canon-bg-light border border-canon-border rounded-lg p-6 max-w-4xl">
      <h3 className="text-xl font-bold text-canon-accent mb-4">Факты и источники</h3>
      {entityEvidence.length > 0 ? (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-canon-border text-canon-text-light">
              <th className="py-2">Утверждение</th>
              <th className="py-2">Источник</th>
              <th className="py-2 text-right">Доверие</th>
            </tr>
          </thead>
          <tbody>
            {entityEvidence.map(ev => {
              const source = getSourceById(ev.source.id);
              return (
                <tr key={ev.id} className="border-b border-canon-border/50">
                  <td className="py-2 pr-4">{ev.statement}</td>
                  <td className="py-2 pr-4 text-canon-text-light">{source?.name || 'Неизвестно'}</td>
                  <td className="py-2 text-right font-mono">{ev.confidence.toFixed(2)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : <p className="text-canon-text-light">С этой сущностью не связано никаких доказательств.</p>}
    </div>
  );
  
  const historyTab = (
       <div className="bg-canon-bg-light border border-canon-border rounded-lg p-6 max-w-4xl">
         <h3 className="text-xl font-bold text-canon-accent mb-4">История изменений</h3>
         <table className="w-full text-left text-sm">
            <thead>
                <tr className="border-b border-canon-border text-canon-text-light">
                    <th className="py-2">Версия</th>
                    <th className="py-2">Дата</th>
                    <th className="py-2">Автор</th>
                    <th className="py-2">Описание</th>
                </tr>
            </thead>
            <tbody>
                {entity.changelog.map(entry => (
                    <tr key={entry.version} className="border-b border-canon-border/50">
                        <td className="py-2 pr-4 font-mono">{entry.version}</td>
                        <td className="py-2 pr-4">{entry.date}</td>
                        <td className="py-2 pr-4">{entry.author}</td>
                        <td className="py-2">{entry.summary}</td>
                    </tr>
                ))}
            </tbody>
         </table>
     </div>
  );

  const tabs = [
      ...(entity.parameters.length > 0 ? [{ label: "Симуляция", content: simulationTab }] : []),
      ...(entity.type === EntityType.Character ? [{ label: "Задания", content: missionsTab }] : []),
      { label: "Лор", content: loreTab },
      { label: "Факты", content: evidenceTab },
      { label: "Медиа", content: mediaTab },
      { label: "История", content: historyTab },
  ].filter(Boolean);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-screen-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-3xl font-bold">{entity.title}: <span className="text-canon-text-light font-normal">{entity.subtitle}</span></h2>
        <div className="text-sm text-canon-text-light mt-1">
          <span>Ветка: <span className="text-canon-text">{branch}</span></span>
          <span className="mx-2">•</span>
          <span>Тип: <span className="text-canon-text">{entity.type}</span></span>
        </div>
      </div>

      {entityStatus && (
        <div className={`mb-6 text-center text-lg font-bold font-mono px-4 py-2 rounded-md ${entityStatus.className}`}>
          {entityStatus.text}
        </div>
      )}
      
      <Tabs tabs={tabs} />
    </div>
  );
};