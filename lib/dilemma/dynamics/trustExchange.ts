import { CONFLICT_LAB_DYNAMICS_FORMULA } from '../../config/formulaConfig';
import { clamp01 } from '../../util/math';
import {
  computeExpectedResponseUtility,
  learnedActionValue,
} from './learningDynamics';
import type {
  ActionUtilityBreakdown,
  AgentDelta,
  ConflictActionId,
  ConflictAgentState,
  ConflictObservation,
  ConflictOutcome,
  ConflictPlayerId,
  ConflictProtocol,
  ConflictRelationState,
  ConflictRole,
  ConflictState,
  RelationDelta,
} from './types';

const cfg = CONFLICT_LAB_DYNAMICS_FORMULA;

export const TRUST_EXCHANGE_ACTION_ORDER = ['trust', 'withhold', 'betray'] as const satisfies readonly ConflictActionId[];

type TrustExchangeRelationMode =
  | 'mutual_trust'
  | 'betrayal_victim'
  | 'betrayal_actor'
  | 'mutual_betrayal'
  | 'guarded';

export function createTrustExchangeProtocol(players: readonly [ConflictPlayerId, ConflictPlayerId]): ConflictProtocol {
  const roles: Record<ConflictPlayerId, ConflictRole> = {
    [players[0]]: 'participant',
    [players[1]]: 'participant',
  };
  return {
    id: 'trust_exchange',
    roles,
    phases: ['simultaneous_choice', 'resolution'],
    actionOrder: TRUST_EXCHANGE_ACTION_ORDER,
  };
}

export function evaluateTrustExchangeUtilities(
  observation: ConflictObservation,
): readonly ActionUtilityBreakdown[] {
  return TRUST_EXCHANGE_ACTION_ORDER.map((actionId) => scoreTrustExchangeAction(actionId, observation));
}

