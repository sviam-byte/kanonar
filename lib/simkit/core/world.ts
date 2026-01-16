// lib/simkit/core/world.ts
// World utilities and snapshot builder.

import type { Id, SimWorld, SimSnapshot, SimCharacter, SimLocation } from './types';
import { importLocationFromGoalLab } from '../locations/goallabImport';

const nowIso = () => new Date().toISOString();
const padTick = (t: number) => `t${String(t).padStart(5, '0')}`;

export function cloneWorld(w: SimWorld): SimWorld {
  return JSON.parse(JSON.stringify(w));
}

export function getChar(w: SimWorld, id: Id): SimCharacter {
  const c = w.characters[id];
  if (!c) throw new Error(`SimKit: missing character ${id}`);
  return c;
}

export function getLoc(w: SimWorld, id: Id): SimLocation {
  const l = w.locations[id];
  if (!l) throw new Error(`SimKit: missing location ${id}`);
  return l;
}

export function buildSnapshot(w: SimWorld, opts?: { events?: any[] }): SimSnapshot {
  return {
    schema: 'SimKitSnapshotV1',
    id: `sim:snap:${padTick(w.tickIndex)}`,
    time: nowIso(),
    tickIndex: w.tickIndex,
    characters: Object.values(w.characters).sort((a, b) => a.id.localeCompare(b.id)),
    locations: Object.values(w.locations).sort((a, b) => a.id.localeCompare(b.id)),
    // IMPORTANT: SimWorld.events is a transient queue that is consumed during step().
    // Snapshot должен отражать события, реально применённые на этом тике.
    // Поэтому opts.events (eventsApplied) имеет приоритет; иначе fallback на w.events.
    events: (opts?.events || w.events || []).slice().sort((a, b) => a.id.localeCompare(b.id)),
    debug: {},
  };
}

// Ensure that a character has a usable position; fallback to first nav node or origin.
export function ensureCharacterPos(world: SimWorld, charId: string, orderIndex?: number) {
  const c = world.characters[charId];
  if (!c) return;
  const loc = world.locations[c.locId];
  const navNodes = Array.isArray(loc?.nav?.nodes) ? loc!.nav!.nodes : [];

  if (!c.pos) c.pos = { nodeId: null, x: null as any, y: null as any };

  // Prefer nav graph if present.
  if (!c.pos.nodeId && navNodes.length) {
    const idx = Number.isFinite(orderIndex as any) ? Number(orderIndex) : 0;
    const n = navNodes[idx % navNodes.length] || navNodes[0];
    c.pos.nodeId = String(n.id);
    c.pos.x = Number(n.x);
    c.pos.y = Number(n.y);
    return;
  }

  const x0 = Number((c as any).pos?.x);
  const y0 = Number((c as any).pos?.y);
  const okXY = Number.isFinite(x0) && Number.isFinite(y0);

  const mapW = Number((loc as any)?.map?.width ?? (loc as any)?.width);
  const mapH = Number((loc as any)?.map?.height ?? (loc as any)?.height);
  const hasMap = Number.isFinite(mapW) && Number.isFinite(mapH) && mapW > 0 && mapH > 0;

  // If we have a map, but coords are missing/invalid, scatter deterministically.
  if (!okXY && hasMap) {
    const idx = Number.isFinite(orderIndex as any) ? Number(orderIndex) : 0;
    const cx = mapW / 2;
    const cy = mapH / 2;
    const r = Math.min(mapW, mapH) * (0.06 + 0.02 * Math.sqrt(idx));
    const a = idx * 0.85;
    c.pos.x = cx + r * Math.cos(a);
    c.pos.y = cy + r * Math.sin(a);
    c.pos.nodeId = c.pos.nodeId ?? null;
    return;
  }

  // Final fallback: origin.
  if (!okXY) {
    c.pos.x = 0;
    c.pos.y = 0;
    c.pos.nodeId = c.pos.nodeId ?? null;
  }
}

