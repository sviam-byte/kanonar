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
  updateStrategyProfileReplicator,
  validateJointAction,
} from '../dynamics/engine';
import { normalizeActionProbabilities } from '../dynamics/math';
import { createTrustExchangeProtocol } from '../dynamics/trustExchange';
import type { ConflictLearningMemory } from '../learningMemory';
import type {
  ActionUtilityBreakdown,
  AgentDelta,
  ConflictActionId,
  ConflictObservation,
  ConflictOutcome,
  ConflictPlayerId,
  ConflictProtocol,
  ConflictRegimeState,
  ConflictTrajectoryFrame,
  ForcedActionStrategyMode,
  RelationDelta,
  StrategyProfile,
} from '../dynamics/types';
import { asKernelConflictStateV1, dyadicPairProjectionV1, normalizeConflictStateNV1 } from './nstate';
import {
  CONFLICT_NSTEP_SCHEMA_VERSION,
  type ConflictNStepInputV1,
  type ConflictNStepErrorV1,
  type ConflictNStepPairV1,
  type ConflictNStepResultOrErrorV1,
} from './types';

// ADR §5.4: deterministic aggregate tag for N > 2; per-pair tags stay in the
// pairwise provenance. At N = 2 the single pair's tag passes through verbatim.
export const N_PAIRWISE_OUTCOME_TAG = 'n_pairwise' as const;

function sameOrderedValues(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function validateCanonicalTrustProtocolNV1(
  players: readonly ConflictPlayerId[],
  protocol: ConflictProtocol,
): ConflictNStepErrorV1 | null {
  if (protocol.id !== 'trust_exchange') {
    return { code: 'invalid_protocol', message: `N-kernel accepts only trust_exchange, got ${protocol.id}` };
  }
  if (!sameOrderedValues(protocol.phases, ['simultaneous_choice', 'resolution'])) {
    return { code: 'invalid_protocol', message: 'N-kernel trust protocol phases are not canonical' };
  }
  if (!sameOrderedValues(protocol.actionOrder, ['trust', 'withhold', 'betray'])) {
    return { code: 'invalid_protocol', message: 'N-kernel trust protocol action order is not canonical' };
  }
  const rolePlayers = Object.keys(protocol.roles);
  if (!sameOrderedValues(rolePlayers, players)
    || rolePlayers.some((playerId) => protocol.roles[playerId] !== 'participant')) {
    return { code: 'invalid_protocol', message: 'N-kernel trust protocol roles do not exactly match ordered participants' };
  }
  return null;
}

export function resolveConflictNStepV1(input: ConflictNStepInputV1): ConflictNStepResultOrErrorV1 {
  const normalized = normalizeConflictStateNV1(input.state);
  if (normalized.ok === false) return normalized;
  const canonical = normalized.value;
  const players = canonical.players;
  const protocol = input.protocol;
  const mode: ForcedActionStrategyMode = input.forcedActionStrategyMode ?? 'freeze';
  const protocolError = validateCanonicalTrustProtocolNV1(players, protocol);
  if (protocolError) return { ok: false, error: protocolError };

  const actions = validateJointAction(asKernelConflictStateV1(canonical), protocol, input.forcedJointActions);
  if (actions.ok === false) return actions;

  // Pairwise decomposition (§2): run the dyadic kernel per unordered pair in
  // declared order, harvest outcome/observations/utilities plus the directed
  // memory/regime slots and the new trace frames from the pair result state
  // (the projection resets trace to [], so the pair state's trace IS the new
  // frames); the pair's own agents/environment/history/tick are discarded.
  const pairwise: ConflictNStepPairV1[] = [];
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

  // ADR §5.2 (aggregation signed 2026-07-18): 'freeze' recomputes the normalized
  // pass-through at N level (byte-equal to the kernel's freeze branch);
  // 'learn_from_utility' runs the kernel replicator at N level over the
  // component-wise MEAN of the player's per-target utilities — at N = 2 the
  // mean is a fold-of-one, so the profile equals the single pair's replicator
  // output exactly (utilities are pre-resolution, independent of the actions).
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
      const perTarget = players
        .filter((targetId) => targetId !== playerId)
        .map((targetId) => utilities[playerId][targetId]);
      strategyProfiles[playerId] = updateStrategyProfileReplicator(
        canonical.strategyProfiles[playerId],
        aggregateActionUtilitiesMeanV1(perTarget, protocol.actionOrder),
        protocol.actionOrder,
      );
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

/**
 * ADR NKERNEL-CHOICE-0 (signed 2026-07-18): component-wise MEAN of a player's
 * utility breakdowns across their targets, per actionOrder entry. U is linear
 * in its components, so mean(U) = U(mean) — the fold is self-consistent — and
 * the magnitude does not grow with N (same rationale as the §5.1 mean of
 * agentDeltas). With a single target every field is x/1 = x exactly, which is
 * what keeps the N = 2 reduction oracle byte-tight. Inputs are kernel-produced
 * breakdowns (every actionOrder id present in each target's list); the divisor
 * is the number of targets that actually scored the action.
 */
export function aggregateActionUtilitiesMeanV1(
  perTarget: readonly (readonly ActionUtilityBreakdown[])[],
  actionOrder: readonly ConflictActionId[],
): readonly ActionUtilityBreakdown[] {
  return actionOrder.map((actionId) => {
    const entries = perTarget
      .map((breakdowns) => breakdowns.find((entry) => entry.actionId === actionId))
      .filter((entry): entry is ActionUtilityBreakdown => entry !== undefined);
    const divisor = Math.max(1, entries.length);
    const keys = new Set<string>();
    for (const entry of entries) {
      for (const key of Object.keys(entry)) {
        if (key !== 'actionId' && typeof (entry as unknown as Record<string, unknown>)[key] === 'number') keys.add(key);
      }
    }
    const folded: Record<string, number> = {};
    for (const key of [...keys].sort(codeUnitCompare)) {
      let sum = 0;
      for (const entry of entries) {
        sum += ((entry as unknown as Record<string, number>)[key] ?? 0);
      }
      folded[key] = sum / divisor;
    }
    return { ...folded, actionId } as unknown as ActionUtilityBreakdown;
  });
}

function sortedTagUnion(pairwise: readonly ConflictNStepPairV1[]): readonly string[] {
  const tags = new Set<string>();
  for (const entry of pairwise) {
    for (const tag of entry.outcome.eventTags) tags.add(tag);
  }
  return [...tags].sort(codeUnitCompare);
}
