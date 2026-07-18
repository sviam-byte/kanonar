// Shared NKERNEL test fixtures: a deterministic, asymmetric N-participant
// state (players 'a', 'b', 'c', … with index-dependent agent/relation patches)
// used by the STEP-0 and CHOICE-0 regressions, and the single-target N = 3
// definition used by the DECISION-0 and SESSION-0 regressions. Asymmetry
// matters: symmetric states would let directed-slice mixups cancel out and
// slip past the oracles.

import {
  defaultConflictAgentState,
  defaultConflictRelationState,
  type ConflictRelationState,
  type StrategyProfile,
} from '../../lib/dilemma';
import {
  CONFLICT_DEFINITION_V3_SCHEMA_VERSION,
  type ConflictDefinitionV3,
} from '../../lib/dilemma/definition/conflictDefinitionV3';
import { TRUST_EXCHANGE_ACTION_ORDER } from '../../lib/dilemma/dynamics/trustExchange';
import type { ConflictStateNV1 } from '../../lib/dilemma/nkernel/types';

export function makeStateN(n: number): ConflictStateNV1 {
  const players = Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i)); // 'a', 'b', 'c', ...
  const agents: Record<string, ReturnType<typeof defaultConflictAgentState>> = {};
  const relations: Record<string, Record<string, ConflictRelationState>> = {};
  const strategyProfiles: Record<string, StrategyProfile> = {};

  players.forEach((playerId, i) => {
    agents[playerId] = defaultConflictAgentState({
      cooperationTendency: 0.5 + 0.05 * i,
      loyalty: 0.4 + 0.04 * i,
      fear: 0.15 + 0.03 * i,
      goalPressure: 0.45 + 0.02 * i,
    });
    strategyProfiles[playerId] = {
      playerId,
      probabilities: { trust: 1 / 3, withhold: 1 / 3, betray: 1 / 3 },
    };
    relations[playerId] = {};
    players.forEach((otherId, j) => {
      if (playerId === otherId) return;
      relations[playerId][otherId] = defaultConflictRelationState({
        trust: 0.4 + 0.06 * i + 0.02 * j,
        bond: 0.28 + 0.03 * j,
        conflict: 0.12 + 0.02 * i,
        perceivedThreat: 0.18 + 0.01 * j,
      });
    });
  });

  return {
    tick: 0,
    players,
    agents,
    relations,
    environment: {
      resourceScarcity: 0.25,
      externalPressure: 0.3,
      visibility: 0.2,
      institutionalPressure: 0.45,
    },
    history: [],
    strategyProfiles,
  };
}

// Every actor's 3 legal actions target one fixed other participant instead of
// all_others — legal under the single-target-only v1 scope (NKERNEL_FOUNDATION_0
// §5.5). The target only flavors which counterparty's belief atoms modulate the
// GoalLab candidate (candidateBridge.ts); the real kernel transition still runs
// every unordered pair regardless (NKERNEL-STEP-0 §2), so this is a legitimate
// end-to-end N = 3 exercise, not a restricted kernel.
export function makeSingleTargetDefinitionN3(
  playerIds: readonly [string, string, string] = ['a', 'b', 'c'],
): ConflictDefinitionV3 {
  const roles = playerIds.map((playerId) => ({ id: `role-${playerId}`, playerId }));
  const nextTarget: Record<string, string> = {
    [playerIds[0]]: playerIds[1],
    [playerIds[1]]: playerIds[2],
    [playerIds[2]]: playerIds[0],
  };
  return {
    schemaVersion: CONFLICT_DEFINITION_V3_SCHEMA_VERSION,
    protocolId: 'trust_exchange',
    playerCount: 3,
    roles,
    phases: [{ id: 'simultaneous_choice', actorRoleIds: roles.map((role) => role.id), observation: 'public_state' }],
    legalActions: TRUST_EXCHANGE_ACTION_ORDER.flatMap((actionId) => roles.map((role) => ({
      id: actionId,
      phaseId: 'simultaneous_choice',
      actorRoleId: role.id,
      target: { mode: 'participant' as const, participantId: nextTarget[role.playerId] },
    }))),
    termination: { kind: 'external_round_budget', note: 'test fixture' },
  };
}
