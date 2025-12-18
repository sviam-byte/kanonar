
import { useMemo } from 'react';
import { AnyEntity, CalculatedMetrics, FitnessScenario, EntityType, SimConfig, SimulationPoint, CharacterState, CharacterEntity, BlackSwanEvent, StabilityBreakdown, V42Metrics, DerivedMetrics, ToMDashboardMetrics, ToMV2DashboardMetrics, BehavioralAdvice, Branch } from '../types';
import * as objectMetrics from '../lib/formulas';
import { scenarios } from '../data/scenarios';
import { simulateCharacter } from '../lib/simulate';
import { getEvidenceById } from '../data/evidence';
import { getSourceById } from '../data/sources';
import { scoreTopology } from '../lib/topology';
import { calculateV42Metrics } from '../lib/character-metrics-v4.2';
import { useCharacterCalculations } from './useCharacterCalculations';
import { calculateLatentsAndQuickStates } from '../lib/metrics';
import { calculateSdeDiagnostics } from '../lib/sde-helpers';


type MetricsResult = Omit<CalculatedMetrics, 'simulationData'> & {
    simulationData: SimulationPoint[];
    finalStates?: CharacterState[];
    E?: number;
    Debt?: number;
};

// Helper to clip a value within a range
const clip = (val: number, min: number, max: number) => Math.max(min, Math.min(val, max));

