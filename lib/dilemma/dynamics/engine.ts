import { CONFLICT_LAB_DYNAMICS_FORMULA } from '../../config/formulaConfig';
import { cloneConflictMemory } from '../learningMemory';
import { actionImpactForTrustExchange } from './actionImpact';
import {
  computePredictionError,
  computeReward,
  updateConflictMemory,
} from './learningDynamics';
import { boundedLogitShift, finiteOrZero, normalizeActionProbabilities, uniformStrategy } from './math';
import {
  applyRegimeHysteresis,
  applyRelationDelta as applyDirectedRelationDelta,
  computeRelationDelta,
} from './relationDynamics';
import { normalizeConflictState } from './state';
import {
  createTrustExchangeProtocol,
  evaluateTrustExchangeUtilities,
  resolveTrustExchangeOutcome,
} from './trustExchange';
import type {
  ActionUtilityBreakdown,
  CanonicalConflictState,
  AgentDelta,
  ConflictAction,
  ConflictActionId,
  ConflictAgentState,
  ConflictObservation,
  ConflictOutcome,
  ConflictPlayerId,
  ConflictProtocol,
  ConflictRegimeState,
  ConflictRelationState,
  ConflictState,
  ConflictStepOptions,
  ConflictStepResult,
  ConflictTrajectoryFrame,
  ConflictValidationError,
  DirectedMemoryMap,
  DirectedRegimeMap,
  ForcedActionStrategyMode,
  RelationDelta,
  Result,
  StrategyProfile,
} from './types';

const cfg = CONFLICT_LAB_DYNAMICS_FORMULA;

export function getObservationForPlayer(
  state: ConflictState,
  protocol: ConflictProtocol,
  playerId: ConflictPlayerId,
): Result<ConflictObservation, ConflictValidationError> {
  const canonicalState = normalizeConflictState(state);
  const otherId = otherPlayer(canonicalState, playerId);
  if (!otherId) {
    return { ok: false, error: { code: 'invalid_player', message: `Player ${playerId} is not in conflict state` } };
  }

  const self = canonicalState.agents[playerId];
  const relationToOther = canonicalState.relations[playerId]?.[otherId];
  const memoryToOther = canonicalState.memories[playerId]?.[otherId];
  const regimeToOther = canonicalState.regimes[playerId]?.[otherId];
  const role = protocol.roles[playerId];
  if (!self || !relationToOther || !memoryToOther || !regimeToOther || !role) {
    return { ok: false, error: { code: 'invalid_state', message: `Missing state, relation, memory, regime, or role for ${playerId}` } };
  }

  return {
    ok: true,
    value: {
      playerId,
      otherId,
      protocolId: protocol.id,
      phase: 'simultaneous_choice',
      role,
      self: { ...self },
      relationToOther: { ...relationToOther },
      memoryToOther: cloneConflictMemory(memoryToOther),
      regimeToOther: { ...regimeToOther },
      environment: { ...canonicalState.environment },
      historyLength: canonicalState.history.length,
      availableActionIds: protocol.actionOrder,
    },
  };
}

export function getAvailableActions(
  protocol: ConflictProtocol,
  _observation: ConflictObservation,
): readonly ConflictActionId[] {
  return protocol.actionOrder;
}

export function validateJointAction(
  state: ConflictState,
  protocol: ConflictProtocol,
  jointActions: readonly ConflictAction[],
): Result<Readonly<Record<ConflictPlayerId, ConflictActionId>>, ConflictValidationError> {
  const canonicalState = normalizeConflictState(state);
  const seen = new Set<ConflictPlayerId>();
  const actions: Partial<Record<ConflictPlayerId, ConflictActionId>> = {};
  for (const action of jointActions) {
    if (!canonicalState.players.includes(action.playerId)) {
      return { ok: false, error: { code: 'invalid_player', message: `Action references unknown player ${action.playerId}` } };
    }
    if (seen.has(action.playerId)) {
      return { ok: false, error: { code: 'duplicate_player', message: `Duplicate action for ${action.playerId}` } };
    }
    if (!protocol.actionOrder.includes(action.actionId)) {
      return { ok: false, error: { code: 'invalid_action', message: `Invalid action ${action.actionId}` } };
    }
    seen.add(action.playerId);
    actions[action.playerId] = action.actionId;
  }

  for (const playerId of canonicalState.players) {
    if (!seen.has(playerId)) {
      return { ok: false, error: { code: 'missing_player', message: `Missing action for ${playerId}` } };
    }
  }

  return { ok: true, value: actions as Readonly<Record<ConflictPlayerId, ConflictActionId>> };
}

