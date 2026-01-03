import type { WorldState, DomainEvent } from '../../types';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function ensureEventLog(world: WorldState): { events: DomainEvent[]; meta: Record<string, any> } {
  const w: any = world as any;
  if (!w.eventLog) w.eventLog = { events: [], meta: {} };
  if (!Array.isArray(w.eventLog.events)) w.eventLog.events = [];
  if (!w.eventLog.meta || typeof w.eventLog.meta !== 'object') w.eventLog.meta = {};
  return w.eventLog;
}

function makeDecisionEventId(tick: number, actorId: string, actionId: string) {
  // Deterministic id: stable across runs for the same tick/actor/action.
  return `auto:decision:${tick}:${actorId}:${actionId}`;
}

/**
 * Close the loop: the chosen action becomes a DomainEvent.
 * This makes subsequent ticks able to “see” what the agent did.
 */
export function applyDecisionToWorld(args: {
  world: WorldState;
  tick: number;
  actorId: string;
  decision: any;
}): { appended?: DomainEvent } {
  const { world, tick, actorId, decision } = args;

  const best = decision?.best;
  const p = best?.p;
  const actionId = String(p?.id || '');
  if (!actionId) return {};

  const ev: DomainEvent = {
    id: makeDecisionEventId(tick, actorId, actionId),
    t: tick,
    type: 'action',
    actorId,
    targetId: (p as any)?.targetId,
    actionId,
    intensity: clamp01(Number(best?.score ?? best?.utility ?? 0.6)),
    domain: String((p as any)?.kind || 'action'),
    polarity: 1,
    locationId: (world as any)?.agents?.find((a: any) => a?.entityId === actorId)?.locationId,
    tags: Array.from(new Set([
      'auto',
      'decision',
      String((p as any)?.kind || 'action'),
      ...((p as any)?.tags || []),
    ])),
    meta: {
      score: best?.score,
      allowed: best?.allowed,
      why: best?.why,
    },
  };

  const log = ensureEventLog(world);
  log.events.push(ev);
  return { appended: ev };
}
