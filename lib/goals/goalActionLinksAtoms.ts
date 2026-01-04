import type { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { clamp01 } from '../util/math';
import { GOAL_DEFS } from './space';

export function deriveGoalActionLinkAtoms(selfId: string): { atoms: ContextAtom[] } {
  const out: ContextAtom[] = [];

  for (const [goalId, def] of Object.entries(GOAL_DEFS)) {
    const acts = Array.isArray((def as any)?.allowedActions) ? (def as any).allowedActions : [];
    for (const act of acts) {
      const actionKey = String(act || '').trim();
      if (!actionKey) continue;

      // allow=1 означает “эта цель прямо поддерживает действие”
      out.push(normalizeAtom({
        id: `goal:hint:allow:${goalId}:${actionKey}`,
        ns: 'goal' as any,
        kind: 'goal_action_link',
        origin: 'derived',
        source: 'GOAL_DEFS.allowedActions',
        subject: selfId,
        magnitude: clamp01(1),
        confidence: 1,
        tags: ['goal', 'link', goalId, actionKey],
        label: `allow:${goalId}->${actionKey}`,
        trace: { usedAtomIds: [], notes: ['static link from GOAL_DEFS.allowedActions'], parts: { goalId, actionKey } }
      } as any));
    }
  }

  return { atoms: out };
}
