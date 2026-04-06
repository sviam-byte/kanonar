import { describe, expect, it } from 'vitest';

import { buildIntentLifecycleTrace, summarizeIntentForTrace } from '@/lib/simkit/core/intentLifecycle';

describe('intent trace summary helpers', () => {
  it('summarizes active intent with stage and staleness fields', () => {
    const activeIntent = {
      id: 'intent:A:1',
      lifecycleState: 'active',
      startedAtTick: 5,
      stageStartedAtTick: 6,
      lastProgressTick: 7,
      stageIndex: 0,
      intentScript: { stages: [{ kind: 'approach' }] },
      intent: { originalAction: { kind: 'negotiate', targetId: 'B' } },
    };

    const s = summarizeIntentForTrace(activeIntent, 9)!;
    expect(s.intentId).toBe('intent:A:1');
    expect(s.originalKind).toBe('negotiate');
    expect(s.originalTargetId).toBe('B');
    expect(s.stageKind).toBe('approach');
    expect(s.ticksSinceProgress).toBe(2);
    expect(typeof s.stale).toBe('boolean');
  });

  it('builds lifecycle patch with desired and suppressed actions', () => {
    const activeIntent = {
      id: 'intent:A:1',
      stageIndex: 0,
      intentScript: { stages: [{ kind: 'approach' }] },
      intent: { originalAction: { kind: 'negotiate', targetId: 'B' } },
    };

    const out = buildIntentLifecycleTrace({
      activeIntent,
      currentTick: 11,
      status: 'forced_continue',
      reason: 'critical_stage',
      desiredAction: { kind: 'threaten', targetId: 'B' },
      suppressedAction: { kind: 'threaten', targetId: 'B' },
    });

    expect(out.status).toBe('forced_continue');
    expect(out.reason).toBe('critical_stage');
    expect(out.activeIntent?.transactionalClass).toBe('dialogue');
    expect(out.suppressedAction?.kind).toBe('threaten');
  });
});
