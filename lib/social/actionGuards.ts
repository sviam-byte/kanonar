import type { AgentState, WorldState, DomainEvent } from '../../types';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function getRelPriors(
  actor: AgentState,
  targetId: string,
): {
  trust: number;
  threat: number;
  strength: number;
  tags: string[];
  updatedAtTick: number;
} {
  const graph = (actor as any)?.relations?.graph;
  const edges: any[] = Array.isArray(graph?.edges) ? graph.edges : [];
  const edge = edges.find(x => x?.a === actor.entityId && x?.b === targetId) || null;

  return {
    trust: clamp01(edge?.trustPrior ?? 0.5),
    threat: clamp01(edge?.threatPrior ?? 0.3),
    strength: clamp01(edge?.strength ?? 0.5),
    tags: Array.isArray(edge?.tags) ? edge.tags.map(String) : [],
    updatedAtTick: Number.isFinite(edge?.updatedAtTick) ? edge.updatedAtTick : 0,
  };
}

export function recentBetween(
  world: WorldState,
  a: string,
  b: string,
  lookbackTicks = 25,
): DomainEvent[] {
  const now = world.tick ?? 0;
  const log: DomainEvent[] = Array.isArray((world as any)?.eventLog?.events)
    ? (world as any).eventLog.events
    : [];

  return log.filter(ev => {
    if (!ev || ev.domain !== 'action') return false;
    if (now - (ev.t ?? 0) > lookbackTicks) return false;

    const actor = String(ev.actorId ?? '');
    const target = ev.targetId ? String(ev.targetId) : '';
    return (actor === a && target === b) || (actor === b && target === a);
  });
}

export function hasRecentAction(
  world: WorldState,
  opts: {
    a: string;
    b: string;
    lookbackTicks?: number;
    actionIdsAny?: string[];
    tagsAny?: string[];
    actorMustBe?: 'a' | 'b' | 'any';
  },
): boolean {
  const {
    a,
    b,
    lookbackTicks = 25,
    actionIdsAny,
    tagsAny,
    actorMustBe = 'any',
  } = opts;
  const evs = recentBetween(world, a, b, lookbackTicks);
  const ids = (actionIdsAny || []).map(s => String(s).toLowerCase());
  const tags = (tagsAny || []).map(s => String(s).toLowerCase());

  return evs.some(ev => {
    const actor = String(ev.actorId ?? '');
    if (actorMustBe === 'a' && actor !== a) return false;
    if (actorMustBe === 'b' && actor !== b) return false;

    const actionId = String(ev.actionId ?? '').toLowerCase();
    const evTags = Array.isArray(ev.tags) ? ev.tags.map(t => String(t).toLowerCase()) : [];

    const okId = ids.length ? ids.includes(actionId) : true;
    const okTag = tags.length ? evTags.some(t => tags.includes(t)) : true;
    return okId && okTag;
  });
}

export function lastActionIdBetween(
  world: WorldState,
  a: string,
  b: string,
  lookbackTicks = 25,
): string | null {
  const evs = recentBetween(world, a, b, lookbackTicks).sort((x, y) => (y.t ?? 0) - (x.t ?? 0));
  const top = evs[0];
  return top ? String(top.actionId ?? '') : null;
}
