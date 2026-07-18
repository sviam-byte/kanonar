// NKERNEL-FOUNDATION-0 §3.6 conflict-nlive-session-v1: the N live-session
// lane — runConflictLabSessionV1's canonical trust_exchange loop lifted to N
// participants over runConflictNJointDecisionV1 (NKERNEL-DECISION-0). This is
// the slice that deliberately crosses the epic's "no runtime imports of
// nkernel" line: the lane is callable (integration barrel), but NOTHING
// dispatches into it by default — runConflictLabSessionV1, the catalog lane
// and the UI are untouched, and liveSession.ts stays byte-identical. Parity
// with the dyadic session is pinned by the N = 2 reduction oracle in
// tests/dilemma/nkernel_session_v1.test.ts.
//
// Deliberate copies from liveSession.ts (makeDecisionRng, relationFromState,
// the worldForTick body modulo the single-other lookup): the originals are
// module-private, and exporting them would edit the runtime file the oracle
// compares against. Same sanctioned-duplication pattern as nanalysis.ts — the
// N = 2 session oracle makes any drift between the copies fail loudly.
//
// ADR §5.5 inheritance: the default definition is trustExchangeDefinitionNV1
// (all_others targets), which is single-target only at N = 2 — at N > 2 the
// decision provider fails closed with 'multi_target_not_supported'. Callers
// run N > 2 by supplying a single-target ConflictDefinitionV3 via
// config.definition until the multi-target fan-out ADR (epic §6 item 7).

import type { AgentState, Relationship, WorldState } from '../../../types';
import {
  buildCanonicalInitialState,
  computeScheduledPressure,
} from '../dynamics/bridge';
import { normalizeConflictState } from '../dynamics/state';
import type {
  ConflictAgentState,
  ConflictPlayerId,
  ConflictRelationState,
  Result,
  StrategyProfile,
  TrajectoryMetrics,
} from '../dynamics/types';
import { getScenario } from '../scenarios';
import type { PressureSchedule, ScenarioTemplate } from '../types';
import {
  validateConflictDefinitionV3,
  type ConflictDefinitionV3,
} from '../definition/conflictDefinitionV3';
import type { ParticipantSetErrorV1 } from '../definition/participantSet';
import {
  asKernelConflictStateV1,
  buildTrustExchangeProtocolNV1,
  normalizeConflictStateNV1,
  participantSetFromConflictPlayersV1,
  trustExchangeDefinitionNV1,
  type CanonicalConflictStateNV1,
} from '../nkernel/nstate';
import { trajectoryMetricsNV1 } from '../nkernel/nanalysis';
import type { ConflictStateNV1 } from '../nkernel/types';
import {
  runConflictNJointDecisionV1,
  type ConflictNIntegrationErrorV1,
  type ConflictNJointDecisionReportV1,
} from './ndecisionProvider';
import { CONFLICT_CHOICE_POLICY_ID, CONFLICT_CHOICE_POLICY_VERSION } from './types';
import { MAX_CONFLICT_LIVE_ROUNDS_V1 } from './liveSession';

export const CONFLICT_NLIVE_SESSION_SCHEMA_VERSION = 'conflict-nlive-session-v1' as const;

export interface ConflictNLabSessionConfigV1 {
  readonly scenarioId: string;
  /** N >= 2, unique non-empty ids — validated via participantSetFromConflictPlayersV1. */
  readonly players: readonly string[];
  readonly totalRounds: number;
  readonly world: WorldState;
  /** Default 42, matching the dyadic session. */
  readonly seed?: number;
  readonly institutionalPressure?: number;
  readonly pressureSchedule?: PressureSchedule;
  /**
   * ADR §5.5 escape hatch: omitted, the session builds
   * trustExchangeDefinitionNV1 (all_others), which fails closed at N > 2 in
   * the single-target decision provider; supply a single-target v3 definition
   * to run N > 2. Re-validated by validateConflictDefinitionV3 either way.
   */
  readonly definition?: ConflictDefinitionV3;
}

