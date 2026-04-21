import { describe, expect, it } from 'vitest';

import { runGoalLabPipelineV1 } from '@/lib/goal-lab/pipeline/runPipelineV1';
import { buildCanonicalGoalLabContract } from '@/lib/goal-lab/pipeline/buildCanonicalContract';
import { buildGoalLabSceneDumpV2 } from '@/lib/goal-lab/sceneDump';
import { arr } from '@/lib/utils/arr';
import {
  GOAL_LAB_PIPELINE_RUN_SCHEMA_VERSION,
  GOAL_LAB_PIPELINE_SCHEMA_VERSION,
  GOAL_LAB_SCENE_DUMP_SCHEMA_VERSION,
  GOAL_LAB_SNAPSHOT_SCHEMA_VERSION,
  KANONAR_SYSTEM_VERSION,
  isSupportedGoalLabSceneDumpSchemaVersion,
} from '@/lib/goal-lab/versioning';

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
    expect(pipeline.schemaVersion).toBe(GOAL_LAB_PIPELINE_SCHEMA_VERSION);
    expect(pipeline.systemVersion).toBe(KANONAR_SYSTEM_VERSION);
    expect(contract?.pipelineRun?.schemaVersion).toBe(GOAL_LAB_PIPELINE_RUN_SCHEMA_VERSION);
    expect(contract?.pipelineRun?.systemVersion).toBe(KANONAR_SYSTEM_VERSION);
    expect(contract?.snapshotV1?.selfId).toBe('A');
    expect(contract?.snapshotV1?.schemaVersion).toBe(GOAL_LAB_SNAPSHOT_SCHEMA_VERSION);
    expect(contract?.snapshotV1?.systemVersion).toBe(KANONAR_SYSTEM_VERSION);

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

  it('uses one shared system version across pipeline, snapshot, and scene dump contracts', () => {
    const world = mockWorld();
    const pipeline = runGoalLabPipelineV1({
      world,
      agentId: 'A',
      participantIds: ['A'],
      sceneControl: { enablePredict: true },
      observeLiteParams: { seed: 999 },
    } as any);

    const contract = buildCanonicalGoalLabContract(pipeline);
    const sceneDump = buildGoalLabSceneDumpV2({
      world,
      pipelineV1: pipeline,
      snapshotV1: contract?.snapshotV1,
      snapshot: contract?.snapshotV1,
      selectedAgentId: 'A',
      perspectiveId: 'A',
      participantIds: ['A'],
      selectedEventIds: new Set<string>(),
      castRows: [],
    });

    expect(sceneDump?.schemaVersion).toBe(GOAL_LAB_SCENE_DUMP_SCHEMA_VERSION);
    expect(sceneDump?.systemVersion).toBe(KANONAR_SYSTEM_VERSION);
    expect(isSupportedGoalLabSceneDumpSchemaVersion(sceneDump?.schemaVersion)).toBe(true);

    expect([
      pipeline.systemVersion,
      contract?.pipelineRun?.systemVersion,
      contract?.snapshotV1?.systemVersion,
      sceneDump?.systemVersion,
    ]).toEqual([
      KANONAR_SYSTEM_VERSION,
      KANONAR_SYSTEM_VERSION,
      KANONAR_SYSTEM_VERSION,
      KANONAR_SYSTEM_VERSION,
    ]);
  });
});
