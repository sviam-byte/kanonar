import { describe, expect, it } from 'vitest';

import type { ContextAtom } from '@/lib/context/v2/types';
import { deriveGoalActionLinkAtoms } from '@/lib/goals/goalActionLinksAtoms';
import { GOAL_DEFS } from '@/lib/goals/space';
import { mapGoalActionToPossibilityKeys } from '@/lib/goals/actionVocabularyBridge';

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

function findAnyGoalWithActionsAndDomains(): { goalId: string; action: string; domains: string[] } {
  for (const [goalId, def] of Object.entries(GOAL_DEFS)) {
    const actions = Array.isArray((def as any)?.allowedActions) ? (def as any).allowedActions : [];
    const domains = Array.isArray((def as any)?.domains) ? (def as any).domains : [];
    const ecoDomains = domains.map((d: any) => mapDomainToEcology(String(d))).filter(Boolean);
    if (actions.length > 0 && ecoDomains.length > 0) {
      return { goalId, action: String(actions[0]), domains: ecoDomains as string[] };
    }
  }
  throw new Error('Expected at least one GOAL_DEFS entry with allowedActions and mappable domains');
}

describe('deriveGoalActionLinkAtoms', () => {
  it('modulates link magnitude using matching goal:domain:* activations', () => {
    const selfId = 'A';
    const { goalId, action, domains } = findAnyGoalWithActionsAndDomains();

    const staticLink = deriveGoalActionLinkAtoms(selfId);
    const staticAtom = staticLink.atoms.find((a) => a.id === `goal:hint:allow:${goalId}:${action}`);
    expect(staticAtom).toBeDefined();

    const domainAtoms: ContextAtom[] = domains.map((domain) => ({
      id: `goal:domain:${domain}:${selfId}`,
      kind: 'goal_domain',
      ns: 'goal',
      source: 'test' as any,
      origin: 'derived',
      magnitude: 1,
      confidence: 1,
    }));

    const highLink = deriveGoalActionLinkAtoms(selfId, domainAtoms);
    const highAtom = highLink.atoms.find((a) => a.id === `goal:hint:allow:${goalId}:${action}`);
    expect(highAtom).toBeDefined();

    const lowContextAtoms: ContextAtom[] = domains.map((domain) => ({
      id: `goal:domain:${domain}:${selfId}`,
      kind: 'goal_domain',
      ns: 'goal',
      source: 'test' as any,
      origin: 'derived',
      magnitude: 0,
      confidence: 1,
    }));
    const lowContextLink = deriveGoalActionLinkAtoms(selfId, lowContextAtoms);
    const lowContextAtom = lowContextLink.atoms.find((a) => a.id === `goal:hint:allow:${goalId}:${action}`);

    expect(Number(staticAtom?.magnitude ?? 0)).toBeCloseTo(1, 6);
    expect(Number(highAtom?.magnitude ?? 0)).toBeCloseTo(1, 6);
    expect(Number(lowContextAtom?.magnitude ?? 0)).toBeCloseTo(0.3, 6);
    expect(Array.isArray(highAtom?.trace?.usedAtomIds)).toBe(true);
    expect(highAtom?.trace?.usedAtomIds?.length ?? 0).toBeGreaterThan(0);
  });

  it('observe maps to observe_area and observe_target', () => {
    const keys = mapGoalActionToPossibilityKeys('observe');
    expect(keys).toContain('observe_area');
    expect(keys).toContain('observe_target');
  });


  it('bridge has direct mappings for new possibility keys', () => {
    expect(mapGoalActionToPossibilityKeys('deceive')).toContain('deceive');
    expect(mapGoalActionToPossibilityKeys('submit')).toContain('submit');
    expect(mapGoalActionToPossibilityKeys('loot')).toContain('loot');
    expect(mapGoalActionToPossibilityKeys('betray')).toContain('betray');
  });

});
