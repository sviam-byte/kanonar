// lib/simkit/actions/moveCellSpec.ts
// Intra-location movement on cell grids.
//
// Why this spec exists:
// - `move` needs `loc.nav.nodes` / inter-location neighbors.
// - some scenarios only provide `location.entity.map.cells` (grid without nav graph),
//   so agents previously had zero movement offers and got stuck.
//
// This spec provides deterministic, local movement inside a location map.

import type { ActionSpec, OfferCtx, ApplyCtx, ValidateCtx } from './specs';
import type { ActionOffer, SimEvent, SimWorld, SimLocation } from '../core/types';
import { clamp01 } from '../../util/math';
import { recordTrail } from '../core/mapTypes';

type CellRef = { x: number; y: number };
type MoveGoal = 'toward_ally' | 'toward_exit' | 'toward_cover' | 'away_threat' | 'wander';

/** Read map cells from canonical `location.entity.map.cells` shape. */
function getMapCells(loc: SimLocation): Array<{ x: number; y: number; walkable?: boolean; cover?: number }> {
  const map = (loc as any)?.entity?.map;
  return Array.isArray(map?.cells) ? map.cells : [];
}

/** Map width is only needed for compatibility/future indexing; defaults are safe. */
function getMapSize(loc: SimLocation): { w: number; h: number } {
  const map = (loc as any)?.entity?.map;
  return {
    w: Number.isFinite(Number(map?.width)) ? Number(map.width) : 20,
    h: Number.isFinite(Number(map?.height)) ? Number(map.height) : 20,
  };
}

function isWalkable(cells: Array<{ x: number; y: number; walkable?: boolean }>, x: number, y: number, _mapW: number): boolean {
  const cell = cells.find((c) => c.x === x && c.y === y);
  return Boolean(cell && cell.walkable !== false);
}

