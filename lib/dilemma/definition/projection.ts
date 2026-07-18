import type {
  ConflictAction,
  ConflictObservation,
  ConflictPlayerId,
  ConflictProtocol,
  ConflictState,
  ConflictValidationError,
  Result,
} from '../dynamics/types';
import type {
  ConflictActionProjectionRow,
  ConflictDefinition,
  ConflictProjectionError,
} from './types';
import { CONFLICT_ACTION_PROJECTION_SCHEMA_VERSION } from './types';

// Typed projection of legal kernel actions into GoalLab candidate space
// (CONFLICT-GAP-0 §Proposed next contract). The projection reads only typed
// kernel IDs from a kernel observation — display labels and localization are
// not inputs and must never affect the rows.

export function conflictUtilityCandidateIdV1(input: {
  readonly protocolId: string;
  readonly phaseId: string;
  readonly actorId: string;
  readonly targetIds: readonly string[];
  readonly tick: number;
  readonly historyLength: number;
  readonly kernelActionId: string;
}): string {
  // Opaque tuple encoding: arbitrary delimiters inside IDs cannot collapse
  // two different projection rows to the same candidate ID.
  return JSON.stringify([
    'conflict',
    CONFLICT_ACTION_PROJECTION_SCHEMA_VERSION,
    input.protocolId,
    input.phaseId,
    input.actorId,
    input.targetIds,
    input.tick,
    input.historyLength,
    input.kernelActionId,
  ]);
}

function candidateId(
  observation: ConflictObservation,
  kernelActionId: string,
  tick: number,
): string {
  return conflictUtilityCandidateIdV1({
    protocolId: observation.protocolId,
    phaseId: observation.phase,
    actorId: observation.playerId,
    targetIds: [observation.otherId],
    tick,
    historyLength: observation.historyLength,
    kernelActionId,
  });
}

export function projectLegalActions(
  definition: ConflictDefinition,
  state: ConflictState,
  protocol: ConflictProtocol,
  actorId: ConflictPlayerId,
): Result<readonly ConflictActionProjectionRow[], ConflictValidationError> {
  const observed = definition.observe(state, protocol, actorId);
  if (observed.ok === false) return observed;
  const observation = observed.value;

  const rows = definition.legalActions(protocol, observation).map((kernelActionId): ConflictActionProjectionRow => ({
    schemaVersion: CONFLICT_ACTION_PROJECTION_SCHEMA_VERSION,
    protocolId: observation.protocolId,
    phaseId: observation.phase,
    role: observation.role,
    kernelActionId,
    actorId: observation.playerId,
    targetIds: [observation.otherId],
    legalSource: 'protocol_action_order',
    utilityCandidateId: candidateId(observation, kernelActionId, state.tick),
    provenance: {
      source: 'conflict-kernel-observation',
      tick: state.tick,
      historyLength: observation.historyLength,
    },
  }));

  return { ok: true, value: rows };
}

// Fail-closed gate back into the kernel: only a candidate ID that exactly
// matches a projected row may become a ConflictAction. Unknown, foreign or
// stale IDs are rejected; the kernel's validateJointAction stays the final
// authority after this gate.
export function resolveProjectedChoice(
  rows: readonly ConflictActionProjectionRow[],
  utilityCandidateId: string,
): Result<ConflictAction, ConflictProjectionError> {
  const row = rows.find((r) => r.utilityCandidateId === utilityCandidateId);
  if (!row) {
    return {
      ok: false,
      error: {
        code: 'unknown_candidate',
        message: `Candidate ${utilityCandidateId} does not match any projected legal action`,
      },
    };
  }
  return { ok: true, value: { playerId: row.actorId, actionId: row.kernelActionId } };
}

export function resolveProjectedJointChoice(
  choices: readonly { rows: readonly ConflictActionProjectionRow[]; utilityCandidateId: string }[],
): Result<readonly ConflictAction[], ConflictProjectionError> {
  const actions: ConflictAction[] = [];
  for (const choice of choices) {
    const resolved = resolveProjectedChoice(choice.rows, choice.utilityCandidateId);
    if (resolved.ok === false) return resolved;
    actions.push(resolved.value);
  }
  return { ok: true, value: actions };
}
