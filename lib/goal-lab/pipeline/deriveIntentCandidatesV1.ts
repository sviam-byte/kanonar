import type { GoalEvalContext } from '../../goals/specs/evalTypes';
import type { DerivedGoalPressure } from './deriveGoalPressuresV1';
import { INTENT_SPECS_V1 } from '../../intents/specs/registry';
import { evaluateIntentSpec } from '../../intents/specs/evaluateIntentSpec';
import type { DerivedIntentCandidateV1, IntentEvalContext } from '../../intents/specs/types';

export function deriveIntentCandidatesV1(
  goalCtx: GoalEvalContext,
  derivedGoalPressures: DerivedGoalPressure[],
): DerivedIntentCandidateV1[] {
  const goalPressures: Record<string, number> = {};
  for (const item of derivedGoalPressures) {
    goalPressures[item.goalId] = Number(item.pressure ?? 0);
  }

  const ctx: IntentEvalContext = {
    ...goalCtx,
    goalPressures,
  };

  return INTENT_SPECS_V1
    .map((spec) => evaluateIntentSpec(spec, ctx))
    .filter((result) => result.active && result.candidate)
    .map((result) => result.candidate as DerivedIntentCandidateV1)
    .sort((left, right) => right.score - left.score);
}