export type ConflictNLabSessionErrorV1 =
  | { readonly code: 'unsupported_mechanic'; readonly mechanicId: string; readonly message: string }
  | { readonly code: 'invalid_participants'; readonly causeCode: ParticipantSetErrorV1['code']; readonly message: string }
  | { readonly code: 'n_live_requires_dyad'; readonly participantCount: number; readonly message: string }
  | { readonly code: 'invalid_round_budget'; readonly totalRounds: number; readonly min: 1; readonly max: typeof MAX_CONFLICT_LIVE_ROUNDS_V1; readonly message: string }
  | { readonly code: 'invalid_definition'; readonly message: string }
  | { readonly code: 'agent_not_found'; readonly playerId: string; readonly message: string }
  | { readonly code: 'analysis_failed'; readonly message: string }
  | {
    readonly code: 'decision_failed';
    readonly round: number;
    readonly cause: ConflictNIntegrationErrorV1;
    readonly message: string;
  };

export interface ConflictNLabSessionReportV1 {
  readonly schemaVersion: typeof CONFLICT_NLIVE_SESSION_SCHEMA_VERSION;
  readonly runtime: 'canonical_goal_lab_s8';
  readonly policyId: typeof CONFLICT_CHOICE_POLICY_ID;
  readonly policyVersion: typeof CONFLICT_CHOICE_POLICY_VERSION;
  readonly scenarioId: string;
  readonly players: readonly ConflictPlayerId[];
  readonly totalRounds: number;
  readonly seed: number;
  readonly definitionSource: 'default_trust_exchange_all_others' | 'caller_override';
  readonly initialState: CanonicalConflictStateNV1;
  readonly finalState: CanonicalConflictStateNV1;
  readonly decisions: readonly ConflictNJointDecisionReportV1[];
  readonly trajectory: readonly CanonicalConflictStateNV1[];
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

function relationFromState(
  previous: Relationship | undefined,
  state: ConflictStateNV1,
  fromId: ConflictPlayerId,
  toId: ConflictPlayerId,
): Relationship {
  const relation = state.relations[fromId]?.[toId];
  return {
    ...(previous ?? {}),
    trust: relation?.trust ?? previous?.trust ?? 0.5,
    bond: relation?.bond ?? previous?.bond ?? 0.1,
    conflict: relation?.conflict ?? previous?.conflict ?? 0.1,
    fear: relation?.perceivedThreat ?? previous?.fear ?? 0,
    respect: relation?.perceivedLegitimacy ?? previous?.respect ?? 0.5,
    align: previous?.align ?? 0.5,
    history: previous?.history ?? [],
  } as Relationship;
}

/**
 * The N closure of the §1.2 seam: liveSession's worldForTick projects kernel
 * relations onto the single `players.find(p => p !== id)` other — here every
 * participant's relationships are patched toward ALL other participants, in
 * declared player order. At N = 2 the loop body runs once with the same other,
 * so the dyadic world is reproduced byte-for-byte (pinned by the oracle).
 */
export function worldForTickNV1(
  source: WorldState,
  state: ConflictStateNV1,
  seed: number,
): WorldState {
  const players = new Set(state.players);
  const agents = (source.agents ?? []).map((agent) => {
    const id = agent.entityId ?? agent.id;
    if (!id || !players.has(id)) return agent;
    const others = state.players.filter((playerId) => playerId !== id);
    if (others.length === 0) return agent;
    const relationships: Record<string, Relationship> = { ...(agent.relationships ?? {}) };
    for (const otherId of others) {
      relationships[otherId] = relationFromState(relationships[otherId], state, id, otherId);
    }
    return { ...agent, relationships } as AgentState;
  });
  return { ...source, tick: state.tick, rngSeed: seed, agents };
}

/**
 * N initial state by per-pair reuse of the real buildCanonicalInitialState —
 * one call per unordered pair (declared index order), merged, never
 * re-implemented. Merge law (ADR, this slice): relations[a][b]/[b][a] come
 * from pair (a, b); environment from the first pair (it is scenario-only,
 * hence pair-invariant); agents[p]/strategyProfiles[p] from the FIRST pair
 * containing p — the anchor-partner rule. The only pair-dependent agent field
 * is `fear` (seeded from the agent's own outgoing dyad in bridge.ts), so each
 * agent's initial fear is toward its first other participant in declared
 * order; at N = 2 that is the dyadic construction verbatim. Mean-over-others
 * fear is the recorded deferred alternative (changes N > 2 semantics only).
 */
export function buildCanonicalInitialStateNV1(config: {
  readonly scenario: ScenarioTemplate;
  readonly players: readonly ConflictPlayerId[];
  readonly world: WorldState;
  readonly institutionalPressure?: number;
}): Result<CanonicalConflictStateNV1, ConflictNLabSessionErrorV1> {
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
  // Same predicate as bridge.ts findAgent — checked up front so the reused
  // dyadic builder (which throws) can no longer throw below.
  for (const playerId of config.players) {
    const agent = (config.world.agents ?? []).find((candidate) => candidate.entityId === playerId || candidate.id === playerId);
    if (!agent) {
      return { ok: false, error: { code: 'agent_not_found', playerId, message: `Agent not found: ${playerId}` } };
    }
  }

  const players = config.players;
  const agents: Record<ConflictPlayerId, ConflictAgentState> = {};
  const relations: Record<ConflictPlayerId, Record<ConflictPlayerId, ConflictRelationState>> = {};
  const strategyProfiles: Record<ConflictPlayerId, StrategyProfile> = {};
  let environment: ConflictStateNV1['environment'] | undefined;

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      const pairState = buildCanonicalInitialState({
        scenario: config.scenario,
        players: [a, b],
        totalRounds: 1,
        world: config.world,
        institutionalPressure: config.institutionalPressure,
      });
      if (environment === undefined) environment = pairState.environment;
      if (agents[a] === undefined) {
        agents[a] = pairState.agents[a];
        strategyProfiles[a] = pairState.strategyProfiles[a];
      }
      if (agents[b] === undefined) {
        agents[b] = pairState.agents[b];
        strategyProfiles[b] = pairState.strategyProfiles[b];
      }
      relations[a] = { ...(relations[a] ?? {}), [b]: pairState.relations[a][b] };
      relations[b] = { ...(relations[b] ?? {}), [a]: pairState.relations[b][a] };
    }
  }

  const normalized = normalizeConflictStateNV1({
    tick: 0,
    players,
    agents,
    relations,
    environment: environment as ConflictStateNV1['environment'],
    history: [],
    strategyProfiles,
  });
  if (normalized.ok === false) {
    // Unreachable after the participant check above; mapped for completeness.
    return {
      ok: false,
      error: {
        code: 'invalid_participants',
        causeCode: normalized.error.code === 'invalid_participants' ? normalized.error.causeCode : 'too_few_participants',
        message: normalized.error.message,
      },
    };
  }
  return { ok: true, value: normalized.value };
}

