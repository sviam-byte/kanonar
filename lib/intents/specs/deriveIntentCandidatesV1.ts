import type { GoalEvalContext } from '../../goals/specs/evalTypes';
import type { DerivedGoalPressure } from '../../goal-lab/pipeline/deriveGoalPressuresV1';
import { INTENT_SPECS_V1 } from './registry';
import { evaluateIntentSpec } from './evaluateIntentSpec';
import type { DerivedIntentCandidateV1 } from './types';

/** Batch derivation entry point for Layer F. */
export function deriveIntentCandidatesV1(ctx: GoalEvalContext, goalPressures: DerivedGoalPressure[]): DerivedIntentCandidateV1[] {
  return INTENT_SPECS_V1
    .map((s) => evaluateIntentSpec(s, ctx, goalPressures))
    .filter((x) => x.active)
    .sort((a, b) => b.score - a.score);
}
