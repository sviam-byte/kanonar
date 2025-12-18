
import { ScenarioDef, EntityType, AnyEntity, CharacterEntity, CalculatedMetrics, AgentState, FitnessScenario } from '../types';

// Alias Scenario to ScenarioDef for compatibility if needed, or update usage.
// In types.ts we aliased Scenario to ScenarioDef, so we can import Scenario from types directly.

type CheckResult = { description: string, passed: boolean };
type FitnessMetrics = Omit<CalculatedMetrics, 'scenarioFitness' | 'simulationData'>;

// Helpers for normalization
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const normProb = (p: number) => clamp01(p);
const normScore100 = (s: number) => clamp01(s / 100);

// Helper to scale a value's contribution to a score based on a target.
// If value >= target, contribution is 1. Below target, it scales down.
const scaleToTarget = (value: number, target: number, scale: number = 0.5) => {
    const t = target > 1 ? normScore100(target) : target; // Ensure target is normalized if passed as >1
    const v = value > 1 ? normScore100(value) : value;
    
    if (t === 0) return 1; // Avoid division by zero
    const ratio = Math.min(1, v / t);
    return ratio >= 1 ? 1 : Math.pow(ratio, scale);
};

// Helper for inverse scaling (lower is better)
const scaleFromTarget = (value: number, target: number, scale: number = 0.5) => {
    const t = target > 1 ? normScore100(target) : target;
    const v = value > 1 ? normScore100(value) : value;
    
    if (v <= t) return 1;
    const overflow = (v - t) / (1 - t);
    return 1 - Math.min(1, Math.pow(overflow, scale));
}