export function evaluateActionUtilities(
  _protocol: ConflictProtocol,
  observation: ConflictObservation,
): readonly ActionUtilityBreakdown[] {
  return evaluateTrustExchangeUtilities(observation);
}

export function updateStrategyProfileReplicator(
  profile: StrategyProfile,
  utilities: readonly ActionUtilityBreakdown[],
  actionOrder: readonly ConflictActionId[],
): StrategyProfile {
  const previous = normalizeActionProbabilities(profile.probabilities, actionOrder);
  const byAction = new Map(utilities.map((utility) => [utility.actionId, utility.U]));
  const next: Partial<Record<ConflictActionId, number>> = {};

  for (const actionId of actionOrder) {
    const utility = finiteOrZero(byAction.get(actionId) ?? 0);
    next[actionId] = previous[actionId] * Math.exp(cfg.replicator.eta * utility);
  }

  return {
    playerId: profile.playerId,
    probabilities: normalizeActionProbabilities(next, actionOrder),
  };
}

export function selectDominantAction(
  profile: StrategyProfile,
  actionOrder: readonly ConflictActionId[],
): ConflictActionId {
  const probabilities = normalizeActionProbabilities(profile.probabilities, actionOrder);
  let best = actionOrder[0];
  let bestP = -Infinity;
  for (const actionId of actionOrder) {
    const p = probabilities[actionId];
    if (p > bestP) {
      best = actionId;
      bestP = p;
    }
  }
  return best;
}

export function resolveProtocolStep(
  state: ConflictState,
  protocol: ConflictProtocol = createTrustExchangeProtocol(state.players),
  optionsOrForcedActions?: ConflictStepOptions | readonly ConflictAction[],
): Result<ConflictStepResult, ConflictValidationError> {
  const canonicalState = normalizeConflictState(state);
  const activeProtocol = protocol ?? createTrustExchangeProtocol(canonicalState.players);
  const options = normalizeStepOptions(optionsOrForcedActions);
  const isForced = Boolean(options.forcedJointActions);
  const forcedStrategyMode: ForcedActionStrategyMode = options.forcedActionStrategyMode ?? 'freeze';
  const observations: Partial<Record<ConflictPlayerId, ConflictObservation>> = {};
  const utilities: Partial<Record<ConflictPlayerId, readonly ActionUtilityBreakdown[]>> = {};
  const nextProfiles: Partial<Record<ConflictPlayerId, StrategyProfile>> = {};
  const chosen: Partial<Record<ConflictPlayerId, ConflictActionId>> = {};

  for (const playerId of canonicalState.players) {
    const observation = getObservationForPlayer(canonicalState, activeProtocol, playerId);
    if (!observation.ok) return observation;
    observations[playerId] = observation.value;

    const scored = evaluateActionUtilities(protocol, observation.value);
    utilities[playerId] = scored;

    const currentProfile = canonicalState.strategyProfiles[playerId] ?? uniformStrategy(playerId, activeProtocol.actionOrder);
    const nextProfile = isForced && forcedStrategyMode === 'freeze'
      ? {
        playerId: currentProfile.playerId,
        probabilities: normalizeActionProbabilities(currentProfile.probabilities, activeProtocol.actionOrder),
      }
      : updateStrategyProfileReplicator(currentProfile, scored, activeProtocol.actionOrder);
    nextProfiles[playerId] = nextProfile;
    chosen[playerId] = selectDominantAction(nextProfile, activeProtocol.actionOrder);
  }

  const actions = options.forcedJointActions
    ? validateJointAction(canonicalState, activeProtocol, options.forcedJointActions)
    : validateJointAction(
      canonicalState,
      activeProtocol,
      canonicalState.players.map((playerId) => ({ playerId, actionId: chosen[playerId] as ConflictActionId })),
    );
  if (!actions.ok) return actions;

  const baseOutcome = resolveTrustExchangeOutcome(canonicalState, actions.value);
  const artifacts = buildLearningArtifacts(
    canonicalState,
    activeProtocol,
    actions.value,
    baseOutcome,
    observations as Readonly<Record<ConflictPlayerId, ConflictObservation>>,
    utilities as Readonly<Record<ConflictPlayerId, readonly ActionUtilityBreakdown[]>>,
    isForced && forcedStrategyMode === 'freeze',
  );
  const nextState = applyConflictTransition(
    canonicalState,
    artifacts.outcome,
    activeProtocol,
    nextProfiles as Readonly<Record<ConflictPlayerId, StrategyProfile>>,
    artifacts.memories,
    artifacts.regimes,
    artifacts.frames,
  );

  return {
    ok: true,
    value: {
      state: nextState,
      observations: observations as Readonly<Record<ConflictPlayerId, ConflictObservation>>,
      utilities: utilities as Readonly<Record<ConflictPlayerId, readonly ActionUtilityBreakdown[]>>,
      strategyProfiles: nextProfiles as Readonly<Record<ConflictPlayerId, StrategyProfile>>,
      actions: actions.value,
      outcome: artifacts.outcome,
      intervention: isForced
        ? {
          forced: true,
          strategyMode: forcedStrategyMode,
          note: forcedStrategyMode === 'freeze'
            ? 'Forced joint actions are treated as external intervention; strategy profiles are carried forward unchanged.'
            : 'Forced joint actions are applied to the outcome while strategy profiles still learn from utility scores.',
        }
        : undefined,
    },
  };
}

