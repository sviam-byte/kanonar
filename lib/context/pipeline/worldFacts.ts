
import { normalizeAtom } from '../v2/infer';
import { curve01, CurvePreset } from '../../utils/curves';
import type { ContextAtom } from '../v2/types';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function num(x: any, fallback = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : fallback;
}

export type WorldFactsInput = {
  world: any;
  tick: number;

  selfId: string;
  self: any;

  location?: any;         // hydrated location entity if you have it
  locationId?: string;
  mapMetrics?: any;       // optional local map metrics (danger/cover/exits/visibility)
  sceneSnapshot?: any;    // optional (GoalLab sceneControl / world.scene)
};

export function buildWorldFactsAtoms(input: WorldFactsInput): ContextAtom[] {
  const out: ContextAtom[] = [];
  const { tick, selfId } = input;
  const preset: CurvePreset = (input.world?.decisionCurvePreset as any) || 'smoothstep';

  // ---------- Tick ----------
  out.push(normalizeAtom({
    id: `world:tick:${tick}`,
    ns: 'world',
    kind: 'world_tick',
    origin: 'world',
    source: 'world',
    magnitude: 1,
    confidence: 1,
    subject: selfId,
    tags: ['world', 'tick'],
    label: `tick=${tick}`,
    trace: { usedAtomIds: [], notes: ['canonical tick'], parts: {} }
  } as any));

  // ---------- Location basic ----------
  const locId = input.locationId || input.location?.entityId || input.location?.id || input.self?.state?.locationId;
  if (locId) {
    out.push(normalizeAtom({
      id: `world:location:${selfId}`,
      ns: 'world',
      kind: 'location_ref',
      origin: 'world',
      source: 'world',
      magnitude: 1,
      confidence: 1,
      subject: selfId,
      target: String(locId),
      tags: ['world', 'location'],
      label: `location=${String(locId)}`,
      trace: { usedAtomIds: [], notes: ['canonical location reference'], parts: { locationId: String(locId) } },
      meta: { locationId: String(locId) }
    } as any));
  }

  // ---------- Location properties -> norm/public axes seeds (as world facts) ----------
  const props = input.location?.properties || {};
  const state = input.location?.state || {};

  const addProp01 = (id: string, v: any, label: string, tags: string[]) => {
    const linear = clamp01(num(v, 0));
    const m = curve01(linear, preset);
    out.push(normalizeAtom({
      id,
      ns: 'world',
      kind: 'world_fact',
      origin: 'world',
      source: 'location',
      magnitude: m,
      confidence: 1,
      subject: selfId,
      tags,
      label,
      trace: {
        usedAtomIds: [],
        notes: ['from location.properties/state'],
        parts: {
          key: id.split(':')[2],
          raw: v,
          normLinear: linear,
          norm: m,
          locationId: locId ? String(locId) : undefined,
        }
      },
      meta: { locationId: locId ? String(locId) : undefined, raw: v }
    } as any));
    return m;
  };

  const privacyLevel = (props.privacy === 'private') ? 1 : (props.privacy === 'semi') ? 0.5 : 0;
  addProp01(`world:loc:privacy:${selfId}`, privacyLevel, `privacy=${props.privacy}`, ['world','loc','privacy']);
  addProp01(`world:loc:visibility:${selfId}`, props.visibility, `visibility=${Math.round(clamp01(num(props.visibility))*100)}%`, ['world','loc','visibility']);
  const noiseVal = addProp01(`world:loc:noise:${selfId}`, props.noise, `noise=${Math.round(clamp01(num(props.noise))*100)}%`, ['world','loc','noise']);
  addProp01(`world:loc:social_visibility:${selfId}`, props.social_visibility, `social_visibility=${Math.round(clamp01(num(props.social_visibility))*100)}%`, ['world','loc','social_visibility']);
  const normPressureVal = addProp01(`world:loc:normative_pressure:${selfId}`, props.normative_pressure, `normative_pressure=${Math.round(clamp01(num(props.normative_pressure))*100)}%`, ['world','loc','normative_pressure']);
  const controlLevelVal = addProp01(`world:loc:control_level:${selfId}`, props.control_level, `control_level=${Math.round(clamp01(num(props.control_level))*100)}%`, ['world','loc','control_level']);

  // Standardized InputAxis seeds
  addProp01(`world:loc:temperature:${selfId}`, (props as any).temperature, `temperature=${Math.round(clamp01(num((props as any).temperature, 0.5))*100)}%`, ['world','loc','temperature']);
  addProp01(`world:loc:comfort:${selfId}`, (props as any).comfort, `comfort=${Math.round(clamp01(num((props as any).comfort, 0.5))*100)}%`, ['world','loc','comfort']);
  addProp01(`world:loc:hygiene:${selfId}`, (props as any).hygiene, `hygiene=${Math.round(clamp01(num((props as any).hygiene, 0.5))*100)}%`, ['world','loc','hygiene']);
  addProp01(`world:loc:aesthetics:${selfId}`, (props as any).aesthetics, `aesthetics=${Math.round(clamp01(num((props as any).aesthetics, 0.5))*100)}%`, ['world','loc','aesthetics']);

  const authorityPresenceSeed = num((props as any).authorityPresence ?? (props as any).authority_presence, controlLevelVal);
  const authorityPresenceVal = addProp01(`world:loc:authorityPresence:${selfId}`, authorityPresenceSeed, `authorityPresence=${Math.round(clamp01(authorityPresenceSeed)*100)}%`, ['world','loc','authorityPresence']);

  // Legacy aliases for downstream compatibility
  const addAlias = (id: string, ref: string, magnitude: number, tags: string[], label: string) => {
    out.push(normalizeAtom({
      id,
      ns: 'world',
      kind: 'world_fact',
      origin: 'world',
      source: 'location',
      magnitude: clamp01(num(magnitude, 0)),
      confidence: 1,
      subject: selfId,
      tags,
      label,
      trace: { usedAtomIds: [ref], notes: ['legacy alias'], parts: { ref, magnitude } },
      meta: { aliasOf: ref }
    } as any));
  };

  addAlias(`world:loc:normPressure:${selfId}`, `world:loc:normative_pressure:${selfId}`, normPressureVal, ['world','loc','normPressure'], `normPressure=${Math.round(clamp01(normPressureVal)*100)}%`);
  addAlias(`world:loc:control:${selfId}`, `world:loc:control_level:${selfId}`, controlLevelVal, ['world','loc','control'], `control=${Math.round(clamp01(controlLevelVal)*100)}%`);
  addAlias(`world:loc:authority:${selfId}`, `world:loc:authorityPresence:${selfId}`, authorityPresenceVal, ['world','loc','authority'], `authority=${Math.round(clamp01(authorityPresenceVal)*100)}%`);
  addAlias(`world:loc:noiseLevel:${selfId}`, `world:loc:noise:${selfId}`, noiseVal, ['world','loc','noiseLevel'], `noiseLevel=${Math.round(clamp01(noiseVal)*100)}%`);

  // crowd level as a world fact
  const crowdVal = addProp01(`world:loc:crowd:${selfId}`, state.crowd_level, `crowd_level=${Math.round(clamp01(num(state.crowd_level))*100)}%`, ['world','loc','crowd']);
  addAlias(`world:loc:crowdDensity:${selfId}`, `world:loc:crowd:${selfId}`, crowdVal, ['world','loc','crowdDensity'], `crowdDensity=${Math.round(clamp01(crowdVal)*100)}%`);

  // ---------- Map local metrics (world facts) ----------
  const mm = input.mapMetrics || {};
  const addMM = (k: string, v: any) => {
    const linear = clamp01(num(v, 0));
    const m = curve01(linear, preset);
    const locId2 = input.locationId || input.location?.entityId || input.location?.id;
    out.push(normalizeAtom({
      id: `world:map:${k}:${selfId}`,
      ns: 'world',
      kind: 'map_metric',
      origin: 'world',
      source: 'map',
      magnitude: m,
      confidence: 1,
      subject: selfId,
      tags: ['world','map',k],
      label: `${k}=${Math.round(m*100)}%`,
      trace: {
        usedAtomIds: [],
        notes: ['from mapMetrics'],
        parts: {
          key: k,
          raw: v,
          normLinear: linear,
          norm: m,
          locationId: locId2 ? String(locId2) : undefined
        }
      },
      meta: { locationId: locId2 ? String(locId2) : undefined, raw: v }
    } as any));
  };

  if (mm) {
    addMM('danger', mm.danger ?? mm.avgDanger);
    addMM('cover', mm.cover ?? mm.avgCover);
    addMM('obstacles', mm.obstacles);
    // exits count -> 0..1 (soft)
    const exitsCount = Array.isArray(mm.exits) ? mm.exits.length : num(mm.exitsCount, 0);
    addMM('exits', clamp01(exitsCount / 4));
  }

  // ---------- Scene snapshot (world facts: scene and norm seeds) ----------
  const sc = input.sceneSnapshot || input.world?.sceneSnapshot || input.world?.scene || null;
  if (sc) {
    const metrics = sc.metrics || sc.scene?.metrics || {};
    const norms = sc.norms || sc.scene?.norms || {};

    const addScene01 = (id: string, v: any, label: string, tags: string[]) => {
      const m = clamp01(num(v, 0));
      out.push(normalizeAtom({
        id,
        ns: 'scene',
        kind: 'scene_metric',
        origin: 'world',
        source: 'scene',
        magnitude: m,
        confidence: 1,
        subject: selfId,
        tags,
        label,
        trace: { usedAtomIds: [], notes: ['from sceneSnapshot'], parts: {} }
      } as any));
    };

    // Canonical path for axes: ctx:src:scene:* and ctx:src:norm:*
    const addCtxSrc01 = (id: string, v: any, label: string, tags: string[]) => {
      const m = clamp01(num(v, 0));
      out.push(normalizeAtom({
        id,
        ns: 'ctx',
        kind: 'ctx_input',
        origin: 'world',
        source: 'scene',
        magnitude: m,
        confidence: 1,
        subject: selfId,
        tags,
        label,
        trace: { usedAtomIds: [], notes: ['from sceneSnapshot'], parts: {} }
      } as any));
    };

    // keep them as 0..1 already; if you store 0..100 elsewhere, convert before passing here
    // Note: scene metrics in older code might be 0-100. We detect and scale.
    const scale = (val: number) => val > 1 ? val / 100 : val;

    if (metrics.crowd !== undefined) {
      const v = scale(metrics.crowd);
      addScene01(`scene:crowd:${selfId}`, v, `scene.crowd=${Math.round(v * 100)}%`, ['scene', 'crowd']);
      addCtxSrc01(`ctx:src:scene:crowd:${selfId}`, v, `scene.crowd=${Math.round(v * 100)}%`, ['ctx', 'src', 'scene', 'crowd']);
    }
    if (metrics.hostility !== undefined) {
      const v = scale(metrics.hostility);
      addScene01(`scene:hostility:${selfId}`, v, `scene.hostility=${Math.round(v * 100)}%`, ['scene', 'hostility']);
      addCtxSrc01(`ctx:src:scene:hostility:${selfId}`, v, `scene.hostility=${Math.round(v * 100)}%`, ['ctx', 'src', 'scene', 'hostility']);
    }
    if (metrics.urgency !== undefined) {
      const v = scale(metrics.urgency);
      addScene01(`scene:urgency:${selfId}`, v, `scene.urgency=${Math.round(v * 100)}%`, ['scene', 'urgency']);
      addCtxSrc01(`ctx:src:scene:urgency:${selfId}`, v, `scene.urgency=${Math.round(v * 100)}%`, ['ctx', 'src', 'scene', 'urgency']);
    }
    if (metrics.scarcity !== undefined) {
      const v = scale(metrics.scarcity);
      addScene01(`scene:scarcity:${selfId}`, v, `scene.scarcity=${Math.round(v * 100)}%`, ['scene', 'scarcity']);
      addCtxSrc01(`ctx:src:scene:scarcity:${selfId}`, v, `scene.scarcity=${Math.round(v * 100)}%`, ['ctx', 'src', 'scene', 'scarcity']);
    }
    if (metrics.novelty !== undefined) {
      const v = scale(metrics.novelty);
      addScene01(`scene:novelty:${selfId}`, v, `scene.novelty=${Math.round(v * 100)}%`, ['scene', 'novelty']);
      addCtxSrc01(`ctx:src:scene:novelty:${selfId}`, v, `scene.novelty=${Math.round(v * 100)}%`, ['ctx', 'src', 'scene', 'novelty']);
    }
    if (metrics.loss !== undefined) {
      const v = scale(metrics.loss);
      addScene01(`scene:loss:${selfId}`, v, `scene.loss=${Math.round(v * 100)}%`, ['scene', 'loss']);
      addCtxSrc01(`ctx:src:scene:loss:${selfId}`, v, `scene.loss=${Math.round(v * 100)}%`, ['ctx', 'src', 'scene', 'loss']);
    }
    if (metrics.resourceAccess !== undefined) {
      const v = scale(metrics.resourceAccess);
      addScene01(`scene:resourceAccess:${selfId}`, v, `scene.resourceAccess=${Math.round(v * 100)}%`, ['scene', 'resourceAccess']);
      addCtxSrc01(`ctx:src:scene:resourceAccess:${selfId}`, v, `scene.resourceAccess=${Math.round(v * 100)}%`, ['ctx', 'src', 'scene', 'resourceAccess']);
    }

    // Optional metrics passthrough (if present in older snapshots)
    for (const k of ['chaos', 'threat'] as const) {
      const val = (metrics as any)?.[k];
      if (val !== undefined) {
        const v = scale(val);
        addScene01(`scene:${k}:${selfId}`, v, `scene.${k}=${Math.round(v * 100)}%`, ['scene', k]);
        addCtxSrc01(`ctx:src:scene:${k}:${selfId}`, v, `scene.${k}=${Math.round(v * 100)}%`, ['ctx', 'src', 'scene', k]);
      }
    }

    // Norms (publish as ctx:src:norm:*; do NOT write ctx:* directly (deriveAxes owns ctx:* atoms))
    const normsPairs: Array<[string, any]> = [
      ['proceduralStrict', norms.proceduralStrict],
      ['surveillance', norms.surveillance],
      ['publicExposure', norms.publicExposure ?? norms.publicness],
      ['privacy', norms.privacy],
      ['normPressure', norms.normPressure]
    ];
    for (const [k, raw] of normsPairs) {
      if (raw === undefined) continue;
      const v = scale(raw);
      // legacy mirror (kept for debugging/backward)
      addScene01(`norm:${k}:${selfId}`, v, `norm.${k}=${Math.round(v * 100)}%`, ['norm', k]);
      addCtxSrc01(`ctx:src:norm:${k}:${selfId}`, v, `norm.${k}=${Math.round(v * 100)}%`, ['ctx', 'src', 'norm', k]);
    }

    const presetId = sc.presetId || sc.sceneId || sc.sceneType || sc.scenarioDef?.id;
    if (presetId) {
      out.push(normalizeAtom({
        id: `scene:id:${String(presetId)}:${selfId}`,
        ns: 'scene',
        kind: 'scene_id',
        origin: 'world',
        source: 'scene',
        magnitude: 1,
        confidence: 1,
        subject: selfId,
        tags: ['scene','id'],
        label: `scene=${String(presetId)}`,
        trace: { usedAtomIds: [], notes: ['from sceneSnapshot'], parts: {} },
        meta: { scene: sc }
      } as any));
    }
  }

  return out;
}
