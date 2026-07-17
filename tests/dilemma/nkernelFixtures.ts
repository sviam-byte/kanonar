// Shared NKERNEL test fixture: a deterministic, asymmetric N-participant state
// (players 'a', 'b', 'c', … with index-dependent agent/relation patches) used
// by the STEP-0 and CHOICE-0 regressions. Asymmetry matters: symmetric states
// would let directed-slice mixups cancel out and slip past the oracles.

import {
  defaultConflictAgentState,
  defaultConflictRelationState,
  type ConflictRelationState,
  type StrategyProfile,
} from '../../lib/dilemma';
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
