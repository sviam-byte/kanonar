export const KANONAR_SYSTEM_VERSION = '2026.04' as const;

export type KanonarSystemVersion = typeof KANONAR_SYSTEM_VERSION;

export const GOAL_LAB_PIPELINE_SCHEMA_VERSION = 1 as const;
export const GOAL_LAB_PIPELINE_RUN_SCHEMA_VERSION = 2 as const;
export const GOAL_LAB_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const GOAL_LAB_SCENE_DUMP_SCHEMA_VERSION = 3 as const;
export const GOAL_LAB_LEGACY_SCENE_DUMP_SCHEMA_VERSION = 2 as const;
export const GOAL_LAB_EXPLAIN_SCHEMA_VERSION = 1 as const;
export const GOAL_LAB_COVERAGE_SCHEMA_VERSION = 1 as const;
export const GOAL_LAB_REL_GRAPH_SCHEMA_VERSION = 1 as const;

export const GOAL_LAB_SUPPORTED_SCENE_DUMP_SCHEMA_VERSIONS = [
  GOAL_LAB_LEGACY_SCENE_DUMP_SCHEMA_VERSION,
  GOAL_LAB_SCENE_DUMP_SCHEMA_VERSION,
] as const;

export type GoalLabContractId =
  | 'goal-lab-pipeline-v1'
  | 'goal-lab-pipeline-run'
  | 'goal-lab-snapshot-v1'
  | 'goal-lab-scene-dump'
  | 'goal-lab-explain'
  | 'goal-lab-coverage';

export type GoalLabSceneDumpSchemaVersion =
  (typeof GOAL_LAB_SUPPORTED_SCENE_DUMP_SCHEMA_VERSIONS)[number];

export type GoalLabVersionStamp<
  TContract extends GoalLabContractId = GoalLabContractId,
  TSchemaVersion extends number = number,
> = {
  systemVersion: KanonarSystemVersion;
  contractId: TContract;
  schemaVersion: TSchemaVersion;
};

export function makeGoalLabVersionStamp<
  TContract extends GoalLabContractId,
  TSchemaVersion extends number,
>(contractId: TContract, schemaVersion: TSchemaVersion): GoalLabVersionStamp<TContract, TSchemaVersion> {
  return {
    systemVersion: KANONAR_SYSTEM_VERSION,
    contractId,
    schemaVersion,
  };
}

export function isSupportedGoalLabSceneDumpSchemaVersion(
  value: unknown,
): value is GoalLabSceneDumpSchemaVersion {
  return GOAL_LAB_SUPPORTED_SCENE_DUMP_SCHEMA_VERSIONS.includes(value as GoalLabSceneDumpSchemaVersion);
}