function buildLearningArtifacts(
  state: CanonicalConflictState,
  protocol: ConflictProtocol,
  actions: Readonly<Record<ConflictPlayerId, ConflictActionId>>,
  baseOutcome: ConflictOutcome,
  observations: Readonly<Record<ConflictPlayerId, ConflictObservation>>,
  utilities: Readonly<Record<ConflictPlayerId, readonly ActionUtilityBreakdown[]>>,
  freezeLearning: boolean,
): {
  outcome: ConflictOutcome;
  memories: DirectedMemoryMap;
  regimes: DirectedRegimeMap;
  frames: readonly ConflictTrajectoryFrame[];
} {
  const relationDeltas: Record<ConflictPlayerId, Record<ConflictPlayerId, RelationDelta>> = {};
  const memories: Record<ConflictPlayerId, Record<ConflictPlayerId, ReturnType<typeof cloneConflictMemory>>> = {};
  const regimes: Record<ConflictPlayerId, Record<ConflictPlayerId, ConflictRegimeState>> = {};
  const frames: ConflictTrajectoryFrame[] = [];
  const relationAfterByKey: Record<string, ConflictRelationState> = {};

  for (const playerId of state.players) {
    const otherId = otherPlayer(state, playerId) as ConflictPlayerId;
    const myActionId = actions[playerId];
    const otherActionId = actions[otherId];
    const relationBefore = state.relations[playerId][otherId];
    const memoryBefore = state.memories[playerId][otherId];
    const observedImpact = actionImpactForTrustExchange(otherActionId);
    const ownImpact = actionImpactForTrustExchange(myActionId);
    const prediction = computePredictionError(memoryBefore, myActionId, otherActionId, protocol.actionOrder);
    const relationDelta = computeRelationDelta({
      relationBefore,
      memoryBefore,
      observedImpact,
      ownImpact,
      predictionError: prediction.predictionError,
    });
    relationDeltas[playerId] = { [otherId]: relationDelta };
    relationAfterByKey[relationKey(playerId, otherId)] = applyDirectedRelationDelta(relationBefore, relationDelta);
  }

  for (const playerId of state.players) {
    const otherId = otherPlayer(state, playerId) as ConflictPlayerId;
    const myActionId = actions[playerId];
    const otherActionId = actions[otherId];
    const relationBefore = state.relations[playerId][otherId];
    const relationAfter = relationAfterByKey[relationKey(playerId, otherId)];
    const memoryBefore = state.memories[playerId][otherId];
    const regimeBefore = state.regimes[playerId][otherId];
    const observedImpact = actionImpactForTrustExchange(otherActionId);
    const ownImpact = actionImpactForTrustExchange(myActionId);
    const prediction = computePredictionError(memoryBefore, myActionId, otherActionId, protocol.actionOrder);
    const reward = computeReward({
      payoff: baseOutcome.payoffs[playerId] ?? 0,
      actionId: myActionId,
      relationBefore,
      relationAfter,
      ownImpact,
      observedImpact,
    });
    const memoryAfter = freezeLearning
      ? cloneConflictMemory(memoryBefore)
      : updateConflictMemory({
        memoryBefore,
        myActionId,
        otherActionId,
        reward,
        predictionError: prediction.predictionError,
        observedImpact,
        ownImpact,
        relationBefore,
      });
    const regimeAfter = applyRegimeHysteresis(regimeBefore, relationAfter, memoryAfter);

    if (!memories[playerId]) memories[playerId] = {};
    if (!regimes[playerId]) regimes[playerId] = {};
    memories[playerId][otherId] = memoryAfter;
    regimes[playerId][otherId] = regimeAfter;

    frames.push({
      tick: state.tick,
      protocolId: protocol.id,
      phaseId: 'resolution',
      agentId: playerId,
      otherId,
      actionId: myActionId,
      otherActionId,
      utility: buildUtilityTrace(utilities[playerId] ?? [], myActionId),
      prediction: {
        expectedOtherActionId: prediction.expectedOtherActionId,
        observedOtherActionId: otherActionId,
        predictedProbability: prediction.predictedProbability,
        predictionError: prediction.predictionError,
      },
      relationBefore: { ...relationBefore },
      relationDelta: relationDeltas[playerId][otherId],
      relationAfter: { ...relationAfter },
      memoryBefore: cloneConflictMemory(memoryBefore),
      memoryAfter: cloneConflictMemory(memoryAfter),
      reward,
      regimeBefore: { ...regimeBefore },
      regimeAfter: { ...regimeAfter },
      impact: observedImpact,
    });
  }

  return {
    outcome: {
      ...baseOutcome,
      relationDeltas,
    },
    memories: mergeDirectedMap(state.memories, memories) as DirectedMemoryMap,
    regimes: mergeDirectedMap(state.regimes, regimes) as DirectedRegimeMap,
    frames,
  };
}