export const useEntityMetrics = (
  entity: AnyEntity | undefined,
  simulationDays: number,
  characterCalculations: ReturnType<typeof useCharacterCalculations>,
  blackSwans: BlackSwanEvent[],
  branch: Branch
): MetricsResult | null => {
  const { modifiableCharacter, eventAdjustedFlatParams, derivedMetrics, behavioralAdvice } = characterCalculations;
  
  return useMemo(() => {
    if (!entity) {
      return null;
    }

    const relevantScenarios = (scenarios as unknown as FitnessScenario[]).filter(s => s.supportedTypes.includes(entity.type));
    let snapshotMetrics: Omit<CalculatedMetrics, 'scenarioFitness' | 'simulationData' | 'E' | 'Debt' | 'analytics' | 'v42metrics' | 'derivedMetrics' | 'tomMetrics' | 'tomV2Metrics' | 'behavioralAdvice'>;
    let simulationData: SimulationPoint[];
    let finalStates: CharacterState[] | undefined = undefined;
    let initialState: CharacterState | undefined = undefined;
    let analytics: CalculatedMetrics['analytics'] | undefined = undefined;
    
    let effectiveParams = { ...eventAdjustedFlatParams };
     if ('tda' in entity && entity.tda && entity.tda.barcode) {
      const topoScore = scoreTopology(entity.tda.barcode as Array<[number, number, number]>);
      effectiveParams.topo = topoScore;
    }

    // --- TrustFactor Calculation ---
    const evidenceIds = 'evidenceIds' in entity && Array.isArray(entity.evidenceIds) ? entity.evidenceIds : [];
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
    
    const isCharacter = entity.type === EntityType.Character || entity.type === EntityType.Essence;
    
    if (isCharacter && modifiableCharacter) {
      const cfg: SimConfig = {
        horizonDays: simulationDays,
        dt: 1, 
        ensemble: 16,
        rngSeed: 42,
        blackSwans: blackSwans,
      };
      
      const simOutput = simulateCharacter(modifiableCharacter, effectiveParams, cfg, trustFactor);
      initialState = simOutput.initialState;
      analytics = simOutput.analytics;
      simulationData = simOutput.mean;
      finalStates = simOutput.finalStates;
      const t0_data: Partial<SimulationPoint> = simOutput.mean[0] || {};

      // DR (Robustness) Calculation
      const { runs } = simOutput;
      const okRuns = runs.filter(run => {
          const min_S = Math.min(...run.series.map(p => p.S));
          return min_S > 40;
      }).length;
      const DR = runs.length > 0 ? (okRuns / runs.length) * 100 : 0;

      // DS (Sensitivity) Calculation
      const { latents: baseLatents, quickStates: baseQuickStates } = calculateLatentsAndQuickStates(eventAdjustedFlatParams);
      const baseResult = calculateSdeDiagnostics(modifiableCharacter, baseLatents, baseQuickStates);
      
      const stressedParams = { ...eventAdjustedFlatParams, 'body.acute.stress': Math.min(100, (eventAdjustedFlatParams['body.acute.stress'] ?? 40) + 20) };
      const { latents: stressedLatents, quickStates: stressedQuickStates } = calculateLatentsAndQuickStates(stressedParams);
      const stressedResult = calculateSdeDiagnostics(modifiableCharacter, stressedLatents, stressedQuickStates, 0, { stress: stressedParams['body.acute.stress'] });

      const DS = Math.abs(stressedResult.S_star - baseResult.S_star) / 20;

      // Scenario S calculation
      let scenarioStability: number | undefined = undefined;
      if (simulationData.length > 0) {
          const S_values = simulationData.map(p => p.S).filter(s => s !== undefined) as number[];
          if (S_values.length > 0) {
              const S_mean = S_values.reduce((a, b) => a + b, 0) / S_values.length;
              const frac_below_40 = S_values.filter(s => s < 40).length / S_values.length;
              scenarioStability = 100 * (0.5 * (S_mean / 100) + 0.5 * (1 - frac_below_40));
          }
      }
      
      const stabilityResult: StabilityBreakdown = {
        S_ss: initialState.S,
        Pv: t0_data.Pv ?? 0,
        Vsigma: t0_data.Vsigma ?? 0,
        DS: DS,
        DR: DR,
        // Deprecated fields, keep for now for any lingering dependencies
        R: 0, H: 0, K: 0, M: 0, U: 0, O: 0, Gplus: 0, 
        H_core: 0, H_tail: 0, H_budget: 0, H_misalign: 0,
        // New pillar values from SDE
        N_pillar: t0_data.N,
        H_pillar: t0_data.H_p,
        C_pillar: t0_data.C,
        // SDE model params
        mu: (t0_data.mu ?? 0) / 100,
        kappa: t0_data.kappa,
        h: t0_data.h,
        S_star: t0_data.S_star,
        scenario_S: scenarioStability,
      };

      const opt = objectMetrics.calculateOpt(t0_data.Pv ?? 0, t0_data.Vsigma ?? 0);

      snapshotMetrics = {
        ...stabilityResult, // Spread stability result to satisfy CalculatedMetrics root properties
        dose: 0, 
        Pv: t0_data.Pv ?? 0,
        Vsigma: t0_data.Vsigma ?? 0,
        vsigma_components: initialState.vsigma_components,
        S: initialState.S,
        v: initialState.v,
        stability: stabilityResult,
        Opt: opt,
        drift: initialState.D,
        topo: characterCalculations.quickStates['T_topo'] || 0,
        influence: initialState.influence,
        prMonstro: initialState.prMonstro,
        monster_veto: objectMetrics.getMonsterVeto(t0_data.Vsigma ?? 0, effectiveParams),
        stress: initialState.stress,
        darkness: initialState.darkness,
        fatigue: initialState.fatigue,
      };
      
    } else { // Default to Object (deterministic simulation)
      const E = effectiveParams.E || 0;
      const A_star = effectiveParams.A_star || 1;
      const dose = objectMetrics.calculateDose(E, A_star);
      
      let currentDrift = 15;
      const objectSimData: SimulationPoint[] = [];
      for (let i = 0; i < simulationDays; i++) {
        const penalties = objectMetrics.calculateDosePenalties(E, A_star);
        const Pv = objectMetrics.calculateObjectPv(effectiveParams);
        const Vsigma = objectMetrics.calculateObjectVsigma(effectiveParams, penalties);
        currentDrift = objectMetrics.calculateObjectDrift(dose, currentDrift);
        const S = objectMetrics.calculateObjectS(Pv, Vsigma, currentDrift, effectiveParams.topo || 0);
        objectSimData.push({ day: i, S: parseFloat(S.toFixed(1)), Pv, Vsigma });
      }
      simulationData = objectSimData;

      const penalties = objectMetrics.calculateDosePenalties(E, A_star);
      const Pv = objectMetrics.calculateObjectPv(effectiveParams);
      const Vsigma = objectMetrics.calculateObjectVsigma(effectiveParams, penalties);
      const opt = objectMetrics.calculateOpt(Pv, Vsigma);
      const stabilityResult: StabilityBreakdown = {
        R: 0, H: 0, K: 0, M: 0, U: 0, O: 0, Gplus: 0, H_core: 0, H_tail: 0, H_budget: 0, H_misalign: 0,
        S_ss: simulationData[0]?.S || 0,
        Pv: Pv,
        Vsigma: Vsigma,
        DS: 0,
        DR: 0
      };


      snapshotMetrics = {
        ...stabilityResult,
        dose,
        Pv,
        Vsigma,
        S: simulationData[0]?.S || 0,
        v: 0,
        stability: stabilityResult,
        Opt: opt,
        drift: 15,
        topo: effectiveParams.topo || 0,
        influence: 0,
        prMonstro: 0,
        monster_veto: objectMetrics.getMonsterVeto(Vsigma, effectiveParams),
        stress: 0,
        darkness: 0,
        fatigue: 0,
      };
    }

    const scenarioFitness = relevantScenarios.map((scenario: FitnessScenario) => ({
      key: scenario.key,
      title: scenario.title,
      // Cast metric object to satisfy FitnessScenario (using Partial internally in scenarios)
      ...scenario.calculateFitness(entity, { 
          ...snapshotMetrics, 
          derivedMetrics,
          v42metrics: characterCalculations.v42metrics,
          tomMetrics: characterCalculations.tomMetrics,
          tomV2Metrics: characterCalculations.tomV2Metrics,
          behavioralAdvice: characterCalculations.behavioralAdvice,
          // also pass E, Debt, and analytics, which are part of CalculatedMetrics but not snapshotMetrics
          E: initialState?.E,
          Debt: initialState?.Debt,
          analytics: analytics,
      } as any, effectiveParams)
    }));

    return {
      ...snapshotMetrics,
      E: initialState?.E,
      Debt: initialState?.Debt,
      analytics,
      scenarioFitness,
      simulationData,
      finalStates,
      v42metrics: characterCalculations.v42metrics,
      derivedMetrics: characterCalculations.derivedMetrics,
      tomMetrics: characterCalculations.tomMetrics,
      tomV2Metrics: characterCalculations.tomV2Metrics,
      behavioralAdvice,
    };
  }, [entity, simulationDays, blackSwans, characterCalculations, modifiableCharacter, branch]);
};
