import { FC } from '../../config/formulaConfig';
import type { GoalEvalContext } from '../../goals/specs/evalTypes';
import { evaluateCondition } from '../../goals/specs/evaluateCondition';
import type { DerivedGoalPressure } from '../../goal-lab/pipeline/deriveGoalPressuresV1';
import type { DerivedIntentCandidateV1, IntentSpecV1 } from './types';

function clampRange(value: number, clamp?: [number, number]): number {
  if (!clamp) return value;
  return Math.max(clamp[0], Math.min(clamp[1], value));
}

export function evaluateIntentSpec(spec: IntentSpecV1, ctx: GoalEvalContext, goalPressures: DerivedGoalPressure[]): DerivedIntentCandidateV1 {
  const reasons: string[] = [];

  const arisesOk = !spec.arisesFrom?.length || spec.arisesFrom.some((c) => evaluateCondition(c, ctx));
  if (!arisesOk) {
    return { intentId: spec.id, label: spec.label, score: 0, active: false, goalContribs: [], reasons: ['no_trigger'], trace: { usedAtomIds: [], notes: ['intent inactive'], parts: {} } };
  }

  const blocked = spec.blockers?.some((c) => evaluateCondition(c, ctx)) ?? false;
  if (blocked) {
    return { intentId: spec.id, label: spec.label, score: 0, active: false, goalContribs: [], reasons: ['blocked'], trace: { usedAtomIds: [], notes: ['intent blocked'], parts: {} } };
  }

  let score = spec.scoreBase;
  for (const m of spec.scoreModifiers) {
    if (m.kind === 'weighted_metric') {
      score += clampRange(Number(ctx.metrics[m.metric] ?? 0) * m.weight, m.clamp);
    } else {
      const best = ctx.appraisals.filter((a) => a.tag === m.tag).reduce((acc, a) => Math.max(acc, Number(a.score ?? 0)), 0);
      score += clampRange(best * m.weight, m.clamp);
    }
  }

  const goalContribs = goalPressures
    .filter((g) => spec.allowedGoalIds.includes(g.goalId))
    .map((g) => ({
      goalId: g.goalId,
      pressure: Number(g.pressure ?? 0),
      contribution: Number(g.pressure ?? 0) * FC.intentSchema.intent.goalPressureWeight,
    }));

  for (const g of goalContribs) score += g.contribution;

  reasons.push('triggered', 'modifiers_applied', 'goal_pressure_bridge');

  return {
    intentId: spec.id,
    label: spec.label,
    score: Math.max(0, score),
    active: score > 0,
    goalContribs,
    reasons,
    trace: {
      usedAtomIds: [],
      notes: ['Derived via IntentSpecV1'],
      parts: { scoreBase: spec.scoreBase, goalContribs },
    },
  };
}
