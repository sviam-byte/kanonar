
// pages/EntityDetailPage.tsx
/* ... existing imports ... */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useLocation, useSearchParams } from 'react-router-dom';
import { getEntityById, getEntitiesByType } from '../data';
import { EntityType, CharacterEntity, AnyEntity, AgentState, BlackSwanEvent, BodyModel, PersonalEvent, LocationEntity } from '../types';
import { useBranch } from '../contexts/BranchContext';
import { useSandbox } from '../contexts/SandboxContext';
import { useAccess } from '../contexts/AccessContext';
import { ActionButtons } from '../components/ActionButtons';
import { CharacterParameters } from '../components/CharacterParameters';
import { Tabs } from '../components/Tabs';
import { useCharacterCalculations } from '../hooks/useCharacterCalculations';
import { useEntityMetrics } from '../hooks/useEntityMetrics';
import { MetricsDashboard } from '../components/MetricsDashboard';
import { StabilityChart } from '../components/charts/StabilityChart';
import { AgentInternalStateView } from '../components/AgentStateView';
import { TomGeneralInspector } from '../components/tom/TomGeneralInspector';
import { ContextualMindQuickLab } from '../components/tom/ContextualMindQuickLab';
import { GoalGraphDisplay } from '../components/GoalGraphDisplay';
import { BehavioralParamsDisplay } from '../components/BehavioralParamsDisplay';
import { ArchetypeLayersDisplay } from '../components/ArchetypeLayersDisplay';
import { ShadowArchetypeDisplay } from '../components/ShadowArchetypeDisplay';
import { ArchetypeFieldsDisplay } from '../components/ArchetypeFieldsDisplay';
import { TraumaSimulator } from '../components/TraumaSimulator';
import { OathsAndTaboosEditor } from '../components/OathsAndTaboosEditor';
import { setNestedValue, getNestedValue } from '../lib/param-utils';
import { calculateCharacterArchetypeInfo } from '../lib/archetypes/shadow';
import { mapCharacterToBehaviorParams } from '../lib/core/character_mapper';
import { makeAgentRNG } from '../lib/core/noise';
import { BlackSwanEditor } from '../components/BlackSwanEditor';
import { AllMetricsView } from '../components/PsychStateView';
import { BodyEditor } from '../components/BodyEditor';
import { ArchetypeProfilePage } from '../components/ArchetypeProfilePage';
import { computeArchetypeDefinition } from '../lib/archetypes/view-model';
import { defaultBody } from '../lib/character-snippet';
import { HistoricalEventEditor } from '../components/HistoricalEventEditor';
import { BiographyAnalysis } from '../components/BiographyAnalysis';
import { GoalCascadeVisualizer } from '../components/GoalCascadeVisualizer';
import { ArchetypeGoalAlignment } from '../components/ArchetypeGoalAlignment';
import { MiniGoalSandbox } from '../components/MiniGoalSandbox';
import { LatentOverview } from '../components/LatentOverview';
import { FORMULA_REGISTRY, resolveFormula } from '../lib/formulas/registry';
import { latentSchema } from '../data/latent-schema';
import { V4_GOAL_DEFINITIONS } from '../lib/life-goals/v4-params';
import { BIO_TO_VECTOR_WEIGHTS } from '../lib/biography/biography-to-traits';
import { computeBiographyLatent } from '../lib/biography/lifeGoalsEngine';
import { LocationProfile } from '../components/locations/LocationProfile';
import { EntitySecurityGate, RedactedBlock } from '../components/EntitySecurityGate';

