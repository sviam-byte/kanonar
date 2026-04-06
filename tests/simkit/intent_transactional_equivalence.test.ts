import { describe, expect, it } from 'vitest';

import { getIntentStaleness, isTransactionallyEquivalentAction } from '@/lib/simkit/core/intentLifecycle';

describe('intent transactional equivalence', () => {
  it('treats negotiate/talk/question_about on same target as one dialogue transaction', () => {
    const activeIntent = {
      startedAtTick: 10,
      stageIndex: 0,
      intentScript: { stages: [{ kind: 'approach' }] },
      intent: { originalAction: { kind: 'negotiate', targetId: 'B' } },
    };

    expect(isTransactionallyEquivalentAction(activeIntent, { kind: 'talk', actorId: 'A', targetId: 'B' } as any)).toBe(true);
    expect(isTransactionallyEquivalentAction(activeIntent, { kind: 'question_about', actorId: 'A', targetId: 'B' } as any)).toBe(true);
    expect(isTransactionallyEquivalentAction(activeIntent, { kind: 'threaten', actorId: 'A', targetId: 'B' } as any)).toBe(false);
    expect(isTransactionallyEquivalentAction(activeIntent, { kind: 'talk', actorId: 'A', targetId: 'C' } as any)).toBe(false);
  });

  it('marks stale approach when no progress is recorded for too long', () => {
    const activeIntent = {
      startedAtTick: 10,
      stageStartedAtTick: 10,
      lastProgressTick: 10,
      stageIndex: 0,
      intentScript: { stages: [{ kind: 'approach' }] },
      intent: { originalAction: { kind: 'negotiate', targetId: 'B' } },
    };

    const s = getIntentStaleness(activeIntent, 13);
    expect(s.stageKind).toBe('approach');
    expect(s.stale).toBe(true);
    expect(s.ticksSinceProgress).toBeGreaterThanOrEqual(2);
  });
});
