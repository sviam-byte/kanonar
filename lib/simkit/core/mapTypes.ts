// lib/simkit/core/mapTypes.ts
// Macro map data model: location layout + edge types for inter-location navigation.

export type MapEdgeType = 'open' | 'blocked' | 'hidden' | 'locked';

export type MacroMapLayout = {
  /** Location id → position on the map canvas. */
  positions: Record<string, { x: number; y: number }>;
  /** Edges with type overrides (open/blocked/hidden/locked). */
  edges: Array<{
    from: string;
    to: string;
    type: MapEdgeType;
    label?: string;
  }>;
  /** Canvas dimensions. */
  width: number;
  height: number;
};

export type MovementTrail = {
  agentId: string;
  /** Last N positions: { tick, locId, nodeId?, x?, y? } */
  trail: Array<{ tick: number; locId: string; nodeId?: string; x?: number; y?: number }>;
};

/**
 * Read or initialize macro map layout from world.facts.
 * If no layout exists, auto-generate a ring layout from locations.
 */
export function getMacroMapLayout(facts: any, locationIds: string[]): MacroMapLayout {
  const stored = facts?.['map:layout'] as MacroMapLayout | undefined;
  if (stored && stored.positions && Object.keys(stored.positions).length > 0) return stored;

  const n = Math.max(1, locationIds.length);
  const W = 800;
  const H = 500;
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) * 0.35;
  const positions: Record<string, { x: number; y: number }> = {};
  const sorted = locationIds.slice().sort();
  for (let i = 0; i < sorted.length; i++) {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    positions[sorted[i]] = { x: Math.round(cx + r * Math.cos(a)), y: Math.round(cy + r * Math.sin(a)) };
  }
  return { positions, edges: [], width: W, height: H };
}

/** Record a movement step in the agent's trail. */
export function recordTrail(
  facts: Record<string, unknown>,
  agentId: string,
  tick: number,
  locId: string,
  nodeId?: string,
  x?: number,
  y?: number,
  maxLen = 8,
): void {
  const key = `trail:${agentId}`;
  const prev: MovementTrail['trail'] = Array.isArray(facts[key]) ? facts[key] : [];
  prev.push({ tick, locId, nodeId, x, y });
  if (prev.length > maxLen) prev.splice(0, prev.length - maxLen);
  facts[key] = prev;
}

export function getTrail(facts: any, agentId: string): MovementTrail['trail'] {
  return Array.isArray(facts?.[`trail:${agentId}`]) ? facts[`trail:${agentId}`] : [];
}
