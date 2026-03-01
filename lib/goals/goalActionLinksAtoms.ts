import type { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { clamp01 } from '../util/math';
import { GOAL_DEFS } from './space';
import { mapGoalActionToPossibilityKeys } from './actionVocabularyBridge';

/**
 * Map GOAL_DEFS domain strings to the goal ecology domain keys used by goalAtoms.
 * Mirrors the mapping in planningGoalAtoms.ts.
 */
function mapDomainToEcology(domain: string): string | null {
  const d = String(domain || '');
  if (d === 'survival') return 'safety';
  if (d === 'control') return 'control';
  if (d === 'rest') return 'rest';
  if (d === 'information') return 'exploration';
  if (d === 'group_cohesion' || d === 'attachment_care' || d === 'personal_bond' || d === 'social') return 'affiliation';
  if (d === 'status' || d === 'leader_legitimacy' || d === 'obedience' || d === 'self_expression' || d === 'autonomy') return 'status';
  if (d === 'ritual' || d === 'self_transcendence' || d === 'other') return 'order';
  return null;
}

/**
 * Derive goal→action link atoms with contextual magnitude.
 *
 * When `atoms` are provided, magnitude reflects the average activation of the
 * goal's ecological domains (from goal:domain:* atoms produced by S7).
 * When atoms are absent, falls back to magnitude=1 (static, backward-compat).
 */
export function deriveGoalActionLinkAtoms(
  selfId: string,
  atoms?: ContextAtom[],
): { atoms: ContextAtom[] } {
  const out: ContextAtom[] = [];

  // Build domain activation map from goal:domain:*:selfId atoms.
  const domainActivation = new Map<string, number>();
  if (atoms) {
    for (const a of atoms) {
      const id = String((a as any)?.id || '');
      // goal:domain:<ecoDomain>:<selfId>
      if (id.startsWith('goal:domain:') && id.endsWith(`:${selfId}`)) {
        const parts = id.split(':');
        if (parts.length >= 4) domainActivation.set(parts[2], clamp01(Number((a as any)?.magnitude ?? 0)));
      }
    }
  }

  for (const [goalId, def] of Object.entries(GOAL_DEFS)) {
    const acts = Array.isArray((def as any)?.allowedActions) ? (def as any).allowedActions : [];

    // Contextual magnitude: average activation of this goal's ecology domains.
    const domains: string[] = Array.isArray((def as any)?.domains) ? (def as any).domains : [];
    const ecoDomains = domains.map(mapDomainToEcology).filter(Boolean) as string[];
    const avgActivation = ecoDomains.length > 0
      ? ecoDomains.reduce((s, d) => s + (domainActivation.get(d) ?? 0.5), 0) / ecoDomains.length
      : 0.5;
    // Backward-compat: without contextual atoms keep static allow links at 1.
    // With atoms, floor at 0.3 so links never fully vanish; ceiling at 1.0.
    const mag = atoms ? clamp01(0.3 + 0.7 * avgActivation) : clamp01(1);

    const usedAtomIds = atoms
      ? ecoDomains
        .map(d => `goal:domain:${d}:${selfId}`)
        .filter(id => atoms.some(a => (a as any)?.id === id))
      : [];

    for (const act of acts) {
      const rawKey = String(act || '').trim();
      if (!rawKey) continue;

      // Bridge: emit hints for both original GOAL_DEFS keys and possibility keys.
      const allKeys = mapGoalActionToPossibilityKeys(rawKey);
      for (const actionKey of allKeys) {
        out.push(normalizeAtom({
        id: `goal:hint:allow:${goalId}:${actionKey}`,
        ns: 'goal' as any,
        kind: 'goal_action_link',
        origin: 'derived',
        source: 'GOAL_DEFS.allowedActions.contextual',
        subject: selfId,
        magnitude: mag,
        confidence: 1,
        tags: ['goal', 'link', goalId, actionKey],
        label: `allow:${goalId}->${actionKey}:${Math.round(mag * 100)}%`,
        trace: {
          usedAtomIds,
          notes: ['contextual link: magnitude = 0.3 + 0.7 * avg(domain activation)'],
          parts: { goalId, actionKey, avgActivation, ecoDomains },
        },
      } as any));
      }
    }
  }

  return { atoms: out };
}
