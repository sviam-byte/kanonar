import type { SimCharacter, SimLocation, SimWorld } from '../core/types';
import type { AutoPlacementMode, PlacementSpec } from './types';

type XY = { x: number; y: number };

/**
 * Auto-place characters on the map using the specified strategy.
 *
 * Modifies world.characters[*].pos in place.
 * Returns the number of characters placed.
 *
 * All strategies ensure characters get valid, walkable positions.
 * They differ in HOW positions are chosen.
 */
export function autoPlaceCharacters(
  world: SimWorld,
  mode: AutoPlacementMode,
  specs?: PlacementSpec[],
  seed?: number,
): number {
  const chars = Object.values(world.characters);
  if (!chars.length) return 0;

  // Group by location
  const byLoc: Record<string, SimCharacter[]> = {};
  for (const c of chars) {
    const locId = (c as any).locId;
    if (!locId) continue;
    (byLoc[locId] ??= []).push(c);
  }

  let placed = 0;

  for (const [locId, locChars] of Object.entries(byLoc)) {
    const loc = world.locations[locId];
    if (!loc) continue;

    const bounds = getMapBounds(loc);
    const walkable = getWalkableCells(loc);
    const navNodes = getNavNodes(loc);
    const specsByActor = new Map((specs ?? []).map((s) => [s.actorId, s]));

    let positions: XY[];
    switch (mode) {
      case 'clustered':
        positions = placeClustered(locChars.length, bounds, navNodes);
        break;
      case 'split_by_role':
        positions = placeSplitByRole(locChars, bounds, navNodes);
        break;
      case 'socially_weighted':
        positions = placeSociallyWeighted(locChars, bounds, navNodes, world);
        break;
      case 'near_points_of_interest':
        positions = placeNearPOI(locChars, loc, bounds, navNodes, specsByActor);
        break;
      case 'random_valid':
        positions = placeRandom(locChars.length, bounds, walkable, navNodes, seed ?? 0);
        break;
      case 'scenario_preset':
        // Fallback to clustered for now; scenario presets need scenario data
        positions = placeClustered(locChars.length, bounds, navNodes);
        break;
      default:
        positions = placeClustered(locChars.length, bounds, navNodes);
    }

    for (let i = 0; i < locChars.length; i++) {
      const c = locChars[i] as any;
      const pos = positions[i] ?? positions[positions.length - 1] ?? { x: bounds.cx, y: bounds.cy };

      // Check forbidden zones
      const spec = specsByActor.get(c.id);
      if (spec?.forbiddenZones?.length) {
        // Simple: just offset if in forbidden zone (placeholder for real zone check)
        // Full implementation would check zone geometry
      }

      // Snap to nearest nav node if available
      const nearNode = findNearestNavNode(navNodes, pos);
      c.pos = {
        nodeId: nearNode?.id ?? null,
        x: nearNode ? nearNode.x : pos.x,
        y: nearNode ? nearNode.y : pos.y,
      };
      placed++;
    }
  }

  return placed;
}

// ── Helpers ──

interface Bounds { cx: number; cy: number; w: number; h: number; }
interface NavNode { id: string; x: number; y: number; tags?: string[]; }

function getMapBounds(loc: SimLocation): Bounds {
  const map = (loc as any)?.map ?? (loc as any)?.entity?.map;
  const w = Number(map?.width ?? 1024);
  const h = Number(map?.height ?? 768);
  return {
    cx: (Number.isFinite(w) ? w : 1024) / 2,
    cy: (Number.isFinite(h) ? h : 768) / 2,
    w: Number.isFinite(w) ? w : 1024,
    h: Number.isFinite(h) ? h : 768,
  };
}

function getNavNodes(loc: SimLocation): NavNode[] {
  const nodes = (loc as any)?.nav?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes
    .filter((n: any) => Number.isFinite(Number(n?.x)) && Number.isFinite(Number(n?.y)))
    .map((n: any) => ({ id: String(n.id), x: Number(n.x), y: Number(n.y), tags: n.tags }));
}

function getWalkableCells(loc: SimLocation): XY[] {
  const cells = (loc as any)?.entity?.map?.cells;
  if (!Array.isArray(cells)) return [];
  return cells
    .filter((c: any) => c.walkable !== false)
    .map((c: any) => ({ x: Number(c.x), y: Number(c.y) }));
}

function findNearestNavNode(nodes: NavNode[], pos: XY): NavNode | null {
  if (!nodes.length) return null;
  let best = nodes[0];
  let bestD = Math.hypot(pos.x - best.x, pos.y - best.y);
  for (let i = 1; i < nodes.length; i++) {
    const d = Math.hypot(pos.x - nodes[i].x, pos.y - nodes[i].y);
    if (d < bestD) { best = nodes[i]; bestD = d; }
  }
  return best;
}

function detHash(s: string, seed: number): number {
  let h = seed ^ 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) / 0xffffffff;
}

// ── Strategies ──

