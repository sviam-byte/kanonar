
import { SceneAtomInjection, SceneInstance, SceneMetrics, SceneNorms } from './types';
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function getTicksInPhase(scene: SceneInstance) {
  return Math.max(0, (scene.tick ?? 0) - (scene.phaseEnteredAtTick ?? 0));
}

function injectionsForPhase(scene: SceneInstance, preset: any): SceneAtomInjection[] {
  const phase = (preset?.phases || []).find((p: any) => p.id === scene.phaseId);
  const list: SceneAtomInjection[] = [
    ...(preset?.globalInjections || []),
    ...(phase?.injections || []),
    ...(scene.manualInjections || [])
  ];
  return list.filter(inj => {
    const when = inj.when;
    if (!when) return true;
    if (typeof when.minTickInPhase === 'number' && getTicksInPhase(scene) < when.minTickInPhase) return false;
    return true;
  });
}

export function applySceneAtoms(args: {
  scene: SceneInstance | null | undefined;
  preset: any;
  worldTick: number;
}): ContextAtom[] {
  const { scene, preset, worldTick } = args;
  if (!scene || !preset) return [];

  const out: ContextAtom[] = [];

  // 1) publish metrics as atoms scene:metric:<id>
  const metrics = scene.metrics as SceneMetrics;
  for (const k of Object.keys(metrics)) {
    const v = clamp01((metrics as any)[k]);
    out.push(normalizeAtom({
      id: `scene:metric:${k}`,
      ns: 'scene',
      kind: 'scene_metric',
      origin: 'world',
      source: 'scene',
      magnitude: v,
      confidence: 1,
      tags: ['scene', 'metric', k],
      label: `scene ${k}=${Math.round(v * 100)}%`,
      trace: { usedAtomIds: [], notes: ['from scene instance metrics'], parts: { tick: worldTick, phaseId: scene.phaseId } }
    } as any));
  }

  // 2) publish norms as atoms norm:<id>
  const norms = scene.norms as SceneNorms;
  for (const k of Object.keys(norms)) {
    const v = clamp01((norms as any)[k]);
    out.push(normalizeAtom({
      id: `norm:${k}`,
      ns: 'norm',
      kind: 'scene_norm',
      origin: 'world',
      source: 'scene',
      magnitude: v,
      confidence: 1,
      tags: ['norm', k],
      label: `norm ${k}=${Math.round(v * 100)}%`,
      trace: { usedAtomIds: [], notes: ['from scene instance norms'], parts: { tick: worldTick, phaseId: scene.phaseId } }
    } as any));
  }

  // 3) publish injections (flags/offers/constraints/events)
  for (const inj of injectionsForPhase(scene, preset)) {
    out.push(normalizeAtom({
      id: inj.id,
      ns: inj.ns as any,
      kind: inj.kind as any,
      origin: 'world',
      source: 'scene',
      magnitude: clamp01(inj.magnitude),
      confidence: inj.confidence ?? 1,
      subject: inj.subject,
      target: inj.target,
      tags: inj.tags || [inj.ns],
      label: inj.label || inj.id,
      trace: { usedAtomIds: [], notes: ['scene injection'], parts: { phaseId: scene.phaseId } },
      meta: inj.meta
    } as any));
  }

  // 4) publish scene banner
  out.push(normalizeAtom({
    id: `scene:banner:${scene.sceneId}`,
    ns: 'scene',
    kind: 'summary_banner',
    origin: 'world',
    source: 'scene',
    magnitude: 1,
    confidence: 1,
    tags: ['scene', 'banner'],
    label: `${scene.presetId}/${scene.phaseId}`,
    trace: { usedAtomIds: [], notes: ['scene banner'], parts: { presetId: scene.presetId, phaseId: scene.phaseId } }
  } as any));

  return out;
}
