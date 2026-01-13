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

  // ensure everyone has pos.nodeId if location has nav
  for (const ch of Object.values(characters)) {
    if (!ch.pos?.nodeId) {
      const loc = locations[ch.locId];
      const n0 = loc?.nav?.nodes?.[0];
      if (n0) ch.pos = { nodeId: n0.id, x: n0.x, y: n0.y };
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