export const EntityDetailPage: React.FC = () => {
  const { entityId } = useParams<{ entityType: string; entityId: string }>();
  const { branch } = useBranch();
  const { isAdmin } = useSandbox();
  const { clearanceLevel } = useAccess();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const previewData = location.state as { character: CharacterEntity, snippet: string } | undefined;
  const isPreview = entityId === 'preview' && !!previewData;

  const baseEntity = useMemo(() => {
      if (isPreview && previewData) {
          return previewData.character;
      }
      return entityId ? getEntityById(entityId) : undefined;
  }, [entityId, isPreview, previewData]);

  const allCharacters = useMemo(() => 
    (getEntitiesByType(EntityType.Character) as CharacterEntity[])
    .concat(getEntitiesByType(EntityType.Essence) as CharacterEntity[]), 
  []);

  const [paramValues, setParamValues] = useState<AnyEntity | null>(null);
  const [lockedParams, setLockedParams] = useState<Set<string>>(new Set());
  const [blackSwans, setBlackSwans] = useState<BlackSwanEvent[]>([]);

  const isArchetype = entityId?.startsWith('ARCHETYPE::');
  const isLocation = baseEntity?.type === EntityType.Location;

  useEffect(() => {
    if (baseEntity) {
        const initial = JSON.parse(JSON.stringify(baseEntity));
        if (initial.type === EntityType.Character || initial.type === EntityType.Essence) {
            const mergedBody = { ...defaultBody, ...(initial.body || {}) };
            if (initial.body) {
                mergedBody.structural = { ...defaultBody.structural, ...(initial.body.structural || {}) };
                mergedBody.functional = { ...defaultBody.functional, ...(initial.body.functional || {}) };
                mergedBody.adipose = { ...defaultBody.adipose, ...(initial.body.adipose || {}) };
                mergedBody.hormonal = { ...defaultBody.hormonal, ...(initial.body.hormonal || {}) };
                mergedBody.reproductive = { ...defaultBody.reproductive, ...(initial.body.reproductive || {}) };
                mergedBody.constitution = { ...defaultBody.constitution, ...(initial.body.constitution || {}) };
                mergedBody.capacity = { ...defaultBody.capacity, ...(initial.body.capacity || {}) };
                mergedBody.reserves = { ...defaultBody.reserves, ...(initial.body.reserves || {}) };
                mergedBody.acute = { ...defaultBody.acute, ...(initial.body.acute || {}) };
                mergedBody.regulation = { ...defaultBody.regulation, ...(initial.body.regulation || {}) };
            }
            initial.body = mergedBody;
            if (!initial.historicalEvents) initial.historicalEvents = [];
        }

        searchParams.forEach((value, key) => {
            if (key.startsWith('p_')) {
                const paramPath = key.substring(2);
                const numVal = parseFloat(value);
                if (!isNaN(numVal)) {
                    setNestedValue(initial, paramPath, numVal);
                }
            }
        });
        setParamValues(initial);
    }
  }, [baseEntity, branch, searchParams.toString()]);

  const handleParamChange = useCallback((key: string, value: number) => {
    setParamValues(prev => {
      if (!prev) return null;
      const next = JSON.parse(JSON.stringify(prev));
      setNestedValue(next, key, value);
      
      const newParams = new URLSearchParams(searchParams);
      const baseVal = getNestedValue(baseEntity, key);
      if (baseVal !== undefined && Math.abs(baseVal - value) < 1e-6) {
           newParams.delete(`p_${key}`);
      } else {
           newParams.set(`p_${key}`, value.toString());
      }
      setSearchParams(newParams, { replace: true });

      return next;
    });
  }, [baseEntity, searchParams, setSearchParams]);
  
  const handleBodyChange = useCallback((newBody: any) => {
      setParamValues(prev => {
          if (!prev) return null;
          return { ...prev, body: newBody };
      });
  }, []);

  const handleEventsChange = useCallback((events: PersonalEvent[], newIdentity?: any) => {
      setParamValues(prev => {
          if (!prev) return null;
          if (prev.type !== EntityType.Character && prev.type !== EntityType.Essence) return prev;
          const next = { ...prev, historicalEvents: events };
          if (newIdentity) {
              (next as CharacterEntity).identity = newIdentity;
          }
          return next;
      });
  }, []);

  const handleToggleLock = useCallback((key: string) => {
      setLockedParams(prev => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key); else next.add(key);
          return next;
      });
  }, []);

  const handleAddBlackSwan = useCallback((event: BlackSwanEvent) => setBlackSwans(prev => [...prev, event]), []);

  const handleApplyTrauma = useCallback((event: any) => {
       setParamValues(prev => {
            if (!prev) return null;
            const next = JSON.parse(JSON.stringify(prev));
            if (!next.historicalEvents) next.historicalEvents = [];
            next.historicalEvents.push({
                id: `trauma-${Date.now()}`, name: `Trauma: ${event.kind}`, t: Date.now(), years_ago: 0,
                domain: event.domain, 
                tags: event.tags,
                intensity: event.severity, valence: -1, duration_days: 30,
                surprise: 1.0, controllability: 0, responsibility_self: 0, secrecy: 'private',
                trauma: { domain: 'others', severity: event.severity, kind: event.kind }
            });
            return next;
       });
  }, []);

  const isCharacter = baseEntity?.type === EntityType.Character || baseEntity?.type === EntityType.Essence;
  const characterForCalc = isCharacter && paramValues ? (paramValues as CharacterEntity) : undefined;
  
  const mentionedInEvents = useMemo(() => {
      if (!characterForCalc) return [];
      const currentId = characterForCalc.entityId;
      const result: { sourceCharacter: CharacterEntity, event: PersonalEvent }[] = [];

      allCharacters.forEach(other => {
          if (other.entityId === currentId) return; 
          if (!other.historicalEvents) return;
          
          other.historicalEvents.forEach(ev => {
              const participants = ev.participants || [];
              const targetId = (ev.payload as any)?.targetId;
              const otherId = (ev.payload as any)?.otherId;
              
              if (participants.includes(currentId) || targetId === currentId || otherId === currentId) {
                  result.push({ sourceCharacter: other, event: ev });
              }
          });
      });
      return result.sort((a,b) => (a.event.years_ago ?? 0) - (b.event.years_ago ?? 0));
  }, [characterForCalc, allCharacters]);

  const characterCalculations = useCharacterCalculations(characterForCalc, branch, []);
  const metrics = useEntityMetrics(paramValues || undefined, 90, characterCalculations, blackSwans, branch);
  const behavioralParams = useMemo(() => characterForCalc ? mapCharacterToBehaviorParams(characterForCalc) : null, [characterForCalc]);

  const archetypeInfo = characterForCalc && metrics ? calculateCharacterArchetypeInfo(characterForCalc, characterCalculations.eventAdjustedFlatParams, metrics.S) : null;
  const archetypeDefinition = useMemo(() => characterForCalc ? computeArchetypeDefinition(characterForCalc) : null, [characterForCalc]);
  const bioLatent = computeBiographyLatent(characterForCalc?.historicalEvents || []);
  
  const mockAgentState: AgentState | undefined = characterForCalc ? {
      ...characterForCalc,
      // FIX: Added id and pos to comply with AgentState interface.
      id: characterForCalc.entityId,
      pos: { x: 0, y: 0 },
      ...characterCalculations.quickStates,
      quickStates: characterCalculations.quickStates,
      hp: characterForCalc.body?.acute?.hp ?? 100,
      S: metrics?.S ?? 50,
      v: metrics?.v ?? 0,
      temperature: behavioralParams?.T0 ?? 0.5,
      gumbelScale: behavioralParams?.gumbel_beta ?? 0.1,
      processNoiseSigma: behavioralParams?.sigma0 ?? 0.05,
      rngChannels: { decide: makeAgentRNG(characterForCalc.entityId, 1), physio: makeAgentRNG(characterForCalc.entityId, 2), perceive: makeAgentRNG(characterForCalc.entityId, 3) },
      behavioralParams: behavioralParams!,
      w_eff: [], relationships: {}, perceivedStates: new Map(), pendingProposals: [],
      W_S: [], W_L: [], W_S_hat: [], W_L_hat: [], W_S_lag: [], W_L_lag: [],
      masksS: [], masksL: [], alphaL: [], alphaS: [],
      phiS_vec: [], phiL_vec: [], 
      goalIds: [], wSelfBase: [], actionHistory: [], flags: {},
      route_belief: 0, route_source: 'none',
      goalEcology: characterCalculations.goalEcology ?? undefined,
      tomMetrics: characterCalculations.tomMetrics ?? undefined,
      v42metrics: characterCalculations.v42metrics ?? undefined,
      tomV2Metrics: characterCalculations.tomV2Metrics ?? undefined,
      fieldMetrics: characterCalculations.fieldMetrics ?? undefined,
      latents: characterCalculations.latents,
      archetype: {
          mixture: {},
          actualId: characterCalculations.modifiableCharacter?.identity?.arch_true_dominant_id ?? 'unknown',
          actualFit: 1.0, shadowId: null, shadowFit: 0, shadowActivation: 0,
          self: { perceivedAxes: {}, selfMixture: {}, selfId: characterCalculations.modifiableCharacter?.identity?.arch_self_dominant_id ?? 'unknown', selfConfidence: 1.0, selfShadowId: null, selfShadowWeight: 0 },
          currentMode: 'default', phase: 'normal', history: {}, viability: 1.0
      },
      derivedMetrics: characterCalculations.derivedMetrics,
      identityProfile: { archetypeObserved: '', archetypeSelf: '', archetypePerceivedBy: {}, tensionSelfObserved: 0 },
      failureState: { activeModes: [], atRiskModes: [], history: [] },
      narrativeState: { episodes: [], narrative: [], maxNarrativeLength: 20 },
      influence: metrics?.influence ?? 0,
      prMonstro: metrics?.prMonstro ?? 0,
      psych: characterCalculations.psych,
      stress: characterForCalc.body?.acute?.stress ?? 0,
      reputation: characterForCalc.social?.audience_reputation[0]?.score ?? 50,
      fatigue: characterForCalc.body?.acute?.fatigue ?? 0,
      darkness: characterForCalc.state?.dark_exposure ?? 0,
      E: characterForCalc.memory?.attention?.E ?? 100,
      Debt: 0, vsigma: 0, pv: 0, D: characterForCalc.state?.drift_state ?? 15,
      N_ema: 0.5, H_ema: 0.5, C_ema: 0.5,
      xi: 0, sigma_xi_sq: 0.01,
      stress_ema_delta: 0, arousal_ema_delta: 0,
      J_ema: 0, post_shock_timer: 0, assimilation_timer: 0, J_positive_ema: 0,
      mode: 'normal',
      burnout_condition_days: 0, dark_condition_days: 0, apophenia_condition_days: 0, corruption_condition_days: 0,
      moral_injury_ema: characterForCalc.body?.acute?.moral_injury ?? 0,
      allostatic_load: 0,
      resilience_growth: 0,
      _debug_bio_latent: bioLatent,
  } : undefined;

  /* ... rest of component ... */
  if (!baseEntity || !paramValues) return <div className="p-8 text-canon-text-light">Загрузка...</div>;
  
  if (baseEntity?.security) {
       if (baseEntity.security.requiredLevel && clearanceLevel < baseEntity.security.requiredLevel) {
           return (
               <div className="p-8 h-[80vh] flex items-center justify-center">
                    <div className="max-w-md w-full h-64">
                        <RedactedBlock level={baseEntity.security.requiredLevel} label={baseEntity.entityId} />
                        <div className="mt-4 text-center text-canon-text-light text-xs">Access denied. Entity classified.</div>
                    </div>
               </div>
           )
       }
  }

  if (isLocation) {
      return (
          <div className="p-8 max-w-screen-2xl mx-auto">
              <LocationProfile location={paramValues as LocationEntity} />
          </div>
      );
  }
  
  const handleComprehensiveExport = () => {
      if (!characterForCalc || !characterCalculations || !metrics) return;
      const formulasSnapshot: Record<string, any> = {};
      if (mockAgentState) {
          Object.keys(FORMULA_REGISTRY).forEach(key => {
              formulasSnapshot[key] = {
                  template: FORMULA_REGISTRY[key],
                  evaluated: resolveFormula(FORMULA_REGISTRY[key], mockAgentState)
              };
          });
      }
      const report = {
          metadata: { id: characterForCalc.entityId, name: characterForCalc.title, timestamp: new Date().toISOString(), version: "Kanonar 4.2 Full Dossier" },
          raw_data: { vector_base: characterForCalc.vector_base, body: characterForCalc.body, identity: characterForCalc.identity, resources: characterForCalc.resources, state: characterForCalc.state, competencies: characterForCalc.competencies, history: characterForCalc.historicalEvents },
          analysis: { latents: characterCalculations.latents, quick_states: characterCalculations.quickStates, v42_metrics: characterCalculations.v42metrics, derived_metrics: characterCalculations.derivedMetrics, tom_metrics: characterCalculations.tomMetrics, psych_profile: characterCalculations.psych, field_metrics: characterCalculations.fieldMetrics, bio_latent_raw: bioLatent },
          explainability: { note: "This section contains the weights and formulas used to derive the analysis from raw data.", latent_schema: latentSchema, metric_formulas: formulasSnapshot, goal_definitions: V4_GOAL_DEFINITIONS, bio_impact_weights: BIO_TO_VECTOR_WEIGHTS },
          trace: { goal_engine_dump: characterCalculations.goalEcology?.lifeGoalDebug, concrete_goals_breakdown: (characterCalculations.goalEcology?.lifeGoalDebug as any)?.concreteGoals }
      };
      const jsonString = JSON.stringify(report, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${characterForCalc.title.replace(/\s+/g, '_')}_FULL_DOSSIER.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  let tabs = [];
  const parametersTabContent = (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
              <CharacterParameters entity={baseEntity} paramValues={paramValues} onParamChange={handleParamChange} lockedParams={lockedParams} onToggleLock={handleToggleLock} latents={characterCalculations.latents} />
          </div>
          {isCharacter && (
              <div className="space-y-6">
                  <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                       <h3 className="font-bold text-sm text-canon-accent mb-4">Физиология</h3>
                       {'body' in paramValues ? (<BodyEditor body={paramValues.body as BodyModel} onChange={handleBodyChange} />) : (<div className="text-canon-text-light text-sm">Нет данных о теле.</div>)}
                  </div>
              </div>
          )}
      </div>
  );

  const psychTabContent = isCharacter && mockAgentState && archetypeInfo ? (
      <div className="space-y-8">
          <div className="flex justify-end gap-2">
               <button onClick={handleComprehensiveExport} className="flex items-center gap-2 px-3 py-1 bg-canon-accent text-canon-bg border border-canon-accent rounded text-xs font-bold hover:bg-opacity-80 transition-colors"><span>💾</span> Скачать Полное Досье (JSON)</button>
          </div>
          <div className="bg-canon-bg-light border border-canon-border rounded-lg p-6">
               {archetypeDefinition && <ArchetypeProfilePage archetype={archetypeDefinition} />}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
               <div className="space-y-6">
                    <h3 className="text-lg font-bold text-canon-accent border-b border-canon-border pb-2">1. Структура (Natura)</h3>
                    <LatentOverview latents={characterCalculations.latents} />
                    <ArchetypeLayersDisplay layers={archetypeInfo.layers} />
               </div>
               <div className="space-y-6">
                    <h3 className="text-lg font-bold text-canon-accent border-b border-canon-border pb-2">2. Рассчитанные Метрики</h3>
                    <AllMetricsView agent={mockAgentState} />
                    {characterCalculations.fieldMetrics && <ArchetypeFieldsDisplay metrics={characterCalculations.fieldMetrics} />}
               </div>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
               <div className="space-y-6">
                   <h3 className="text-lg font-bold text-canon-accent border-b border-canon-border pb-2">3. Динамика и Конфликт</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <AgentInternalStateView agent={mockAgentState} />
                        <TraumaSimulator character={characterForCalc!} onApplyTrauma={handleApplyTrauma} />
                   </div>
                   <ShadowArchetypeDisplay shadow={archetypeInfo.shadow} trauma_shadow_bias={characterForCalc?.state?.trauma_shadow_bias} />
               </div>
               <div className="space-y-6">
                   <h3 className="text-lg font-bold text-canon-accent border-b border-canon-border pb-2">4. Вывод Поведения</h3>
                   <BehavioralParamsDisplay params={behavioralParams || null} />
               </div>
          </div>
      </div>
  ) : null;

  const biographyTabContent = isCharacter && characterForCalc ? (
       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-canon-bg-light border border-canon-border rounded-lg p-4">
                <HistoricalEventEditor events={characterForCalc.historicalEvents || []} character={characterForCalc} onEventsChange={handleEventsChange} />
            </div>
            <div className="lg:col-span-2 bg-canon-bg-light border border-canon-border rounded-lg p-4 flex flex-col gap-6">
                <div>
                    <h3 className="font-bold text-lg text-canon-accent mb-4">Анализ Биографии</h3>
                    <BiographyAnalysis character={characterForCalc} events={characterForCalc.historicalEvents || []} />
                </div>
                {mentionedInEvents.length > 0 && (
                    <div className="border-t border-canon-border pt-4">
                        <h3 className="font-bold text-lg text-canon-accent mb-3">Перекрестная история</h3>
                        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                            {mentionedInEvents.map(({ sourceCharacter, event }, i) => (
                                <div key={`${sourceCharacter.entityId}-${event.id}-${i}`} className="bg-canon-bg border border-canon-border/50 rounded p-3 text-sm flex justify-between items-center hover:bg-canon-bg/70 transition-colors">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-canon-text">{sourceCharacter.title}</span>
                                            <span className="text-canon-text-light text-xs">({sourceCharacter.entityId})</span>
                                        </div>
                                        <div className="text-xs text-canon-text-light mt-1">
                                            <span className="font-mono text-canon-accent">{event.name}</span>
                                            <span className="mx-1">•</span>
                                            <span>{event.years_ago} лет назад</span>
                                        </div>
                                    </div>
                                    <button className="text-xs text-canon-blue border border-canon-blue px-2 py-1 rounded hover:bg-canon-blue hover:text-black transition-colors" onClick={() => window.location.hash = `/character/${sourceCharacter.entityId}`}>Перейти</button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
       </div>
  ) : null;

  if (isArchetype) {
      tabs = [
          { label: 'Паспорт', content: (
                  <div className="space-y-8">
                    <div className="bg-canon-bg-light border border-canon-border rounded-lg">
                        {archetypeDefinition && <ArchetypeProfilePage archetype={archetypeDefinition} />}
                    </div>
                  </div>
              )
          },
          { label: 'Параметры', content: parametersTabContent }
      ];
  } else {
      tabs = [
          { label: 'Симуляция (SDE)', content: (
              <div className="space-y-6">
                  {metrics && <MetricsDashboard metrics={metrics} entity={paramValues} linterIssues={[]} />}
                  {metrics && metrics.simulationData.length > 0 && (
                      <div className="h-80 bg-canon-bg border border-canon-border rounded-lg p-4">
                          <h3 className="font-bold mb-2 text-canon-text">Динамика стабильности</h3>
                          <StabilityChart data={metrics.simulationData} events={blackSwans} />
                      </div>
                  )}
                   <BlackSwanEditor onAddEvent={handleAddBlackSwan} />
              </div>
          )},
          ...(isCharacter ? [{ label: 'Психика (Все Метрики)', content: psychTabContent }] : []),
          ...(isCharacter ? [{ label: 'Биография', content: biographyTabContent }] : []),
          ...(isCharacter && characterCalculations.goalEcology ? [{ label: 'Цели', content: (
                <div className="grid grid-cols-1 gap-6">
                    <div>
                         <h3 className="text-xl font-bold text-canon-accent mb-2">Каскад Мотивации</h3>
                         <p className="text-sm text-canon-text-light mb-4">Визуализация того, как личные качества (Traits) и жизненный опыт (Bio) формируют Жизненные Цели.</p>
                         <GoalCascadeVisualizer ecology={characterCalculations.goalEcology} />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                         <MiniGoalSandbox character={characterForCalc!} />
                         <ArchetypeGoalAlignment character={characterForCalc!} ecology={characterCalculations.goalEcology} />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                        <div className="lg:col-span-2"><GoalGraphDisplay ecology={characterCalculations.goalEcology} /></div>
                        <div><OathsAndTaboosEditor character={characterForCalc as CharacterEntity} onIdentityChange={(newId) => handleParamChange('identity', newId as any)} /></div>
                    </div>
                </div>
          )}] : []),
          ...(isCharacter && characterForCalc ? [{
                label: 'ToM (Math)',
                content: (
                  <TomGeneralInspector
                    observerId={characterForCalc.entityId}
                    observerEntityOverride={characterForCalc}
                    observerMetricsOverride={characterCalculations}
                  />
                ),
              }
          ] : []),
          ...(isCharacter && characterForCalc ? [{
                label: 'ToM (Context)',
                content: (
                  <ContextualMindQuickLab
                    character={characterForCalc as CharacterEntity}
                    allCharacters={allCharacters}
                  />
                ),
              }
          ] : []),
          { label: 'Параметры (Raw)', content: parametersTabContent }
      ];
  }

  return (
    <div className="p-8 max-w-screen-2xl mx-auto">
        {isPreview && previewData && (
            <div className="mb-6 bg-canon-blue/10 border border-canon-blue rounded-lg p-4 flex justify-between items-center animate-fade-in">
                <div>
                    <h3 className="text-canon-blue font-bold flex items-center gap-2"><span>⚡</span> ПРЕДПРОСМОТР: {paramValues.title}</h3>
                    <p className="text-xs text-canon-text-light mt-1">Этот персонаж сгенерирован временно.</p>
                </div>
                <div className="flex gap-2 w-1/2">
                    <input readOnly value={previewData.snippet} className="flex-grow bg-canon-bg border border-canon-border rounded px-2 py-1 text-[10px] font-mono text-canon-text-light focus:outline-none focus:border-canon-accent" onClick={e => (e.target as HTMLInputElement).select()} />
                    <button onClick={() => navigator.clipboard.writeText(previewData.snippet)} className="px-3 py-1 bg-canon-blue text-canon-bg font-bold text-xs rounded hover:bg-opacity-80 transition-colors">Copy</button>
                </div>
            </div>
        )}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
                <div className="flex items-center gap-3">
                     <h2 className="text-4xl font-bold text-canon-text mb-1">{paramValues.title}</h2>
                     {isArchetype && <span className="px-3 py-1 bg-canon-blue/20 text-canon-blue border border-canon-blue/50 rounded-full text-xs font-bold uppercase tracking-wider">Архетип (Шаблон)</span>}
                     {isLocation && <span className="px-3 py-1 bg-yellow-500/20 text-yellow-500 border border-yellow-500/50 rounded-full text-xs font-bold uppercase tracking-wider">Локация</span>}
                     {isAdmin && <span className="px-2 py-0.5 bg-red-900/40 border border-red-500 text-red-400 text-[10px] uppercase font-bold rounded">Admin Mode</span>}
                </div>
                {paramValues.subtitle && <p className="text-xl text-canon-text-light">{paramValues.subtitle}</p>}
            </div>
            <div className="flex gap-2">
                {isCharacter && <button onClick={handleComprehensiveExport} className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded shadow-lg hover:shadow-purple-500/30 transition-all transform hover:scale-105 text-sm border border-white/10">💾 Скачать Полное Досье (JSON)</button>}
                <ActionButtons entity={baseEntity} paramValues={paramValues} defaultValues={baseEntity} setAllParams={setParamValues} />
            </div>
        </div>
        <Tabs tabs={tabs} syncKey="tab" />
    </div>
  );
};
