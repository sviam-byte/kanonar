// lib/simkit/adapters/fromKanonarEntities.ts
// Adapter to build a SimWorld from selected Kanonar entities.

import type { LocationEntity, CharacterEntity } from '../../../types';
import type { SimWorld } from '../core/types';
import { importLocationFromGoalLab } from '../locations/goallabImport';
import { clamp01 } from '../../util/math';

type MaybeMap = Record<string, unknown> | null | undefined;
type RuntimeQuickStates = { stress?: unknown; health?: unknown; energy?: unknown };
type RuntimeCharacter = CharacterEntity & {
  S?: unknown;
  v?: unknown;
  hp?: unknown;
  quickStates?: RuntimeQuickStates;
  tags?: unknown;
  context?: { faction?: unknown };
  roles?: { relations?: unknown };
  identity?: { relations?: unknown };
};
type RuntimeHazard = { kind?: unknown; intensity?: unknown };
type RuntimeNavNode = { id?: unknown; x?: unknown; y?: unknown };
type RuntimeLocation = LocationEntity & {
  properties?: MaybeMap & { tags?: unknown; control_level?: unknown; visibility?: unknown; noise?: unknown };
  state?: MaybeMap & { alert_level?: unknown; crowd_level?: unknown };
  hazards?: RuntimeHazard[];
  width?: unknown;
  height?: unknown;
};

function num(x: unknown, fb: number) {
  const v = Number(x);
  return Number.isFinite(v) ? v : fb;
}

function pickStress(ch: RuntimeCharacter) {
  // Эвристика: если есть runtime-поля — используем их.
  return clamp01(num(ch?.S ?? ch?.quickStates?.stress, 0.2));
}

function pickHealth(ch: RuntimeCharacter) {
  // hp может быть 0..1 или 0..100 — нормируем аккуратно.
  const hp = num(ch?.hp ?? ch?.quickStates?.health, 1.0);
  return clamp01(hp > 1.0 ? hp / 100 : hp);
}

function pickEnergy(ch: RuntimeCharacter) {
  return clamp01(num(ch?.v ?? ch?.quickStates?.energy, 0.7));
}

function locNeighborsFromConnections(loc: RuntimeLocation): string[] {
  // В data/locations.ts связи указаны entityId соседних локаций.
  return Object.keys(loc.connections || {});
}

function hazardsFromLocation(loc: RuntimeLocation): Record<string, number> {
  // Hazards приходят массивом; для каждого kind берём максимум intensity.
  const out: Record<string, number> = {};
  for (const h of loc.hazards || []) {
    const k = String(h.kind || 'unknown');
    const v = clamp01(Number(h.intensity ?? 0));
    out[k] = Math.max(out[k] ?? 0, v);
  }
  return out;
}

function getMapValue(obj: MaybeMap, key: string): unknown {
  return obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined;
}

