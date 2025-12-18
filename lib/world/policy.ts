
import { Policy, WorldState, AnyEntity, DecisionReport } from '../../types';

export interface PolicyEvalResult {
  policy: Policy;
  report: DecisionReport;
}

/**
 * Заглушка/скелет оценщика политик.
 * Позже сюда можно втащить твой sim/experiments.
 */
export function evaluatePolicies(
  world: WorldState,
  entities: AnyEntity[],
  policies: Policy[]
): PolicyEvalResult[] {
  // пока просто фейковая оценка:
  return policies.map((p) => ({
    policy: p,
    report: {
      policyId: p.id,
      deltaRisk: 0, // здесь потом будет реальный delta по S / Pr[collapse] / Pr[monstro]
      rationale: [],
    },
  }));
}
