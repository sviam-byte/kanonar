
import { ContextAtom } from '../v2/types';
import { LocationEntity, LocationMap, LocationMapCell } from '../../../types';

type AnyLocation = LocationEntity;

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

// Normalize any value to 0..1
function norm01(x: any, fb = 0) {
  const v = Number(x);
  if (!Number.isFinite(v)) return fb;
  // If explicitly 0..1
  if (v >= 0 && v <= 1) return v;
  // If 0..100 scale
  if (v >= 0 && v <= 100) return v / 100;
  // If 0..10 scale
  if (v >= 0 && v <= 10) return v / 10;
  
  return clamp01(v);
}

function atom(
  id: string,
  magnitude: number,
  meta: any = {}
): ContextAtom {
  const usedAtomIds: string[] = Array.isArray(meta?.usedAtomIds) ? meta.usedAtomIds : [];
  const parts: Record<string, any> = (meta?.parts && typeof meta.parts === 'object') ? meta.parts : {};
  const notes: string[] = Array.isArray(meta?.notes) ? meta.notes : ['from locationExtractor'];

  return {
    id,
    ns: id.split(':')[0] as any,
    kind: 'world_fact',
    origin: 'world',
    source: 'locationExtractor',
    magnitude: clamp01(magnitude),
    confidence: 1,
    meta,
    trace: {
      usedAtomIds,
      notes,
      parts
    }
  } as any;
}

function safeArr<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

function computeMapAggregates(map: LocationMap | undefined) {
  const cells = safeArr<LocationMapCell>(map?.cells);
  if (!cells.length) {
    return {
      hasMap: 0,
      coverMean: 0,
      dangerMean: 0,
      walkableFrac: 0,
      exitsCountNorm: 0
    };
  }

  let coverSum = 0, dangerSum = 0, walkable = 0, exits = 0;
  for (const c of cells) {
    coverSum += norm01(c.cover, 0);
    dangerSum += norm01(c.danger, 0);
    walkable += (c.walkable === false) ? 0 : 1;
    // Heuristic: check if cell is an exit? 
    // In current types, exits are separate in map.exits, but let's check legacy/future cell props just in case
    if ((c as any).exit) exits += 1;
  }

  const n = cells.length;
  // If exits are defined in map.exits, add them
  if (map?.exits) {
      exits += map.exits.length;
  }

  // Soft normalization for exits: 0..10 => 0..1
  const exitsCountNorm = clamp01(exits / 10);

  return {
    hasMap: 1,
    coverMean: clamp01(coverSum / n),
    dangerMean: clamp01(dangerSum / n),
    walkableFrac: clamp01(walkable / n),
    exitsCountNorm
  };
}

export function extractLocationAtoms(args: {
  selfId: string;
  location: AnyLocation | null | undefined;
}): ContextAtom[] {
  const { selfId, location } = args;

  if (!location) {
    return [
      atom(`world:loc:none:${selfId}`, 1, { reason: 'no location resolved for agent' })
    ];
  }

  const locId = String(location.entityId || 'unknown');
  const props = location.properties || {};
  const state = location.state || {};
  const hazards = safeArr<any>(location.hazards);

  const privacy = norm01(props.privacy === 'private' ? 1 : (props.privacy === 'public' ? 0 : 0.5));
  const visibility = norm01(props.visibility, 0.5);
  const noise = norm01(props.noise, 0.3);
  const socialVis = norm01((props as any).social_visibility, 0.5); // Fallback if property missing
  const normPressure = norm01((props as any).normative_pressure, 0);
  const control = norm01(props.control_level, 0);
  
  const crowd = norm01(state.crowd_level, 0);

  let envHazard = 0;
  for (const h of hazards) {
    envHazard = Math.max(envHazard, norm01(h?.intensity, 0));
  }

  const map = location.map;
  const agg = computeMapAggregates(map);
  const tags = safeArr<string>(location.tags).map(String);
  const kind = String(location.kind || location.type || 'location');
  const owner = location.ownership?.ownerFaction ? String(location.ownership.ownerFaction) : null;

  const out: ContextAtom[] = [];

  // --- Identity ---
  out.push(atom(`world:loc:id:${selfId}`, 1, { locId, kind }));
  out.push(atom(`world:loc:kind:${selfId}:${kind}`, 1, { locId }));
  if (owner) out.push(atom(`world:loc:owner:${selfId}:${owner}`, 1, { locId }));
  for (const t of tags) out.push(atom(`world:loc:tag:${selfId}:${t}`, 1, { locId }));

  // --- Social Env (Core for ctxAxes) ---
  out.push(atom(`world:loc:privacy:${selfId}`, privacy, { locId, raw: props.privacy }));
  out.push(atom(`world:loc:visibility:${selfId}`, visibility, { locId, raw: props.visibility }));
  out.push(atom(`world:loc:noise:${selfId}`, noise, { locId, raw: props.noise }));
  out.push(atom(`world:loc:social_visibility:${selfId}`, socialVis, { locId }));
  out.push(atom(`world:loc:normative_pressure:${selfId}`, normPressure, { locId }));
  out.push(atom(`world:loc:control_level:${selfId}`, control, { locId, raw: props.control_level }));
  out.push(atom(`world:loc:crowd:${selfId}`, crowd, { locId, raw: state.crowd_level }));

  // --- Hazards ---
  out.push(atom(`world:env:hazard:${selfId}`, envHazard, { locId, hazardsCount: hazards.length }));

  // --- Map Aggregates (Must exist for possibilities/threat) ---
  out.push(atom(`world:map:hasMap:${selfId}`, agg.hasMap, { locId }));
  out.push(atom(`world:map:cover:${selfId}`, agg.coverMean, { locId }));
  out.push(atom(`world:map:danger:${selfId}`, agg.dangerMean, { locId }));
  out.push(atom(`world:map:walkableFrac:${selfId}`, agg.walkableFrac, { locId }));
  out.push(atom(`world:map:exits:${selfId}`, agg.exitsCountNorm, { locId }));

  // --- Derived "Escape" Proxy (Cheap, but stable) ---
  // Escape depends on exits + walkable + (1-danger)
  const escape = clamp01(0.45 * agg.exitsCountNorm + 0.35 * agg.walkableFrac + 0.20 * (1 - agg.dangerMean));
  out.push(atom(
    `world:map:escape:${selfId}`,
    escape,
    {
      locId,
      parts: {
        exits: agg.exitsCountNorm,
        walkable: agg.walkableFrac,
        danger: agg.dangerMean,
        formula: '0.45*exits + 0.35*walkable + 0.20*(1-danger)'
      },
      usedAtomIds: [
        `world:map:exits:${selfId}`,
        `world:map:walkableFrac:${selfId}`,
        `world:map:danger:${selfId}`
      ],
      notes: ['derived escape proxy from map aggregates']
    }
  ));

  return out;
}
