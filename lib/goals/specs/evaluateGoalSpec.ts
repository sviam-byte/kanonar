import type { GoalEvalContext } from './evalTypes';
import type { GoalPriorityRule, GoalSpecV1 } from './types';
import { evaluateCondition } from './evaluateCondition';

function clampRange(value: number, clamp?: [number, number]): number {
  if (!clamp) return value;
  return Math.max(clamp[0], Math.min(clamp[1], value));
}

function evalPriorityRule(rule: GoalPriorityRule, ctx: GoalEvalContext): number {
  switch (rule.kind) {
    case 'constant':
      return rule.value;

    case 'weighted_metric': {
      const raw = Number(ctx.metrics[rule.metric] ?? 0) * rule.weight;
      return clampRange(raw, rule.clamp);
    }

    case 'weighted_appraisal': {
      const best = ctx.appraisals
        .filter((a) => a.tag === rule.tag)
        .reduce((maxScore, a) => Math.max(maxScore, Number(a.score ?? 0)), 0);
      const raw = best * rule.weight;
      return clampRange(raw, rule.clamp);
    }

    default:
      return 0;
  }
}

export interface GoalPressureResult {
  goalId: string;
  active: boolean;
  pressure: number;
  reasons: string[];
}

/**
 * Evaluates one goal spec into an interpretable pressure record.
 *
 * Reasons are designed for explainability in Goal Lab artifacts and for future
 * migration diagnostics against legacy `lib/goals/space.ts` heuristics.
 */
export function evaluateGoalSpec(spec: GoalSpecV1, ctx: GoalEvalContext): GoalPressureResult {
  const reasons: string[] = [];

  const arises = spec.arisesFrom.length === 0
    ? true
    : spec.arisesFrom.some((c) => evaluateCondition(c, ctx));

  if (!arises) {
    return { goalId: spec.id, active: false, pressure: 0, reasons: ['no_trigger'] };
  }

  const preconditionsOk = spec.preconditions.every((c) => evaluateCondition(c, ctx));
  if (!preconditionsOk) {
    return { goalId: spec.id, active: false, pressure: 0, reasons: ['preconditions_failed'] };
  }

  const blocked = spec.blockers.some((c) => evaluateCondition(c, ctx));
  if (blocked) {
    return { goalId: spec.id, active: false, pressure: 0, reasons: ['blocked'] };
  }

  let pressure = spec.priorityBase;
  for (const rule of spec.priorityRules) {
    pressure += evalPriorityRule(rule, ctx);
  }

  reasons.push('triggered', 'preconditions_ok');

  return {
    goalId: spec.id,
    active: pressure > 0,
    pressure: Math.max(0, pressure),
    reasons,
  };
}