/**
 * The parity-gated N live-session runner. Mirrors the dyadic canonical loop
 * (liveSession.ts runCanonicalTrustExchangeSession) round for round: scheduled
 * pressure patched into the environment, kernel relations projected onto the
 * world, one GoalLab pipeline input + seeded rng channel per participant,
 * decision via runConflictNJointDecisionV1, state threaded through the
 * inter-step normalizeConflictState pass (the ntrajectory convention — the
 * re-normalization is load-bearing below the replicator floor). Fail-closed
 * Result instead of the dyadic throw, and NO runDilemmaV2 compatibility
 * fallback: a non-trust_exchange mechanic is a typed error in the N lane.
 * Participant count and round budget are validated before catalog/pipeline
 * work. For valid dyads, getScenario still propagates unknown/disabled errors
 * unchanged — the R6 catalog-lane rules apply (§3.6).
 */
export function runConflictNLabSessionV1(
  config: ConflictNLabSessionConfigV1,
): Result<ConflictNLabSessionReportV1, ConflictNLabSessionErrorV1> {
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
  if (set.value.participantCount > 2) {
    return {
      ok: false,
      error: {
        code: 'n_live_requires_dyad',
        participantCount: set.value.participantCount,
        message: `The live decision/session lane is dyadic; got ${set.value.participantCount} participants`,
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
        message: `The N live-session lane is canonical trust_exchange only; ${config.scenarioId} carries mechanic '${scenario.mechanicId}' (no compatibility fallback at N)`,
      },
    };
  }
  const protocol = buildTrustExchangeProtocolNV1(set.value);

  let definition: ConflictDefinitionV3;
  let definitionSource: ConflictNLabSessionReportV1['definitionSource'];
  if (config.definition) {
    const validated = validateConflictDefinitionV3(config.definition);
    if (validated.ok === false) {
      return {
        ok: false,
        error: { code: 'invalid_definition', message: validated.errors.map((error) => error.message).join('; ') },
      };
    }
    definition = validated.value;
    definitionSource = 'caller_override';
  } else {
    const built = trustExchangeDefinitionNV1(set.value);
    if (built.ok === false) {
      return {
        ok: false,
        error: { code: 'invalid_definition', message: built.errors.map((error) => error.message).join('; ') },
      };
    }
    definition = built.value;
    definitionSource = 'default_trust_exchange_all_others';
  }

  const totalRounds = config.totalRounds;
  const seed = config.seed ?? 42;

  const initial = buildCanonicalInitialStateNV1({
    scenario,
    players: config.players,
    world: config.world,
    institutionalPressure: config.institutionalPressure,
  });
  if (initial.ok === false) return initial;

  // RNG chain: iterated golden-ratio imul — player k gets s_k where s_0 = seed
  // and s_{k+1} = Math.imul(s_k, 0x9e3779b1). At N = 2 this is literally the
  // dyadic pair (seed, imul(seed, 0x9e3779b1)) from liveSession.ts.
  const rngs: Record<string, () => number> = {};
  let chained = seed;
  for (const playerId of config.players) {
    rngs[playerId] = makeDecisionRng(chained);
    chained = Math.imul(chained, 0x9e3779b1);
  }

  const decisions: ConflictNJointDecisionReportV1[] = [];
  const trajectory: CanonicalConflictStateNV1[] = [initial.value];
  let state: CanonicalConflictStateNV1 = initial.value;

  for (let round = 0; round < totalRounds; round++) {
    const basePressure = config.institutionalPressure ?? scenario.institutionalPressure;
    const pressure = computeScheduledPressure(basePressure, config.pressureSchedule, round, totalRounds);
    const scheduledState: CanonicalConflictStateNV1 = normalizeConflictState(asKernelConflictStateV1({
      ...state,
      environment: { ...state.environment, institutionalPressure: pressure },
    }));
    const world = worldForTickNV1(config.world, scheduledState, seed);
    const players = Object.fromEntries(scheduledState.players.map((playerId) => [playerId, {
      pipelineInput: {
        world,
        agentId: playerId,
        participantIds: [...scheduledState.players],
        tickOverride: scheduledState.tick,
        observeLiteParams: { seed },
        sceneControl: { runtimeProfile: { profileId: 'phase1' } },
      },
      rng: rngs[playerId],
      // Same channel-id format as the dyadic lane: it is a trace label
      // embedded in ConflictChoiceTraceV1 (not a registry key), and sharing
      // the format is what keeps N = 2 choice traces byte-comparable.
      rngChannelId: `conflict-live:${config.scenarioId}:${seed}:${playerId}`,
    }]));
    const decision = runConflictNJointDecisionV1({ state: scheduledState, definition, protocol, players });
    if (decision.ok === false) {
      return {
        ok: false,
        error: {
          code: 'decision_failed',
          round,
          cause: decision.error,
          message: `Conflict N provider failed at round ${round} (${decision.error.code}): ${decision.error.message}`,
        },
      };
    }
    decisions.push(decision.value);
    state = normalizeConflictState(asKernelConflictStateV1(decision.value.canonical.step.state));
    trajectory.push(state);
  }

  const metrics = trajectoryMetricsNV1(trajectory);
  if (metrics.ok === false) {
    return { ok: false, error: { code: 'analysis_failed', message: metrics.error.message } };
  }

  return {
    ok: true,
    value: {
      schemaVersion: CONFLICT_NLIVE_SESSION_SCHEMA_VERSION,
      runtime: 'canonical_goal_lab_s8',
      policyId: CONFLICT_CHOICE_POLICY_ID,
      policyVersion: CONFLICT_CHOICE_POLICY_VERSION,
      scenarioId: config.scenarioId,
      players: [...config.players],
      totalRounds,
      seed,
      definitionSource,
      initialState: initial.value,
      finalState: state,
      decisions,
      trajectory,
      metrics: metrics.value,
    },
  };
}
