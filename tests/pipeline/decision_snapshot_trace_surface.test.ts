import { describe, expect, it } from 'vitest';

import { runGoalLabPipelineV1 } from '@/lib/goal-lab/pipeline/runPipelineV1';
import { arr } from '@/lib/utils/arr';

import { mockWorld } from './fixtures';

describe('pipeline: decision snapshot surfaces explainability payload', () => {
  it('exports usedAtomIds / modifiers / notes for ranked and best actions', () => {
    const pipeline = runGoalLabPipelineV1({
      world: mockWorld(),
      agentId: 'A',
      participantIds: ['A'],
    });

    const s8 = arr((pipeline as any)?.stages).find((s: any) => String(s?.stage) === 'S8');
    const snapshot = (s8 as any)?.artifacts?.decisionSnapshot;

    expect(snapshot?.best).toBeTruthy();
    expect(Array.isArray(snapshot?.best?.usedAtomIds)).toBe(true);
    expect(Array.isArray(snapshot?.best?.notes)).toBe(true);
    expect(Array.isArray(snapshot?.best?.modifiers)).toBe(true);
    expect(snapshot?.best).toHaveProperty('why');
    expect(Array.isArray(snapshot?.ranked)).toBe(true);
    expect(snapshot?.ranked?.length).toBeGreaterThan(0);
  });
});