function buildUtilityTrace(
  utilities: readonly ActionUtilityBreakdown[],
  actionId: ConflictActionId,
): ConflictTrajectoryFrame['utility'] {
  const sorted = [...utilities].sort((a, b) => {
    if (b.U !== a.U) return b.U - a.U;
    return a.actionId.localeCompare(b.actionId);
  });
  const selected = utilities.find((u) => u.actionId === actionId) ?? sorted[0];
  const secondBest = sorted.find((u) => u.actionId !== selected?.actionId);
  return {
    baseU: selected?.baseU ?? selected?.U ?? 0,
    learnedQ: selected?.learnedQ ?? 0,
    expectedResponse: selected?.expectedResponse ?? 0,
    finalU: selected?.U ?? 0,
    marginFromSecondBest: (selected?.U ?? 0) - (secondBest?.U ?? selected?.U ?? 0),
  };
}

function mergeDirectedMap<T>(
  base: Readonly<Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, T>>>>,
  patch: Record<ConflictPlayerId, Record<ConflictPlayerId, T>>,
): Record<ConflictPlayerId, Record<ConflictPlayerId, T>> {
  const out: Record<ConflictPlayerId, Record<ConflictPlayerId, T>> = {};
  for (const fromId of Object.keys(base)) {
    out[fromId] = { ...(base[fromId] as Record<ConflictPlayerId, T>), ...(patch[fromId] ?? {}) };
  }
  for (const fromId of Object.keys(patch)) {
    out[fromId] = { ...(out[fromId] ?? {}), ...patch[fromId] };
  }
  return out;
}

function relationKey(fromId: ConflictPlayerId, toId: ConflictPlayerId): string {
  return `${fromId}->${toId}`;
}

