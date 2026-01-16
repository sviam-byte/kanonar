// lib/simkit/adapters/fromKanonarEntities.ts
// Adapter to build a SimWorld from selected Kanonar entities.

import type { LocationEntity, CharacterEntity } from '../../../types';
import type { SimWorld } from '../core/types';
import { importLocationFromGoalLab } from '../locations/goallabImport';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function num(x: any, fb: number) {
  const v = Number(x);
  return Number.isFinite(v) ? v : fb;
}

function pickStress(ch: any) {
  // Эвристика: если есть runtime-поля — используем их.
  return clamp01(num(ch?.S ?? ch?.quickStates?.stress, 0.2));
}

function pickHealth(ch: any) {
  // hp может быть 0..1 или 0..100 — нормируем аккуратно.
  const hp = num(ch?.hp ?? ch?.quickStates?.health, 1.0);
  return clamp01(hp > 1.0 ? hp / 100 : hp);
}

function pickEnergy(ch: any) {
  return clamp01(num(ch?.v ?? ch?.quickStates?.energy, 0.7));
}

function locNeighborsFromConnections(loc: LocationEntity): string[] {
  // В data/locations.ts связи указаны entityId соседних локаций.
  return Object.keys(loc.connections || {});
}

function hazardsFromLocation(loc: LocationEntity): Record<string, number> {
  // Hazards приходят массивом; для каждого kind берём максимум intensity.
  const out: Record<string, number> = {};
  for (const h of loc.hazards || []) {
    const k = String((h as any).kind || 'unknown');
    const v = clamp01(Number((h as any).intensity ?? 0));
    out[k] = Math.max(out[k] ?? 0, v);
  }
  return out;
}

function normsFromLocation(loc: LocationEntity): Record<string, number> {
  // Минимальная витрина норм из properties/state (если есть числовые значения).
  const out: Record<string, number> = {};
  const props = (loc.properties || {}) as any;
  const state = (loc.state || {}) as any;

  if (typeof props.control_level === 'number') out.control = clamp01(props.control_level);
  if (typeof props.visibility === 'number') out.visibility = clamp01(props.visibility);
  if (typeof props.noise === 'number') out.noise = clamp01(props.noise);

  if (typeof state.alert_level === 'number') out.alert = clamp01(state.alert_level);
  if (typeof state.crowd_level === 'number') out.crowd = clamp01(state.crowd_level);

  return out;
}

function tagsFromCharacter(ch: CharacterEntity): string[] {
  // Быстрые теги по id; можно заменить на biography/roles/capabilities при необходимости.
  const t: string[] = [];
  const id = ch.entityId || '';
  if (id.includes('tegan')) t.push('authority');
  if (id.includes('krystar')) t.push('proud');
  return t;
}

