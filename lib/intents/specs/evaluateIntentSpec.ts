import { FC } from '../../config/formulaConfig';
import type { GoalEvalContext } from '../../goals/specs/evalTypes';
import { evaluateCondition } from '../../goals/specs/evaluateCondition';
import type { DerivedGoalPressure } from '../../goal-lab/pipeline/deriveGoalPressuresV1';
import type { DerivedIntentCandidateV1, IntentSpecV1 } from './types';

function clampRange(value: number, clamp?: [number, number]): number {
  if (!clamp) return value;
  return Math.max(clamp[0], Math.min(clamp[1], value));
}

/**
 * Evaluate a single IntentSpec against context and active goal pressures.
 *
 * Now enforces:
 *   - prerequisites (Condition[]) — spatial/metric/appraisal gates
 *   - blockers (Condition[]) — suppression conditions
 *   - returns family, dialogueAct, desiredEffect, groundingHints in result
 */
export function evaluateIntentSpec(spec: IntentSpecV1, ctx: GoalEvalContext, goalPressures: DerivedGoalPressure[]): DerivedIntentCandidateV1 {
  const reasons: string[] = [];
  const family = spec.family ?? 'communicative';
  const groundingHints = spec.groundingHints ?? [];
  const emptyResult = (reason: string): DerivedIntentCandidateV1 => ({
    intentId: spec.id,
    family,
    label: spec.label,
    score: 0,
    active: false,
    goalContribs: [],
    groundingHints,
    reasons: [reason],
    trace: { usedAtomIds: [], notes: [`intent inactive: ${reason}`], parts: {} },
  });

  // Back-compat: old arisesFrom field
  const arisesFrom = spec.arisesFrom ?? [];
  const arisesOk = !arisesFrom.length || arisesFrom.some((c) => evaluateCondition(c, ctx));
  if (!arisesOk) return emptyResult('no_trigger');

  // New: prerequisites (all must hold)
  const prereqs = spec.prerequisites ?? [];
  if (prereqs.length && !prereqs.every((c) => evaluateCondition(c, ctx))) {
    return emptyResult('prerequisites_failed');
  }

  // Blockers (any fires → blocked)
  const blockers = spec.blockers ?? [];
  if (blockers.some((c) => evaluateCondition(c, ctx))) {
    return emptyResult('blocked');
  }

  // Score computation
  let score = spec.scoreBase;
  for (const m of spec.scoreModifiers) {
    if (m.kind === 'weighted_metric') {
      score += clampRange(Number(ctx.metrics[m.metric] ?? 0) * m.weight, m.clamp);
    } else if (m.kind === 'weighted_appraisal') {
      const best = ctx.appraisals.filter((a) => a.tag === m.tag).reduce((acc, a) => Math.max(acc, Number(a.score ?? 0)), 0);
      score += clampRange(best * m.weight, m.clamp);
    } else if (m.kind === 'constant') {
      score += m.value;
    }
  }

  // Goal pressure contribution
  const goalContribs = goalPressures
    .filter((g) => spec.allowedGoalIds.includes(g.goalId))
    .map((g) => ({
      goalId: g.goalId,
      pressure: Number(g.pressure ?? 0),
      contribution: Number(g.pressure ?? 0) * FC.intentSchema.intent.goalPressureWeight,
    }));
  for (const g of goalContribs) score += g.contribution;

  reasons.push('triggered', 'modifiers_applied', 'goal_pressure_bridge');
  if (prereqs.length) reasons.push('prerequisites_ok');
  reasons.push(...goalContribs.map((g) => `goal:${g.goalId}`));

  return {
    intentId: spec.id,
    family,
    label: spec.label,
    score: Math.max(0, score),
    active: score > 0,
    targetId: ctx.targetId ?? undefined,
    dialogueAct: spec.dialogueAct,
    desiredEffect: spec.desiredEffect,
    groundingHints,
    goalContribs,
    reasons,
    trace: {
      usedAtomIds: [],
      notes: ['Derived via IntentSpecV1 (enriched)'],
      parts: { scoreBase: spec.scoreBase, family, goalContribs },
    },
  };
}
