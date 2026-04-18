// lib/mafia/runner.ts
//
// Orchestrator. runMafiaGame: one game end-to-end. runMafiaBatch: N games.
// Deterministic given seed.

import type { AgentState } from '../../types';
import type {
  MafiaGameState,
  MafiaGameConfig,
  MafiaBatchConfig,
  MafiaBatchResult,
  MafiaAnalysis,
  NightAction,
  PublicClaim,
  DayVote,
  RoleId,
} from './types';
import {
  cloneAgents,
  shuffle,
  type RngState,
} from './helpers';
import {
  createGame,
  applyDayResult,
  applyNightResult,
  isGameOver,
} from './engine';
import {
  decideMafiaKill,
  decideSheriffCheck,
  decideDoctorHeal,
} from './decisions/night';
import { decideVote } from './decisions/vote';
import { decideClaim } from './decisions/claim';
import {
  updateAfterDayElimination,
  updateAfterNightKill,
  updateFromSheriffClaim,
} from './suspicion';

export type MafiaGameResult = {
  state: MafiaGameState;
  analysis: MafiaAnalysis;
  trace: {
    days: Array<{
      cycle: number;
      claims: PublicClaim[];
      votes: DayVote[];
      eliminatedId: string | null;
    }>;
    nights: Array<{
      cycle: number;
      actions: NightAction[];
      killedId: string | null;
    }>;
  };
};

export function runMafiaGame(
  config: MafiaGameConfig
): MafiaGameResult {
  const agents = cloneAgents(config.world, config.players);
  const state = createGame(config, agents);

  const rng: RngState = { s: state.rngState };
  const maxCycles = config.maxCycles ?? 20;

  while (!isGameOver(state)) {
    if (state.cycle > maxCycles) {
      state.winner = 'draw';
      state.phase = 'ended';
      break;
    }

    if (state.phase === 'day') {
      runDayPhase(state, agents, rng);
    } else if (state.phase === 'night') {
      runNightPhase(state, agents, rng);
    }
  }

  state.rngState = rng.s;

  const analysis = analyzeGame(state);
  const trace = {
    days: state.history.days.map(d => ({
      cycle: d.cycle,
      claims: d.claims,
      votes: d.votes,
      eliminatedId: d.eliminatedId,
    })),
    nights: state.history.nights.map(n => ({
      cycle: n.cycle,
      actions: n.actions,
      killedId: n.killedId,
    })),
  };

  return { state, analysis, trace };
}

function runDayPhase(
  state: MafiaGameState,
  agents: Record<string, AgentState>,
  rng: RngState
): void {
  const speakerOrder = shuffle(rng, [...state.alive]);

  const claims: PublicClaim[] = [];
  for (const speakerId of speakerOrder) {
    const { claim } = decideClaim(state, agents, speakerId, claims, rng);
    claims.push(claim);

    if (claim.kind === 'claim_sheriff') {
      updateFromSheriffClaim(state, agents, claim);
    }
  }

  const votes: DayVote[] = [];
  const voteOrder = shuffle(rng, [...state.alive]);
  for (const voterId of voteOrder) {
    const { targetId, trace } = decideVote(state, agents, voterId, claims, rng);
    votes.push({ voterId, targetId, reasoning: trace });
  }

  applyDayResult(state, claims, votes);

  const lastDay = state.history.days[state.history.days.length - 1];
  if (lastDay?.eliminatedId) {
    const revealedRole = state.roles[lastDay.eliminatedId];
    updateAfterDayElimination(state, agents, lastDay.eliminatedId, revealedRole);
  }
}

function runNightPhase(
  state: MafiaGameState,
  agents: Record<string, AgentState>,
  rng: RngState
): void {
  const actions: NightAction[] = [];

  const mafiaIds = [...state.alive].filter(p => state.roles[p] === 'mafia');
  const sheriffIds = [...state.alive].filter(p => state.roles[p] === 'sheriff');
  const doctorIds = [...state.alive].filter(p => state.roles[p] === 'doctor');

  if (mafiaIds.length > 0) {
    const { targetId } = decideMafiaKill(state, agents, mafiaIds, rng);
    actions.push({
      actorId: mafiaIds[0],
      role: 'mafia',
      kind: 'kill',
      targetId,
    });
  }

  for (const sid of sheriffIds) {
    const { targetId } = decideSheriffCheck(state, agents, sid, rng);
    actions.push({
      actorId: sid,
      role: 'sheriff',
      kind: 'check',
      targetId,
    });
  }

  for (const did of doctorIds) {
    const { targetId } = decideDoctorHeal(state, agents, did, rng);
    actions.push({
      actorId: did,
      role: 'doctor',
      kind: 'heal',
      targetId,
    });
  }

  applyNightResult(state, actions);

  const lastNight = state.history.nights[state.history.nights.length - 1];
  if (lastNight?.killedId) {
    updateAfterNightKill(state, agents, lastNight.killedId);
  }
}

