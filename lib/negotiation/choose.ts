
// --- /lib/choice/policy.ts ---
import { AgentState, Action, ActiveGoal, Strategy, GoalMeta, CharacterEntity, EssenceEntity, Counterparty, Mission, EnvoyResult, EntityParams, NegotiationMetrics } from '../../types';
import { RNG, sampleGumbel } from '../core/noise';
import { simulateNegotiation } from './simulate';

// Helper function to get a parameter value or a default from the new nested structure
const getParam = (entity: CharacterEntity | EssenceEntity, key: string, defaultValue: number): number => {
    switch (key) {
        case 'will': return entity.state.will ?? defaultValue;
        case 'fatigue': return entity.body.acute.fatigue ?? defaultValue;
        case 'stress': return entity.body.acute.stress ?? defaultValue;
        // Safe access for competencies
        case 'competence_core': return entity.competencies?.competence_core ?? defaultValue;
        case 'intel_access': return entity.memory.visibility_zone ?? defaultValue;
        case 'accountability': return (1 - (entity.cognitive?.utility_shape?.risk_aversion ?? 0.5)) * 100;
        case 'Vsigma': return (entity as any).derived?.Vsigma ?? defaultValue;
        case 'public_scrutiny': return 0; // Deprecated, default to 0
        default:
            // Fallback for other deprecated params that might be in formulas - this will safely return defaultValue if parameters are gone
            const flatParams = (entity as any).parameters as {key: string, defaultValue: number}[];
            const param = flatParams?.find(p => p.key === key);
            return param?.defaultValue ?? defaultValue;
    }
};


export function rankEnvoys(
  candidates: (CharacterEntity | EssenceEntity)[], 
  cp: Counterparty, 
  mission: Mission,
  paramOverrides?: EntityParams
): EnvoyResult[] {
  return candidates
    .map(c => {
      // Create a flat param object for the simulation from the nested entity
      const charParams: EntityParams = {
          will: getParam(c, 'will', 50),
          fatigue: getParam(c, 'fatigue', 20),
          stress: getParam(c, 'stress', 40),
          competence_core: getParam(c, 'competence_core', 50),
          intel_access: getParam(c, 'intel_access', 50),
          accountability: getParam(c, 'accountability', 50),
          Vsigma: getParam(c, 'Vsigma', 30),
          public_scrutiny: getParam(c, 'public_scrutiny', 0),
          ...paramOverrides
      };
      
      const m = simulateNegotiation(charParams, cp, mission, 256);
      
      // score = E[Value] - RiskPenalty + StabilityBonus
      const score = m.expectedDealValue - 0.7 * m.cvar10 + 0.5 * m.postDelta.S30;
      
      return { id: c.entityId, entity: c, score, metrics: m };
    })
    .sort((a, b) => b.score - a.score);
}
