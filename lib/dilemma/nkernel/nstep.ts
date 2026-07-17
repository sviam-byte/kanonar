// NKERNEL-FOUNDATION-0 §3.3 conflict-nstep-v1: forced-joint-action N-step via
// pairwise decomposition (§2). Reuse, not re-implementation: each unordered
// pair {i, j} is resolved by the REAL dyadic kernel (resolveProtocolStep on the
// pair projection), and player-level folds follow the signed ADR §5.1/§5.4 —
// agentDeltas mean over the player's N−1 pairs, payoffs summed round-robin,
// directed relation/memory/regime slots assembled disjointly per pair,
// outcomeTag/eventTags passed through verbatim at N = 2 and aggregated
// deterministically at N > 2. At N = 2 every fold is a fold-of-one, so the
// result reproduces resolveProtocolStep exactly — the reduction oracle in
// tests/dilemma/nkernel_step_v1.test.ts pins this.

import { codeUnitCompare } from '../../utils/compare';
import {
  applyConflictTransition,
  resolveProtocolStep,
  validateJointAction,
} from '../dynamics/engine';
import { normalizeActionProbabilities } from '../dynamics/math';
import { createTrustExchangeProtocol } from '../dynamics/trustExchange';
import type { ConflictLearningMemory } from '../learningMemory';
import type {
  ActionUtilityBreakdown,
  AgentDelta,
  ConflictObservation,
  ConflictOutcome,
  ConflictPlayerId,
  ConflictRegimeState,
  ConflictStepResult,
  ConflictTrajectoryFrame,
  ForcedActionStrategyMode,
  RelationDelta,
  StrategyProfile,
} from '../dynamics/types';
import { asKernelConflictStateV1, dyadicPairProjectionV1, normalizeConflictStateNV1 } from './nstate';
import {
  CONFLICT_NSTEP_SCHEMA_VERSION,
  type ConflictNStepInputV1,
  type ConflictNStepPairV1,
  type ConflictNStepResultOrErrorV1,
} from './types';

// ADR §5.4: deterministic aggregate tag for N > 2; per-pair tags stay in the
// pairwise provenance. At N = 2 the single pair's tag passes through verbatim.
export const N_PAIRWISE_OUTCOME_TAG = 'n_pairwise' as const;