export function resolveTrustExchangeOutcome(
  state: ConflictState,
  actions: Readonly<Record<ConflictPlayerId, ConflictActionId>>,
): ConflictOutcome {
  const [a, b] = state.players;
  const aAction = actions[a];
  const bAction = actions[b];

  if (aAction === 'trust' && bAction === 'trust') {
    return symmetricOutcome(state, 'mutual_trust', actions, cfg.trustExchange.mutualTrust.payoff, cfg.trustExchange.mutualTrust.agent, cfg.trustExchange.mutualTrust.relation, 'mutual_trust', ['trust_reinforced']);
  }

  if (aAction === 'betray' && bAction === 'betray') {
    return symmetricOutcome(state, 'mutual_betrayal', actions, cfg.trustExchange.mutualBetray.payoff, cfg.trustExchange.mutualBetray.agent, cfg.trustExchange.mutualBetray.relation, 'mutual_betrayal', ['betrayal', 'mutual_defection']);
  }

  if (aAction === 'trust' && bAction === 'betray') {
    return asymmetricOutcome(
      state,
      'a_betrayed',
      actions,
      a,
      b,
      cfg.trustExchange.trustVsBetray.victimPayoff,
      cfg.trustExchange.trustVsBetray.betrayerPayoff,
      cfg.trustExchange.trustVsBetray.victimAgent,
      cfg.trustExchange.trustVsBetray.betrayerAgent,
      cfg.trustExchange.trustVsBetray.victimRelation,
      cfg.trustExchange.trustVsBetray.betrayerRelation,
      'betrayal_victim',
      'betrayal_actor',
      ['betrayal', 'exploitation'],
    );
  }

  if (aAction === 'betray' && bAction === 'trust') {
    return asymmetricOutcome(
      state,
      'b_betrayed',
      actions,
      b,
      a,
      cfg.trustExchange.trustVsBetray.victimPayoff,
      cfg.trustExchange.trustVsBetray.betrayerPayoff,
      cfg.trustExchange.trustVsBetray.victimAgent,
      cfg.trustExchange.trustVsBetray.betrayerAgent,
      cfg.trustExchange.trustVsBetray.victimRelation,
      cfg.trustExchange.trustVsBetray.betrayerRelation,
      'betrayal_victim',
      'betrayal_actor',
      ['betrayal', 'exploitation'],
    );
  }

  if (aAction === 'trust' && bAction === 'withhold') {
    return asymmetricOutcome(
      state,
      'a_met_withholding',
      actions,
      a,
      b,
      cfg.trustExchange.trustVsWithhold.trustingPayoff,
      cfg.trustExchange.trustVsWithhold.withholdingPayoff,
      cfg.trustExchange.trustVsWithhold.trustingAgent,
      cfg.trustExchange.trustVsWithhold.withholdingAgent,
      cfg.trustExchange.trustVsWithhold.trustingRelation,
      cfg.trustExchange.trustVsWithhold.withholdingRelation,
      'guarded',
      'guarded',
      ['guarded_response'],
    );
  }

  if (aAction === 'withhold' && bAction === 'trust') {
    return asymmetricOutcome(
      state,
      'b_met_withholding',
      actions,
      b,
      a,
      cfg.trustExchange.trustVsWithhold.trustingPayoff,
      cfg.trustExchange.trustVsWithhold.withholdingPayoff,
      cfg.trustExchange.trustVsWithhold.trustingAgent,
      cfg.trustExchange.trustVsWithhold.withholdingAgent,
      cfg.trustExchange.trustVsWithhold.trustingRelation,
      cfg.trustExchange.trustVsWithhold.withholdingRelation,
      'guarded',
      'guarded',
      ['guarded_response'],
    );
  }

  if (aAction === 'betray' && bAction === 'withhold') {
    return asymmetricOutcome(
      state,
      'a_betrayal_blocked',
      actions,
      b,
      a,
      cfg.trustExchange.betrayVsWithhold.withholdingPayoff,
      cfg.trustExchange.betrayVsWithhold.betrayerPayoff,
      cfg.trustExchange.betrayVsWithhold.withholdingAgent,
      cfg.trustExchange.betrayVsWithhold.betrayerAgent,
      cfg.trustExchange.betrayVsWithhold.withholdingRelation,
      cfg.trustExchange.betrayVsWithhold.betrayerRelation,
      'betrayal_victim',
      'betrayal_actor',
      ['blocked_betrayal'],
    );
  }

  if (aAction === 'withhold' && bAction === 'betray') {
    return asymmetricOutcome(
      state,
      'b_betrayal_blocked',
      actions,
      a,
      b,
      cfg.trustExchange.betrayVsWithhold.withholdingPayoff,
      cfg.trustExchange.betrayVsWithhold.betrayerPayoff,
      cfg.trustExchange.betrayVsWithhold.withholdingAgent,
      cfg.trustExchange.betrayVsWithhold.betrayerAgent,
      cfg.trustExchange.betrayVsWithhold.withholdingRelation,
      cfg.trustExchange.betrayVsWithhold.betrayerRelation,
      'betrayal_victim',
      'betrayal_actor',
      ['blocked_betrayal'],
    );
  }

  return symmetricOutcome(state, 'mutual_withhold', actions, cfg.trustExchange.guarded.payoff, cfg.trustExchange.guarded.agent, cfg.trustExchange.guarded.relation, 'guarded', ['guarded_stasis']);
}

