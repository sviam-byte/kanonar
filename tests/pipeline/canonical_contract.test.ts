import { describe, expect, it } from 'vitest';

import { runGoalLabPipelineV1 } from '@/lib/goal-lab/pipeline/runPipelineV1';
import { buildCanonicalGoalLabContract } from '@/lib/goal-lab/pipeline/buildCanonicalContract';
import { arr } from '@/lib/utils/arr';

import { mockWorld } from './fixtures';

describe('pipeline canonical contract', () => {
  it('builds v2-facing canonical snapshot from staged pipeline output', () => {
    const pipeline = runGoalLabPipelineV1({
      world: mockWorld(),
      agentId: 'A',
      participantIds: ['A'],
      sceneControl: { enablePredict: true },
      observeLiteParams: { seed: 123 },
    } as any);

    const contract = buildCanonicalGoalLabContract(pipeline);
    expect(contract).toBeTruthy();
    expect(contract?.pipelineRun?.schemaVersion).toBe(2);
    expect(contract?.snapshotV1?.selfId).toBe('A');

    const stages = arr(pipeline?.stages);
    const finalStageAtoms = arr(stages[stages.length - 1]?.atoms);
    expect(contract?.snapshotV1?.atoms).toEqual(finalStageAtoms);
    expect((contract?.snapshotV1 as any)?.pipelineV1).toBe(pipeline);
  });

  it('surfaces decision and transition artifacts through the canonical snapshot', () => {
    const pipeline = runGoalLabPipelineV1({
      world: mockWorld(),
      agentId: 'A',
      participantIds: ['A'],
      sceneControl: { enablePredict: true, useLookaheadForChoice: true },
      observeLiteParams: { seed: 321 },
    } as any);

    const contract = buildCanonicalGoalLabContract(pipeline);
    const decision = (contract?.snapshotV1 as any)?.decision;

    expect(decision).toBeTruthy();
    expect(Array.isArray(decision?.ranked)).toBe(true);
    expect(decision?.best).toBeTruthy();
    expect(decision?.transitionSnapshot).toBeTruthy();
  });
});
