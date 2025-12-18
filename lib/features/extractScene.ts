
// lib/features/extractScene.ts
import { Features } from './types';
import { clamp01, num } from './scale';

export function extractSceneFeatures(args: { sceneSnapshot: any; sceneId: string }): Features {
  const sc = args.sceneSnapshot || {};
  const id = args.sceneId;

  const values: Record<string, number> = {};
  const trace: any = {};
  const set = (k: string, v: number, source: string) => {
    values[k] = clamp01(v);
    trace[k] = { source };
  };

  const metrics = sc.metrics || sc.scene?.metrics || {};
  const norms = sc.norms || sc.scene?.norms || {};

  // Handle scaling if metrics are 0-100
  const scale = (val: any) => {
      const n = num(val, 0);
      return n > 1 ? n / 100 : n;
  }

  set('scene.crowd', clamp01(scale(metrics.crowd)), 'scene.metrics.crowd');
  set('scene.hostility', clamp01(scale(metrics.hostility)), 'scene.metrics.hostility');
  set('scene.urgency', clamp01(scale(metrics.urgency)), 'scene.metrics.urgency');
  set('scene.scarcity', clamp01(scale(metrics.scarcity)), 'scene.metrics.scarcity');
  set('scene.novelty', clamp01(scale(metrics.novelty)), 'scene.metrics.novelty');
  set('scene.loss', clamp01(scale(metrics.loss)), 'scene.metrics.loss');
  set('scene.resourceAccess', clamp01(scale(metrics.resourceAccess)), 'scene.metrics.resourceAccess');

  set('norm.surveillance', clamp01(scale(norms.surveillance)), 'scene.norms.surveillance');
  set('norm.proceduralStrict', clamp01(scale(norms.proceduralStrict)), 'scene.norms.proceduralStrict');
  set('ctx.publicness', clamp01(scale(norms.publicExposure ?? norms.publicness)), 'scene.norms.publicness');
  set('ctx.privacy', clamp01(scale(norms.privacy)), 'scene.norms.privacy');

  return { schemaVersion: 1, kind: 'scene', entityId: id, values, trace };
}
