
// lib/features/atomize.ts
import { Features } from './types';
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { clamp01 } from './scale';

export function atomizeFeatures(features: Features, nsPrefix: string): ContextAtom[] {
  const out: ContextAtom[] = [];
  const id = features.entityId;

  for (const k of Object.keys(features.values || {})) {
    const v = clamp01(features.values[k]);
    const src = features.trace?.[k]?.source || 'features';
    out.push(normalizeAtom({
      id: `${nsPrefix}:${id}:${k}`,
      ns: 'feat' as any,
      kind: `${features.kind}_feature` as any,
      origin: 'world',
      source: 'features',
      magnitude: v,
      confidence: 1,
      subject: id,
      tags: ['feat', features.kind, k],
      label: `${k}=${Math.round(v * 100)}%`,
      trace: { usedAtomIds: [], notes: [`from ${src}`], parts: {} },
      meta: { featureKey: k, featureSource: src, kind: features.kind }
    } as any));
  }

  return out;
}