export function applyConflictTransition(
  state: ConflictState,
  outcome: ConflictOutcome,
  protocol: ConflictProtocol = createTrustExchangeProtocol(state.players),
  strategyProfiles: Readonly<Record<ConflictPlayerId, StrategyProfile>> = state.strategyProfiles,
  memories = normalizeConflictState(state).memories,
  regimes = normalizeConflictState(state).regimes,
  frames: readonly ConflictTrajectoryFrame[] = [],
): ConflictState {
  const canonicalState = normalizeConflictState(state);
  const agents: Record<ConflictPlayerId, ConflictAgentState> = {};
  for (const playerId of canonicalState.players) {
    agents[playerId] = applyAgentDelta(canonicalState.agents[playerId], outcome.agentDeltas[playerId] ?? {});
  }

  const relations: Record<ConflictPlayerId, Record<ConflictPlayerId, ConflictRelationState>> = {};
  for (const fromId of canonicalState.players) {
    relations[fromId] = {};
    for (const toId of canonicalState.players) {
      if (fromId === toId) continue;
      relations[fromId][toId] = applyDirectedRelationDelta(
        canonicalState.relations[fromId][toId],
        outcome.relationDeltas[fromId]?.[toId] ?? {},
      );
    }
  }

  return {
    tick: canonicalState.tick + 1,
    players: canonicalState.players,
    agents,
    relations,
    environment: {
      resourceScarcity: boundedLogitShift(canonicalState.environment.resourceScarcity, outcome.environmentDelta.resourceScarcity ?? 0, cfg.transition.environmentDriveScale.resourceScarcity),
      externalPressure: boundedLogitShift(canonicalState.environment.externalPressure, outcome.environmentDelta.externalPressure ?? 0, cfg.transition.environmentDriveScale.externalPressure),
      visibility: boundedLogitShift(canonicalState.environment.visibility, outcome.environmentDelta.visibility ?? 0, cfg.transition.environmentDriveScale.visibility),
      institutionalPressure: boundedLogitShift(canonicalState.environment.institutionalPressure, outcome.environmentDelta.institutionalPressure ?? 0, cfg.transition.environmentDriveScale.institutionalPressure),
    },
    history: [
      ...canonicalState.history,
      {
        tick: canonicalState.tick,
        protocolId: protocol.id,
        actions: outcome.actions,
        outcomeTag: outcome.outcomeTag,
        payoffs: outcome.payoffs,
      },
    ],
    memories,
    regimes,
    strategyProfiles,
    trace: [...canonicalState.trace, ...frames],
  };
}

export function runConflictTrajectory(
  initialState: ConflictState,
  protocol: ConflictProtocol = createTrustExchangeProtocol(initialState.players),
  steps: number,
  forcedActionsByStep?: readonly (readonly ConflictAction[])[],
): Result<readonly ConflictStepResult[], ConflictValidationError> {
  let state = normalizeConflictState(initialState);
  const results: ConflictStepResult[] = [];

  for (let i = 0; i < steps; i++) {
    const step = resolveProtocolStep(state, protocol, forcedActionsByStep?.[i]);
    if (!step.ok) return step;
    results.push(step.value);
    state = step.value.state;
  }

  return { ok: true, value: results };
}

function applyAgentDelta(agent: ConflictAgentState, delta: AgentDelta): ConflictAgentState {
  return {
    goalPressure: boundedLogitShift(agent.goalPressure, delta.goalPressure ?? 0, cfg.transition.agentDriveScale.goalPressure),
    fear: boundedLogitShift(agent.fear, delta.fear ?? 0, cfg.transition.agentDriveScale.fear),
    stress: boundedLogitShift(agent.stress, delta.stress ?? 0, cfg.transition.agentDriveScale.stress),
    resentment: boundedLogitShift(agent.resentment, delta.resentment ?? 0, cfg.transition.agentDriveScale.resentment),
    loyalty: boundedLogitShift(agent.loyalty, delta.loyalty ?? 0, cfg.transition.agentDriveScale.loyalty),
    dominanceNeed: boundedLogitShift(agent.dominanceNeed, delta.dominanceNeed ?? 0, cfg.transition.agentDriveScale.dominanceNeed),
    cooperationTendency: boundedLogitShift(agent.cooperationTendency, delta.cooperationTendency ?? 0, cfg.transition.agentDriveScale.cooperationTendency),
    will: boundedLogitShift(agent.will, delta.will ?? 0, cfg.transition.agentDriveScale.will),
  };
}

function normalizeStepOptions(optionsOrForcedActions?: ConflictStepOptions | readonly ConflictAction[]): ConflictStepOptions {
  if (!optionsOrForcedActions) return {};
  if (Array.isArray(optionsOrForcedActions)) {
    return { forcedJointActions: optionsOrForcedActions, forcedActionStrategyMode: 'freeze' };
  }
  return optionsOrForcedActions;
}

function otherPlayer(state: ConflictState, playerId: ConflictPlayerId): ConflictPlayerId | null {
  if (state.players[0] === playerId) return state.players[1];
  if (state.players[1] === playerId) return state.players[0];
  return null;
}
