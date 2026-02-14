import { describe, expect, it } from 'vitest';

import { buildGoalLabContext } from '@/lib/goals/goalLabContext';
import { mockWorld } from '../pipeline/fixtures';

function decisionBestId(ctx: any): string {
  const best = (ctx as any)?.snapshot?.decision?.best;
  return String((best as any)?.id || (best as any)?.actionId || '');
}

describe('goalLabContext force_action override', () => {
  it('forces decision.best when overrideEvents contains force_action for self', () => {
    const world = mockWorld();
    const base = buildGoalLabContext(world as any, 'A', {}) as any;
    expect(base).toBeTruthy();

    const ranked = Array.isArray(base?.snapshot?.decision?.ranked)
      ? base.snapshot.decision.ranked
      : [];
    expect(ranked.length).toBeGreaterThan(0);

    const forcedActionId = String((ranked[ranked.length - 1]?.action?.id || ranked[0]?.action?.id || ''));
    expect(forcedActionId).not.toBe('');

    const forcedCtx = buildGoalLabContext(world as any, 'A', {
      snapshotOptions: {
        overrideEvents: [{ type: 'force_action', agentId: 'A', actionId: forcedActionId }],
      },
    }) as any;

    expect(forcedCtx).toBeTruthy();
    expect(decisionBestId(forcedCtx)).toBe(forcedActionId);

    const atoms = Array.isArray(forcedCtx?.snapshot?.decision?.atoms)
      ? forcedCtx.snapshot.decision.atoms
      : [];
    expect(atoms.some((a: any) => String(a?.id || '') === 'action:forced:A')).toBe(true);
  });

  it('ignores force_action for another agent', () => {
    const world = mockWorld();
    const base = buildGoalLabContext(world as any, 'A', {}) as any;
    expect(base).toBeTruthy();

    const baseBest = decisionBestId(base);
    const ranked = Array.isArray(base?.snapshot?.decision?.ranked)
      ? base.snapshot.decision.ranked
      : [];
    expect(ranked.length).toBeGreaterThan(0);

    const candidateId = String(ranked[ranked.length - 1]?.action?.id || '');
    expect(candidateId).not.toBe('');

    const otherAgentCtx = buildGoalLabContext(world as any, 'A', {
      snapshotOptions: {
        overrideEvents: [{ type: 'force_action', agentId: 'B', actionId: candidateId }],
      },
    }) as any;

    expect(otherAgentCtx).toBeTruthy();
    expect(decisionBestId(otherAgentCtx)).toBe(baseBest);
  });
});
