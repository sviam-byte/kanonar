// lib/dilemma/engine.ts
//
// Pure game-theory engine. No dependencies on GoalLab/pipeline.
// Manages game state, resolves rounds, computes equilibria.

import type {
  DilemmaSpec,
  DilemmaGameState,
  DilemmaRound,
  RoundTrace,
} from './types';

// ── Game lifecycle ──

export function createGame(
  spec: DilemmaSpec,
  players: readonly [string, string],
  totalRounds: number,
): DilemmaGameState {
  if (totalRounds < 1) throw new Error('totalRounds must be ≥ 1');
  if (players[0] === players[1]) throw new Error('players must be distinct');
  return {
    specId: spec.id,
    players,
    rounds: [],
    currentRound: 0,
    totalRounds,
    cumulativePayoffs: { [players[0]]: 0, [players[1]]: 0 },
  };
}

export function isGameOver(game: DilemmaGameState): boolean {
  return game.currentRound >= game.totalRounds;
}

/**
 * Resolve a round: apply choices, compute payoffs, advance game state.
 * Returns a new game state (immutable update).
 */
export function advanceGame(
  spec: DilemmaSpec,
  game: DilemmaGameState,
  choices: Record<string, string>,
  traces?: Record<string, RoundTrace>,
): DilemmaGameState {
  if (isGameOver(game)) throw new Error('Game is already over');

  const [p0, p1] = game.players;
  const a0 = choices[p0];
  const a1 = choices[p1];

  if (!a0 || !a1) throw new Error(`Missing choice for ${!a0 ? p0 : p1}`);
  if (!spec.payoffs[a0]?.[a1]) {
    throw new Error(`Invalid action pair: ${a0} × ${a1}`);
  }

  const [pay0, pay1] = spec.payoffs[a0][a1];

  const round: DilemmaRound = {
    index: game.currentRound,
    choices: { [p0]: a0, [p1]: a1 },
    payoffs: { [p0]: pay0, [p1]: pay1 },
    traces: traces ?? {
      [p0]: emptyTrace(),
      [p1]: emptyTrace(),
    },
  };

  return {
    ...game,
    rounds: [...game.rounds, round],
    currentRound: game.currentRound + 1,
    cumulativePayoffs: {
      [p0]: game.cumulativePayoffs[p0] + pay0,
      [p1]: game.cumulativePayoffs[p1] + pay1,
    },
  };
}

function emptyTrace(): RoundTrace {
  return { ranked: [], dilemmaAtomIds: [], trustAtDecision: 0.5 };
}

// ── Equilibria (2×2 games, analytical) ──

/**
 * Find all pure-strategy Nash equilibria in a 2-player symmetric game.
 * For 2×2: check each cell — (a, b) is Nash if neither player can
 * improve by unilateral deviation.
 */
export function findPureNash(spec: DilemmaSpec): [string, string][] {
  const acts = spec.actions.map((a) => a.id);
  const equilibria: [string, string][] = [];

  for (const a0 of acts) {
    for (const a1 of acts) {
      if (!spec.payoffs[a0]?.[a1]) continue;
      const [pay0, pay1] = spec.payoffs[a0][a1];

      let p0canImprove = false;
      for (const alt of acts) {
        if (alt === a0) continue;
        if (spec.payoffs[alt]?.[a1] && spec.payoffs[alt][a1][0] > pay0) {
          p0canImprove = true;
          break;
        }
      }

      let p1canImprove = false;
      for (const alt of acts) {
        if (alt === a1) continue;
        if (spec.payoffs[a0]?.[alt] && spec.payoffs[a0][alt][1] > pay1) {
          p1canImprove = true;
          break;
        }
      }

      if (!p0canImprove && !p1canImprove) {
        equilibria.push([a0, a1]);
      }
    }
  }

  return equilibria;
}

/**
 * Find Pareto-optimal outcomes.
 * An outcome is Pareto-optimal if no other outcome makes someone better off
 * without making someone else worse off.
 */
export function findParetoOptimal(spec: DilemmaSpec): [string, string][] {
  const acts = spec.actions.map((a) => a.id);
  const outcomes: { a0: string; a1: string; p0: number; p1: number }[] = [];

  for (const a0 of acts) {
    for (const a1 of acts) {
      if (!spec.payoffs[a0]?.[a1]) continue;
      const [p0, p1] = spec.payoffs[a0][a1];
      outcomes.push({ a0, a1, p0, p1 });
    }
  }

  const pareto: [string, string][] = [];
  for (const o of outcomes) {
    const dominated = outcomes.some(
      (alt) =>
        alt.p0 >= o.p0
        && alt.p1 >= o.p1
        && (alt.p0 > o.p0 || alt.p1 > o.p1),
    );
    if (!dominated) {
      pareto.push([o.a0, o.a1]);
    }
  }

  return pareto;
}

/**
 * Find strictly dominated strategies for one player.
 * Strategy s is dominated if there exists s' that gives strictly higher
 * payoff for every opponent strategy.
 */
export function findDominatedStrategies(
  spec: DilemmaSpec,
  asPlayer: 0 | 1,
): string[] {
  const acts = spec.actions.map((a) => a.id);
  const dominated: string[] = [];

  for (const s of acts) {
    const isDominated = acts.some((alt) => {
      if (alt === s) return false;
      return acts.every((opp) => {
        const [myS, theirS] = asPlayer === 0
          ? spec.payoffs[s]?.[opp] ?? [0, 0]
          : spec.payoffs[opp]?.[s] ?? [0, 0];
        const [myAlt, theirAlt] = asPlayer === 0
          ? spec.payoffs[alt]?.[opp] ?? [0, 0]
          : spec.payoffs[opp]?.[alt] ?? [0, 0];
        const payS = asPlayer === 0 ? myS : theirS;
        const payAlt = asPlayer === 0 ? myAlt : theirAlt;
        return payAlt > payS;
      });
    });
    if (isDominated) dominated.push(s);
  }

  return dominated;
}

// ── History helpers ──

/** Get all choices by a player across rounds. */
export function playerHistory(
  game: DilemmaGameState,
  playerId: string,
): string[] {
  return game.rounds.map((r) => r.choices[playerId]);
}

/** Count how many times a player chose the cooperative action. */
export function cooperationCount(
  spec: DilemmaSpec,
  game: DilemmaGameState,
  playerId: string,
): number {
  return playerHistory(game, playerId)
    .filter((c) => c === spec.cooperativeActionId)
    .length;
}

/** Cooperation rate (0–1), or 0.5 if no rounds played. */
export function cooperationRate(
  spec: DilemmaSpec,
  game: DilemmaGameState,
  playerId: string,
): number {
  if (game.rounds.length === 0) return 0.5;
  return cooperationCount(spec, game, playerId) / game.rounds.length;
}