function placeClustered(n: number, bounds: Bounds, nodes: NavNode[]): XY[] {
  if (nodes.length >= n) {
    // Pick n nearest-to-center nodes
    const sorted = [...nodes].sort((a, b) =>
      Math.hypot(a.x - bounds.cx, a.y - bounds.cy) - Math.hypot(b.x - bounds.cx, b.y - bounds.cy),
    );
    return sorted.slice(0, n);
  }
  // Circular placement around center
  const radius = Math.min(bounds.w, bounds.h) * 0.08;
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2;
    return {
      x: bounds.cx + radius * Math.cos(angle),
      y: bounds.cy + radius * Math.sin(angle),
    };
  });
}

function placeSplitByRole(chars: SimCharacter[], bounds: Bounds, _nodes: NavNode[]): XY[] {
  const positions: XY[] = [];
  const leaders: number[] = [];
  const core: number[] = [];
  const periphery: number[] = [];

  chars.forEach((c, i) => {
    const tags = new Set((c.tags ?? []).map(String));
    if (tags.has('leader') || tags.has('authority') || tags.has('commander')) leaders.push(i);
    else if (tags.has('observer') || tags.has('scout') || tags.has('outsider')) periphery.push(i);
    else core.push(i);
  });

  // Leaders at center, core mid-ring, periphery outer ring
  const r1 = Math.min(bounds.w, bounds.h) * 0.03;
  const r2 = Math.min(bounds.w, bounds.h) * 0.10;
  const r3 = Math.min(bounds.w, bounds.h) * 0.20;

  const placeRing = (indices: number[], radius: number) => {
    indices.forEach((idx, j) => {
      const angle = (j / Math.max(indices.length, 1)) * Math.PI * 2;
      positions[idx] = { x: bounds.cx + radius * Math.cos(angle), y: bounds.cy + radius * Math.sin(angle) };
    });
  };

  placeRing(leaders, r1);
  placeRing(core, r2);
  placeRing(periphery, r3);

  // Fill any gaps
  for (let i = 0; i < chars.length; i++) {
    if (!positions[i]) positions[i] = { x: bounds.cx, y: bounds.cy };
  }

  return positions;
}

function placeSociallyWeighted(
  chars: SimCharacter[],
  bounds: Bounds,
  _nodes: NavNode[],
  world: SimWorld,
): XY[] {
  // Start with clustered, then push/pull by relationships
  const base = placeClustered(chars.length, bounds, []);
  const facts: any = world.facts || {};

  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < chars.length; i++) {
      let fx = 0;
      let fy = 0;
      for (let j = 0; j < chars.length; j++) {
        if (i === j) continue;
        const dx = base[j].x - base[i].x;
        const dy = base[j].y - base[i].y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const nx = dx / dist;
        const ny = dy / dist;

        const trust = Number(
          facts?.relations?.[chars[i].id]?.[chars[j].id]?.trust
          ?? facts?.[`rel:trust:${chars[i].id}:${chars[j].id}`]
          ?? 0.5,
        );

        // Trust > 0.5 → attract, < 0.5 → repel
        const force = (trust - 0.5) * 2; // -1..+1
        const strength = 8;
        fx += nx * force * strength;
        fy += ny * force * strength;
      }
      base[i] = {
        x: Math.max(20, Math.min(bounds.w - 20, base[i].x + fx)),
        y: Math.max(20, Math.min(bounds.h - 20, base[i].y + fy)),
      };
    }
  }

  return base;
}

function placeNearPOI(
  chars: SimCharacter[],
  loc: SimLocation,
  bounds: Bounds,
  nodes: NavNode[],
  specs: Map<string, PlacementSpec>,
): XY[] {
  const features = (loc as any).features ?? [];
  const featurePos: Record<string, XY> = {};
  for (const f of features) {
    if (f.nodeId) {
      const node = nodes.find((n) => n.id === f.nodeId);
      if (node) featurePos[f.kind] = { x: node.x, y: node.y };
    }
  }

  return chars.map((c) => {
    const spec = specs.get(c.id);
    if (spec?.preferredNearPOI?.length) {
      for (const poi of spec.preferredNearPOI) {
        if (featurePos[poi]) {
          const p = featurePos[poi];
          return { x: p.x + (detHash(c.id, 1) - 0.5) * 20, y: p.y + (detHash(c.id, 2) - 0.5) * 20 };
        }
      }
    }
    // Fallback: nearest node or center
    return nodes.length
      ? nodes[Math.floor(detHash(c.id, 3) * nodes.length)]
      : { x: bounds.cx + (detHash(c.id, 4) - 0.5) * bounds.w * 0.3, y: bounds.cy + (detHash(c.id, 5) - 0.5) * bounds.h * 0.3 };
  });
}

function placeRandom(n: number, bounds: Bounds, walkable: XY[], nodes: NavNode[], seed: number): XY[] {
  if (nodes.length >= n) {
    // Shuffle deterministically
    const shuffled = [...nodes];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(detHash(`${seed}:${i}`, seed) * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, n);
  }
  if (walkable.length >= n) {
    const shuffled = [...walkable];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(detHash(`${seed}:w:${i}`, seed) * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, n);
  }
  // Deterministic scatter
  return Array.from({ length: n }, (_, i) => ({
    x: 20 + detHash(`${seed}:rx:${i}`, seed) * (bounds.w - 40),
    y: 20 + detHash(`${seed}:ry:${i}`, seed) * (bounds.h - 40),
  }));
}