function scoreTrustExchangeAction(
  actionId: ConflictActionId,
  observation: ConflictObservation,
): ActionUtilityBreakdown {
  const profile = cfg.utility.trustExchange[actionId];
  const weights = cfg.utility.weights;
  const mod = cfg.utility.modulation;
  const self = observation.self;
  const relation = observation.relationToOther;
  const memory = observation.memoryToOther;
  const env = observation.environment;

  const relationQuality = clamp01(
    mod.relationQuality.trust * relation.trust
    + mod.relationQuality.bond * relation.bond
    + mod.relationQuality.legitimacy * relation.perceivedLegitimacy,
  );
  const danger = clamp01(
    mod.danger.perceivedThreat * relation.perceivedThreat
    + mod.danger.resourceScarcity * env.resourceScarcity
    + mod.danger.fear * self.fear,
  );
  const conflictPressure = clamp01(
    mod.conflictPressure.conflict * relation.conflict
    + mod.conflictPressure.resentment * self.resentment
    + mod.conflictPressure.stress * self.stress,
  );
  const cooperativeIdentity = clamp01(
    mod.cooperativeIdentity.cooperationTendency * self.cooperationTendency
    + mod.cooperativeIdentity.loyalty * self.loyalty
    + mod.cooperativeIdentity.antiDominance * (1 - self.dominanceNeed),
  );
  const opportunityPressure = clamp01(
    mod.opportunityPressure.goalPressure * self.goalPressure
    + mod.opportunityPressure.resourceScarcity * env.resourceScarcity
    + mod.opportunityPressure.will * self.will,
  );

  const G = profile.goal + opportunityPressure * (actionId === 'betray' ? mod.goalOpportunity.betray : mod.goalOpportunity.other);
  const R = profile.relation + relationQuality - conflictPressure;
  const S = profile.security - danger + (actionId === 'withhold' ? mod.withholdSafetyBonus : 0);
  const L = profile.legitimacy + relation.perceivedLegitimacy + env.institutionalPressure * (actionId === 'betray' ? mod.institutional.betray : mod.institutional.other);
  const I = profile.identity + cooperativeIdentity * (actionId === 'betray' ? mod.identity.betray : mod.identity.other);
  const P = profile.prediction + relation.trust - relation.perceivedThreat;
  const C = profile.cost + self.stress * mod.cost.stress + env.visibility * (actionId === 'betray' ? mod.cost.betrayVisibility : mod.cost.otherVisibility);
  const baseU =
    weights.goal * G
    + weights.relation * R
    + weights.security * S
    + weights.legitimacy * L
    + weights.identity * I
    + weights.prediction * P
    - weights.cost * C;
  const learnedQ = learnedActionValue(memory, actionId);
  const expectedResponse = computeExpectedResponseUtility(memory, actionId, TRUST_EXCHANGE_ACTION_ORDER);
  const volatilityPenalty = memory.volatility * (actionId === 'trust' ? 0.35 : actionId === 'betray' ? 0.25 : 0.10);
  const betrayalDebtPenalty = memory.betrayalDebt * (actionId === 'trust' ? 0.45 : actionId === 'withhold' ? 0.16 : 0.08);
  const learning = cfg.learningUtility;
  const U =
    baseU
    + learning.learnedQWeight * learnedQ
    + learning.expectedResponseWeight * expectedResponse
    - learning.volatilityPenaltyWeight * volatilityPenalty
    - learning.betrayalDebtPenaltyWeight * betrayalDebtPenalty;

  return { actionId, U, baseU, learnedQ, expectedResponse, volatilityPenalty, betrayalDebtPenalty, G, R, S, L, I, P, C };
}

function symmetricOutcome(
  state: ConflictState,
  outcomeTag: string,
  actions: Readonly<Record<ConflictPlayerId, ConflictActionId>>,
  payoff: number,
  agentDelta: AgentDelta,
  relationDelta: RelationDelta,
  relationMode: TrustExchangeRelationMode,
  eventTags: readonly string[],
): ConflictOutcome {
  const [a, b] = state.players;
  return {
    protocolId: 'trust_exchange',
    outcomeTag,
    actions,
    payoffs: { [a]: payoff, [b]: payoff },
    agentDeltas: { [a]: agentDelta, [b]: agentDelta },
    relationDeltas: {
      [a]: { [b]: computeTrustExchangeRelationDelta(state, a, b, relationDelta, relationMode) },
      [b]: { [a]: computeTrustExchangeRelationDelta(state, b, a, relationDelta, relationMode) },
    },
    environmentDelta: {},
    eventTags,
  };
}

