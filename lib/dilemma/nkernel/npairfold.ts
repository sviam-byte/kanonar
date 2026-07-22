// Shared NKERNEL pair fold. Both broadcast-action conflict-nstep-v1 and the
// directed target-matrix step delegate every unordered pair to the real
// dyadic kernel, then use this single deterministic fold for N-level effects,
// directed learning slots, traces, and player-level strategy profiles.

import { codeUnitCompare } from '../../utils/compare';
import { resolveProtocolStep, updateStrategyProfileReplicator } from '../dynamics/engine';
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
  Result,
  StrategyProfile,
} from '../dynamics/types';
import { dyadicPairProjectionV1, type CanonicalConflictStateNV1 } from './nstate';
import type { ConflictNStepErrorV1, ConflictNStepPairV1 } from './types';

export const N_PAIRWISE_OUTCOME_TAG = 'n_pairwise' as const;

export interface ConflictNPairFoldV1 {
  readonly outcome: Omit<ConflictOutcome, 'actions'>;
  readonly pairwise: readonly ConflictNStepPairV1[];
  readonly observations: Readonly<Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, ConflictObservation>>>>;
  readonly utilities: Readonly<Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, readonly ActionUtilityBreakdown[]>>>>;
  readonly memories: Readonly<Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, ConflictLearningMemory>>>>;
  readonly regimes: Readonly<Record<ConflictPlayerId, Readonly<Record<ConflictPlayerId, ConflictRegimeState>>>>;
  readonly frames: readonly ConflictTrajectoryFrame[];
  readonly strategyProfiles: Readonly<Record<ConflictPlayerId, StrategyProfile>>;
}

export function resolveConflictNPairFoldV1(args: {
  readonly state: CanonicalConflictStateNV1;
  readonly protocol: ConflictProtocol;
  readonly forcedActionStrategyMode: ForcedActionStrategyMode;
  readonly actionsForPair: (
    a: ConflictPlayerId,
    b: ConflictPlayerId,
  ) => readonly [ConflictActionId, ConflictActionId];
}): Result<ConflictNPairFoldV1, ConflictNStepErrorV1> {
  const { state, protocol, forcedActionStrategyMode: mode, actionsForPair } = args;
  const players = state.players;
  const pairwise: ConflictNStepPairV1[] = [];
  const observations: Record<ConflictPlayerId, Record<ConflictPlayerId, ConflictObservation>> = {};
  const utilities: Record<ConflictPlayerId, Record<ConflictPlayerId, readonly ActionUtilityBreakdown[]>> = {};
  const memories: Record<ConflictPlayerId, Record<ConflictPlayerId, ConflictLearningMemory>> = {};
  const regimes: Record<ConflictPlayerId, Record<ConflictPlayerId, ConflictRegimeState>> = {};
  const frames: ConflictTrajectoryFrame[] = [];

  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      const [aActionId, bActionId] = actionsForPair(a, b);
      const projection = dyadicPairProjectionV1(state, a, b);
      if (projection.ok === false) return projection;

      const pairStep = resolveProtocolStep(projection.value, createTrustExchangeProtocol([a, b]), {
        forcedJointActions: [
          { playerId: a, actionId: aActionId },
          { playerId: b, actionId: bActionId },
        ],
        forcedActionStrategyMode: mode,
      });
      if (pairStep.ok === false) {
        return {
          ok: false,
          error: {
            code: 'pair_step_failed',
            pair: [a, b],
            cause: pairStep.error,
            message: `Pair (${a}, ${b}) step failed: ${pairStep.error.message}`,
          },
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
      setDirected(memories, a, b, pairMemories[a][b]);
      setDirected(memories, b, a, pairMemories[b][a]);
      setDirected(regimes, a, b, pairRegimes[a][b]);
      setDirected(regimes, b, a, pairRegimes[b][a]);
      frames.push(...pairTrace);
    }
  }

  const payoffs: Record<ConflictPlayerId, number> = {};
  const agentDeltas: Record<ConflictPlayerId, AgentDelta> = {};
  for (const playerId of players) {
    const contributions = pairwise.filter((entry) => entry.pair.includes(playerId));
    payoffs[playerId] = contributions.reduce(
      (sum, entry) => sum + (entry.outcome.payoffs[playerId] ?? 0),
      0,
    );
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
  const strategyProfiles: Record<ConflictPlayerId, StrategyProfile> = {};
  if (mode === 'freeze') {
    for (const playerId of players) {
      const current = state.strategyProfiles[playerId];
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
        state.strategyProfiles[playerId],
        aggregateActionUtilitiesMeanV1(perTarget, protocol.actionOrder),
        protocol.actionOrder,
      );
    }
  }

  return {
    ok: true,
    value: {
      outcome: {
        protocolId: pairwise[0].outcome.protocolId,
        outcomeTag: singlePair ? pairwise[0].outcome.outcomeTag : N_PAIRWISE_OUTCOME_TAG,
        payoffs: singlePair ? pairwise[0].outcome.payoffs : payoffs,
        agentDeltas: singlePair ? pairwise[0].outcome.agentDeltas : agentDeltas,
        relationDeltas: singlePair ? pairwise[0].outcome.relationDeltas : relationDeltas,
        environmentDelta: singlePair ? pairwise[0].outcome.environmentDelta : {},
        eventTags: singlePair ? pairwise[0].outcome.eventTags : sortedTagUnion(pairwise),
      },
      pairwise,
      observations,
      utilities,
      memories,
      regimes,
      frames,
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
        sum += (entry as unknown as Record<string, number>)[key] ?? 0;
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
