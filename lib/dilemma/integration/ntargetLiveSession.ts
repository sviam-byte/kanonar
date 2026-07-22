import type { WorldState } from '../../../types';
import { computeScheduledPressure } from '../dynamics/bridge';
import type { ConflictPlayerId, Result, TrajectoryMetrics } from '../dynamics/types';
import { getScenario } from '../scenarios';
import type { PressureSchedule } from '../types';
import {
  validateConflictDefinitionV3,
  type ConflictDefinitionV3,
} from '../definition/conflictDefinitionV3';
import type { ParticipantSetErrorV1 } from '../definition/participantSet';
import { trajectoryMetricsNV1 } from '../nkernel/nanalysis';
import {
  buildTrustExchangeProtocolNV1,
  normalizeConflictStateNV1,
  participantSetFromConflictPlayersV1,
  trustExchangeDefinitionNV1,
} from '../nkernel/nstate';
import type { ConflictStateNV1 } from '../nkernel/types';
import type {
  ConflictTargetMatrixHistoryEventV1,
  ConflictTargetMatrixStateV1,
} from '../nkernel/ntargetstep';
import { MAX_CONFLICT_LIVE_ROUNDS_V1 } from './liveSession';
import {
  buildCanonicalInitialStateNV1,
  worldForTickNV1,
} from './nliveSession';
import {
  runConflictTargetMatrixDecisionV1,
  type ConflictTargetMatrixDecisionReportV1,
  type ConflictTargetMatrixIntegrationErrorV1,
  type ConflictTargetMatrixPlayerDecisionInputV1,
} from './targetMatrixDecisionProvider';
import { CONFLICT_CHOICE_POLICY_ID, CONFLICT_CHOICE_POLICY_VERSION } from './types';

export const CONFLICT_TARGET_MATRIX_LIVE_SESSION_SCHEMA_VERSION = 'conflict-target-matrix-live-session-v1' as const;

export interface ConflictTargetMatrixLabSessionConfigV1 {
  readonly scenarioId: string;
  readonly players: readonly string[];
  readonly totalRounds: number;
  readonly world: WorldState;
  readonly seed?: number;
  readonly institutionalPressure?: number;
  readonly pressureSchedule?: PressureSchedule;
  readonly definition?: ConflictDefinitionV3;
}

export type ConflictTargetMatrixLabSessionErrorV1 =
  | { readonly code: 'unsupported_mechanic'; readonly mechanicId: string; readonly message: string }
  | { readonly code: 'invalid_participants'; readonly causeCode: ParticipantSetErrorV1['code']; readonly message: string }
  | { readonly code: 'invalid_round_budget'; readonly totalRounds: number; readonly min: 1; readonly max: typeof MAX_CONFLICT_LIVE_ROUNDS_V1; readonly message: string }
  | { readonly code: 'invalid_definition'; readonly message: string }
  | { readonly code: 'agent_not_found'; readonly playerId: string; readonly message: string }
  | { readonly code: 'initial_state_failed'; readonly causeCode: string; readonly message: string }
  | { readonly code: 'state_normalization_failed'; readonly causeCode: string; readonly message: string }
  | { readonly code: 'analysis_failed'; readonly message: string }
  | {
    readonly code: 'decision_failed';
    readonly round: number;
    readonly cause: ConflictTargetMatrixIntegrationErrorV1;
    readonly message: string;
  };

export interface ConflictTargetMatrixLabSessionReportV1 {
  readonly schemaVersion: typeof CONFLICT_TARGET_MATRIX_LIVE_SESSION_SCHEMA_VERSION;
  readonly runtime: 'canonical_goal_lab_s8_target_matrix';
  readonly policyId: typeof CONFLICT_CHOICE_POLICY_ID;
  readonly policyVersion: typeof CONFLICT_CHOICE_POLICY_VERSION;
  readonly scenarioId: string;
  readonly players: readonly ConflictPlayerId[];
  readonly totalRounds: number;
  readonly seed: number;
  readonly definitionSource: 'default_trust_exchange_all_others' | 'caller_override';
  readonly initialState: ConflictTargetMatrixStateV1;
  readonly finalState: ConflictTargetMatrixStateV1;
  readonly decisions: readonly ConflictTargetMatrixDecisionReportV1[];
  readonly trajectory: readonly ConflictTargetMatrixStateV1[];
  readonly scheduledStates: readonly ConflictTargetMatrixStateV1[];
  readonly pressureHistory: readonly number[];
  readonly history: readonly ConflictTargetMatrixHistoryEventV1[];
  readonly metrics: TrajectoryMetrics;
}

