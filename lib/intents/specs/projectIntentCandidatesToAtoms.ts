import type { ContextAtom } from '../../context/v2/types';
import type { DerivedIntentCandidateV1 } from './types';

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function projectIntentCandidatesToAtoms(
  candidates: DerivedIntentCandidateV1[],
): ContextAtom[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  if (sorted.length === 0) return [];

  const atoms: ContextAtom[] = [];

  const top = sorted[0];
  atoms.push({
    id: 'intent:v1:top',
    kind: 'intent.top',
    source: 'system',
    ns: 'goal',
    origin: 'derived',
    magnitude: clamp01(top.score),
    label: top.intentId,
    tags: ['intent_v1', 'top_intent'],
    meta: {
      intentId: top.intentId,
      targetId: top.targetId ?? null,
      score: top.score,
      sourceGoalIds: top.sourceGoalIds,
      dialogueAct: top.dialogueAct ?? null,
      desiredEffect: top.desiredEffect ?? null,
    },
    trace: {
      notes: ['IntentSpecV1 top candidate projection'],
    },
  } as ContextAtom);

  for (const item of sorted) {
    atoms.push({
      id: `intent:v1:active:${item.intentId}`,
      kind: 'intent.active',
      source: 'system',
      ns: 'goal',
      origin: 'derived',
      magnitude: clamp01(item.score),
      label: item.intentId,
      tags: ['intent_v1', ...(item.tags ?? [])],
      targetId: item.targetId,
      meta: {
        intentId: item.intentId,
        targetId: item.targetId ?? null,
        score: item.score,
        sourceGoalIds: item.sourceGoalIds,
        reasons: item.reasons,
        groundingHints: item.groundingHints,
        dialogueAct: item.dialogueAct ?? null,
        desiredEffect: item.desiredEffect ?? null,
      },
      trace: {
        notes: ['Projected from IntentSpecV1 candidate'],
      },
    } as ContextAtom);
  }

  return atoms;
}