export function worldFromScenarioDraft(draft: any): SimWorld {
  const locations: Record<string, SimLocation> = {};
  // 1) SimKit locations
  for (const l of (draft.locations || [])) {
    if (!l?.id) continue;
    locations[l.id] = l;
  }
  // 2) GoalLab specs -> SimKit locations (map+nav)
  for (const spec of (draft.locationSpecs || [])) {
    if (!spec?.id) continue;
    const imported = importLocationFromGoalLab(spec);
    const base = locations[spec.id];
    locations[spec.id] = base
      ? {
          ...base,
          map: imported.map ?? base.map ?? null,
          nav: imported.nav ?? base.nav,
          features: imported.features ?? base.features,
          hazards: { ...(base.hazards || {}), ...(imported.hazards || {}) },
        }
      : imported;
  }

  const characters: Record<string, SimCharacter> = {};
  for (const c of (draft.characters || [])) {
    if (!c?.id) continue;
    characters[c.id] = c;
  }

  // placements: set locId + pos
  for (const p of (draft.placements || [])) {
    const ch = characters[p.characterId];
    if (!ch) continue;
    if (p.locationId) ch.locId = p.locationId;
    ch.pos = {
      nodeId: p.nodeId ?? null,
      x: p.x ?? null,
      y: p.y ?? null,
    };
  }

  // If there are no placements at all, auto-place the entire cast in the first location.
  const locIds = Object.keys(locations || {}).sort();
  const fallbackLocId = locIds[0] || null;
  const characterList = Object.values(characters);
  const placedCount = characterList.reduce((count, c: any) => {
    const x = Number(c?.pos?.x);
    const y = Number(c?.pos?.y);
    return count + (Number.isFinite(x) && Number.isFinite(y) ? 1 : 0);
  }, 0);
  const shouldAutoPlaceAll = placedCount === 0 && Boolean(fallbackLocId);

  if (shouldAutoPlaceAll) {
    for (const c of characterList as any[]) {
      c.locId = fallbackLocId;
      c.pos = { nodeId: null, x: undefined, y: undefined };
    }
  }

  // Normalize missing/invalid positions for each character.
  for (const [index, ch] of characterList.entries()) {
    if (!ch.locId || !locations[ch.locId]) ch.locId = fallbackLocId;
    const loc = ch.locId ? locations[ch.locId] : null;
    const navNodes = Array.isArray(loc?.nav?.nodes) ? loc!.nav!.nodes : [];

    if (!ch.pos) ch.pos = { nodeId: null, x: null, y: null };

    // If no nodeId and nav exists -> spread across nodes (not all stacked on node0).
    if (!ch.pos.nodeId && navNodes.length) {
      const n = navNodes[index % navNodes.length] || navNodes[0];
      ch.pos.nodeId = String(n.id);
      ch.pos.x = Number(n.x);
      ch.pos.y = Number(n.y);
      continue;
    }

    const mapW = Number(loc?.map?.width ?? loc?.width);
    const mapH = Number(loc?.map?.height ?? loc?.height);
    const hasMapSize = Number.isFinite(mapW) && Number.isFinite(mapH);

    if ((!Number.isFinite(Number(ch.pos.x)) || !Number.isFinite(Number(ch.pos.y))) && hasMapSize) {
      // Scatter in a deterministic spiral so markers don't stack.
      const cx = mapW / 2;
      const cy = mapH / 2;
      const r = Math.min(mapW, mapH) * (0.06 + 0.02 * Math.sqrt(index));
      const a = index * 0.85; // radians step
      ch.pos.x = cx + r * Math.cos(a);
      ch.pos.y = cy + r * Math.sin(a);
    }
  }

  return {
    tickIndex: 0,
    seed: draft.seed ?? 1,
    facts: {
      hazardPoints: Array.isArray(draft.hazardPoints) ? draft.hazardPoints : [],
    },
    events: [],
    locations,
    characters,
  };
}
