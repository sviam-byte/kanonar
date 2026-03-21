import { GOAL_SPECS_V1 } from '../../goals/specs/registry';
import type { GoalEvalContext } from '../../goals/specs/evalTypes';
import { evaluateGoalSpec } from '../../goals/specs/evaluateGoalSpec';

export interface DerivedGoalPressure {
  goalId: string;
  pressure: number;
  reasons: string[];
}

/**
 * Evaluates the canonical GoalSpecV1 registry and returns active pressures only.
 *
 * Legacy goal atoms remain untouched; this is an additive artifact stream to enable
 * incremental migration and side-by-side debugging.
 */
export function deriveGoalPressuresV1(ctx: GoalEvalContext): DerivedGoalPressure[] {
  return GOAL_SPECS_V1
    .map((spec) => evaluateGoalSpec(spec, ctx))
    .filter((result) => result.active)
    .sort((left, right) => right.pressure - left.pressure)
    .map((result) => ({
      goalId: result.goalId,
      pressure: result.pressure,
      reasons: result.reasons,
    }));
}
