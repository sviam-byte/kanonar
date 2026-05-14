import type { AgentState, Relationship, WorldState } from '../../../types';
import { compileAgent, compileDyad, computePerceivedStakes } from '../compiler';
import type { PressureSchedule, ScenarioTemplate } from '../types';
import { clamp01 } from '../../util/math';
import { normalizeActionProbabilities, uniformStrategy } from './math';
import { normalizeConflictState } from './state';
import {
  createTrustExchangeProtocol,
  defaultConflictAgentState,
  defaultConflictRelationState,
  TRUST_EXCHANGE_ACTION_ORDER,
} from './trustExchange';
import { resolveProtocolStep } from './engine';
import { trajectoryMetrics } from './analysis';
import type {
  CanonicalConflictState,
  ConflictAgentState,
  ConflictCoreRunReport,
  ConflictEnvironmentState,
  ConflictPlayerId,
  ConflictRelationState,
  ConflictState,
  ConflictStepResult,
} from './types';

export interface CanonicalConflictLabRunConfig {
  scenario: ScenarioTemplate;
  players: readonly [ConflictPlayerId, ConflictPlayerId];
  totalRounds: number;
  world: WorldState;
  institutionalPressure?: number;
  pressureSchedule?: PressureSchedule;
}

export function runCanonicalConflictLab(config: CanonicalConflictLabRunConfig): ConflictCoreRunReport {
  if (config.scenario.mechanicId !== 'trust_exchange') {
    return {
      runtime: 'unsupported_kernel',
      mechanicId: config.scenario.mechanicId,
      protocolKernel: config.scenario.protocol.kernel,
      reason: 'canonical kernel pending; showing protocol structure + legacy trace only',
    };
  }

  const initialState = buildCanonicalInitialState(config);
  const protocol = createTrustExchangeProtocol(initialState.players);
  const steps: ConflictStepResult[] = [];
  const trajectory: CanonicalConflictState[] = [initialState];
  let state: CanonicalConflictState = initialState;
  const totalRounds = Math.max(1, Math.floor(config.totalRounds));
  const basePressure = config.institutionalPressure ?? config.scenario.institutionalPressure;

  for (let round = 0; round < totalRounds; round++) {
    const scheduledPressure = computeScheduledPressure(basePressure, config.pressureSchedule, round, totalRounds);
    const scheduledState = normalizeConflictState({
      ...state,
      environment: {
        ...state.environment,
        institutionalPressure: scheduledPressure,
      },
    });
    const step = resolveProtocolStep(scheduledState, protocol);
    if (!step.ok) {
      return {
        runtime: 'unsupported_kernel',
        mechanicId: config.scenario.mechanicId,
        protocolKernel: config.scenario.protocol.kernel,
        reason: step.error.message,
      };
    }
    const canonicalStep = {
      ...step.value,
      state: normalizeConflictState(step.value.state),
    };
    steps.push(canonicalStep);
    state = canonicalStep.state;
    trajectory.push(state);
  }

  return {
    runtime: 'canonical_dynamics',
    protocolId: protocol.id,
    supportedMechanicId: 'trust_exchange',
    players: initialState.players,
    actionLabels: {
      trust: 'trust / cooperate',
      withhold: 'withhold / hedge / silent',
      betray: 'betray / defect',
    },
    initialState,
    finalState: state,
    steps,
    frames: state.trace,
    trajectory,
    metrics: trajectoryMetrics(trajectory),
  };
}

