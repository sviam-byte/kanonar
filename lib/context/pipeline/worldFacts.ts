
import { normalizeAtom } from '../v2/infer';
import { ContextAtom } from '../v2/types';

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
      trace: { usedAtomIds: [], notes: [], parts: {} },
      meta: { locationId: String(locId) }
    } as any));
  }

  // ---------- Location properties -> norm/public axes seeds (as world facts) ----------
  const props = input.location?.properties || {};
  const state = input.location?.state || {};

  const addProp01 = (id: string, v: any, label: string, tags: string[]) => {
    const m = clamp01(num(v, 0));
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
      trace: { usedAtomIds: [], notes: ['from location.properties/state'], parts: {} }
    } as any));
  };

  addProp01(`world:loc:privacy:${selfId}`, props.privacy === 'private' ? 1 : 0, `privacy=${props.privacy}`, ['world','loc','privacy']);
  addProp01(`world:loc:visibility:${selfId}`, props.visibility, `visibility=${Math.round(clamp01(num(props.visibility))*100)}%`, ['world','loc','visibility']);
  addProp01(`world:loc:noise:${selfId}`, props.noise, `noise=${Math.round(clamp01(num(props.noise))*100)}%`, ['world','loc','noise']);
  addProp01(`world:loc:social_visibility:${selfId}`, props.social_visibility, `social_visibility=${Math.round(clamp01(num(props.social_visibility))*100)}%`, ['world','loc','social_visibility']);
  addProp01(`world:loc:normative_pressure:${selfId}`, props.normative_pressure, `normative_pressure=${Math.round(clamp01(num(props.normative_pressure))*100)}%`, ['world','loc','normative_pressure']);
  addProp01(`world:loc:control_level:${selfId}`, props.control_level, `control_level=${Math.round(clamp01(num(props.control_level))*100)}%`, ['world','loc','control_level']);
  
  // crowd level as a world fact
  addProp01(`world:loc:crowd:${selfId}`, state.crowd_level, `crowd_level=${Math.round(clamp01(num(state.crowd_level))*100)}%`, ['world','loc','crowd']);

  // ---------- Map local metrics (world facts) ----------
  const mm = input.mapMetrics || {};
  const addMM = (k: string, v: any) => {
    const m = clamp01(num(v, 0));
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
      trace: { usedAtomIds: [], notes: ['from mapMetrics'], parts: {} }
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

    // keep them as 0..1 already; if you store 0..100 elsewhere, convert before passing here
    // Note: scene metrics in older code might be 0-100. We detect and scale.
    const scale = (val: number) => val > 1 ? val / 100 : val;

    if (metrics.crowd !== undefined) addScene01(`scene:crowd:${selfId}`, scale(metrics.crowd), `scene.crowd=${Math.round(scale(metrics.crowd)*100)}%`, ['scene','crowd']);
    if (metrics.hostility !== undefined) addScene01(`scene:hostility:${selfId}`, scale(metrics.hostility), `scene.hostility=${Math.round(scale(metrics.hostility)*100)}%`, ['scene','hostility']);
    if (metrics.urgency !== undefined) addScene01(`scene:urgency:${selfId}`, scale(metrics.urgency), `scene.urgency=${Math.round(scale(metrics.urgency)*100)}%`, ['scene','urgency']);
    if (metrics.scarcity !== undefined) addScene01(`scene:scarcity:${selfId}`, scale(metrics.scarcity), `scene.scarcity=${Math.round(scale(metrics.scarcity)*100)}%`, ['scene','scarcity']);
    if (metrics.novelty !== undefined) addScene01(`scene:novelty:${selfId}`, scale(metrics.novelty), `scene.novelty=${Math.round(scale(metrics.novelty)*100)}%`, ['scene','novelty']);
    if (metrics.loss !== undefined) addScene01(`scene:loss:${selfId}`, scale(metrics.loss), `scene.loss=${Math.round(scale(metrics.loss)*100)}%`, ['scene','loss']);
    if (metrics.resourceAccess !== undefined) addScene01(`scene:resourceAccess:${selfId}`, scale(metrics.resourceAccess), `scene.resourceAccess=${Math.round(scale(metrics.resourceAccess)*100)}%`, ['scene','resourceAccess']);
    
    // Legacy metric support
    if (metrics.threat !== undefined) addScene01(`scene:threat:${selfId}`, scale(metrics.threat), `scene.threat=${Math.round(scale(metrics.threat)*100)}%`, ['scene','threat']);

    if (norms.proceduralStrict !== undefined) addScene01(`scene:proceduralStrict:${selfId}`, scale(norms.proceduralStrict), `norm.proceduralStrict=${Math.round(scale(norms.proceduralStrict)*100)}%`, ['norm','proceduralStrict']);
    if (norms.surveillance !== undefined) addScene01(`norm:surveillance:${selfId}`, scale(norms.surveillance), `norm.surveillance=${Math.round(scale(norms.surveillance)*100)}%`, ['norm','surveillance']);
    if ((norms.publicExposure ?? norms.publicness) !== undefined) addScene01(`ctx:publicness:${selfId}`, scale(norms.publicExposure ?? norms.publicness), `ctx.publicness=${Math.round(scale(norms.publicExposure ?? norms.publicness)*100)}%`, ['ctx','publicness']);
    if (norms.privacy !== undefined) addScene01(`ctx:privacy:${selfId}`, scale(norms.privacy), `ctx.privacy=${Math.round(scale(norms.privacy)*100)}%`, ['ctx','privacy']);

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