export function resolveConflictNStepV1(input: ConflictNStepInputV1): ConflictNStepResultOrErrorV1 {
  const normalized = normalizeConflictStateNV1(input.state);
  if (normalized.ok === false) return normalized;
  const canonical = normalized.value;
  const players = canonical.players;
  const protocol = input.protocol;
  const mode: ForcedActionStrategyMode = input.forcedActionStrategyMode ?? 'freeze';

  for (const playerId of players) {
    if (!protocol.roles[playerId]) {
      return { ok: false, error: { code: 'invalid_protocol', message: `Protocol ${protocol.id} has no role for player ${playerId}` } };
    }
  }

  if (mode === 'learn_from_utility' && players.length > 2) {
    return {
      ok: false,
      error: {
        code: 'unsupported_strategy_mode_for_n',
        playerCount: players.length,
        message: `forcedActionStrategyMode 'learn_from_utility' is fail-closed at N = ${players.length} until the NKERNEL-CHOICE-0 aggregation ADR is signed (NKERNEL_FOUNDATION_0 §5.2)`,
      },
    };
  }

  const actions = validateJointAction(asKernelConflictStateV1(canonical), protocol, input.forcedJointActions);
  if (actions.ok === false) return actions;

  // Pairwise decomposition (§2): run the dyadic kernel per unordered pair in
  // declared order, harvest outcome/observations/utilities plus the directed
  // memory/regime slots and the new trace frames from the pair result state
  // (the projection resets trace to [], so the pair state's trace IS the new
  // frames); the pair's own agents/environment/history/tick are discarded.
  const pairwise: ConflictNStepPairV1[] = [];
  const pairSteps: ConflictStepResult[] = [];
  const observations: Record<ConflictPlayerId, Record<ConflictPlayerId, ConflictObservation>> = {};
  const utilities: Record<ConflictPlayerId, Record<ConflictPlayerId, readonly ActionUtilityBreakdown[]>> = {};
  const foldedMemories: Record<ConflictPlayerId, Record<ConflictPlayerId, ConflictLearningMemory>> = {};
  const foldedRegimes: Record<ConflictPlayerId, Record<ConflictPlayerId, ConflictRegimeState>> = {};
  const frames: ConflictTrajectoryFrame[] = [];

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      const projection = dyadicPairProjectionV1(canonical, a, b);
      if (projection.ok === false) return projection;

      const pairStep = resolveProtocolStep(projection.value, createTrustExchangeProtocol([a, b]), {
        forcedJointActions: [
          { playerId: a, actionId: actions.value[a] },
          { playerId: b, actionId: actions.value[b] },
        ],
        forcedActionStrategyMode: mode,
      });
      if (pairStep.ok === false) {
        return {
          ok: false,
          error: { code: 'pair_step_failed', pair: [a, b], cause: pairStep.error, message: `Pair (${a}, ${b}) step failed: ${pairStep.error.message}` },
        };
      }

      const pairState = pairStep.value.state;
      const pairMemories = pairState.memories;
      const pairRegimes = pairState.regimes;
      const pairTrace = pairState.trace;
      if (!pairMemories || !pairRegimes || !pairTrace) {
        return {
          ok: false,
          error: {
            code: 'pair_step_failed',
            pair: [a, b],
            cause: { code: 'invalid_state', message: 'pair step returned a state without memories/regimes/trace' },
            message: `Pair (${a}, ${b}) step returned a non-canonical state`,
          },
        };
      }

      pairwise.push({ pair: [a, b], outcome: pairStep.value.outcome });
      pairSteps.push(pairStep.value);
      setDirected(observations, a, b, pairStep.value.observations[a]);
      setDirected(observations, b, a, pairStep.value.observations[b]);
      setDirected(utilities, a, b, pairStep.value.utilities[a]);
      setDirected(utilities, b, a, pairStep.value.utilities[b]);
      setDirected(foldedMemories, a, b, pairMemories[a][b]);
      setDirected(foldedMemories, b, a, pairMemories[b][a]);
      setDirected(foldedRegimes, a, b, pairRegimes[a][b]);
      setDirected(foldedRegimes, b, a, pairRegimes[b][a]);
      frames.push(...pairTrace);
    }
  }

  // Player-level folds (§2, ADR §5.1): payoffs summed, agentDeltas averaged
  // over the player's N−1 pairs; every ordered slot belongs to exactly one
  // unordered pair, so relation deltas assemble disjointly.
  const payoffs: Record<ConflictPlayerId, number> = {};
  const agentDeltas: Record<ConflictPlayerId, AgentDelta> = {};
  for (const playerId of players) {
    const contributions = pairwise.filter((entry) => entry.pair.includes(playerId));
    let payoff = 0;
    for (const entry of contributions) payoff += entry.outcome.payoffs[playerId] ?? 0;
    payoffs[playerId] = payoff;
    agentDeltas[playerId] = foldAgentDeltaMean(
      contributions.map((entry) => entry.outcome.agentDeltas[playerId] ?? {}),
      players.length - 1,
    );
  }

  const relationDeltas: Record<ConflictPlayerId, Record<ConflictPlayerId, RelationDelta>> = {};
  for (const entry of pairwise) {
    const [a, b] = entry.pair;
    const deltaAB = entry.outcome.relationDeltas[a]?.[b];
    if (deltaAB) setDirected(relationDeltas, a, b, deltaAB);
    const deltaBA = entry.outcome.relationDeltas[b]?.[a];
    if (deltaBA) setDirected(relationDeltas, b, a, deltaBA);
  }

  const singlePair = pairwise.length === 1;
  const outcome: ConflictOutcome = {
    protocolId: pairwise[0].outcome.protocolId,
    outcomeTag: singlePair ? pairwise[0].outcome.outcomeTag : N_PAIRWISE_OUTCOME_TAG,
    actions: actions.value,
    payoffs,
    agentDeltas,
    relationDeltas,
    // trust_exchange never emits an environment delta; pass the single pair's
    // through verbatim at N = 2, empty at N > 2 (NKERNEL_FOUNDATION_0 §3.3).
    environmentDelta: singlePair ? pairwise[0].outcome.environmentDelta : {},
    eventTags: singlePair ? pairwise[0].outcome.eventTags : sortedTagUnion(pairwise),
  };

  // ADR §5.2: 'freeze' recomputes the normalized pass-through at N level
  // (byte-equal to the kernel's freeze branch); 'learn_from_utility' is only
  // reachable at N = 2 here — identity aggregation of the single pair's
  // replicator output.
  const strategyProfiles: Record<ConflictPlayerId, StrategyProfile> = {};
  if (mode === 'freeze') {
    for (const playerId of players) {
      const current = canonical.strategyProfiles[playerId];
      strategyProfiles[playerId] = {
        playerId: current.playerId,
        probabilities: normalizeActionProbabilities(current.probabilities, protocol.actionOrder),
      };
    }
  } else {
    for (const playerId of players) {
      strategyProfiles[playerId] = pairSteps[0].strategyProfiles[playerId];
    }
  }

  const nextState = applyConflictTransition(
    asKernelConflictStateV1(canonical),
    outcome,
    protocol,
    strategyProfiles,
    foldedMemories,
    foldedRegimes,
    frames,
  );

  return {
    ok: true,
    value: {
      schemaVersion: CONFLICT_NSTEP_SCHEMA_VERSION,
      state: nextState,
      actions: actions.value,
      outcome,
      pairwise,
      observations,
      utilities,
      strategyProfiles,
    },
  };
}

function setDirected<T>(
  map: Record<ConflictPlayerId, Record<ConflictPlayerId, T>>,
  fromId: ConflictPlayerId,
  toId: ConflictPlayerId,
  value: T,
): void {
  if (!map[fromId]) map[fromId] = {};
  map[fromId][toId] = value;
}

// Mean over the player's pairs with an absent summand counted as 0; a field is
// present in the fold only if at least one pair emitted it, which keeps the
// N = 2 fold-of-one structurally identical to the single pair delta.
function foldAgentDeltaMean(contributions: readonly AgentDelta[], divisor: number): AgentDelta {
  const keys = new Set<string>();
  for (const contribution of contributions) {
    for (const key of Object.keys(contribution)) {
      if ((contribution as Record<string, number | undefined>)[key] !== undefined) keys.add(key);
    }
  }
  const out: Record<string, number> = {};
  for (const key of [...keys].sort(codeUnitCompare)) {
    let sum = 0;
    for (const contribution of contributions) {
      sum += (contribution as Record<string, number | undefined>)[key] ?? 0;
    }
    out[key] = sum / divisor;
  }
  return out as AgentDelta;
}

function sortedTagUnion(pairwise: readonly ConflictNStepPairV1[]): readonly string[] {
  const tags = new Set<string>();
  for (const entry of pairwise) {
    for (const tag of entry.outcome.eventTags) tags.add(tag);
  }
  return [...tags].sort(codeUnitCompare);
}
