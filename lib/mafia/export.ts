// lib/mafia/export.ts
//
// Export artifacts for MafiaLab. These are replay/debug surfaces, not canon.

import type { AgentState } from '../../types';
import { cloneAgents } from './helpers';
import type { MafiaAnalysis, MafiaGameState, RoleAssignment, RoleId, Team } from './types';
import type { MafiaGameResult } from './runner';

export type MafiaFlatEvent =
  | {
    idx: number;
    cycle: number;
    phase: 'day';
    kind: 'claim';
    actorId: string;
    claimKind: string;
    targetId?: string;
    reasoning: unknown;
  }
  | {
    idx: number;
    cycle: number;
    phase: 'day';
    kind: 'vote';
    actorId: string;
    targetId: string | null;
    reasoning: unknown;
  }
  | {
    idx: number;
    cycle: number;
    phase: 'day';
    kind: 'elimination';
    playerId: string | null;
    revealedRole?: RoleId;
  }
  | {
    idx: number;
    cycle: number;
    phase: 'night';
    kind: 'night_action';
    actorId: string;
    actionKind: 'kill' | 'check' | 'heal';
    targetId: string;
    resolved?: { success: boolean; info?: RoleId };
    reasoning?: unknown;
  }
  | {
    idx: number;
    cycle: number;
    phase: 'night';
    kind: 'night_result';
    killedId: string | null;
  }
  | {
    idx: number;
    cycle: number;
    phase: 'day' | 'night';
    kind: 'suspicion_delta';
    observerId: string;
    targetId: string;
    reason: string;
    before: number;
    delta: number;
    after: number;
    sourceRefs: unknown;
  }
  | {
    idx: number;
    cycle: number;
    phase: 'day' | 'night' | 'ended';
    kind: 'game_end';
    winner: Team | 'draw' | null;
  };

export type MafiaReplayExport = {
  schema: 'Kanonar.MafiaLab.Replay.v1';
  exportedAt: string;
  config: {
    seed?: number;
    maxCycles?: number;
    players: string[];
    roleAssignmentMode: 'random' | 'fixed';
    roleDistribution?: Record<RoleId, number>;
  };
  participants: Record<string, AgentState>;
  roles: RoleAssignment;
  state: {
    cycle: number;
    phase: MafiaGameState['phase'];
    alive: string[];
    winner: Team | 'draw' | null;
    eliminations: MafiaGameState['eliminations'];
    sheriffKnowledge: MafiaGameState['sheriffKnowledge'];
    suspicion: MafiaGameState['suspicion'];
    suspicionLedger: MafiaGameState['suspicionLedger'];
  };
  analysis: MafiaAnalysis;
  history: MafiaGameState['history'];
  flatTimeline: MafiaFlatEvent[];
};

export function buildMafiaFlatTimeline(result: MafiaGameResult): MafiaFlatEvent[] {
  const state = result.state;
  const events: MafiaFlatEvent[] = [];
  let idx = 0;

  const push = (event: Omit<MafiaFlatEvent, 'idx'>) => {
    events.push({ idx, ...event } as MafiaFlatEvent);
    idx += 1;
  };

  const maxCycle = Math.max(
    0,
    ...state.history.days.map(d => d.cycle),
    ...state.history.nights.map(n => n.cycle),
    ...state.suspicionLedger.map(d => d.cycle),
  );

  for (let cycle = 1; cycle <= maxCycle; cycle++) {
    const day = state.history.days.find(d => d.cycle === cycle);
    if (day) {
      for (const claim of day.claims) {
        push({
          cycle,
          phase: 'day',
          kind: 'claim',
          actorId: claim.actorId,
          claimKind: claim.kind,
          targetId: claim.targetId,
          reasoning: claim.reasoning,
        });
      }
      for (const vote of day.votes) {
        push({
          cycle,
          phase: 'day',
          kind: 'vote',
          actorId: vote.voterId,
          targetId: vote.targetId,
          reasoning: vote.reasoning,
        });
      }
      push({
        cycle,
        phase: 'day',
        kind: 'elimination',
        playerId: day.eliminatedId,
        revealedRole: day.eliminatedId ? state.roles[day.eliminatedId] : undefined,
      });
    }

    const deltas = state.suspicionLedger.filter(d => d.cycle === cycle);
    for (const delta of deltas) {
      push({
        cycle,
        phase: delta.phase,
        kind: 'suspicion_delta',
        observerId: delta.observerId,
        targetId: delta.targetId,
        reason: delta.reason,
        before: delta.before,
        delta: delta.delta,
        after: delta.after,
        sourceRefs: delta.sourceRefs,
      });
    }

    const night = state.history.nights.find(n => n.cycle === cycle);
    if (night) {
      for (const action of night.actions) {
        push({
          cycle,
          phase: 'night',
          kind: 'night_action',
          actorId: action.actorId,
          actionKind: action.kind,
          targetId: action.targetId,
          resolved: action.resolved,
          reasoning: action.reasoning,
        });
      }
      push({
        cycle,
        phase: 'night',
        kind: 'night_result',
        killedId: night.killedId,
      });
    }
  }

  push({
    cycle: state.cycle,
    phase: state.phase,
    kind: 'game_end',
    winner: state.winner,
  });

  return events;
}

export function buildMafiaReplayExport(result: MafiaGameResult): MafiaReplayExport {
  const state = result.state;
  const participants = cloneAgents(state.config.world, state.config.players);
  return {
    schema: 'Kanonar.MafiaLab.Replay.v1',
    exportedAt: new Date().toISOString(),
    config: {
      seed: state.config.seed,
      maxCycles: state.config.maxCycles,
      players: [...state.config.players],
      roleAssignmentMode: state.config.roleAssignment === 'random' ? 'random' : 'fixed',
      roleDistribution: state.config.roleDistribution,
    },
    participants,
    roles: { ...state.roles },
    state: {
      cycle: state.cycle,
      phase: state.phase,
      alive: [...state.alive],
      winner: state.winner,
      eliminations: state.eliminations,
      sheriffKnowledge: state.sheriffKnowledge,
      suspicion: state.suspicion,
      suspicionLedger: state.suspicionLedger,
    },
    analysis: result.analysis,
    history: state.history,
    flatTimeline: buildMafiaFlatTimeline(result),
  };
}