function makeDecisionRng(seed: number): () => number {
  let x = (seed >>> 0) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

/**
 * The canonical normalizer never reads history-event fields. This adapter
 * preserves the directed-history union while reusing its state/profile/map
 * normalization instead of creating a second transition or normalization law.
 */
function normalizeTargetMatrixStateV1(
  state: ConflictTargetMatrixStateV1,
): Result<ConflictTargetMatrixStateV1, Extract<ConflictTargetMatrixLabSessionErrorV1, { code: 'state_normalization_failed' }>> {
  const normalized = normalizeConflictStateNV1(state as unknown as ConflictStateNV1);
  if (normalized.ok === false) {
    return {
      ok: false,
      error: {
        code: 'state_normalization_failed',
        causeCode: normalized.error.code,
        message: `Target-matrix state became invalid: ${normalized.error.message}`,
      },
    };
  }
  return { ok: true, value: normalized.value as unknown as ConflictTargetMatrixStateV1 };
}

function buildCellRngs(
  players: readonly string[],
  scenarioId: string,
  seed: number,
): Readonly<Record<string, Readonly<Record<string, { rng: () => number; rngChannelId: string }>>>> {
  const byActor: Record<string, Record<string, { rng: () => number; rngChannelId: string }>> = {};
  let chained = seed;
  for (const actorId of players) {
    const byTarget: Record<string, { rng: () => number; rngChannelId: string }> = {};
    for (const targetId of players) {
      if (targetId === actorId) continue;
      byTarget[targetId] = {
        rng: makeDecisionRng(chained),
        rngChannelId: players.length === 2
          ? `conflict-live:${scenarioId}:${seed}:${actorId}`
          : `conflict-live:${scenarioId}:${seed}:${actorId.length}:${actorId}:${targetId.length}:${targetId}`,
      };
      chained = Math.imul(chained, 0x9e3779b1);
    }
    byActor[actorId] = byTarget;
  }
  return byActor;
}

export function runConflictTargetMatrixLabSessionV1(
  config: ConflictTargetMatrixLabSessionConfigV1,
): Result<ConflictTargetMatrixLabSessionReportV1, ConflictTargetMatrixLabSessionErrorV1> {
  const set = participantSetFromConflictPlayersV1(config.players);
  if (set.ok === false) {
    return {
      ok: false,
      error: {
        code: 'invalid_participants',
        causeCode: set.errors[0].code,
        message: set.errors.map((error) => error.message).join('; '),
      },
    };
  }
  if (!Number.isFinite(config.totalRounds)
    || !Number.isInteger(config.totalRounds)
    || config.totalRounds < 1
    || config.totalRounds > MAX_CONFLICT_LIVE_ROUNDS_V1) {
    return {
      ok: false,
      error: {
        code: 'invalid_round_budget',
        totalRounds: config.totalRounds,
        min: 1,
        max: MAX_CONFLICT_LIVE_ROUNDS_V1,
        message: `totalRounds must be an integer in [1, ${MAX_CONFLICT_LIVE_ROUNDS_V1}], got ${config.totalRounds}`,
      },
    };
  }

  const scenario = getScenario(config.scenarioId);
  if (scenario.mechanicId !== 'trust_exchange') {
    return {
      ok: false,
      error: {
        code: 'unsupported_mechanic',
        mechanicId: String(scenario.mechanicId ?? ''),
        message: `The target-matrix live lane is canonical trust_exchange only; ${config.scenarioId} carries mechanic '${scenario.mechanicId}'`,
      },
    };
  }

  let definition: ConflictDefinitionV3;
  let definitionSource: ConflictTargetMatrixLabSessionReportV1['definitionSource'];
  if (config.definition) {
    const validated = validateConflictDefinitionV3(config.definition);
    if (validated.ok === false) {
      return { ok: false, error: { code: 'invalid_definition', message: validated.errors.map((error) => error.message).join('; ') } };
    }
    definition = validated.value;
    definitionSource = 'caller_override';
  } else {
    const built = trustExchangeDefinitionNV1(set.value);
    if (built.ok === false) {
      return { ok: false, error: { code: 'invalid_definition', message: built.errors.map((error) => error.message).join('; ') } };
    }
    definition = built.value;
    definitionSource = 'default_trust_exchange_all_others';
  }

  const initial = buildCanonicalInitialStateNV1({
    scenario,
    players: config.players,
    world: config.world,
    institutionalPressure: config.institutionalPressure,
  });
  if (initial.ok === false) {
    if (initial.error.code === 'invalid_participants' || initial.error.code === 'agent_not_found') {
      return { ok: false, error: initial.error };
    }
    return {
      ok: false,
      error: {
        code: 'initial_state_failed',
        causeCode: initial.error.code,
        message: `Target-matrix initial state failed: ${initial.error.message}`,
      },
    };
  }

  const totalRounds = config.totalRounds;
  const seed = config.seed ?? 42;
  const protocol = buildTrustExchangeProtocolNV1(set.value);
  const cellRngs = buildCellRngs(config.players, config.scenarioId, seed);
  const decisions: ConflictTargetMatrixDecisionReportV1[] = [];
  const normalizedInitial = normalizeTargetMatrixStateV1(initial.value);
  if (normalizedInitial.ok === false) return normalizedInitial;
  const initialState = normalizedInitial.value;
  const trajectory: ConflictTargetMatrixStateV1[] = [initialState];
  const scheduledStates: ConflictTargetMatrixStateV1[] = [];
  const pressureHistory: number[] = [];
  let state = initialState;

  for (let round = 0; round < totalRounds; round++) {
    const basePressure = config.institutionalPressure ?? scenario.institutionalPressure;
    const pressure = computeScheduledPressure(basePressure, config.pressureSchedule, round, totalRounds);
    const scheduled = normalizeTargetMatrixStateV1({
      ...state,
      environment: { ...state.environment, institutionalPressure: pressure },
    });
    if (scheduled.ok === false) return scheduled;
    const scheduledState = scheduled.value;
    scheduledStates.push(scheduledState);
    pressureHistory.push(pressure);
    const world = worldForTickNV1(config.world, scheduledState as unknown as ConflictStateNV1, seed);
    const players: Record<string, ConflictTargetMatrixPlayerDecisionInputV1> = {};
    for (const actorId of scheduledState.players) {
      players[actorId] = {
        pipelineInput: {
          world,
          agentId: actorId,
          participantIds: [...scheduledState.players],
          tickOverride: scheduledState.tick,
          observeLiteParams: { seed },
          sceneControl: { runtimeProfile: { profileId: 'phase1' } },
        },
        rngByTarget: cellRngs[actorId],
      };
    }
    const decision = runConflictTargetMatrixDecisionV1({ state: scheduledState, definition, protocol, players });
    if (decision.ok === false) {
      return {
        ok: false,
        error: {
          code: 'decision_failed',
          round,
          cause: decision.error,
          message: `Conflict target-matrix provider failed at round ${round} (${decision.error.code}): ${decision.error.message}`,
        },
      };
    }
    decisions.push(decision.value);
    const normalizedNext = normalizeTargetMatrixStateV1(decision.value.canonical.step.state);
    if (normalizedNext.ok === false) return normalizedNext;
    state = normalizedNext.value;
    trajectory.push(state);
  }

  const metrics = trajectoryMetricsNV1(trajectory as unknown as readonly ConflictStateNV1[]);
  if (metrics.ok === false) {
    return { ok: false, error: { code: 'analysis_failed', message: metrics.error.message } };
  }

  return {
    ok: true,
    value: {
      schemaVersion: CONFLICT_TARGET_MATRIX_LIVE_SESSION_SCHEMA_VERSION,
      runtime: 'canonical_goal_lab_s8_target_matrix',
      policyId: CONFLICT_CHOICE_POLICY_ID,
      policyVersion: CONFLICT_CHOICE_POLICY_VERSION,
      scenarioId: config.scenarioId,
      players: [...config.players],
      totalRounds,
      seed,
      definitionSource,
      initialState,
      finalState: state,
      decisions,
      trajectory,
      scheduledStates,
      pressureHistory,
      history: [...state.history],
      metrics: metrics.value,
    },
  };
}
