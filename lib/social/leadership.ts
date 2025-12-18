
import { WorldState, LeaderChangedEvent, AgentState } from '../../types';
import { getTomView } from '../tom/view';
import { ema } from '../util/math';
import { LEADER_MOMENTUM, LEADER_SWITCH_THRESHOLD, LEADER_MIN_TICKS_TO_SWITCH } from './tuning';

export function updateLeaderDissatisfaction(world: WorldState, eventsThisTick: any[]) {
  // Stub for narrative usage
}

function calculateRawLeaderScore(agent: AgentState, world: WorldState): number {
    const intrinsic = agent.capabilities?.command ?? 0.5;
    let supportSum = 0;
    let count = 0;
    for (const other of world.agents) {
        if (other.entityId === agent.entityId) continue;
        const v = getTomView(world, other.entityId, agent.entityId);
        supportSum += (v.trust + v.align - v.conflict);
        count++;
    }
    const socialScore = count > 0 ? supportSum / count : 0;
    const stressPenalty = (agent.body.acute.stress ?? 0) / 200;
    return 0.4 * intrinsic + 0.5 * socialScore - 0.1 * stressPenalty; 
}

export function maybeChangeLeader(world: WorldState): LeaderChangedEvent | null {
  const { leadership } = world;
  const prevId = leadership.currentLeaderId;

  if (!leadership.supportScores) leadership.supportScores = {};
  if (leadership.betterStreak === undefined) leadership.betterStreak = 0;
  if (leadership.lastBestId === undefined) leadership.lastBestId = null;

  const currentScores: Record<string, number> = {};
  for (const agent of world.agents) {
      currentScores[agent.entityId] = calculateRawLeaderScore(agent, world);
  }
  leadership.leaderScores = currentScores;

  // EMA Update
  for (const agent of world.agents) {
      const id = agent.entityId;
      const old = leadership.supportScores[id] ?? currentScores[id];
      leadership.supportScores[id] = ema(old, currentScores[id] - old, 1 - LEADER_MOMENTUM);
  }

  let bestId: string | null = null;
  let bestScore = -Infinity;
  for (const agent of world.agents) {
      const s = leadership.supportScores[agent.entityId];
      if (s > bestScore) {
          bestScore = s;
          bestId = agent.entityId;
      }
  }

  if (prevId === null) {
      if (bestId && bestScore > 0.2) {
          leadership.currentLeaderId = bestId;
          leadership.lastChangeTick = world.tick;
          leadership.changeCount++;
          return {
              kind: 'LeaderChanged',
              tick: world.tick,
              oldLeaderId: null,
              newLeaderId: bestId,
              explanation: 'Initial consensus reached.',
              leaderScores: leadership.supportScores,
              score: bestScore
          };
      }
      return null;
  }

  const currentLeaderScore = leadership.supportScores[prevId] ?? -Infinity;
  
  if (bestId && bestId !== prevId && (bestScore - currentLeaderScore > LEADER_SWITCH_THRESHOLD)) {
      if (leadership.lastBestId === bestId) {
          leadership.betterStreak! += 1;
      } else {
          leadership.betterStreak = 1;
          leadership.lastBestId = bestId;
      }

      if (leadership.betterStreak! >= LEADER_MIN_TICKS_TO_SWITCH) {
          leadership.currentLeaderId = bestId;
          leadership.betterStreak = 0;
          leadership.lastChangeTick = world.tick;
          leadership.changeCount++;
          return {
              kind: 'LeaderChanged',
              tick: world.tick,
              oldLeaderId: prevId,
              newLeaderId: bestId,
              explanation: `Power shift: ${bestId} consistently outperformed ${prevId}.`,
              leaderScores: leadership.supportScores,
              score: bestScore
          };
      }
  } else {
      leadership.betterStreak = 0;
      leadership.lastBestId = prevId;
  }

  return null;
}
