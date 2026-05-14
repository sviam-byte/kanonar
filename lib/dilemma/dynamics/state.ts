import { createConflictLearningMemory, cloneConflictMemory } from '../learningMemory';
import type {
  ConflictPlayerId,
  CanonicalConflictState,
  ConflictRegimeState,
  ConflictRelationState,
  ConflictState,
  DirectedMemoryMap,
  DirectedRegimeMap,
  StrategyProfile,
} from './types';
import { TRUST_EXCHANGE_ACTION_ORDER } from './trustExchange';
import { normalizeActionProbabilities } from './math';

export function defaultConflictRegimeState(patch?: Partial<ConflictRegimeState>): ConflictRegimeState {
  return {
    regime: 'secure',
    ticksInRegime: 0,
    exitEligibleTicks: 0,
    ...(patch ?? {}),
  };
}

export function normalizeConflictState(input: ConflictState): CanonicalConflictState {
  const players = input.players;
  const strategyProfiles: Record<ConflictPlayerId, StrategyProfile> = {};
  const relations: Record<ConflictPlayerId, Record<ConflictPlayerId, ConflictRelationState>> = {};
  const memories: Record<ConflictPlayerId, Record<ConflictPlayerId, ReturnType<typeof createConflictLearningMemory>>> = {};
  const regimes: Record<ConflictPlayerId, Record<ConflictPlayerId, ConflictRegimeState>> = {};

  for (const fromId of players) {
    const profile = input.strategyProfiles[fromId];
    strategyProfiles[fromId] = {
      playerId: fromId,
      probabilities: normalizeActionProbabilities(profile?.probabilities ?? {}, TRUST_EXCHANGE_ACTION_ORDER),
    };
    relations[fromId] = {};
    memories[fromId] = {};
    regimes[fromId] = {};

    for (const toId of players) {
      if (fromId === toId) continue;
      const relation = input.relations[fromId]?.[toId];
      relations[fromId][toId] = normalizeRelationState(relation);

      const memory = input.memories?.[fromId]?.[toId];
      memories[fromId][toId] = memory ? cloneConflictMemory(memory) : createConflictLearningMemory();

      const regime = input.regimes?.[fromId]?.[toId];
      regimes[fromId][toId] = regime ? normalizeRegimeState(regime) : defaultConflictRegimeState();
    }
  }

  return {
    ...input,
    relations,
    memories: memories as DirectedMemoryMap,
    regimes: regimes as DirectedRegimeMap,
    strategyProfiles,
    history: [...(input.history ?? [])],
    trace: [...(input.trace ?? [])],
  } as CanonicalConflictState;
}

export function normalizeRelationState(relation?: Partial<ConflictRelationState>): ConflictRelationState {
  return {
    trust: finite01(relation?.trust, 0.5),
    bond: finite01(relation?.bond, 0.3),
    perceivedThreat: finite01(relation?.perceivedThreat, 0.2),
    conflict: finite01(relation?.conflict, 0.2),
    perceivedLegitimacy: finite01(relation?.perceivedLegitimacy, 0.5),
    volatility: finite01(relation?.volatility, 0),
  };
}

function normalizeRegimeState(regime: ConflictRegimeState): ConflictRegimeState {
  return {
    regime: regime.regime,
    ticksInRegime: finiteCount(regime.ticksInRegime),
    exitEligibleTicks: finiteCount(regime.exitEligibleTicks),
  };
}

function finite01(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, Number(value)));
}

function finiteCount(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(Number(value)));
}