export const scenarios: FitnessScenario[] = [
  // --- CHARACTER SCENARIOS ---
  {
    key: 'negotiation_ready',
    title: 'Готов к переговорам',
    supportedTypes: [EntityType.Character, EntityType.Essence],
    calculateFitness: (entity: AnyEntity, metrics: FitnessMetrics, params: Record<string, number>) => {
      const char = entity as CharacterEntity;
      // Check if character has oaths array and verify oath
      // Use safe navigation or default
      const hasOath = char.identity?.oaths?.some((o: any) => o.key === 'no_ex_nihilo') ?? false;
      
      // Negotiation readiness based on metrics
      const tomQ = metrics.tomMetrics?.toM_Quality ?? 0;
      const agency = metrics.v42metrics?.Agency_t ?? 0;
      const stress = metrics.stress ?? 0;

      let score = 0;
      score += scaleToTarget(tomQ, 0.6) * 0.4;
      score += scaleToTarget(agency, 0.5) * 0.3;
      score += scaleFromTarget(stress, 40) * 0.3;

      const passed = score > 0.7;

      return {
        score: score * 100,
        status: passed ? 'ok' : 'fail',
        checks: [
            { description: `ToM Quality ≥ 0.6`, passed: tomQ >= 0.6 },
            { description: `Agency ≥ 0.5`, passed: agency >= 0.5 },
            { description: `Stress ≤ 40`, passed: stress <= 40 },
        ]
      };
    },
  }, 
  {
    key: 'repair_no_monster',
    title: 'Ремонт (без монстра)',
    supportedTypes: [EntityType.Character, EntityType.Essence],
    calculateFitness: (entity: AnyEntity, metrics: FitnessMetrics, params: Record<string, number>) => {
      const char = entity as CharacterEntity;
      const hasOath = char.identity?.oaths?.some((o: any) => o.key === 'no_ex_nihilo') ?? false;
      
      const topoAff = normScore100(params['competencies.topo_affinity'] ?? 0);
      const causalSens = normScore100(params['competencies.causal_sensitivity'] ?? 0);
      const prMonstro = normProb(metrics.prMonstro ?? 0);

      const checks = [
        { description: `Топо-чуткость ≥ 0.65`, value: topoAff, target: 0.65, weight: 0.4 },
        { description: `Каузальная чувствительность ≥ 0.7`, value: causalSens, target: 0.7, weight: 0.3 },
        { description: `P(Монстр) ≤ 0.2`, value: prMonstro, target: 0.2, weight: 0.3, invert: true },
        { description: `Клятва 'no_ex_nihilo'`, value: hasOath ? 1 : 0, target: 1, weight: 0.2 } 
      ];
      
      let weightedScore = 0;
      let totalWeight = 0;
      
      weightedScore += scaleToTarget(topoAff, 0.65) * 0.4; totalWeight += 0.4;
      weightedScore += scaleToTarget(causalSens, 0.7) * 0.3; totalWeight += 0.3;
      weightedScore += scaleFromTarget(prMonstro, 0.2) * 0.3; totalWeight += 0.3;
      weightedScore += (hasOath ? 1 : 0) * 0.2; totalWeight += 0.2;

      const score = (weightedScore / totalWeight) * 100;
      const passed = score > 85 && !!hasOath;
      
      return {
        score,
        status: passed ? 'ok' : 'fail',
        checks: [
            { description: `Топо-чуткость ≥ 0.65`, passed: topoAff >= 0.65 },
            { description: `Каузальная чувствительность ≥ 0.7`, passed: causalSens >= 0.7 },
            { description: `P(Монстр) ≤ 0.2`, passed: prMonstro <= 0.2 },
            { description: `Клятва 'no_ex_nihilo'`, passed: hasOath },
        ]
      };
    },
  },
  {
    key: 'scenario_negotiator_under_pressure',
    title: 'Переговорщик под давлением',
    supportedTypes: [EntityType.Character, EntityType.Essence],
    calculateFitness: (entity: AnyEntity, metrics: FitnessMetrics, params: Record<string, number>) => {
        const char = entity as AgentState;
        const tomQ = metrics.tomMetrics?.toM_Quality ?? 0;
        const tomU = metrics.tomMetrics?.toM_Unc ?? 1;
        const phase = char.archetype?.phase || 'normal';
        
        const care = normScore100(params['vector_base.ARCH_CARE'] ?? 50);
        const manip = normScore100(params['vector_base.ARCH_MANIP'] ?? 50);

        let score = 0;
        score += scaleToTarget(tomQ, 0.7) * 0.3;
        score += scaleFromTarget(tomU, 0.3) * 0.3;
        score += scaleToTarget(care, 0.4) * 0.2;
        score += scaleFromTarget(manip, 0.8) * 0.2;

        const phasePenalty = (phase === 'break' || phase === 'radical') ? 0.5 : 1.0;
        score *= phasePenalty;

        const passed = score > 0.75;

        return {
            score: score * 100,
            status: passed ? 'ok' : 'fail',
            checks: [
                { description: `ToM Quality ≥ 0.7`, passed: tomQ >= 0.7 },
                { description: `ToM Uncertainty ≤ 0.3`, passed: tomU <= 0.3 },
                { description: `Фаза не break/radical`, passed: phase !== 'break' && phase !== 'radical' },
                { description: `CARE умеренный`, passed: care >= 0.4 },
                { description: `MANIP не зашкаливает`, passed: manip <= 0.8 }
            ]
        }
    }
  },
  {
    key: 'scenario_breakdown',
    title: 'Риск Срыва (Диагностика)',
    supportedTypes: [EntityType.Character, EntityType.Essence],
    calculateFitness: (entity: AnyEntity, metrics: FitnessMetrics, params: Record<string, number>) => {
        const char = entity as AgentState;
        const stress = normScore100(params['body.acute.stress'] ?? 0);
        const phase = char.archetype?.phase || 'normal';
        const shadowProb = char.archetype?.shadowActivation ?? 0;

        // Score here represents RISK (higher is worse for the character, but 'success' for the scenario check of identifying risk)
        // We want to highlight high risk.
        
        let riskScore = 0;
        riskScore += scaleToTarget(stress, 0.8) * 0.4;
        riskScore += (phase === 'break' || phase === 'radical') ? 0.3 : 0;
        riskScore += scaleToTarget(shadowProb, 0.7) * 0.3;
        
        const passed = riskScore > 0.7; // High risk detected

        return {
            score: riskScore * 100,
            status: passed ? 'warn' : 'ok', // Warn if risk is high
            checks: [
                { description: `Стресс > 0.8`, passed: stress > 0.8 },
                { description: `Фаза break/radical`, passed: phase === 'break' || phase === 'radical' },
                { description: `Активация Тени > 0.7`, passed: shadowProb > 0.7 }
            ]
        };
    }
  },

  // --- OBJECT SCENARIOS ---
  {
    key: 'stable_deployment',
    title: 'Стабильное развёртывание',
    supportedTypes: [EntityType.Object],
    calculateFitness: (entity: AnyEntity, metrics: FitnessMetrics, params: Record<string, number>) => {
      const { S, Vsigma } = metrics;
      const sNorm = normScore100(S);
      const vNorm = normScore100(Vsigma);

      let weightedScore = 0;
      weightedScore += scaleToTarget(sNorm, 0.6) * 0.6;
      weightedScore += scaleFromTarget(vNorm, 0.5) * 0.4;
      
      const passed = sNorm > 0.6 && vNorm < 0.5;

      return {
        score: weightedScore * 100,
        status: passed ? 'ok' : 'fail',
        checks: [
            { description: `Стабильность (S) > 60`, passed: S > 60 },
            { description: `Хаотичность (Vσ) < 50`, passed: Vsigma < 50 },
        ]
      };
    },
  },
];
