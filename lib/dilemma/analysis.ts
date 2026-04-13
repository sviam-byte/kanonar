// lib/dilemma/analysis.ts
//
// Post-game analysis: strategy matching, cooperation curves,
// Nash alignment, hypothesis testing.

import type {
  DilemmaSpec,
  DilemmaGameState,
  DilemmaAnalysis,
  StrategyMatchScores,
} from './types';
import { playerHistory } from './engine';

/**
 * Analyze a completed (or in-progress) game.
 */
export function analyzeGame(
  spec: DilemmaSpec,
  game: DilemmaGameState,
): DilemmaAnalysis {
  const [p0, p1] = game.players;
  const coopId = spec.cooperativeActionId;
  const rounds = game.rounds;

  // ── Cooperation curve ──
  const cooperationCurve = rounds.map((r) => {
    const c0 = r.choices[p0] === coopId ? 1 : 0;
    const c1 = r.choices[p1] === coopId ? 1 : 0;
    return (c0 + c1) / 2;
  });

  // ── Mutual cooperation / defection rates ──
  const mutualCoop = rounds.filter((r) =>
    r.choices[p0] === coopId && r.choices[p1] === coopId).length;
  const mutualDefect = rounds.filter((r) =>
    r.choices[p0] !== coopId && r.choices[p1] !== coopId).length;
  const total = Math.max(1, rounds.length);

  // ── Nash alignment ──
  const nashAlignment: Record<string, number> = {};
  for (const pid of game.players) {
    const otherId = pid === p0 ? p1 : p0;
    let nashMatches = 0;
    for (const r of rounds) {
      const myChoice = r.choices[pid];
      const theirChoice = r.choices[otherId];
      const isNash = spec.nashEquilibria.some(
        ([n0, n1]) => {
          if (pid === p0) return myChoice === n0 && theirChoice === n1;
          return myChoice === n1 && theirChoice === n0;
        },
      );
      if (isNash) nashMatches++;
    }
    nashAlignment[pid] = rounds.length > 0 ? nashMatches / rounds.length : 0;
  }

  // ── Strategy matching ──
  const strategyMatch: Record<string, StrategyMatchScores> = {};
  for (const pid of game.players) {
    strategyMatch[pid] = matchStrategies(spec, game, pid);
  }

  return {
    nashAlignment,
    cooperationCurve,
    totalPayoffs: { ...game.cumulativePayoffs },
    strategyMatch,
    mutualCooperationRate: mutualCoop / total,
    mutualDefectionRate: mutualDefect / total,
  };
}

/**
 * Match a player's actual choices against classical iterated strategies.
 * Returns similarity score (0–1) for each strategy.
 */
function matchStrategies(
  spec: DilemmaSpec,
  game: DilemmaGameState,
  playerId: string,
): StrategyMatchScores {
  const coopId = spec.cooperativeActionId;
  const otherId = game.players.find((p) => p !== playerId);
  if (!otherId) {
    return {
      titForTat: 0.5,
      alwaysCooperate: 0.5,
      alwaysDefect: 0.5,
      pavlov: 0.5,
      grimTrigger: 0.5,
    };
  }

  const myHistory = playerHistory(game, playerId);
  const theirHistory = playerHistory(game, otherId);
  const n = myHistory.length;

  if (n === 0) {
    return {
      titForTat: 0.5,
      alwaysCooperate: 0.5,
      alwaysDefect: 0.5,
      pavlov: 0.5,
      grimTrigger: 0.5,
    };
  }

  let tftMatch = 0;
  let alwaysCoopMatch = 0;
  let alwaysDefMatch = 0;
  let pavlovMatch = 0;
  let grimMatch = 0;

  // Grim trigger state: cooperate until first defection, then defect forever.
  let grimCooperating = true;

  for (let i = 0; i < n; i++) {
    const myChoice = myHistory[i];
    const isCoop = myChoice === coopId;

    // Always cooperate
    if (isCoop) alwaysCoopMatch++;

    // Always defect
    if (!isCoop) alwaysDefMatch++;

    // Tit for Tat: cooperate on round 0, then copy opponent's last move.
    if (i === 0) {
      if (isCoop) tftMatch++;
    } else {
      const theyCoopedLast = theirHistory[i - 1] === coopId;
      if (isCoop === theyCoopedLast) tftMatch++;
    }

    // Pavlov (win-stay, lose-shift):
    // Cooperate on round 0. Then:
    //   If last round was mutual cooperate or mutual defect → cooperate.
    //   Otherwise → defect.
    if (i === 0) {
      if (isCoop) pavlovMatch++;
    } else {
      const bothSame = (myHistory[i - 1] === coopId) === (theirHistory[i - 1] === coopId);
      const pavlovPredicts = bothSame;
      if (isCoop === pavlovPredicts) pavlovMatch++;
    }

    // Grim trigger
    if (i > 0 && theirHistory[i - 1] !== coopId) {
      grimCooperating = false;
    }
    const grimPredicts = grimCooperating;
    if (isCoop === grimPredicts) grimMatch++;
  }

  return {
    titForTat: tftMatch / n,
    alwaysCooperate: alwaysCoopMatch / n,
    alwaysDefect: alwaysDefMatch / n,
    pavlov: pavlovMatch / n,
    grimTrigger: grimMatch / n,
  };
}

/**
 * Find the best-matching classical strategy for a player.
 */
export function bestStrategy(scores: StrategyMatchScores): {
  name: string;
  score: number;
} {
  const entries = Object.entries(scores) as [string, number][];
  entries.sort((a, b) => b[1] - a[1]);
  const [name, score] = entries[0];
  return {
    name: formatStrategyName(name),
    score,
  };
}

const STRATEGY_NAMES: Record<string, string> = {
  titForTat: 'Tit for Tat',
  alwaysCooperate: 'Always Cooperate',
  alwaysDefect: 'Always Defect',
  pavlov: 'Pavlov (Win-Stay Lose-Shift)',
  grimTrigger: 'Grim Trigger',
};

function formatStrategyName(key: string): string {
  return STRATEGY_NAMES[key] ?? key;
}