export function makeSimWorldFromSelection(args: {
  seed: number;
  locations: LocationEntity[];
  characters: CharacterEntity[];
  placements: Record<string, string>;
  locationSpecs?: Array<any>;
  nodePlacements?: Array<{
    characterId: string;
    locationId: string;
    nodeId: string;
    x?: number;
    y?: number;
  }>;
  hazardPoints?: Array<any>;
}): SimWorld {
  const { seed, locations, characters, placements, locationSpecs, nodePlacements, hazardPoints } = args;

  const locMap: SimWorld['locations'] = {};
  for (const loc of locations) {
    locMap[loc.entityId] = {
      id: loc.entityId,
      name: loc.title || loc.entityId,
      neighbors: locNeighborsFromConnections(loc).filter((id) => locations.some((l) => l.entityId === id)),
      hazards: hazardsFromLocation(loc),
      norms: normsFromLocation(loc),
      tags: (loc.properties?.tags || []) as any,
      map: (loc as any).map ?? null,
      entity: loc,
    };
  }

  // GoalLab specs override/extend map+nav features for selected locations.
  for (const spec of locationSpecs || []) {
    if (!spec?.id) continue;
    const imported = importLocationFromGoalLab(spec);
    const base = locMap[spec.id];
    locMap[spec.id] = base
      ? {
          ...base,
          map: imported.map ?? base.map ?? null,
          nav: imported.nav ?? base.nav,
          features: imported.features ?? base.features,
          hazards: { ...(base.hazards || {}), ...(imported.hazards || {}) },
        }
      : imported;
  }

  const firstLoc = locations[0]?.entityId || 'loc:missing';

  const chMap: SimWorld['characters'] = {};
  for (const ch of characters) {
    const locId = placements[ch.entityId] && locMap[placements[ch.entityId]]
      ? placements[ch.entityId]
      : firstLoc;

    chMap[ch.entityId] = {
      id: ch.entityId,
      name: ch.title || ch.entityId,
      locId,
      stress: pickStress(ch as any),
      health: pickHealth(ch as any),
      energy: pickEnergy(ch as any),
      tags: Array.isArray((ch as any).tags) ? (ch as any).tags : tagsFromCharacter(ch),
      entity: ch,
    };
  }

  for (const p of nodePlacements || []) {
    const ch = chMap[p.characterId];
    if (!ch) continue;
    if (p.locationId && locMap[p.locationId]) ch.locId = p.locationId;
    ch.pos = {
      nodeId: p.nodeId ?? null,
      x: p.x ?? null,
      y: p.y ?? null,
    };
  }

  // --- Auto placement (required to start a scene):
  // If nothing has usable XY, scatter the cast so markers are visible and draggable.
  const allChars = Object.values(chMap);
  const placedCount = allChars.reduce((acc, c: any) => {
    const x = Number(c?.pos?.x);
    const y = Number(c?.pos?.y);
    return acc + (Number.isFinite(x) && Number.isFinite(y) ? 1 : 0);
  }, 0);

  // Ensure every char has a pos object (even if empty).
  for (const c of allChars as any[]) {
    if (!c.pos) c.pos = { nodeId: null, x: null, y: null };
  }

  if (placedCount === 0) {
    // 1) If a location has nav nodes, distribute across nodes.
    const byLoc: Record<string, any[]> = {};
    for (const c of allChars as any[]) {
      const locId = c.locId && locMap[c.locId] ? c.locId : firstLoc;
      c.locId = locId;
      (byLoc[locId] ||= []).push(c);
    }

    for (const [locId, xs] of Object.entries(byLoc)) {
      const loc = locMap[locId];
      const navNodes = Array.isArray((loc as any)?.nav?.nodes) ? (loc as any).nav.nodes : [];
      if (navNodes.length) {
        for (let i = 0; i < xs.length; i++) {
          const n = navNodes[i % navNodes.length];
          xs[i].pos = { nodeId: String(n.id), x: Number(n.x), y: Number(n.y) };
        }
        continue;
      }

      // 2) Otherwise, scatter on map bounds (fallback 1024x768).
      const mapW = Number((loc as any)?.map?.width ?? (loc as any)?.width ?? 1024);
      const mapH = Number((loc as any)?.map?.height ?? (loc as any)?.height ?? 768);
      const w = Number.isFinite(mapW) ? mapW : 1024;
      const h = Number.isFinite(mapH) ? mapH : 768;
      const cx = w / 2;
      const cy = h / 2;

      for (let i = 0; i < xs.length; i++) {
        const r = Math.min(w, h) * (0.06 + 0.02 * Math.sqrt(i));
        const a = i * 0.85;
        xs[i].pos = { nodeId: null, x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
      }
    }
  } else {
    // Some placements exist; just ensure missing ones get a sane fallback.
    for (const c of allChars as any[]) {
      // IMPORTANT:
      // PlacementMapEditor produces XY placements with nodeId=null.
      // Do NOT override XY with nav node fallback, otherwise hazards/atoms can't use map-space points.
      const hasXY = Number.isFinite(Number(c?.pos?.x)) && Number.isFinite(Number(c?.pos?.y));
      if (hasXY) continue;
      const loc = locMap[c.locId];
      const n0 = (loc as any)?.nav?.nodes?.[0];
      if (n0) {
        c.pos = { nodeId: String(n0.id), x: Number(n0.x), y: Number(n0.y) };
        continue;
      }
      const mapW = Number((loc as any)?.map?.width ?? (loc as any)?.width ?? 1024);
      const mapH = Number((loc as any)?.map?.height ?? (loc as any)?.height ?? 768);
      c.pos = {
        nodeId: null,
        x: (Number.isFinite(mapW) ? mapW : 1024) / 2,
        y: (Number.isFinite(mapH) ? mapH : 768) / 2,
      };
    }
  }

  return {
    tickIndex: 0,
    seed,
    facts: {
      hazardPoints: Array.isArray(hazardPoints) ? hazardPoints : [],
    },
    events: [],
    locations: locMap,
    characters: chMap,
  };
}
