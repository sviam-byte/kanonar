import type { ActionImpact } from '../learningMemory';
import type { ConflictActionId } from './types';

export const ZERO_ACTION_IMPACT: ActionImpact = {
  support: 0,
  harm: 0,
  betrayal: 0,
  deception: 0,
  repair: 0,
  dominance: 0,
  submission: 0,
  withdrawal: 0,
  humiliation: 0,
  protection: 0,
};

export function actionImpactForTrustExchange(actionId: ConflictActionId): ActionImpact {
  switch (actionId) {
    case 'trust':
      return { ...ZERO_ACTION_IMPACT, support: 0.72, repair: 0.18, submission: 0.10 };
    case 'withhold':
      return { ...ZERO_ACTION_IMPACT, withdrawal: 0.55, protection: 0.35 };
    case 'betray':
      return { ...ZERO_ACTION_IMPACT, betrayal: 1.0, deception: 0.70, harm: 0.50, dominance: 0.35, humiliation: 0.20, threat: 0.55 };
    default:
      return ZERO_ACTION_IMPACT;
  }
}
