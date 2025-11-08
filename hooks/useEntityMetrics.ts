import { useMemo } from 'react';
import { AnyEntity, CalculatedMetrics, Scenario, EntityType, SimConfig, SimulationPoint, CharacterState } from '../types';
import * as formulas from '../lib/formulas';
import { scenarios } from '../data/scenarios';
import { simulateCharacter } from '../lib/simulate';
import { getEvidenceById } from '../data/evidence';
import { getSourceById } from '../data/sources';

type MetricsResult = Omit<CalculatedMetrics, 'simulationData'> & {
    simulationData: SimulationPoint[];
    finalStates?: CharacterState[];
    E?: number;
    Debt?: number;
};

// Helper to clip a value within a range
const clip = (val: number, min: number, max: number) => Math.max(min, Math.min(val, max));

export const useEntityMetrics = (
  entity: AnyEntity,
  paramValues: Record<string, number>,
  simulationDays: number
): MetricsResult => {
  return useMemo(() => {
    const relevantScenarios = scenarios.filter(s => s.supportedTypes.includes(entity.type));
    let snapshotMetrics: Omit<CalculatedMetrics, 'scenarioFitness' | 'simulationData' | 'E' | 'Debt' | 'analytics'>;
    let simulationData: SimulationPoint[];
    let finalStates: CharacterState[] | undefined = undefined;
    let initialState: CharacterState | undefined = undefined;
    let analytics: CalculatedMetrics['analytics'] | undefined = undefined;

    // --- TrustFactor Calculation ---
    const evidenceIds = entity.evidenceIds || [];
    const entityEvidence = evidenceIds.map(id => getEvidenceById(id)).filter(Boolean);
    let trustFactor = 1.0;
    if (entityEvidence.length > 0) {
        const alpha = 0.2, tau = 0.25;
        const reliabilitySum = entityEvidence.reduce((sum, ev) => {
            const source = getSourceById(ev!.source.id);
            // Assuming evidence weight w_e = 1 for all
            return sum + (source?.reliability || 0);
        }, 0);
        trustFactor = clip(1 + alpha * reliabilitySum, 1 - tau, 1 + tau);
    }
    

    if (entity.type === EntityType.Character) {
      const cfg: SimConfig = {
        horizonDays: simulationDays,
        dt: 0.25, // 4 steps per day
        ensemble: 64,
        rngSeed: 42,
      };
      
      const simOutput = simulateCharacter(paramValues, cfg, trustFactor);
      initialState = simOutput.initialState;
      analytics = simOutput.analytics;
      
      const initialS = formulas.calculateS(initialState.pv, initialState.vsigma, paramValues);
      const lambda_mon = formulas.calculateLambdaMon(paramValues, initialState.vsigma, initialState.darkness);
      const prMonstro = formulas.calculatePrMonstro(lambda_mon, simulationDays);

      snapshotMetrics = {
        dose: 0,
        Pv: initialState.pv,
        Vsigma: initialState.vsigma,
        S: initialS,
        drift: 0, // Drift is no longer part of the character model
        topo: paramValues.topo || 0,
        influence: initialState.influence,
        prMonstro: prMonstro,
        monster_veto: formulas.getMonsterVeto(initialState.vsigma, paramValues),
      };
      simulationData = simOutput.mean;
      finalStates = simOutput.finalStates;

    } else { // Default to Object (deterministic simulation)
      const E = paramValues.E || 0;
      const A_star = paramValues.A_star || 1;
      const dose = formulas.calculateDose(E, A_star);
      
      let currentDrift = 15;
      const objectSimData: SimulationPoint[] = [];
      for (let i = 0; i < simulationDays; i++) {
        const penalties = formulas.calculateDosePenalties(E, A_star);
        const Pv = formulas.calculateObjectPv(paramValues);
        const Vsigma = formulas.calculateObjectVsigma(paramValues, penalties);
        currentDrift = formulas.calculateObjectDrift(dose, currentDrift);
        const S = formulas.calculateS(Pv, Vsigma, { ...paramValues, drift: currentDrift }, 0);
        objectSimData.push({ day: i, S: parseFloat(S.toFixed(1)) });
      }
      simulationData = objectSimData;

      const penalties = formulas.calculateDosePenalties(E, A_star);
      const Pv = formulas.calculateObjectPv(paramValues);
      const Vsigma = formulas.calculateObjectVsigma(paramValues, penalties);

      snapshotMetrics = {
        dose,
        Pv,
        Vsigma,
        S: simulationData[0]?.S || 0,
        drift: 15, // initial drift
        topo: paramValues.topo || 0,
        influence: 0,
        prMonstro: 0,
        monster_veto: formulas.getMonsterVeto(Vsigma, paramValues),
      };
    }

    const scenarioFitness = relevantScenarios.map((scenario: Scenario) => ({
      ...scenario,
      ...scenario.calculateFitness(snapshotMetrics, paramValues)
    }));

    return {
      ...snapshotMetrics,
      E: initialState?.E,
      Debt: initialState?.Debt,
      analytics,
      scenarioFitness,
      simulationData,
      finalStates
    };
  // Using JSON.stringify for deep comparison of paramValues
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, JSON.stringify(paramValues), simulationDays]);
};