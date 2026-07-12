import type { GoalLabPipelineV1 } from '../../goal-lab/pipeline/runPipelineV1';
import type { WorldState } from '../../../types';
import type {
  ConflictActionId,
  ConflictPhase,
  ConflictPlayerId,
  ConflictProtocolId,
  ConflictState,
  ConflictStepResult,
  ForcedActionStrategyMode,
} from '../dynamics/types';
import type { ConflictActionProjectionRow, ConflictDefinition } from '../definition/types';

// CONFLICT-INTEGRATION-0: canonical choice enters the kernel through the
// forcedJointActions seam; the policy is the versioned GoalLab S8 contract
// (docs/unification/CONFLICT_CHOICE_ADR_0.md §2, §3, §5).

export const CONFLICT_CHOICE_POLICY_ID = 'goal_lab_s8_gumbel' as const;
export const CONFLICT_CHOICE_POLICY_VERSION = 1 as const;
export const CONFLICT_JOINT_DECISION_SCHEMA_VERSION = 'conflict-joint-decision-v1' as const;
export const CONFLICT_CHOICE_TRACE_SCHEMA_VERSION = 'conflict-choice-trace-v1' as const;

export type ConflictTemperatureSource =
  | 'trait-atom'
  | 'world'
  | 'agent-behavioral'
  | 'agent'
  | 'default';

export interface ConflictPlayerDecisionInputV1 {
  /** Observer's completed GoalLab pipeline run (S8 atoms carry the beliefs). */
  pipeline: GoalLabPipelineV1 | null;
  world: WorldState;
  /**
   * Named seeded RNG channel. Fail-closed per CONFLICT-CHOICE-ADR-0 §6:
   * a missing channel is a validation error, never a silent fallback.
   */
  rng: (() => number) | { nextFloat: () => number } | null;
  rngChannelId: string;
}

export interface ConflictRankedCandidateTraceV1 {
  readonly utilityCandidateId: string;
  readonly kernelActionId: ConflictActionId;
  readonly q: number;
  readonly qUsed: number;
  readonly sampleNoise: number;
  readonly sampleScore: number;
  readonly inTieBand: boolean;
  readonly marginFromBest: number;
  readonly chosen: boolean;
}

export interface ConflictChoiceTraceV1 {
  readonly schemaVersion: typeof CONFLICT_CHOICE_TRACE_SCHEMA_VERSION;
  readonly policyId: typeof CONFLICT_CHOICE_POLICY_ID;
  readonly policyVersion: typeof CONFLICT_CHOICE_POLICY_VERSION;
  readonly playerId: ConflictPlayerId;
  readonly rngChannelId: string;
  readonly temperature: number;
  readonly temperatureSource: ConflictTemperatureSource;
  readonly topK: number;
  readonly protocolId: ConflictProtocolId;
  readonly phaseId: ConflictPhase;
  readonly projectedRows: readonly ConflictActionProjectionRow[];
  readonly ranked: readonly ConflictRankedCandidateTraceV1[];
  readonly chosenUtilityCandidateId: string;
  readonly kernelActionId: ConflictActionId;
  readonly usedAtomIds: readonly string[];
}

export interface ConflictJointDecisionReportV1 {
  readonly schemaVersion: typeof CONFLICT_JOINT_DECISION_SCHEMA_VERSION;
  readonly policyId: typeof CONFLICT_CHOICE_POLICY_ID;
  readonly policyVersion: typeof CONFLICT_CHOICE_POLICY_VERSION;
  readonly protocolId: ConflictProtocolId;
  readonly tick: number;
  readonly players: readonly ConflictPlayerId[];
  readonly choices: Readonly<Record<ConflictPlayerId, ConflictChoiceTraceV1>>;
  readonly canonical: {
    readonly forcedActionStrategyMode: ForcedActionStrategyMode;
    readonly actions: Readonly<Record<ConflictPlayerId, ConflictActionId>>;
    readonly step: ConflictStepResult;
  };
  /**
   * Dual-run lane (CONFLICT-CHOICE-ADR-0 §7): the kernel's internal
   * replicator+argmax policy computed side by side. Divergence is data,
   * never silently resolved.
   */
  readonly reference: {
    readonly actions: Readonly<Record<ConflictPlayerId, ConflictActionId>>;
    readonly step: ConflictStepResult;
  };
  readonly divergence: {
    readonly anyDifference: boolean;
    readonly byPlayer: Readonly<Record<ConflictPlayerId, {
      readonly canonicalActionId: ConflictActionId;
      readonly referenceActionId: ConflictActionId;
      readonly same: boolean;
    }>>;
  };
}

export interface ConflictIntegrationError {
  readonly code:
    | 'missing_pipeline'
    | 'missing_rng_channel'
    | 'missing_s8_stage'
    | 'empty_candidates'
    | 'projection_failed'
    | 'unknown_candidate'
    | 'kernel_step_failed';
  readonly playerId?: ConflictPlayerId;
  readonly message: string;
}

export interface ConflictJointDecisionArgsV1 {
  state: ConflictState;
  definition?: ConflictDefinition;
  players: Readonly<Record<ConflictPlayerId, ConflictPlayerDecisionInputV1>>;
  /**
   * Default 'learn_from_utility': the integrated transition keeps
   * memory/learning and replicator-profile dynamics alive (plan §11
   * CONFLICT-INTEGRATION-0; ADR §4 keeps the profile as a state artifact).
   */
  forcedActionStrategyMode?: ForcedActionStrategyMode;
}
