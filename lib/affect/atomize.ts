// lib/affect/atomize.ts
import type { AffectState } from '../emotions/types';
import type { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

const num = (v: any, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Materialize affect into canonical context atoms.
 * These atoms are the bridge between GoalLab UI affect knobs and downstream ToM/threat/goals explanations.
 */
export function atomizeAffect(
  selfId: string,
  affect: AffectState | null | undefined,
  origin: 'manual' | 'derived' = 'derived'
): ContextAtom[] {
  if (!selfId || !affect) return [];

  const out: ContextAtom[] = [];

  // Core affect
  out.push(
    normalizeAtom({
      id: `affect:valence:${selfId}`,
      ns: 'emo',
      kind: 'affect',
      origin,
      source: 'affect',
      magnitude: num((affect as any).valence, 0), // -1..+1
      confidence: 1,
      tags: ['affect', 'emo'],
      subject: selfId,
      label: `valence:${Math.round(num((affect as any).valence, 0) * 100) / 100}`,
      trace: { usedAtomIds: [], notes: ['core affect'] },
    } as any),
    normalizeAtom({
      id: `affect:arousal:${selfId}`,
      ns: 'emo',
      kind: 'affect',
      origin,
      source: 'affect',
      magnitude: clamp01(num((affect as any).arousal, 0)),
      confidence: 1,
      tags: ['affect', 'emo'],
      subject: selfId,
      label: `arousal:${Math.round(clamp01(num((affect as any).arousal, 0)) * 100)}%`,
      trace: { usedAtomIds: [], notes: ['core affect'] },
    } as any),
    normalizeAtom({
      id: `affect:control:${selfId}`,
      ns: 'emo',
      kind: 'affect',
      origin,
      source: 'affect',
      magnitude: clamp01(num((affect as any).control, 0)),
      confidence: 1,
      tags: ['affect', 'emo'],
      subject: selfId,
      label: `control:${Math.round(clamp01(num((affect as any).control, 0)) * 100)}%`,
      trace: { usedAtomIds: [], notes: ['core affect'] },
    } as any)
  );

  // Meta
  out.push(
    normalizeAtom({
      id: `affect:stress:${selfId}`,
      ns: 'emo',
      kind: 'affect',
      origin,
      source: 'affect',
      magnitude: clamp01(num((affect as any).stress, 0)),
      confidence: 1,
      tags: ['affect', 'emo'],
      subject: selfId,
      label: `stress:${Math.round(clamp01(num((affect as any).stress, 0)) * 100)}%`,
      trace: { usedAtomIds: [], notes: ['meta affect'] },
    } as any),
    normalizeAtom({
      id: `affect:fatigue:${selfId}`,
      ns: 'emo',
      kind: 'affect',
      origin,
      source: 'affect',
      magnitude: clamp01(num((affect as any).fatigue, 0)),
      confidence: 1,
      tags: ['affect', 'emo'],
      subject: selfId,
      label: `fatigue:${Math.round(clamp01(num((affect as any).fatigue, 0)) * 100)}%`,
      trace: { usedAtomIds: [], notes: ['meta affect'] },
    } as any),
    normalizeAtom({
      id: `affect:dissociation:${selfId}`,
      ns: 'emo',
      kind: 'affect',
      origin,
      source: 'affect',
      magnitude: clamp01(num((affect as any).dissociation, 0)),
      confidence: 1,
      tags: ['affect', 'emo'],
      subject: selfId,
      label: `dissociation:${Math.round(clamp01(num((affect as any).dissociation, 0)) * 100)}%`,
      trace: { usedAtomIds: [], notes: ['meta affect'] },
    } as any)
  );

  // Discrete emotions
  const e = (affect as any).e || {};
  for (const [k, vRaw] of Object.entries(e)) {
    const v = clamp01(num(vRaw, 0));
    if (v <= 0.001) continue;
    out.push(
      normalizeAtom({
        id: `affect:e:${String(k)}:${selfId}`,
        ns: 'emo',
        kind: 'emotion',
        origin,
        source: 'affect',
        magnitude: v,
        confidence: 1,
        tags: ['affect', 'emo', 'emotion'],
        subject: selfId,
        label: `${String(k)}:${Math.round(v * 100)}%`,
        trace: { usedAtomIds: [], notes: ['discrete emotion'] },
      } as any)
    );
  }

  return out;
}