function analyzeGame(state: MafiaGameState): MafiaAnalysis {
  const winner = state.winner;
  const players = state.config.players;

  const survival: MafiaAnalysis['survival'] = {};
  for (const p of players) {
    const elim = state.eliminations.find(e => e.playerId === p);
    survival[p] = {
      alive: state.alive.has(p),
      diedCycle: elim?.cycle,
      diedPhase: elim?.phase,
    };
  }

  const rolePerformance: MafiaAnalysis['rolePerformance'] = {
    mafia: { won: false, survivedToEnd: false },
    citizen: { won: false, survivedToEnd: false },
    sheriff: { won: false, survivedToEnd: false },
    doctor: { won: false, survivedToEnd: false },
  };

  for (const p of players) {
    const role = state.roles[p];
    const alive = state.alive.has(p);
    const won =
      (winner === 'mafia' && role === 'mafia') ||
      (winner === 'town' && role !== 'mafia');
    rolePerformance[role] = {
      won: rolePerformance[role].won || won,
      survivedToEnd: rolePerformance[role].survivedToEnd || alive,
    };
  }

  const suspicionAccuracy: MafiaAnalysis['suspicionAccuracy'] = {};
  for (const target of players) {
    const role = state.roles[target];
    const actualMafia = role === 'mafia';
    let sumSus = 0;
    let n = 0;
    for (const observer of players) {
      if (observer === target) continue;
      const sus = state.suspicion[observer]?.[target];
      if (sus !== undefined) { sumSus += sus; n += 1; }
    }
    const avgSus = n > 0 ? sumSus / n : 0.5;
    suspicionAccuracy[target] = {
      actualMafia,
      avgSuspicionAgainstThem: avgSus,
      correctlyClassified: actualMafia ? avgSus > 0.5 : avgSus <= 0.5,
    };
  }

  return {
    winner,
    cycles: state.cycle,
    survival,
    rolePerformance,
    suspicionAccuracy,
  };
}

export function runMafiaBatch(config: MafiaBatchConfig): MafiaBatchResult {
  const results: MafiaAnalysis[] = [];
  const byPlayer: MafiaBatchResult['aggregate']['byPlayer'] = {};
  const byRole: MafiaBatchResult['aggregate']['byRole'] = {
    mafia: { games: 0, wins: 0, winRate: 0 },
    citizen: { games: 0, wins: 0, winRate: 0 },
    sheriff: { games: 0, wins: 0, winRate: 0 },
    doctor: { games: 0, wins: 0, winRate: 0 },
  };

  for (const p of config.players) {
    byPlayer[p] = {
      gamesPlayed: 0,
      roleCounts: { mafia: 0, citizen: 0, sheriff: 0, doctor: 0 },
      winsByRole: { mafia: 0, citizen: 0, sheriff: 0, doctor: 0 },
      avgSurvivalCycles: 0,
    };
  }

  let townWins = 0;
  let mafiaWins = 0;
  let draws = 0;
  let totalCycles = 0;
  const survivalSum: Record<string, number> = {};

  for (let gameIdx = 0; gameIdx < config.nGames; gameIdx++) {
    const seed = (Math.imul(config.baseSeed + gameIdx, 0x9e3779b9) >>> 0) ^ (gameIdx * 0x6c62272e);

    const gameConfig: MafiaGameConfig = {
      players: config.players,
      roleAssignment: config.fixedRoleAssignment ?? 'random',
      roleDistribution: config.roleDistribution,
      world: config.world,
      seed,
    };

    const { state, analysis } = runMafiaGame(gameConfig);
    results.push(analysis);

    if (analysis.winner === 'town') townWins++;
    else if (analysis.winner === 'mafia') mafiaWins++;
    else draws++;

    totalCycles += analysis.cycles;

    for (const p of config.players) {
      const role = state.roles[p];
      byPlayer[p].gamesPlayed++;
      byPlayer[p].roleCounts[role]++;
      byRole[role].games++;

      const won =
        (analysis.winner === 'mafia' && role === 'mafia') ||
        (analysis.winner === 'town' && role !== 'mafia');
      if (won) {
        byPlayer[p].winsByRole[role]++;
        byRole[role].wins++;
      }

      const surv = analysis.survival[p];
      const survCycle = surv.alive ? analysis.cycles : (surv.diedCycle ?? analysis.cycles);
      survivalSum[p] = (survivalSum[p] ?? 0) + survCycle;
    }
  }

  for (const p of config.players) {
    byPlayer[p].avgSurvivalCycles = survivalSum[p] / Math.max(1, byPlayer[p].gamesPlayed);
  }
  for (const r of Object.keys(byRole) as RoleId[]) {
    byRole[r].winRate = byRole[r].games > 0 ? byRole[r].wins / byRole[r].games : 0;
  }

  return {
    games: results,
    aggregate: {
      townWinRate: townWins / config.nGames,
      mafiaWinRate: mafiaWins / config.nGames,
      drawRate: draws / config.nGames,
      avgCycles: totalCycles / config.nGames,
      byPlayer,
      byRole,
    },
  };
}