function normsFromLocation(loc: RuntimeLocation): Record<string, number> {
  // Минимальная витрина норм из properties/state (если есть числовые значения).
  const out: Record<string, number> = {};
  const props = loc.properties;
  const state = loc.state;

  const controlLevel = getMapValue(props, 'control_level');
  const visibility = getMapValue(props, 'visibility');
  const noise = getMapValue(props, 'noise');
  const alertLevel = getMapValue(state, 'alert_level');
  const crowdLevel = getMapValue(state, 'crowd_level');

  if (typeof controlLevel === 'number') out.control = clamp01(controlLevel);
  if (typeof visibility === 'number') out.visibility = clamp01(visibility);
  if (typeof noise === 'number') out.noise = clamp01(noise);
  if (typeof alertLevel === 'number') out.alert = clamp01(alertLevel);
  if (typeof crowdLevel === 'number') out.crowd = clamp01(crowdLevel);

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
  for (const loc of locations as RuntimeLocation[]) {
    locMap[loc.entityId] = {
      id: loc.entityId,
      name: loc.title || loc.entityId,
      neighbors: locNeighborsFromConnections(loc).filter((id) => locations.some((l) => l.entityId === id)),
      hazards: hazardsFromLocation(loc),
      norms: normsFromLocation(loc),
      tags: Array.isArray(loc.properties?.tags) ? loc.properties.tags : [],
      map: loc.map ?? null,
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
  for (const ch of characters as RuntimeCharacter[]) {
    const locId = placements[ch.entityId] && locMap[placements[ch.entityId]]
      ? placements[ch.entityId]
      : firstLoc;

    chMap[ch.entityId] = {
      id: ch.entityId,
      name: ch.title || ch.entityId,
      locId,
      stress: pickStress(ch),
      health: pickHealth(ch),
      energy: pickEnergy(ch),
      tags: Array.isArray(ch.tags) ? ch.tags : tagsFromCharacter(ch),
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
  const placedCount = allChars.reduce((acc, c) => {
    const x = Number(c?.pos?.x);
    const y = Number(c?.pos?.y);
    return acc + (Number.isFinite(x) && Number.isFinite(y) ? 1 : 0);
  }, 0);

  // Ensure every char has a pos object (even if empty).
  for (const c of allChars) {
    if (!c.pos) c.pos = { nodeId: null, x: null, y: null };
  }

  if (placedCount === 0) {
    // 1) If a location has nav nodes, distribute across nodes.
    const byLoc: Record<string, typeof allChars> = {};
    for (const c of allChars) {
      const locId = c.locId && locMap[c.locId] ? c.locId : firstLoc;
      c.locId = locId;
      if (!byLoc[locId]) byLoc[locId] = [];
      byLoc[locId].push(c);
    }

    for (const [locId, xs] of Object.entries(byLoc)) {
      const loc = locMap[locId];
      const navNodes = Array.isArray(loc?.nav?.nodes) ? (loc.nav.nodes as RuntimeNavNode[]) : [];
      if (navNodes.length) {
        for (let i = 0; i < xs.length; i++) {
          const n = navNodes[i % navNodes.length];
          xs[i].pos = { nodeId: String(n.id), x: Number(n.x), y: Number(n.y) };
        }
        continue;
      }

      // 2) Otherwise, scatter on map bounds (fallback 1024x768).
      const runtimeLoc = loc as RuntimeLocation;
      const mapW = Number(loc?.map?.width ?? runtimeLoc?.width ?? 1024);
      const mapH = Number(loc?.map?.height ?? runtimeLoc?.height ?? 768);
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
    for (const c of allChars) {
      // IMPORTANT:
      // PlacementMapEditor produces XY placements with nodeId=null.
      // Do NOT override XY with nav node fallback, otherwise hazards/atoms can't use map-space points.
      const hasXY = Number.isFinite(Number(c?.pos?.x)) && Number.isFinite(Number(c?.pos?.y));
      if (hasXY) continue;
      const loc = locMap[c.locId];
      const n0 = loc?.nav?.nodes?.[0];
      if (n0) {
        c.pos = { nodeId: String(n0.id), x: Number(n0.x), y: Number(n0.y) };
        continue;
      }
      const runtimeLoc = loc as RuntimeLocation;
      const mapW = Number(loc?.map?.width ?? runtimeLoc?.width ?? 1024);
      const mapH = Number(loc?.map?.height ?? runtimeLoc?.height ?? 768);
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
      relations: buildInitialRelations(characters),
    },
    events: [],
    locations: locMap,
    characters: chMap,
  };
}

/**
 * Initializes dyadic relations with conservative defaults derived from
 * faction alignment and explicit relation roles from character payloads.
 */
function buildInitialRelations(characters: CharacterEntity[]): Record<string, Record<string, any>> {
  const rels: Record<string, Record<string, any>> = {};

  const getFaction = (ch: CharacterEntity): string =>
    String((ch as RuntimeCharacter)?.context?.faction ?? 'unknown').toLowerCase();

  const getExplicitRelations = (ch: CharacterEntity): Array<{ other_id: string; role: string }> => {
    const rc = ch as RuntimeCharacter;
    const raw = rc.roles?.relations ?? rc.identity?.relations ?? [];
    return Array.isArray(raw) ? raw : [];
  };

  for (const a of characters) {
    rels[a.entityId] = rels[a.entityId] || {};
    const aFaction = getFaction(a);
    const aExplicit = getExplicitRelations(a);

    for (const b of characters) {
      if (a.entityId === b.entityId) continue;
      rels[a.entityId][b.entityId] = rels[a.entityId][b.entityId] || {};
      const entry = rels[a.entityId][b.entityId];
      const bFaction = getFaction(b);

      if (aFaction === bFaction && aFaction !== 'unknown' && aFaction !== 'independent') {
        entry.trust = Math.max(entry.trust ?? 0, 0.60);
        entry.familiarity = Math.max(entry.familiarity ?? 0, 0.30);
      } else if (aFaction !== 'unknown' && bFaction !== 'unknown' && aFaction !== 'independent' && bFaction !== 'independent') {
        entry.trust = entry.trust ?? 0.42;
      } else {
        entry.trust = entry.trust ?? 0.50;
      }

      for (const rel of aExplicit) {
        if (rel.other_id !== b.entityId) continue;
        const role = String(rel.role ?? '').toLowerCase();
        if (role === 'ward_of' || role === 'caretaker_of' || role === 'kin') {
          entry.trust = Math.max(entry.trust ?? 0, 0.80);
          entry.familiarity = Math.max(entry.familiarity ?? 0, 0.70);
        } else if (role === 'ally' || role === 'ally_of') {
          entry.trust = Math.max(entry.trust ?? 0, 0.70);
          entry.familiarity = Math.max(entry.familiarity ?? 0, 0.40);
        } else if (role === 'rival' || role === 'rival_of' || role === 'enemy') {
          entry.trust = Math.min(entry.trust ?? 1, 0.25);
          entry.threat = Math.max(entry.threat ?? 0, 0.40);
        } else if (role === 'subordinate_of') {
          entry.trust = Math.max(entry.trust ?? 0, 0.60);
          entry.familiarity = Math.max(entry.familiarity ?? 0, 0.35);
        }
      }
    }
  }

  return rels;
}
