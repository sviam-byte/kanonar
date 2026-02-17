import { describe, expect, it } from 'vitest';

import {
  buildFeatureVectorFromAtoms,
  buildPredictedWorldSummary,
  buildTransitionSnapshot,
} from '@/lib/goal-lab/pipeline/lookahead';

describe('lookahead subjective model', () => {
  it('uses neutral defaults for missing social/emotion features with provenance', () => {
    const fv = buildFeatureVectorFromAtoms({
      selfId: 'A',
      atoms: [],
      stageId: 'S9',
    });

    expect(fv.z.socialTrust).toBe(0.5);
    expect(fv.z.emotionValence).toBe(0.5);
    expect(fv.missing.socialTrust).toContain('ctx:final:socialTrust:A');
    expect(fv.provenanceByKey.socialTrust?.[0]?.note).toContain('defaulted to 0.5');
  });

  it('falls back to legacy value shape when goalEnergy is empty', () => {
    const args = {
      selfId: 'A',
      tick: 10,
      seed: 123,
      gamma: 0.7,
      riskAversion: 0.2,
      atoms: [],
      actions: [{ id: 'action:wait', kind: 'wait', qNow: 0 }],
    };

    const a = buildTransitionSnapshot({ ...args });
    const b = buildTransitionSnapshot({ ...args, goalEnergy: {} });

    expect(a.valueFn.v0).toBeCloseTo(b.valueFn.v0, 10);
    expect(a.valueFn.note).toContain('fallback: empty goalEnergy');
  });

  it('prefers socially positive action under social goal energy and exposes diagnostics', () => {
    const snapshot = buildTransitionSnapshot({
      selfId: 'A',
      tick: 1,
      seed: 999,
      gamma: 1,
      riskAversion: 0,
      atoms: [],
      goalEnergy: { social: 1 },
      actions: [
        { id: 'action:cooperate', kind: 'cooperate', qNow: 0 },
        { id: 'action:betray', kind: 'betray', qNow: 0 },
      ],
    });

    expect(snapshot.perAction[0]?.actionId).toBe('action:cooperate');
    expect(snapshot.perAction[0]?.v1PerGoal?.social).toBeGreaterThan(snapshot.perAction[1]?.v1PerGoal?.social ?? -1);
    expect(snapshot.sensitivity).toBeDefined();
    expect(snapshot.sensitivityZ0).toBeDefined();
    expect((snapshot.flipCandidates || []).length).toBeGreaterThan(0);

    const summary = buildPredictedWorldSummary(snapshot.perAction[0], snapshot.z0.z);
    expect(summary.actionId).toBe('action:cooperate');
    expect(summary.statements.length).toBeGreaterThan(0);
  });
});
