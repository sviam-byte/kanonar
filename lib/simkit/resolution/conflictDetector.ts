// lib/simkit/resolution/conflictDetector.ts
// Detect and resolve action conflicts within a single tick.

import type { SimWorld, SimAction, SimEvent } from '../core/types';
import { RNG } from '../core/rng';
import { clamp01 } from '../../util/math';

export type ConflictPair = {
  agentA: string;
  agentB: string;
  actionA: SimAction;
  actionB: SimAction;
  type: 'mutual_hostile' | 'resource_contention' | 'social_collision';
};

export type ConflictResolution = {
  pair: ConflictPair;
  winnerId: string;
  loserId: string;
  winnerAction: SimAction;
  loserFallback: SimAction;
  reason: string;
};

const HOSTILE = new Set(['attack', 'confront', 'threaten']);
const AVOID_SET = new Set(['avoid', 'escape', 'hide']);
const SOCIAL = new Set(['talk', 'negotiate', 'comfort', 'ask_info', 'propose_trade']);

export function detectConflicts(actions: SimAction[]): ConflictPair[] {
  const pairs: ConflictPair[] = [];

  // Mutual hostile.
  for (let i = 0; i < actions.length; i++) {
    for (let j = i + 1; j < actions.length; j++) {
      const a = actions[i];
      const b = actions[j];
      if (HOSTILE.has(a.kind) && HOSTILE.has(b.kind) && a.targetId === b.actorId && b.targetId === a.actorId) {
        pairs.push({ agentA: a.actorId, agentB: b.actorId, actionA: a, actionB: b, type: 'mutual_hostile' });
      }
    }
  }

  // Social collision: A talks to B, B avoids A.
  for (let i = 0; i < actions.length; i++) {
    for (let j = 0; j < actions.length; j++) {
      if (i === j) continue;
      const a = actions[i];
      const b = actions[j];
      if (SOCIAL.has(a.kind) && a.targetId === b.actorId && AVOID_SET.has(b.kind)) {
        if (!b.targetId || b.targetId === a.actorId) {
          pairs.push({ agentA: a.actorId, agentB: b.actorId, actionA: a, actionB: b, type: 'social_collision' });
        }
      }
    }
  }

  // Resource contention: two agents targeting same resource/feature.
  const byTarget = new Map<string, SimAction[]>();
  const RESOURCE_ACTIONS = new Set(['loot', 'take_resource', 'scavenge_feature', 'inspect_feature']);
  for (const a of actions) {
    if (a.targetId && RESOURCE_ACTIONS.has(a.kind)) {
      const key = String(a.targetId);
      const list = byTarget.get(key) || [];
      list.push(a);
      byTarget.set(key, list);
    }
  }
  for (const group of byTarget.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        pairs.push({
          agentA: group[i].actorId,
          agentB: group[j].actorId,
          actionA: group[i],
          actionB: group[j],
          type: 'resource_contention',
        });
      }
    }
  }

  return pairs;
}

function combatStrength(world: SimWorld, agentId: string): number {
  const c = world.characters[agentId];
  if (!c) return 0;
  return clamp01(c.health ?? 0.5) * 0.4
    + clamp01(c.energy ?? 0.5) * 0.3
    + (1 - clamp01(c.stress ?? 0)) * 0.3;
}

export function resolveConflicts(
  world: SimWorld,
  actions: SimAction[],
  seed: number,
): { resolved: ConflictResolution[]; filteredActions: SimAction[]; events: SimEvent[] } {
  const pairs = detectConflicts(actions);
  if (!pairs.length) return { resolved: [], filteredActions: actions, events: [] };

  const rng = new RNG(seed + world.tickIndex * 7919);
  const losers = new Set<string>();
  const resolved: ConflictResolution[] = [];
  const events: SimEvent[] = [];

  for (const pair of pairs) {
    if (losers.has(pair.agentA) || losers.has(pair.agentB)) continue;

    let winnerId: string;
    let loserId: string;
    let reason: string;

    if (pair.type === 'mutual_hostile') {
      const sA = combatStrength(world, pair.agentA);
      const sB = combatStrength(world, pair.agentB);
      const noise = (rng.next() - 0.5) * 0.1;
      if (sA + noise >= sB) {
        winnerId = pair.agentA;
        loserId = pair.agentB;
      } else {
        winnerId = pair.agentB;
        loserId = pair.agentA;
      }
      reason = `combat: ${winnerId} wins`;
    } else if (pair.type === 'social_collision') {
      winnerId = pair.agentB;
      loserId = pair.agentA;
      reason = `social_collision: ${pair.agentB} avoids`;
    } else {
      const eA = clamp01(Number(world.characters[pair.agentA]?.energy ?? 0.5));
      const eB = clamp01(Number(world.characters[pair.agentB]?.energy ?? 0.5));
      if (eA + (rng.next() - 0.5) * 0.05 >= eB) {
        winnerId = pair.agentA;
        loserId = pair.agentB;
      } else {
        winnerId = pair.agentB;
        loserId = pair.agentA;
      }
      reason = `resource: ${winnerId} faster`;
    }

    losers.add(loserId);
    const winnerAction = winnerId === pair.agentA ? pair.actionA : pair.actionB;
    const loserFallback: SimAction = {
      id: `act:conflict_fallback:${world.tickIndex}:${loserId}`,
      kind: 'wait',
      actorId: loserId,
      targetId: null,
      meta: {
        source: 'conflict_resolution',
        originalKind: loserId === pair.agentA ? pair.actionA.kind : pair.actionB.kind,
      },
    };

    resolved.push({ pair, winnerId, loserId, winnerAction, loserFallback, reason });
    events.push({
      id: `evt:conflict:${world.tickIndex}:${pair.agentA}:${pair.agentB}`,
      type: 'conflict',
      payload: { type: pair.type, winnerId, loserId, reason, tick: world.tickIndex },
    });
  }

  const filteredActions = actions.map((a) => {
    if (losers.has(a.actorId)) {
      const res = resolved.find((r) => r.loserId === a.actorId);
      return res ? res.loserFallback : a;
    }
    return a;
  });

  return { resolved, filteredActions, events };
}
