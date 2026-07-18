import type { AgentState, Relationship, WorldState } from '../../../types';
import { codeUnitCompare } from '../../utils/compare';
import { compileAgent } from '../compiler';
import { buildParticipantSetV1 } from '../definition/participantSet';
import {
  buildCanonicalInitialState,
  computeScheduledPressure,
  runCanonicalConflictLab,
} from '../dynamics/bridge';
import { normalizeConflictState } from '../dynamics/state';
import { trajectoryMetrics } from '../dynamics/analysis';
import type {
  CanonicalConflictState,
  ConflictCoreRunSupportedReport,
  ConflictPlayerId,
} from '../dynamics/types';
import { getScenario } from '../scenarios';
import { runDilemmaV2 } from '../runner';
import type { ScenarioTemplate, V2RunConfig, V2RunResult } from '../types';
import { runConflictJointDecisionV1 } from './decisionProvider';
import type { ConflictJointDecisionReportV1 } from './types';

export const CONFLICT_LIVE_SESSION_SCHEMA_VERSION = 'conflict-live-session-v1' as const;
export const MAX_CONFLICT_LIVE_ROUNDS_V1 = 30 as const;

function assertLiveSessionBoundary(config: V2RunConfig): void {
  if (!Number.isFinite(config.totalRounds)
    || !Number.isInteger(config.totalRounds)
    || config.totalRounds < 1
    || config.totalRounds > MAX_CONFLICT_LIVE_ROUNDS_V1) {
    throw new RangeError(`totalRounds must be an integer in [1, ${MAX_CONFLICT_LIVE_ROUNDS_V1}], got ${config.totalRounds}`);
  }
  const players = config.players as readonly string[];
  if (players.length !== 2) {
    throw new RangeError(`Conflict Lab dyadic runtime requires exactly 2 participants, got ${players.length}`);
  }
  const set = buildParticipantSetV1(players.map((participantId, index) => ({
    participantId,
    roleId: `participant-${index}`,
  })));
  if (set.ok === false) {
    throw new RangeError(`Invalid Conflict Lab dyad: ${set.errors.map((error) => error.message).join('; ')}`);
  }
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
  state: CanonicalConflictState,
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

function worldForTick(
  source: WorldState,
  state: CanonicalConflictState,
  seed: number,
): WorldState {
  const players = new Set(state.players);
  const agents = (source.agents ?? []).map((agent) => {
    const id = agent.entityId ?? agent.id;
    if (!id || !players.has(id)) return agent;
    const otherId = state.players.find((playerId) => playerId !== id);
    if (!otherId) return agent;
    return {
      ...agent,
      relationships: {
        ...(agent.relationships ?? {}),
        [otherId]: relationFromState(agent.relationships?.[otherId], state, id, otherId),
      },
    } as AgentState;
  });
  return { ...source, tick: state.tick, rngSeed: seed, agents };
}

function canonicalSummary(playerId: string, reports: readonly ConflictJointDecisionReportV1[]): string {
  const counts: Record<string, number> = {};
  for (const report of reports) {
    const actionId = report.canonical.actions[playerId];
    counts[actionId] = (counts[actionId] ?? 0) + 1;
  }
  const ordered = Object.entries(counts)
    .sort(([a], [b]) => codeUnitCompare(a, b))
    .map(([actionId, count]) => `${actionId}: ${count}`)
    .join(', ');
  return `Canonical GoalLab S8 choices — ${ordered || 'no actions'}`;
}

function runCanonicalTrustExchangeSession(
  config: V2RunConfig,
  scenario: ScenarioTemplate,
): V2RunResult {
  const totalRounds = config.totalRounds;
  const seed = config.seed ?? 42;
  const initialState = buildCanonicalInitialState({
    scenario,
    players: config.players,
    totalRounds,
    world: config.world,
    institutionalPressure: config.institutionalPressure,
    pressureSchedule: config.pressureSchedule,
  });
  const rngs: Record<string, () => number> = {
    [config.players[0]]: makeDecisionRng(seed),
    [config.players[1]]: makeDecisionRng(Math.imul(seed, 0x9e3779b1)),
  };
  const decisions: ConflictJointDecisionReportV1[] = [];
  const trajectory: CanonicalConflictState[] = [initialState];
  let state = initialState;

  for (let round = 0; round < totalRounds; round++) {
    const basePressure = config.institutionalPressure ?? scenario.institutionalPressure;
    const pressure = computeScheduledPressure(basePressure, config.pressureSchedule, round, totalRounds);
    const scheduledState = normalizeConflictState({
      ...state,
      environment: { ...state.environment, institutionalPressure: pressure },
    });
    const world = worldForTick(config.world, scheduledState, seed);
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
      rngChannelId: `conflict-live:${config.scenarioId}:${seed}:${playerId}`,
    }]));
    const decision = runConflictJointDecisionV1({ state: scheduledState, players });
    if (decision.ok === false) {
      throw new Error(`Canonical Conflict provider failed (${decision.error.code}): ${decision.error.message}`);
    }
    decisions.push(decision.value);
    state = normalizeConflictState(decision.value.canonical.step.state);
    trajectory.push(state);
  }

  const conflictCore: ConflictCoreRunSupportedReport = {
    runtime: 'canonical_dynamics',
    protocolId: 'trust_exchange',
    supportedMechanicId: 'trust_exchange',
    players: initialState.players,
    actionLabels: {
      trust: 'trust / cooperate',
      withhold: 'withhold / hedge / silent',
      betray: 'betray / defect',
    },
    initialState,
    finalState: state,
    steps: decisions.map((decision) => decision.canonical.step),
    frames: state.trace,
    trajectory,
    metrics: trajectoryMetrics(trajectory),
  };
  const game = {
    scenarioId: config.scenarioId,
    players: config.players,
    rounds: decisions.map((decision, index) => ({
      index,
      choices: { ...decision.canonical.actions },
      traces: {},
    })),
    currentRound: decisions.length,
    totalRounds,
  };
  const confidence = Object.fromEntries(config.players.map((playerId) => {
    const agent = config.world.agents.find((candidate) => candidate.entityId === playerId || candidate.id === playerId);
    return [playerId, agent ? compileAgent(agent).confidence : 0];
  }));

  return {
    game,
    confidence,
    summaries: Object.fromEntries(config.players.map((playerId) => [playerId, canonicalSummary(playerId, decisions)])),
    conflictCore,
    canonicalSession: {
      schemaVersion: CONFLICT_LIVE_SESSION_SCHEMA_VERSION,
      runtime: 'canonical_goal_lab_s8',
      policyId: 'goal_lab_s8_gumbel',
      policyVersion: 1,
      decisions,
    },
  };
}

/** Live Conflict Lab boundary: trust_exchange is canonical; other cards remain compatibility-only. */
export function runConflictLabSessionV1(config: V2RunConfig): V2RunResult {
  assertLiveSessionBoundary(config);
  const scenario = getScenario(config.scenarioId);
  if (scenario.mechanicId === 'trust_exchange') {
    return runCanonicalTrustExchangeSession(config, scenario);
  }
  const legacy = runDilemmaV2(config);
  return {
    ...legacy,
    conflictCore: legacy.conflictCore ?? runCanonicalConflictLab({
      scenario,
      players: config.players,
      totalRounds: config.totalRounds,
      world: config.world,
      institutionalPressure: config.institutionalPressure,
      pressureSchedule: config.pressureSchedule,
    }),
  };
}