export function buildCanonicalInitialState(config: CanonicalConflictLabRunConfig): CanonicalConflictState {
  const [aId, bId] = config.players;
  const a = findAgent(config.world, aId);
  const b = findAgent(config.world, bId);
  if (!a || !b) {
    const missing = !a ? aId : bId;
    throw new Error(`Agent not found: ${missing}`);
  }

  const compiledA = compileAgent(a);
  const compiledB = compileAgent(b);
  compiledA.perceivedStakes = computePerceivedStakes(compiledA, config.scenario);
  compiledB.perceivedStakes = computePerceivedStakes(compiledB, config.scenario);
  const dyadAB = compileDyad(compiledA, compiledB, a, b);
  const dyadBA = compileDyad(compiledB, compiledA, b, a);
  const basePressure = config.institutionalPressure ?? config.scenario.institutionalPressure;
  const environment = buildEnvironment(config.scenario, basePressure);

  const state: ConflictState = {
    tick: 0,
    players: [aId, bId],
    agents: {
      [aId]: buildAgentState(compiledA, dyadAB.rel.fear),
      [bId]: buildAgentState(compiledB, dyadBA.rel.fear),
    },
    relations: {
      [aId]: { [bId]: buildRelationState(dyadAB.rel) },
      [bId]: { [aId]: buildRelationState(dyadBA.rel) },
    },
    environment,
    history: [],
    strategyProfiles: {
      [aId]: uniformStrategy(aId, TRUST_EXCHANGE_ACTION_ORDER),
      [bId]: uniformStrategy(bId, TRUST_EXCHANGE_ACTION_ORDER),
    },
  };

  return normalizeConflictState({
    ...state,
    strategyProfiles: {
      [aId]: {
        playerId: aId,
        probabilities: normalizeActionProbabilities(state.strategyProfiles[aId].probabilities, TRUST_EXCHANGE_ACTION_ORDER),
      },
      [bId]: {
        playerId: bId,
        probabilities: normalizeActionProbabilities(state.strategyProfiles[bId].probabilities, TRUST_EXCHANGE_ACTION_ORDER),
      },
    },
  });
}

export function computeScheduledPressure(
  base: number,
  schedule: PressureSchedule | undefined,
  round: number,
  totalRounds: number,
): number {
  if (!schedule || schedule.shape === 'flat') return clamp01(base);
  const t = totalRounds <= 1 ? 1 : round / Math.max(1, totalRounds - 1);
  switch (schedule.shape) {
    case 'rising':
      return clamp01(schedule.floor + (base - schedule.floor) * t);
    case 'falling':
      return clamp01(base + (schedule.floor - base) * t);
    case 'spike': {
      const peak = schedule.peakRound / Math.max(1, totalRounds - 1);
      const dist = Math.abs(t - peak);
      const spread = 0.25;
      const envelope = Math.exp(-(dist * dist) / (2 * spread * spread));
      return clamp01(schedule.floor + (base - schedule.floor) * envelope);
    }
    default:
      return clamp01(base);
  }
}

function findAgent(world: WorldState, id: ConflictPlayerId): AgentState | null {
  return (world.agents ?? []).find((agent) => agent.entityId === id || agent.id === id) ?? null;
}

function buildAgentState(compiled: ReturnType<typeof compileAgent>, dyadFear: number): ConflictAgentState {
  const fallback = defaultConflictAgentState();
  return {
    goalPressure: clamp01(compiled.perceivedStakes),
    fear: clamp01(dyadFear),
    stress: clamp01(compiled.acute.stress / 100),
    resentment: clamp01(compiled.acute.moralInjury / 100),
    loyalty: clamp01(compiled.state.loyalty / 100),
    dominanceNeed: clamp01(compiled.axes.A_Power_Sovereignty ?? fallback.dominanceNeed),
    cooperationTendency: clamp01(compiled.axes.C_reciprocity_index ?? fallback.cooperationTendency),
    will: clamp01(compiled.state.will / 100),
  };
}

function buildRelationState(rel: Relationship): ConflictRelationState {
  return defaultConflictRelationState({
    trust: clamp01(rel.trust ?? 0.5),
    bond: clamp01(rel.bond ?? 0.1),
    conflict: clamp01(rel.conflict ?? 0.1),
    perceivedThreat: clamp01(rel.fear ?? 0),
    perceivedLegitimacy: clamp01(rel.respect ?? 0.5),
    volatility: 0,
  });
}

function buildEnvironment(scenario: ScenarioTemplate, institutionalPressure: number): ConflictEnvironmentState {
  return {
    resourceScarcity: clamp01((scenario.stakes.personal + scenario.stakes.physical) / 2),
    externalPressure: clamp01((scenario.stakes.institutional + scenario.stakes.physical) / 2),
    visibility: clamp01(
      (scenario.visibility.actionsVisible ? 0.35 : 0)
      + (scenario.visibility.audiencePresent ? 0.45 : 0)
      + (scenario.visibility.consequencesDeferred ? 0.1 : 0.2),
    ),
    institutionalPressure: clamp01(institutionalPressure),
  };
}
