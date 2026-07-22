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

import {
  applyConflictTransition,
  validateJointAction,
} from '../dynamics/engine';
import type {
  ConflictOutcome,
  ConflictPlayerId,
  ConflictProtocol,
  ForcedActionStrategyMode,
} from '../dynamics/types';
import { asKernelConflictStateV1, normalizeConflictStateNV1 } from './nstate';
import { resolveConflictNPairFoldV1 } from './npairfold';
import {
  CONFLICT_NSTEP_SCHEMA_VERSION,
  type ConflictNStepInputV1,
  type ConflictNStepErrorV1,
  type ConflictNStepResultOrErrorV1,
} from './types';

export { N_PAIRWISE_OUTCOME_TAG, aggregateActionUtilitiesMeanV1 } from './npairfold';

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

  const fold = resolveConflictNPairFoldV1({
    state: canonical,
    protocol,
    forcedActionStrategyMode: mode,
    actionsForPair: (a, b) => [actions.value[a], actions.value[b]],
  });
  if (fold.ok === false) return fold;

  const folded = fold.value;
  const outcome: ConflictOutcome = {
    protocolId: folded.outcome.protocolId,
    outcomeTag: folded.outcome.outcomeTag,
    actions: actions.value,
    payoffs: folded.outcome.payoffs,
    agentDeltas: folded.outcome.agentDeltas,
    relationDeltas: folded.outcome.relationDeltas,
    environmentDelta: folded.outcome.environmentDelta,
    eventTags: folded.outcome.eventTags,
  };

  const nextState = applyConflictTransition(
    asKernelConflictStateV1(canonical),
    outcome,
    protocol,
    folded.strategyProfiles,
    folded.memories,
    folded.regimes,
    folded.frames,
  );

  return {
    ok: true,
    value: {
      schemaVersion: CONFLICT_NSTEP_SCHEMA_VERSION,
      state: nextState,
      actions: actions.value,
      outcome,
      pairwise: folded.pairwise,
      observations: folded.observations,
      utilities: folded.utilities,
      strategyProfiles: folded.strategyProfiles,
    },
  };
}
