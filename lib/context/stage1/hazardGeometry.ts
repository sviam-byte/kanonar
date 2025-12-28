// lib/context/stage1/hazardGeometry.ts
// Geometry-aware “опасность” atoms built from location grid + agent positions.
//
// What it adds:
//  - world:map:hazardProximity:<selfId>                       (self distance -> proximity to nearest hazard cell)
//  - world:map:hazardProximity:<selfId>:<otherId>             (same for other agents)
//  - world:map:hazardBetween:<selfId>:<otherId>               (max hazard along segment between positions)
//  - soc:allyHazardBetween:<selfId>:<otherId>                 (prox:friend * hazardBetween)
//  - soc:enemyHazardBetween:<selfId>:<otherId>                (prox:enemy * hazardBetween)
//  - haz:enemyProximity:<selfId>                              (max prox:enemy)
//  - haz:dangerSourceProximity:<selfId>                       (max(hazardProximity, enemyProximity))

import type { ContextAtom } from '../v2/types';
import { normalizeAtom } from '../v2/infer';
import { ensureMapCells } from '../../world/ensureMapCells';
import { gateOK } from '../gates/atomGates';

const HAZ_GATE = { anyPrefix: ['world:map:hazard:', 'world:env:hazard:', 'hazard:'] };

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function getMag(atoms: ContextAtom[], id: string, fallback = 0) {
  const a = atoms.find(x => x.id === id);
  const m = a?.magnitude;
  return typeof m === 'number' && Number.isFinite(m) ? m : fallback;
}

function getTarget(atoms: ContextAtom[], id: string): string | undefined {
  const a = atoms.find(x => x.id === id);
  return (typeof a?.target === 'string' && a.target) || (typeof a?.meta?.locationId === 'string' && a.meta.locationId) || undefined;
}

function inBounds(x: number, y: number, w: number, h: number) {
  return x >= 0 && y >= 0 && x < w && y < h;
}

function idx(x: number, y: number, w: number) {
  return y * w + x;
}

function bresenham(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let x = x0;
  let y = y0;

  while (true) {
    points.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return points;
}

function computeDistanceTransform(
  w: number,
  h: number,
  walkable: boolean[],
  hazardStrength: number[]
): number[] {
  // Multi-source BFS distance (4-neighborhood).
  // Distance is measured in steps. Unreachable => Infinity.
  const dist = new Array<number>(w * h).fill(Infinity);
  const qx: number[] = [];
  const qy: number[] = [];
  let qh = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w);
      if (hazardStrength[i] > 0) {
        dist[i] = 0;
        qx.push(x);
        qy.push(y);
      }
    }
  }

  const dirs = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 }
  ];

  while (qh < qx.length) {
    const x = qx[qh];
    const y = qy[qh];
    qh++;

    const baseI = idx(x, y, w);
    const baseD = dist[baseI];

    for (const d of dirs) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (!inBounds(nx, ny, w, h)) continue;
      const ni = idx(nx, ny, w);
      // We propagate through walkable cells; hazard cells themselves can be non-walkable,
      // but they still act as sources.
      if (!walkable[ni]) continue;
      const nd = baseD + 1;
      if (nd < dist[ni]) {
        dist[ni] = nd;
        qx.push(nx);
        qy.push(ny);
      }
    }
  }

  return dist;
}

/**
 * Convert a map cell into a hazard strength in [0..1].
 *
 * IMPORTANT:
 * UI often sets danger ~0.2..0.8. A hard threshold makes hazardBetween/hazardProximity
 * almost always zero, so use a soft threshold that preserves contrast.
 */
function hazardFromCell(cell: any, dangerThreshold: number): number {
  const tags: string[] = Array.isArray(cell?.tags) ? cell.tags : [];
  if (tags.includes('hazard')) return 1;

  const d = typeof cell?.danger === 'number' ? cell.danger : 0;
  const dn = clamp01(d);
  const eps = clamp01(dangerThreshold);
  if (dn <= eps) return 0;
  return clamp01((dn - eps) / Math.max(1e-6, (1 - eps)));
}