function asymmetricOutcome(
  state: ConflictState,
  outcomeTag: string,
  actions: Readonly<Record<ConflictPlayerId, ConflictActionId>>,
  firstPlayer: ConflictPlayerId,
  secondPlayer: ConflictPlayerId,
  firstPayoff: number,
  secondPayoff: number,
  firstAgentDelta: AgentDelta,
  secondAgentDelta: AgentDelta,
  firstRelationDelta: RelationDelta,
  secondRelationDelta: RelationDelta,
  firstRelationMode: TrustExchangeRelationMode,
  secondRelationMode: TrustExchangeRelationMode,
  eventTags: readonly string[],
): ConflictOutcome {
  return {
    protocolId: 'trust_exchange',
    outcomeTag,
    actions,
    payoffs: { [firstPlayer]: firstPayoff, [secondPlayer]: secondPayoff },
    agentDeltas: { [firstPlayer]: firstAgentDelta, [secondPlayer]: secondAgentDelta },
    relationDeltas: {
      [firstPlayer]: { [secondPlayer]: computeTrustExchangeRelationDelta(state, firstPlayer, secondPlayer, firstRelationDelta, firstRelationMode) },
      [secondPlayer]: { [firstPlayer]: computeTrustExchangeRelationDelta(state, secondPlayer, firstPlayer, secondRelationDelta, secondRelationMode) },
    },
    environmentDelta: {},
    eventTags,
  };
}

function computeTrustExchangeRelationDelta(
  state: ConflictState,
  fromId: ConflictPlayerId,
  toId: ConflictPlayerId,
  baseDelta: RelationDelta,
  mode: TrustExchangeRelationMode,
): RelationDelta {
  const relationBefore = state.relations[fromId][toId];
  const dynamics = cfg.transitionDynamics.trustExchange;
  const pressure = clamp01(
    0.5 * state.environment.resourceScarcity
    + 0.3 * state.environment.externalPressure
    + 0.2 * state.environment.visibility,
  );

  const scale = mode === 'mutual_trust'
    ? 1
      + dynamics.repairLowTrustAmplifier * (1 - relationBefore.trust)
      + dynamics.repairLowBondAmplifier * (1 - relationBefore.bond)
      + dynamics.repairConflictAmplifier * relationBefore.conflict
    : mode === 'betrayal_victim'
      ? 1
        + dynamics.betrayalTrustAmplifier * relationBefore.trust
        + dynamics.betrayalBondAmplifier * relationBefore.bond
        + dynamics.betrayalPressureAmplifier * pressure
      : mode === 'mutual_betrayal'
        ? 1
          + 0.5 * dynamics.betrayalTrustAmplifier * relationBefore.trust
          + dynamics.betrayalPressureAmplifier * pressure
        : mode === 'guarded'
          ? 1
            + dynamics.guardedConflictAmplifier * relationBefore.conflict
            + dynamics.guardedScarcityAmplifier * state.environment.resourceScarcity
          : 1;

  return scaleRelationDelta(baseDelta, scale);
}

function scaleRelationDelta(delta: RelationDelta, scale: number): RelationDelta {
  const safeScale = Number.isFinite(scale) ? Math.max(0, scale) : 1;
  return {
    ...(delta.trust !== undefined ? { trust: delta.trust * safeScale } : {}),
    ...(delta.bond !== undefined ? { bond: delta.bond * safeScale } : {}),
    ...(delta.perceivedThreat !== undefined ? { perceivedThreat: delta.perceivedThreat * safeScale } : {}),
    ...(delta.conflict !== undefined ? { conflict: delta.conflict * safeScale } : {}),
    ...(delta.perceivedLegitimacy !== undefined ? { perceivedLegitimacy: delta.perceivedLegitimacy * safeScale } : {}),
  };
}

export function defaultConflictAgentState(patch?: Partial<ConflictAgentState>): ConflictAgentState {
  return {
    goalPressure: 0.5,
    fear: 0.2,
    stress: 0.2,
    resentment: 0.1,
    loyalty: 0.5,
    dominanceNeed: 0.4,
    cooperationTendency: 0.55,
    will: 0.6,
    ...(patch ?? {}),
  };
}

export function defaultConflictRelationState(patch?: Partial<ConflictRelationState>): ConflictRelationState {
  return {
    trust: 0.5,
    bond: 0.3,
    perceivedThreat: 0.2,
    conflict: 0.2,
    perceivedLegitimacy: 0.5,
    volatility: 0,
    ...(patch ?? {}),
  };
}
