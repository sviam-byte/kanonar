
import { SceneInstance, ScenePreset, SceneMetrics, SceneNorms } from './types';
import { SCENE_PRESETS } from './presets';
import { ContextAtom } from '../context/v2/types';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function stableHashInt32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) || 1;
}

function defaultMetrics(preset: ScenePreset): SceneMetrics {
  const d: any = {
    crowd: 0, hostility: 0, chaos: 0, urgency: 0,
    scarcity: 0, loss: 0, novelty: 0, resourceAccess: 0
  };
  return { ...d, ...(preset.defaultMetrics || {}) } as SceneMetrics;
}

function defaultNorms(preset: ScenePreset): SceneNorms {
  const d: any = { publicExposure: 0, privacy: 0, surveillance: 0, normPressure: 0, proceduralStrict: 0 };
  return { ...d, ...(preset.defaultNorms || {}) } as SceneNorms;
}

function compare(op: string, a: number, b: number) {
  if (op === '>=') return a >= b;
  if (op === '>') return a > b;
  if (op === '<=') return a <= b;
  if (op === '<') return a < b;
  return false;
}

function getMag(atoms: ContextAtom[], id: string, fallback = 0) {
  const a = atoms.find(x => x.id === id);
  const m = a?.magnitude;
  return (typeof m === 'number' && Number.isFinite(m)) ? m : fallback;
}

export function createSceneInstance(args: {
  presetId: string;
  sceneId: string;
  startedAtTick: number;
  participants: string[];
  locationId?: string;
  metricsOverride?: Partial<SceneMetrics>;
  normsOverride?: Partial<SceneNorms>;
  seed?: number;
}): SceneInstance {
  const preset = SCENE_PRESETS[args.presetId];
  if (!preset) throw new Error(`Unknown scene preset ${args.presetId}`);
  const seed = Number.isFinite(args.seed)
    ? Number(args.seed)
    : stableHashInt32(String(args.sceneId) + '::' + String(args.presetId));

  return {
    schemaVersion: 1,
    sceneId: args.sceneId,
    presetId: args.presetId,
    seed,
    startedAtTick: args.startedAtTick,
    tick: args.startedAtTick,
    phaseId: preset.entryPhaseId,
    phaseEnteredAtTick: args.startedAtTick,
    participants: args.participants || [],
    locationId: args.locationId,
    metrics: { ...defaultMetrics(preset), ...(args.metricsOverride || {}) },
    norms: { ...defaultNorms(preset), ...(args.normsOverride || {}) },
    manualInjections: [],
    lastTransition: null
  };
}

export function stepSceneInstance(args: {
  scene: SceneInstance;
  nowTick: number;
  atomsForConditions: ContextAtom[]; // must include threat/app/etc if transitions depend on them
}): SceneInstance {
  const preset = SCENE_PRESETS[args.scene.presetId];
  if (!preset) return args.scene;

  const scene = { ...args.scene, tick: args.nowTick };
  const phase = preset.phases.find(p => p.id === scene.phaseId);

  if (!phase) return scene;

  const ticksInPhase = Math.max(0, scene.tick - scene.phaseEnteredAtTick);

  // Evaluate transitions in order
  for (const tr of (phase.transitions || [])) {
    if (typeof tr.afterTicksInPhase === 'number' && ticksInPhase < tr.afterTicksInPhase) continue;

    let ok = true;
    for (const cond of (tr.when || [])) {
      const v = clamp01(getMag(args.atomsForConditions, cond.atomId, 0));
      if (!compare(cond.op, v, cond.value)) { ok = false; break; }
    }
    if (!ok) continue;

    // transition
    return {
      ...scene,
      phaseId: tr.to,
      phaseEnteredAtTick: scene.tick,
      lastTransition: { from: args.scene.phaseId, to: tr.to, tick: scene.tick, reason: 'conditions met' }
    };
  }

  return scene;
}
