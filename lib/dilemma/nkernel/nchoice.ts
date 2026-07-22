// NKERNEL-CHOICE-0 (NKERNEL_FOUNDATION_0 §3.4): endogenous N-choice. Lifts the
// kernel's own endogenous rule (replicator update over pre-resolution utility
// scores, then dominant action) to N participants using the ADR-signed
// component-wise MEAN aggregation across each player's N−1 targets, and
// delegates the transition to the pairwise N-step in 'learn_from_utility'
// mode (memory/hysteresis live, matching the kernel's non-forced path where
// freezeLearning is false). Reuse, not re-implementation: observations and
// scoring come from the real dyadic kernel on pair projections; at N = 2 the
// whole endogenous step reproduces resolveProtocolStep with no options —
// pinned by the reduction oracle in tests/dilemma/nkernel_choice_v1.test.ts.

import { getObservationForPlayer, selectDominantAction, updateStrategyProfileReplicator } from '../dynamics/engine';
import { createTrustExchangeProtocol, evaluateTrustExchangeUtilities } from '../dynamics/trustExchange';
import type {
  ActionUtilityBreakdown,
  ConflictAction,
  ConflictPlayerId,
  ConflictProtocol,
} from '../dynamics/types';
import { dyadicPairProjectionV1, normalizeConflictStateNV1 } from './nstate';
import { aggregateActionUtilitiesMeanV1, resolveConflictNStepV1, validateCanonicalTrustProtocolNV1 } from './nstep';
import {
  CONFLICT_NCHOICE_SCHEMA_VERSION,
  type ConflictNChoiceResultOrErrorV1,
  type ConflictStateNV1,
} from './types';

export interface ConflictNChoiceInputV1 {
  readonly state: ConflictStateNV1;
  readonly protocol: ConflictProtocol;
}

export function resolveConflictNChoiceStepV1(input: ConflictNChoiceInputV1): ConflictNChoiceResultOrErrorV1 {
  const normalized = normalizeConflictStateNV1(input.state);
  if (normalized.ok === false) return normalized;
  const canonical = normalized.value;
  const players = canonical.players;
  const protocol = input.protocol;

  const protocolError = validateCanonicalTrustProtocolNV1(players, protocol);
  if (protocolError) return { ok: false, error: protocolError };

  // Pre-resolution scoring, identical to what the N-step will harvest: the
  // real dyadic kernel observation + trust_exchange evaluator per pair.
  const perTarget: Record<ConflictPlayerId, ActionUtilityBreakdown[][]> = {};
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i];
      const b = players[j];
      const projection = dyadicPairProjectionV1(canonical, a, b);
      if (projection.ok === false) return projection;
      const pairProtocol = createTrustExchangeProtocol([a, b]);
      for (const [selfId] of [[a, b], [b, a]] as const) {
        const observation = getObservationForPlayer(projection.value, pairProtocol, selfId);
        if (observation.ok === false) {
          return {
            ok: false,
            error: { code: 'pair_step_failed', pair: [a, b], cause: observation.error, message: `Pair (${a}, ${b}) observation failed: ${observation.error.message}` },
          };
        }
        if (!perTarget[selfId]) perTarget[selfId] = [];
        perTarget[selfId].push([...evaluateTrustExchangeUtilities(observation.value)]);
      }
    }
  }

  // Endogenous rule at N level: replicator over the mean-aggregated utilities,
  // then dominant action — the same two kernel functions the dyadic
  // non-forced path uses.
  const aggregatedUtilities: Record<ConflictPlayerId, readonly ActionUtilityBreakdown[]> = {};
  const chosen: ConflictAction[] = [];
  for (const playerId of players) {
    const aggregated = aggregateActionUtilitiesMeanV1(perTarget[playerId], protocol.actionOrder);
    aggregatedUtilities[playerId] = aggregated;
    const nextProfile = updateStrategyProfileReplicator(canonical.strategyProfiles[playerId], aggregated, protocol.actionOrder);
    chosen.push({ playerId, actionId: selectDominantAction(nextProfile, protocol.actionOrder) });
  }

  // The transition is the pairwise N-step; 'learn_from_utility' recomputes the
  // same aggregated replicator profiles from the harvested utilities, so the
  // step result's profiles equal the ones the choice was made from.
  const step = resolveConflictNStepV1({
    state: input.state,
    protocol,
    forcedJointActions: chosen,
    forcedActionStrategyMode: 'learn_from_utility',
  });
  if (step.ok === false) return step;

  return {
    ok: true,
    value: {
      schemaVersion: CONFLICT_NCHOICE_SCHEMA_VERSION,
      chosenActions: step.value.actions,
      aggregatedUtilities,
      step: step.value,
    },
  };
}
