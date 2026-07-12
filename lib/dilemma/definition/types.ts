import type {
  ActionUtilityBreakdown,
  ConflictAction,
  ConflictActionId,
  ConflictObservation,
  ConflictOutcome,
  ConflictPhase,
  ConflictPlayerId,
  ConflictProtocol,
  ConflictProtocolId,
  ConflictRole,
  ConflictState,
  ConflictStepOptions,
  ConflictStepResult,
  ConflictValidationError,
  Result,
} from '../dynamics/types';

// CONFLICT-DEFINITION-0: minimal immutable runtime contract for the existing
// trust_exchange kernel. The definition binds to lib/dilemma/dynamics/* and
// re-implements nothing; authoring schema and UI constructor are out of scope
// (docs/LAB_UNIFICATION_PLAN.md §11, docs/unification/CONFLICT_CHOICE_ADR_0.md).

export const CONFLICT_DEFINITION_SCHEMA_VERSION = 'conflict-definition-v1' as const;

export interface ConflictDefinitionTermination {
  // v1: the kernel state carries no terminal predicate; the host owns the
  // round budget (bridge runCanonicalConflictLab totalRounds, runner rounds).
  readonly kind: 'external_round_budget';
  readonly note: string;
}

export interface ConflictDefinition {
  readonly schemaVersion: typeof CONFLICT_DEFINITION_SCHEMA_VERSION;
  readonly protocolId: ConflictProtocolId;
  readonly playerCount: 2;
  readonly roles: readonly ConflictRole[];
  readonly phases: readonly ConflictPhase[];
  readonly actionIds: readonly ConflictActionId[];
  readonly termination: ConflictDefinitionTermination;

  createProtocol(players: readonly [ConflictPlayerId, ConflictPlayerId]): ConflictProtocol;
  observe(
    state: ConflictState,
    protocol: ConflictProtocol,
    playerId: ConflictPlayerId,
  ): Result<ConflictObservation, ConflictValidationError>;
  legalActions(
    protocol: ConflictProtocol,
    observation: ConflictObservation,
  ): readonly ConflictActionId[];
  validateJointAction(
    state: ConflictState,
    protocol: ConflictProtocol,
    jointActions: readonly ConflictAction[],
  ): Result<Readonly<Record<ConflictPlayerId, ConflictActionId>>, ConflictValidationError>;
  // Reference evaluator, NOT the canonical utility: CONFLICT-CHOICE-ADR-0 §1
  // assigns canonical utility to GoalLab S8 Q; this feeds the replicator
  // profile, dynamics tests and dual-run comparison.
  referenceUtilities(observation: ConflictObservation): readonly ActionUtilityBreakdown[];
  resolveOutcome(
    state: ConflictState,
    actions: Readonly<Record<ConflictPlayerId, ConflictActionId>>,
  ): ConflictOutcome;
  // Full validated kernel step. External (canonical) choice enters through
  // options.forcedJointActions — the seam fixed by CONFLICT-CHOICE-ADR-0 §3.
  step(
    state: ConflictState,
    protocol: ConflictProtocol,
    options?: ConflictStepOptions | readonly ConflictAction[],
  ): Result<ConflictStepResult, ConflictValidationError>;
}

// CONFLICT-GAP-0 §Proposed next contract: typed projection row that carries a
// legal kernel action into GoalLab candidate space without label heuristics.

export const CONFLICT_ACTION_PROJECTION_SCHEMA_VERSION = 'conflict-action-projection-v1' as const;

export interface ConflictActionProjectionProvenance {
  readonly source: 'conflict-kernel-observation';
  readonly tick: number;
  readonly historyLength: number;
}

export interface ConflictActionProjectionRow {
  readonly schemaVersion: typeof CONFLICT_ACTION_PROJECTION_SCHEMA_VERSION;
  readonly protocolId: ConflictProtocolId;
  readonly phaseId: ConflictPhase;
  readonly role: ConflictRole;
  readonly kernelActionId: ConflictActionId;
  readonly actorId: ConflictPlayerId;
  readonly targetIds: readonly ConflictPlayerId[];
  readonly legalSource: 'protocol_action_order';
  // Opaque deterministic candidate ID. Consumers must never parse it; entry
  // back into the kernel goes only through exact-match resolveProjectedChoice.
  readonly utilityCandidateId: string;
  readonly provenance: ConflictActionProjectionProvenance;
}

export interface ConflictProjectionError {
  readonly code: 'unknown_candidate';
  readonly message: string;
}
