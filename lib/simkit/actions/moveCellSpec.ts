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

function findExitCells(loc: SimLocation): CellRef[] {
  const exits = (loc as any)?.entity?.map?.exits;
  if (!Array.isArray(exits)) return [];
  return exits
    .map((e: any) => ({ x: Number(e?.x), y: Number(e?.y) }))
    .filter((p: CellRef) => Number.isFinite(p.x) && Number.isFinite(p.y));
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

    const pos = charXY(world, actorId);
    if (!pos) return [];

    const facts: any = world.facts || {};
    const { w: mapW } = getMapSize(loc);

    // ── Read personality traits for movement preferences ──
    const entity: any = (actor as any)?.entity;
    const traits: any = entity?.traits || entity?.params || {};
    const traitN = (k: string, fb: number) => {
      const v = Number(traits[k]);
      return Number.isFinite(v) ? clamp01(v) : fb;
    };
    // Cautious characters value safety/cover more.
    const safetyWeight = 0.2 + 0.25 * traitN('D_HPA_reactivity', 0.5) + 0.15 * traitN('A_Safety_Care', 0.5);
    // Social characters value ally proximity more.
    const affiliationWeight = 0.1 + 0.2 * traitN('C_Social_Affiliation', 0.5);
    // Dominant characters value control positions (elevation, cover-as-dominance).
    const controlWeight = 0.1 + 0.15 * traitN('A_Power_Sovereignty', 0.5);
    // Curious characters explore more.
    const explorationWeight = 0.03 + 0.08 * traitN('B_openness', 0.5);

    // Build tactical context from local relations.
    const allies: CellRef[] = [];
    const threats: CellRef[] = [];
    for (const other of Object.values(world.characters)) {
      if (other.id === actorId || (other as any).locId !== (actor as any).locId) continue;
      const otherPos = charXY(world, other.id);
      if (!otherPos) continue;
      const trust = clamp01(Number(facts?.relations?.[actorId]?.[other.id]?.trust ?? 0.5));
      const threat = clamp01(Number(facts?.relations?.[actorId]?.[other.id]?.threat ?? 0.3));
      if (trust > 0.6) allies.push(otherPos);
      if (threat > 0.5) threats.push(otherPos);
    }

    const exitCells = findExitCells(loc);
    const danger = clamp01(Number(facts[`ctx:danger:${actorId}`] ?? 0));

    const dirs = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
      { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
      { dx: 1, dy: 1 }, { dx: -1, dy: -1 },
      { dx: 1, dy: -1 }, { dx: -1, dy: 1 },
    ];

    const offers: ActionOffer[] = [];
    for (const d of dirs) {
      const nx = pos.x + d.dx;
      const ny = pos.y + d.dy;
      if (!isWalkable(cells, nx, ny, mapW)) continue;

      const target: CellRef = { x: nx, y: ny };
      const cell = cells.find((c) => c.x === nx && c.y === ny);
      const cellCover = clamp01(Number(cell?.cover ?? 0));
      const deltaGoals: Record<string, number> = {};

      const nearestThreatDist = threats.length ? Math.min(...threats.map((t) => manhattan(target, t))) : 99;
      const curThreatDist = threats.length ? Math.min(...threats.map((t) => manhattan(pos, t))) : 99;
      deltaGoals.safety = (cellCover - 0.3) * safetyWeight + (nearestThreatDist > curThreatDist ? safetyWeight * 0.5 : -0.05);

      const nearestAllyDist = allies.length ? Math.min(...allies.map((a) => manhattan(target, a))) : 99;
      const curAllyDist = allies.length ? Math.min(...allies.map((a) => manhattan(pos, a))) : 99;
      deltaGoals.affiliation = nearestAllyDist < curAllyDist ? affiliationWeight : -0.03;

      deltaGoals.control = cellCover * controlWeight + clamp01(Number((cell as any)?.elevation ?? 0) / 5) * controlWeight * 0.8;
      deltaGoals.exploration = explorationWeight;

      const tags = Array.isArray((cell as any)?.tags) ? (cell as any).tags : [];
      const isRest = tags.includes('rest') || tags.includes('medical');
      if (isRest) deltaGoals.rest = 0.15;

      if (danger > 0.5 && exitCells.length) {
        const nearestExit = nearest(target, exitCells);
        const curExit = nearest(pos, exitCells);
        if (nearestExit && curExit) {
          const exitImprovement = manhattan(pos, curExit) - manhattan(target, nearestExit);
          if (exitImprovement > 0) deltaGoals.safety = (deltaGoals.safety || 0) + exitImprovement * 0.05;
        }
      }

      const topGoal = Object.entries(deltaGoals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'wander';
      const score = Math.max(0.02, Object.values(deltaGoals).reduce((sum, v) => sum + Math.max(0, v), 0));

      offers.push({
        kind: 'move_cell',
        actorId,
        score,
        meta: { moveGoal: topGoal as MoveGoal, targetPos: target, deltaGoals, cellCover },
      });
    }

    offers.push({
      kind: 'move_cell',
      actorId,
      score: 0.01,
      meta: { moveGoal: 'wander' as MoveGoal, targetPos: pos, deltaGoals: {}, cellCover: 0, isStay: true },
    });

    return offers;
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

    const pos = charXY(world, action.actorId);
    if (!pos) return { world, events, notes: ['move_cell: no pos'] };

    const goal: MoveGoal = (action.meta as any)?.moveGoal ?? 'wander';
    const targetPos: CellRef | undefined = (action.meta as any)?.targetPos;
    const isStay = (action.meta as any)?.isStay === true;
    if (isStay || !targetPos || (targetPos.x === pos.x && targetPos.y === pos.y)) {
      notes.push(`${actor.id} holds position`);
      return { world, events, notes };
    }

    // Target cell is selected during enumerate and later scored by GoalLab.
    const next = targetPos;

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
