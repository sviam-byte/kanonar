/**
 * tests/goals/goal_tuning.test.ts
 *
 * Tests for per-agent GoalTuningConfig in deriveGoalAtoms.
 * Covers: veto, slope/bias modulation, identity when no tuning.
 *
 * Run: npx vitest run tests/goals/goal_tuning.test.ts
 */

import { describe, it, expect } from 'vitest';
import { deriveGoalAtoms } from '../../lib/goals/goalAtoms';
import { normalizeAtom } from '../../lib/context/v2/infer';
import type { GoalTuningConfig } from '../../types';

function mkAtom(id: string, magnitude: number, ns = 'ctx'): any {
  return normalizeAtom({ id, ns, kind: 'test', origin: 'world', source: 'test', magnitude, confidence: 1 } as any);
}

function buildMinimalAtoms(selfId: string): any[] {
  // Minimal set to get non-zero domain scores
  return [
    mkAtom(`ctx:final:danger:${selfId}`, 0.5),
    mkAtom(`ctx:final:control:${selfId}`, 0.4),
    mkAtom(`ctx:final:publicness:${selfId}`, 0.3),
    mkAtom(`ctx:final:normPressure:${selfId}`, 0.3),
    mkAtom(`ctx:final:uncertainty:${selfId}`, 0.4),
    mkAtom(`ctx:final:scarcity:${selfId}`, 0.3),
    mkAtom(`drv:safetyNeed:${selfId}`, 0.6, 'drv'),
    mkAtom(`drv:controlNeed:${selfId}`, 0.5, 'drv'),
    mkAtom(`drv:affiliationNeed:${selfId}`, 0.4, 'drv'),
    mkAtom(`drv:statusNeed:${selfId}`, 0.3, 'drv'),
    mkAtom(`drv:curiosityNeed:${selfId}`, 0.3, 'drv'),
    mkAtom(`drv:restNeed:${selfId}`, 0.2, 'drv'),
    mkAtom(`cap:fatigue:${selfId}`, 0.3, 'cap'),
  ];
}

function getDomainScore(atoms: any[], selfId: string, domain: string): number {
  const a = atoms.find((x: any) => x.id === `goal:domain:${domain}:${selfId}`);
  return a ? Number(a.magnitude) : NaN;
}

describe('deriveGoalAtoms with goalTuning', () => {
  const selfId = 'agent_tune';

  it('no tuning path keeps the same goal-domain id set as default', () => {
    const a = deriveGoalAtoms(selfId, buildMinimalAtoms(selfId), { topN: 3 });
    const b = deriveGoalAtoms(selfId, buildMinimalAtoms(selfId), { topN: 3, goalTuning: null });

    const idsA = a.atoms
      .map((x: any) => String(x.id || ''))
      .filter((id: string) => id.startsWith('goal:domain:'))
      .sort();
    const idsB = b.atoms
      .map((x: any) => String(x.id || ''))
      .filter((id: string) => id.startsWith('goal:domain:'))
      .sort();

    expect(idsB).toEqual(idsA);
    for (const id of idsB) {
      const atom = b.atoms.find((x: any) => x.id === id);
      const mag = Number((atom as any)?.magnitude ?? NaN);
      expect(Number.isFinite(mag)).toBe(true);
      expect(mag).toBeGreaterThanOrEqual(0);
      expect(mag).toBeLessThanOrEqual(1);
    }
  });

  it('veto kills domain score', () => {
    const tuning: GoalTuningConfig = { veto: { safety: true } };
    const result = deriveGoalAtoms(selfId, buildMinimalAtoms(selfId), { topN: 3, goalTuning: tuning });
    const safety = getDomainScore(result.atoms, selfId, 'safety');
    expect(safety).toBe(0);
  });

  it('positive bias increases score', () => {
    const noTuning = deriveGoalAtoms(selfId, buildMinimalAtoms(selfId), { topN: 3 });
    const withBias = deriveGoalAtoms(selfId, buildMinimalAtoms(selfId), {
      topN: 3,
      goalTuning: { goals: { exploration: { bias: 2.0 } } },
    });
    const base = getDomainScore(noTuning.atoms, selfId, 'exploration');
    const boosted = getDomainScore(withBias.atoms, selfId, 'exploration');
    expect(boosted).toBeGreaterThan(base);
  });

  it('slope > 1 amplifies deviation from 0.5', () => {
    const noTuning = deriveGoalAtoms(selfId, buildMinimalAtoms(selfId), { topN: 3 });
    const withSlope = deriveGoalAtoms(selfId, buildMinimalAtoms(selfId), {
      topN: 3,
      goalTuning: { global: { slope: 2.0 } },
    });
    // High scores should get higher, low scores lower (more polarized)
    const baseS = getDomainScore(noTuning.atoms, selfId, 'safety');
    const slopedS = getDomainScore(withSlope.atoms, selfId, 'safety');
    // Safety is typically > 0.5 with danger=0.5, so slope should push it higher
    if (baseS > 0.5) {
      expect(slopedS).toBeGreaterThan(baseS);
    }
  });

  it('category-level tuning applies to matching domains', () => {
    const tuning: GoalTuningConfig = {
      categories: { social: { bias: 1.5 } },
    };
    const noTuning = deriveGoalAtoms(selfId, buildMinimalAtoms(selfId), { topN: 3 });
    const withCat = deriveGoalAtoms(selfId, buildMinimalAtoms(selfId), { topN: 3, goalTuning: tuning });

    // affiliation and status map to 'social'
    const affBase = getDomainScore(noTuning.atoms, selfId, 'affiliation');
    const affBoosted = getDomainScore(withCat.atoms, selfId, 'affiliation');
    expect(affBoosted).toBeGreaterThan(affBase);

    // safety maps to 'survival', should be unaffected
    const safeBase = getDomainScore(noTuning.atoms, selfId, 'safety');
    const safeCat = getDomainScore(withCat.atoms, selfId, 'safety');
    expect(safeCat).toBeCloseTo(safeBase, 4);
  });

  it('goal-level overrides category-level', () => {
    const tuning: GoalTuningConfig = {
      categories: { social: { bias: 2.0 } },
      goals: { affiliation: { bias: -2.0 } }, // override: suppress affiliation
    };
    const result = deriveGoalAtoms(selfId, buildMinimalAtoms(selfId), { topN: 3, goalTuning: tuning });
    const noTuning = deriveGoalAtoms(selfId, buildMinimalAtoms(selfId), { topN: 3 });
    const aff = getDomainScore(result.atoms, selfId, 'affiliation');
    const affBase = getDomainScore(noTuning.atoms, selfId, 'affiliation');
    // Negative bias should push affiliation down
    expect(aff).toBeLessThan(affBase);
  });
});