function charXY(world: SimWorld, charId: string): CellRef | null {
  const c = world.characters[charId];
  if (!c) return null;
  const x = Number((c as any).pos?.x);
  const y = Number((c as any).pos?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

const manhattan = (a: CellRef, b: CellRef) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function nearest(from: CellRef, points: CellRef[]): CellRef | null {
  if (!points.length) return null;
  let best = points[0];
  let bestD = manhattan(from, best);
  for (let i = 1; i < points.length; i += 1) {
    const d = manhattan(from, points[i]);
    if (d < bestD) {
      best = points[i];
      bestD = d;
    }
  }
  return best;
}

function stepToward(from: CellRef, to: CellRef, cells: Array<{ x: number; y: number; walkable?: boolean }>, mapW: number): CellRef {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  if (dx !== 0 && isWalkable(cells, from.x + dx, from.y, mapW)) return { x: from.x + dx, y: from.y };
  if (dy !== 0 && isWalkable(cells, from.x, from.y + dy, mapW)) return { x: from.x, y: from.y + dy };
  if (dx !== 0 && dy !== 0 && isWalkable(cells, from.x + dx, from.y + dy, mapW)) return { x: from.x + dx, y: from.y + dy };
  return from;
}

function stepAway(from: CellRef, threat: CellRef, cells: Array<{ x: number; y: number; walkable?: boolean }>, mapW: number): CellRef {
  const dx = Math.sign(from.x - threat.x);
  const dy = Math.sign(from.y - threat.y);
  if (dx !== 0 && isWalkable(cells, from.x + dx, from.y, mapW)) return { x: from.x + dx, y: from.y };
  if (dy !== 0 && isWalkable(cells, from.x, from.y + dy, mapW)) return { x: from.x, y: from.y + dy };
  return from;
}

function findCoverCells(cells: Array<{ x: number; y: number; walkable?: boolean; cover?: number }>): CellRef[] {
  return cells
    .filter((c) => c.walkable !== false && Number(c.cover ?? 0) > 0.3)
    .map((c) => ({ x: c.x, y: c.y }));
}

function findExitCells(loc: SimLocation): CellRef[] {
  const exits = (loc as any)?.entity?.map?.exits;
  if (!Array.isArray(exits)) return [];
  return exits
    .map((e: any) => ({ x: Number(e?.x), y: Number(e?.y) }))
    .filter((p: CellRef) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

/**
 * Pick best high-level move goal using deterministic local heuristics.
 * No RNG: same world state -> same chosen goal/target.
 */
function pickMoveGoal(world: SimWorld, actorId: string): { goal: MoveGoal; targetPos?: CellRef; score: number } | null {
  const actor = world.characters[actorId];
  if (!actor) return null;
  const loc = world.locations[(actor as any).locId];
  if (!loc) return null;

  const cells = getMapCells(loc);
  if (!cells.length) return null;

  const pos = charXY(world, actorId);
  if (!pos) return null;

  const facts: any = world.facts || {};
  const danger = clamp01(Number(facts[`ctx:danger:${actorId}`] ?? 0));
  const stress = clamp01(Number((actor as any).stress ?? 0));

  const allies: CellRef[] = [];
  const threats: CellRef[] = [];

  for (const other of Object.values(world.characters)) {
    if (other.id === actorId || (other as any).locId !== (actor as any).locId) continue;
    const otherPos = charXY(world, other.id);
    if (!otherPos) continue;

    const trust = clamp01(Number(facts[`rel:trust:${actorId}:${other.id}`] ?? facts?.relations?.[actorId]?.[other.id]?.trust ?? 0.5));
    const threat = clamp01(Number(facts[`rel:threat:${actorId}:${other.id}`] ?? facts?.relations?.[actorId]?.[other.id]?.threat ?? 0.3));

    if (trust > 0.6) allies.push(otherPos);
    if (threat > 0.5) threats.push(otherPos);
  }

  const candidates: Array<{ goal: MoveGoal; targetPos?: CellRef; score: number }> = [];

  if (threats.length && danger > 0.3) {
    const nearThreat = nearest(pos, threats);
    if (nearThreat && manhattan(pos, nearThreat) < 5) {
      candidates.push({ goal: 'away_threat', targetPos: nearThreat, score: 0.3 + danger * 0.5 });
    }
  }

  if (danger > 0.4) {
    const cover = nearest(pos, findCoverCells(cells));
    if (cover && manhattan(pos, cover) > 0) {
      candidates.push({ goal: 'toward_cover', targetPos: cover, score: 0.2 + danger * 0.4 });
    }
  }

  if (danger > 0.6 || stress > 0.7) {
    const exit = nearest(pos, findExitCells(loc));
    if (exit) {
      candidates.push({ goal: 'toward_exit', targetPos: exit, score: 0.15 + danger * 0.5 + stress * 0.3 });
    }
  }

  if (allies.length) {
    const farAllies = allies.filter((a) => manhattan(pos, a) > 3);
    if (farAllies.length) {
      candidates.push({ goal: 'toward_ally', targetPos: farAllies[0], score: 0.15 });
    }
  }

  candidates.push({ goal: 'wander', score: 0.05 });
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

export const MoveCellSpec: ActionSpec = {
  kind: 'move_cell',
  enumerate: ({ world, actorId }: OfferCtx): ActionOffer[] => {
    const actor = world.characters[actorId];
    if (!actor) return [];

    const loc = world.locations[(actor as any).locId];
    if (!loc) return [];

    const cells = getMapCells(loc);
    if (!cells.length) return [];

    const picked = pickMoveGoal(world, actorId);
    if (!picked || picked.score < 0.03) return [];

    return [{
      kind: 'move_cell',
      actorId,
      score: picked.score,
      meta: { moveGoal: picked.goal, targetPos: picked.targetPos },
    }];
  },
  validateV1: ({ offer }: ValidateCtx) => offer,
  validateV2: ({ offer }: ValidateCtx) => offer,
  classifyV3: () => 'single',
  apply: ({ world, action }: ApplyCtx) => {
    const notes: string[] = [];
    const events: SimEvent[] = [];

    const actor = world.characters[action.actorId];
    if (!actor) return { world, events, notes: ['move_cell: no char'] };

    const loc = world.locations[(actor as any).locId];
    if (!loc) return { world, events, notes: ['move_cell: no loc'] };

    const cells = getMapCells(loc);
    const { w: mapW } = getMapSize(loc);
    const pos = charXY(world, action.actorId);
    if (!pos) return { world, events, notes: ['move_cell: no pos'] };

    const goal: MoveGoal = (action.meta as any)?.moveGoal ?? 'wander';
    const targetPos: CellRef | undefined = (action.meta as any)?.targetPos;

    let next = pos;

    if (goal === 'away_threat' && targetPos) {
      next = stepAway(pos, targetPos, cells, mapW);
    } else if (targetPos) {
      next = stepToward(pos, targetPos, cells, mapW);
    } else {
      const dirs = [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 },
      ];
      const walkable = dirs.filter((d) => isWalkable(cells, pos.x + d.dx, pos.y + d.dy, mapW));
      if (walkable.length) {
        // Deterministic pseudo-choice (no RNG): depends only on tick index.
        const pick = walkable[world.tickIndex % walkable.length];
        next = { x: pos.x + pick.dx, y: pos.y + pick.dy };
      }
    }

    if (next.x === pos.x && next.y === pos.y) {
      notes.push(`${actor.id} can't move (stuck)`);
      return { world, events, notes };
    }

    (actor as any).pos = { ...(actor as any).pos, nodeId: null, x: next.x, y: next.y };
    (actor as any).energy = clamp01(Number((actor as any).energy ?? 0.5) - 0.005);
    recordTrail(world.facts as any, actor.id, world.tickIndex, (actor as any).locId, undefined, next.x, next.y);

    notes.push(`${actor.id} moves ${goal} to (${next.x},${next.y})`);
    events.push({
      id: `evt:move_cell:${world.tickIndex}:${actor.id}`,
      type: 'action:move_cell',
      payload: { actorId: actor.id, locationId: (actor as any).locId, x: next.x, y: next.y, goal },
    });

    return { world, events, notes };
  },
};
