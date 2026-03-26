import { clamp01 } from '../../util/math';
import { evaluateCondition } from '../../goals/specs/evaluateCondition';
import type { DerivedIntentCandidateV1, IntentEvalContext, IntentPriorityRule, IntentSpecV1 } from './types';

function clampMaybe(x: number, clamp?: [number, number]): number {
  if (!clamp) return x;
  return Math.max(clamp[0], Math.min(clamp[1], x));
}

function evalPriorityRule(rule: IntentPriorityRule, ctx: IntentEvalContext): number {
  switch (rule.kind) {
    case 'constant':
      return rule.value;

    case 'weighted_metric': {
      const raw = (ctx.metrics[rule.metric] ?? 0) * rule.weight;
      return clampMaybe(raw, rule.clamp);
    }

    case 'weighted_appraisal': {
      const best = ctx.appraisals
        .filter((a) => a.tag === rule.tag)
        .reduce((m, a) => Math.max(m, a.score), 0);
      const raw = best * rule.weight;
      return clampMaybe(raw, rule.clamp);
    }

    case 'weighted_goal': {
      const raw = (ctx.goalPressures[rule.goalId] ?? 0) * rule.weight;
      return clampMaybe(raw, rule.clamp);
    }

    default:
      return 0;
  }
}

export interface IntentEvalResult {
  active: boolean;
  candidate: DerivedIntentCandidateV1 | null;
}

export function evaluateIntentSpec(
  spec: IntentSpecV1,
  ctx: IntentEvalContext,
): IntentEvalResult {
  const sourceGoalIds = spec.sourceGoals.filter((goalId) => (ctx.goalPressures[goalId] ?? 0) > 0);
  if (sourceGoalIds.length === 0) {
    return { active: false, candidate: null };
  }

  const preconditionsOk = spec.preconditions.every((c) => evaluateCondition(c, ctx));
  if (!preconditionsOk) {
    return { active: false, candidate: null };
  }

  const blocked = spec.blockers.some((c) => evaluateCondition(c, ctx));
  if (blocked) {
    return { active: false, candidate: null };
  }

  let score = spec.priorityBase;
  for (const rule of spec.priorityRules) {
    score += evalPriorityRule(rule, ctx);
  }

  // Small stabilizer: intent score should reflect source goal support.
  const strongestGoal = sourceGoalIds.reduce((m, goalId) => Math.max(m, ctx.goalPressures[goalId] ?? 0), 0);
  score += clamp01(strongestGoal) * 0.15;

  score = Math.max(0, score);

  if (score <= 0) {
    return { active: false, candidate: null };
  }

  return {
    active: true,
    candidate: {
      intentId: spec.id,
      family: spec.family,
      score,
      sourceGoalIds,
      targetId: spec.targeting === 'other' || spec.targeting === 'optional_other' ? ctx.targetId : undefined,
      reasons: [
        ...sourceGoalIds.map((goalId) => `goal:${goalId}`),
        'preconditions_ok',
      ],
      groundingHints: [...(spec.groundingHints ?? [])],
      dialogueAct: spec.dialogueAct,
      desiredEffect: spec.desiredEffect,
      tags: [...(spec.tags ?? [])],
    },
  };
}
