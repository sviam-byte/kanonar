import { CONFLICT_LAB_DYNAMICS_FORMULA } from '../../config/formulaConfig';
import { boundedLogitShift, finiteOrZero, normalizeActionProbabilities, uniformStrategy } from './math';
import {
  createTrustExchangeProtocol,
  evaluateTrustExchangeUtilities,
  resolveTrustExchangeOutcome,
} from './trustExchange';
import type {
  ActionUtilityBreakdown,
  AgentDelta,
  ConflictAction,
  ConflictActionId,
  ConflictAgentState,
  ConflictObservation,
  ConflictOutcome,
  ConflictPlayerId,
  ConflictProtocol,
  ConflictRelationState,
  ConflictState,
  ConflictStepResult,
  ConflictValidationError,
  Result,
  StrategyProfile,
} from './types';

const cfg = CONFLICT_LAB_DYNAMICS_FORMULA;

export function getObservationForPlayer(
  state: ConflictState,
  protocol: ConflictProtocol,
  playerId: ConflictPlayerId,
): Result<ConflictObservation, ConflictValidationError> {
  const otherId = otherPlayer(state, playerId);
  if (!otherId) {
    return { ok: false, error: { code: 'invalid_player', message: `Player ${playerId} is not in conflict state` } };
  }

  const self = state.agents[playerId];
  const relationToOther = state.relations[playerId]?.[otherId];
  const role = protocol.roles[playerId];
  if (!self || !relationToOther || !role) {
    return { ok: false, error: { code: 'invalid_state', message: `Missing state, relation, or role for ${playerId}` } };
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
      environment: { ...state.environment },
      historyLength: state.history.length,
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
  const seen = new Set<ConflictPlayerId>();
  const actions: Partial<Record<ConflictPlayerId, ConflictActionId>> = {};
  for (const action of jointActions) {
    if (!state.players.includes(action.playerId)) {
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

  for (const playerId of state.players) {
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
  forcedJointActions?: readonly ConflictAction[],
): Result<ConflictStepResult, ConflictValidationError> {
  const observations: Partial<Record<ConflictPlayerId, ConflictObservation>> = {};
  const utilities: Partial<Record<ConflictPlayerId, readonly ActionUtilityBreakdown[]>> = {};
  const nextProfiles: Partial<Record<ConflictPlayerId, StrategyProfile>> = {};
  const chosen: Partial<Record<ConflictPlayerId, ConflictActionId>> = {};

  for (const playerId of state.players) {
    const observation = getObservationForPlayer(state, protocol, playerId);
    if (!observation.ok) return observation;
    observations[playerId] = observation.value;

    const scored = evaluateActionUtilities(protocol, observation.value);
    utilities[playerId] = scored;

    const currentProfile = state.strategyProfiles[playerId] ?? uniformStrategy(playerId, protocol.actionOrder);
    const nextProfile = updateStrategyProfileReplicator(currentProfile, scored, protocol.actionOrder);
    nextProfiles[playerId] = nextProfile;
    chosen[playerId] = selectDominantAction(nextProfile, protocol.actionOrder);
  }

  const actions = forcedJointActions
    ? validateJointAction(state, protocol, forcedJointActions)
    : validateJointAction(
      state,
      protocol,
      state.players.map((playerId) => ({ playerId, actionId: chosen[playerId] as ConflictActionId })),
    );
  if (!actions.ok) return actions;

  const outcome = resolveTrustExchangeOutcome(state, actions.value);
  const nextState = applyConflictTransition(state, outcome, protocol, nextProfiles as Readonly<Record<ConflictPlayerId, StrategyProfile>>);

  return {
    ok: true,
    value: {
      state: nextState,
      observations: observations as Readonly<Record<ConflictPlayerId, ConflictObservation>>,
      utilities: utilities as Readonly<Record<ConflictPlayerId, readonly ActionUtilityBreakdown[]>>,
      strategyProfiles: nextProfiles as Readonly<Record<ConflictPlayerId, StrategyProfile>>,
      actions: actions.value,
      outcome,
    },
  };
}

export function applyConflictTransition(
  state: ConflictState,
  outcome: ConflictOutcome,
  protocol: ConflictProtocol = createTrustExchangeProtocol(state.players),
  strategyProfiles: Readonly<Record<ConflictPlayerId, StrategyProfile>> = state.strategyProfiles,
): ConflictState {
  const agents: Record<ConflictPlayerId, ConflictAgentState> = {};
  for (const playerId of state.players) {
    agents[playerId] = applyAgentDelta(state.agents[playerId], outcome.agentDeltas[playerId] ?? {});
  }

  const relations: Record<ConflictPlayerId, Record<ConflictPlayerId, ConflictRelationState>> = {};
  for (const fromId of state.players) {
    relations[fromId] = {};
    for (const toId of state.players) {
      if (fromId === toId) continue;
      relations[fromId][toId] = applyRelationDelta(
        state.relations[fromId][toId],
        outcome.relationDeltas[fromId]?.[toId] ?? {},
      );
    }
  }

  return {
    tick: state.tick + 1,
    players: state.players,
    agents,
    relations,
    environment: {
      resourceScarcity: boundedLogitShift(state.environment.resourceScarcity, outcome.environmentDelta.resourceScarcity ?? 0, cfg.transition.environmentRetention.resourceScarcity),
      externalPressure: boundedLogitShift(state.environment.externalPressure, outcome.environmentDelta.externalPressure ?? 0, cfg.transition.environmentRetention.externalPressure),
      visibility: boundedLogitShift(state.environment.visibility, outcome.environmentDelta.visibility ?? 0, cfg.transition.environmentRetention.visibility),
      institutionalPressure: boundedLogitShift(state.environment.institutionalPressure, outcome.environmentDelta.institutionalPressure ?? 0, cfg.transition.environmentRetention.institutionalPressure),
    },
    history: [
      ...state.history,
      {
        tick: state.tick,
        protocolId: protocol.id,
        actions: outcome.actions,
        outcomeTag: outcome.outcomeTag,
        payoffs: outcome.payoffs,
      },
    ],
    strategyProfiles,
  };
}

export function runConflictTrajectory(
  initialState: ConflictState,
  protocol: ConflictProtocol = createTrustExchangeProtocol(initialState.players),
  steps: number,
  forcedActionsByStep?: readonly (readonly ConflictAction[])[],
): Result<readonly ConflictStepResult[], ConflictValidationError> {
  let state = initialState;
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
    goalPressure: boundedLogitShift(agent.goalPressure, delta.goalPressure ?? 0, cfg.transition.agentRetention.goalPressure),
    fear: boundedLogitShift(agent.fear, delta.fear ?? 0, cfg.transition.agentRetention.fear),
    stress: boundedLogitShift(agent.stress, delta.stress ?? 0, cfg.transition.agentRetention.stress),
    resentment: boundedLogitShift(agent.resentment, delta.resentment ?? 0, cfg.transition.agentRetention.resentment),
    loyalty: boundedLogitShift(agent.loyalty, delta.loyalty ?? 0, cfg.transition.agentRetention.loyalty),
    dominanceNeed: boundedLogitShift(agent.dominanceNeed, delta.dominanceNeed ?? 0, cfg.transition.agentRetention.dominanceNeed),
    cooperationTendency: boundedLogitShift(agent.cooperationTendency, delta.cooperationTendency ?? 0, cfg.transition.agentRetention.cooperationTendency),
    will: boundedLogitShift(agent.will, delta.will ?? 0, cfg.transition.agentRetention.will),
  };
}

function applyRelationDelta(relation: ConflictRelationState, delta: Partial<Record<keyof ConflictRelationState, number>>): ConflictRelationState {
  return {
    trust: boundedLogitShift(relation.trust, delta.trust ?? 0, cfg.transition.relationRetention.trust),
    bond: boundedLogitShift(relation.bond, delta.bond ?? 0, cfg.transition.relationRetention.bond),
    perceivedThreat: boundedLogitShift(relation.perceivedThreat, delta.perceivedThreat ?? 0, cfg.transition.relationRetention.perceivedThreat),
    conflict: boundedLogitShift(relation.conflict, delta.conflict ?? 0, cfg.transition.relationRetention.conflict),
    perceivedLegitimacy: boundedLogitShift(relation.perceivedLegitimacy, delta.perceivedLegitimacy ?? 0, cfg.transition.relationRetention.perceivedLegitimacy),
  };
}

function otherPlayer(state: ConflictState, playerId: ConflictPlayerId): ConflictPlayerId | null {
  if (state.players[0] === playerId) return state.players[1];
  if (state.players[1] === playerId) return state.players[0];
  return null;
}
