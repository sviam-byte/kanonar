// lib/mafia/engine.ts
//
// Game engine. State transitions for day/night phases.

import type { AgentState } from '../../types';
import type {
  MafiaGameState,
  MafiaGameConfig,
  RoleAssignment,
  RoleId,
  Team,
  PublicClaim,
  DayVote,
  NightAction,
  NightTrace,
} from './types';
import {
  makeRng,
  shuffle,
  type RngState,
} from './helpers';
import {
  validateDistribution,
  defaultDistribution,
} from './roles';
import { initSuspicion, seedInitialSuspicionLedger } from './suspicion';

export function createGame(
  config: MafiaGameConfig,
  agents: Record<string, AgentState>
): MafiaGameState {
  const playerIds = [...config.players];
  const nPlayers = playerIds.length;
  if (nPlayers < 4) throw new Error('Need at least 4 players');

  const rng = makeRng(config.seed ?? 42);

  let roles: RoleAssignment;
  if (config.roleAssignment === 'random') {
    const dist = config.roleDistribution ?? defaultDistribution(nPlayers);
    validateDistribution(dist, nPlayers);
    roles = assignRolesRandomly(playerIds, dist, rng);
  } else {
    roles = { ...config.roleAssignment };
    for (const p of playerIds) {
      if (!roles[p]) throw new Error(`Player ${p} has no role assignment`);
    }
  }

  const state: MafiaGameState = {
    config,
    roles,
    alive: new Set(playerIds),
    phase: 'day',
    cycle: 1,
    history: { days: [], nights: [] },
    eliminations: [],
    sheriffKnowledge: {},
    suspicion: initSuspicion(playerIds, agents),
    suspicionLedger: [],
    winner: null,
    rngState: rng.s,
  };

  seedInitialSuspicionLedger(state);
  return state;
}

function assignRolesRandomly(
  playerIds: readonly string[],
  dist: Record<RoleId, number>,
  rng: RngState
): RoleAssignment {
  const pool: RoleId[] = [];
  (Object.keys(dist) as RoleId[]).forEach(r => {
    for (let i = 0; i < dist[r]; i++) pool.push(r);
  });
  const shuffled = shuffle(rng, pool);
  const out: RoleAssignment = {};
  playerIds.forEach((id, i) => { out[id] = shuffled[i]; });
  return out;
}

export function checkWin(state: MafiaGameState): Team | 'draw' | null {
  let mafiaAlive = 0;
  let townAlive = 0;
  for (const p of state.alive) {
    if (state.roles[p] === 'mafia') mafiaAlive++;
    else townAlive++;
  }
  if (mafiaAlive === 0) return 'town';
  if (mafiaAlive >= townAlive) return 'mafia';
  if (state.config.maxCycles && state.cycle > state.config.maxCycles) return 'draw';
  return null;
}

export function isGameOver(state: MafiaGameState): boolean {
  return state.winner !== null || state.phase === 'ended';
}

export function applyDayResult(
  state: MafiaGameState,
  claims: PublicClaim[],
  votes: DayVote[]
): void {
  const tally: Record<string, number> = {};
  for (const v of votes) {
    if (v.targetId === null) continue;
    tally[v.targetId] = (tally[v.targetId] ?? 0) + 1;
  }

  const entries = Object.entries(tally).sort(([, a], [, b]) => b - a);
  let eliminatedId: string | null = null;
  if (entries.length > 0) {
    const [topId, topCount] = entries[0];
    const tied = entries.filter(([, c]) => c === topCount).length > 1;
    if (!tied) eliminatedId = topId;
  }

  state.history.days.push({
    cycle: state.cycle,
    claims,
    votes,
    eliminatedId,
  });

  if (eliminatedId) {
    state.alive.delete(eliminatedId);
    state.eliminations.push({
      playerId: eliminatedId,
      cycle: state.cycle,
      phase: 'day',
      revealedRole: state.roles[eliminatedId],
    });
  }

  state.winner = checkWin(state);
  if (state.winner) {
    state.phase = 'ended';
    return;
  }

  state.phase = 'night';
}

export function applyNightResult(
  state: MafiaGameState,
  actions: NightAction[],
  traces: NightTrace[] = []
): void {
  let killId: string | null = null;
  const healTargets = new Set<string>();

  for (const a of actions) {
    if (a.kind === 'kill') killId = a.targetId;
    else if (a.kind === 'heal') healTargets.add(a.targetId);
    else if (a.kind === 'check') {
      const sheriff = a.actorId;
      if (!state.sheriffKnowledge[sheriff]) state.sheriffKnowledge[sheriff] = {};
      state.sheriffKnowledge[sheriff][a.targetId] = state.roles[a.targetId];
      a.resolved = { success: true, info: state.roles[a.targetId] };
    }
  }

  const saved = killId !== null && healTargets.has(killId);
  const killedId = saved ? null : killId;

  state.history.nights.push({
    cycle: state.cycle,
    actions,
    killedId,
    traces,
  });

  if (killedId) {
    state.alive.delete(killedId);
    state.eliminations.push({
      playerId: killedId,
      cycle: state.cycle,
      phase: 'night',
    });
  }

  state.winner = checkWin(state);
  if (state.winner) {
    state.phase = 'ended';
    return;
  }

  state.phase = 'day';
  state.cycle += 1;
}
