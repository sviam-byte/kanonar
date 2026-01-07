// lib/simkit/core/world.ts
// World utilities and snapshot builder.

import type { Id, SimWorld, SimSnapshot, SimCharacter, SimLocation } from './types';

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
