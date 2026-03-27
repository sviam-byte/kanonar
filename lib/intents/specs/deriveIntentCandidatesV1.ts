import type { GoalEvalContext } from '../../goals/specs/evalTypes';
import type { DerivedGoalPressure } from '../../goal-lab/pipeline/deriveGoalPressuresV1';
import { INTENT_SPECS_V1 } from './registry';
import { evaluateIntentSpec } from './evaluateIntentSpec';
import type { DerivedIntentCandidateV1 } from './types';

/** Batch derivation entry point for Layer F. */
export function deriveIntentCandidatesV1(ctx: GoalEvalContext, goalPressures: DerivedGoalPressure[]): DerivedIntentCandidateV1[] {
  const candidates = INTENT_SPECS_V1
    .map((s) => evaluateIntentSpec(s, ctx, goalPressures))
    .filter((x) => x.active)
    .sort((a, b) => b.score - a.score);

  // Guarantee at least one candidate: if all intents blocked, inject pause as fallback
  if (candidates.length === 0) {
    candidates.push({
      intentId: 'pause',
      family: 'regulatory',
      label: 'Взять паузу',
      score: 0.01,
      active: true,
      groundingHints: ['wait', 'rest'],
      goalContribs: [],
      reasons: ['fallback_no_active_intents'],
      trace: { usedAtomIds: [], notes: ['Fallback: no intents survived filtering'], parts: {} },
    });
  }

  return candidates;
}