function safePos(pos: any, w: number, h: number): { x: number; y: number } | null {
  const x = Math.round(pos?.x ?? NaN);
  const y = Math.round(pos?.y ?? NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const cx = Math.max(0, Math.min(w - 1, x));
  const cy = Math.max(0, Math.min(h - 1, y));
  return { x: cx, y: cy };
}

function mkAtom(args: {
  id: string;
  selfId: string;
  otherId?: string;
  ns: any;
  kind: string;
  magnitude: number;
  usedAtomIds: string[];
  parts: any;
  label?: string;
  meta?: any;
}): ContextAtom {
  return normalizeAtom({
    id: args.id,
    ns: args.ns,
    kind: args.kind,
    origin: 'derived',
    source: 'hazardGeometry',
    magnitude: clamp01(args.magnitude),
    confidence: 1,
    subject: args.selfId,
    target: args.otherId,
    relatedAgentId: args.otherId,
    tags: [String(args.ns), 'hazardGeometry', args.kind],
    label: args.label,
    meta: args.meta,
    trace: {
      usedAtomIds: Array.from(new Set(args.usedAtomIds)),
      notes: [],
      parts: args.parts
    }
  });
}

export function deriveHazardGeometryAtoms(args: {
  world: any;
  selfId: string;
  atoms: ContextAtom[];
  dangerThreshold?: number;
}): { atoms: ContextAtom[] } {
  const { world, selfId, atoms } = args;
  if (!gateOK(atoms, HAZ_GATE)) return { atoms: [] };
  const dangerThreshold = typeof args.dangerThreshold === 'number' ? args.dangerThreshold : 0.15;

  const out: ContextAtom[] = [];

  // Resolve locationId for self (prefer explicit world fact atom).
  const locId =
    getTarget(atoms, `world:location:${selfId}`) ||
    world?.agents?.find((a: any) => a?.entityId === selfId)?.locationId ||
    world?.agents?.find((a: any) => a?.id === selfId)?.locationId;

  if (!locId) return { atoms: out };

  const loc = world?.locations?.find((l: any) => l?.entityId === locId);
  const map = loc?.map;
  if (!map || typeof map.width !== 'number' || typeof map.height !== 'number') return { atoms: out };

  const w = map.width;
  const h = map.height;
  const mapCells = ensureMapCells(map).cells;

  const walkable: boolean[] = new Array(w * h).fill(true);
  const hazardStrength: number[] = new Array(w * h).fill(0);

  for (const cell of mapCells) {
    const x = cell.x;
    const y = cell.y;
    if (!inBounds(x, y, w, h)) continue;
    const i = idx(x, y, w);
    walkable[i] = !!cell.walkable;
    hazardStrength[i] = hazardFromCell(cell, dangerThreshold);
  }

  const hazardCellsCount = hazardStrength.reduce((acc, v) => acc + (v > 0 ? 1 : 0), 0);
  const dist = computeDistanceTransform(w, h, walkable, hazardStrength);
  const dMax = Math.max(1, w + h); // steps scale

  // Gather relevant other agents: those that appear in obs:nearby for self.
  const otherIds = new Set<string>();
  for (const a of atoms) {
    if (!a?.id?.startsWith(`obs:nearby:${selfId}:`)) continue;
    const parts = a.id.split(':');
    const otherId = parts[3];
    if (otherId) otherIds.add(otherId);
  }

  const worldAgents: any[] = Array.isArray(world?.agents) ? world.agents : [];

  const getAgentPos = (agentId: string) => {
    const ag = worldAgents.find(a => a?.entityId === agentId) || worldAgents.find(a => a?.id === agentId);
    if (!ag?.position) return null;
    return safePos(ag.position, w, h);
  };

  // --- Self hazard proximity ---
  const selfPos = getAgentPos(selfId);
  if (selfPos) {
    const di = dist[idx(selfPos.x, selfPos.y, w)];
    const prox = Number.isFinite(di) ? clamp01(1 - di / dMax) : 0;

    out.push(
      mkAtom({
        id: `world:map:hazardProximity:${selfId}`,
        selfId,
        ns: 'world',
        kind: 'hazard_proximity',
        magnitude: prox,
        usedAtomIds: [`world:location:${selfId}`],
        parts: { cell: selfPos, distSteps: di, dMax, hazardCellsCount, dangerThreshold },
        meta: { cell: selfPos, distSteps: di, dMax, hazardCellsCount, dangerThreshold }
      })
    );
  }

  // --- Other agents hazard proximity + hazardBetween ---
  for (const otherId of otherIds) {
    const otherPos = getAgentPos(otherId);
    if (!otherPos || !selfPos) continue;

    const di = dist[idx(otherPos.x, otherPos.y, w)];
    const prox = Number.isFinite(di) ? clamp01(1 - di / dMax) : 0;

    out.push(
      mkAtom({
        id: `world:map:hazardProximity:${selfId}:${otherId}`,
        selfId,
        otherId,
        ns: 'world',
        kind: 'hazard_proximity_other',
        magnitude: prox,
        usedAtomIds: [`world:location:${selfId}`],
        parts: { cell: otherPos, distSteps: di, dMax, hazardCellsCount, dangerThreshold },
        meta: { cell: otherPos, distSteps: di, dMax, hazardCellsCount, dangerThreshold }
      })
    );

    // hazardBetween on segment selfPos -> otherPos
    const seg = bresenham(selfPos.x, selfPos.y, otherPos.x, otherPos.y);
    let hb = 0;
    let hbCount = 0;

    for (let k = 0; k < seg.length; k++) {
      const p = seg[k];
      if (!inBounds(p.x, p.y, w, h)) continue;
      const i = idx(p.x, p.y, w);
      const v = hazardStrength[i];
      if (v > 0) hbCount++;
      hb = Math.max(hb, v);
    }

    out.push(
      mkAtom({
        id: `world:map:hazardBetween:${selfId}:${otherId}`,
        selfId,
        otherId,
        ns: 'world',
        kind: 'hazard_between',
        magnitude: hb,
        usedAtomIds: [`world:location:${selfId}`],
        parts: { segmentLen: seg.length, hazardOnSegmentCells: hbCount, hazardMax: hb },
        meta: { segmentLen: seg.length, hazardOnSegmentCells: hbCount, hazardMax: hb }
      })
    );

    // Composites: “мы рядом, но между нами опасность”
    const friendNear = getMag(atoms, `prox:friend:${selfId}:${otherId}`, 0);
    const enemyNear = getMag(atoms, `prox:enemy:${selfId}:${otherId}`, 0);

    if (friendNear > 0) {
      out.push(
        mkAtom({
          id: `soc:allyHazardBetween:${selfId}:${otherId}`,
          selfId,
          otherId,
          ns: 'soc',
          kind: 'ally_hazard_between',
          magnitude: friendNear * hb,
          usedAtomIds: [`prox:friend:${selfId}:${otherId}`, `world:map:hazardBetween:${selfId}:${otherId}`],
          parts: { friendNear, hazardBetween: hb }
        })
      );
    }

    if (enemyNear > 0) {
      out.push(
        mkAtom({
          id: `soc:enemyHazardBetween:${selfId}:${otherId}`,
          selfId,
          otherId,
          ns: 'soc',
          kind: 'enemy_hazard_between',
          magnitude: enemyNear * hb,
          usedAtomIds: [`prox:enemy:${selfId}:${otherId}`, `world:map:hazardBetween:${selfId}:${otherId}`],
          parts: { enemyNear, hazardBetween: hb }
        })
      );
    }
  }

  // --- Enemy-as-danger summary ---
  // (враг = источник опасности, независимо от клеток)
  let enemyProx = 0;
  const usedEnemies: string[] = [];
  for (const otherId of otherIds) {
    const p = getMag(atoms, `prox:enemy:${selfId}:${otherId}`, 0);
    if (p > 0) {
      usedEnemies.push(`prox:enemy:${selfId}:${otherId}`);
      enemyProx = Math.max(enemyProx, p);
    }
  }

  if (enemyProx > 0) {
    out.push(
      mkAtom({
        id: `haz:enemyProximity:${selfId}`,
        selfId,
        ns: 'misc',
        kind: 'enemy_as_hazard',
        magnitude: enemyProx,
        usedAtomIds: usedEnemies,
        parts: { enemyProx }
      })
    );
  }

  const hazardProxSelf = getMag(out as any, `world:map:hazardProximity:${selfId}`, 0);
  const dangerSource = Math.max(hazardProxSelf, enemyProx);

  out.push(
    mkAtom({
      id: `haz:dangerSourceProximity:${selfId}`,
      selfId,
      ns: 'misc',
      kind: 'danger_source_proximity',
      magnitude: dangerSource,
      usedAtomIds: [
        `world:map:hazardProximity:${selfId}`,
        ...(enemyProx > 0 ? [`haz:enemyProximity:${selfId}`] : [])
      ],
      parts: { hazardProx: hazardProxSelf, enemyProx, dangerSource }
    })
  );

  return { atoms: out };
}
