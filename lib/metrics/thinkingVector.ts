import type { ActivityCaps, ThinkingAxisA, ThinkingAxisB, ThinkingAxisC, ThinkingAxisD, ThinkingProfile } from '../../types';

const AX_A: ThinkingAxisA[] = ['enactive', 'imagery', 'verbal', 'formal'];
const AX_B: ThinkingAxisB[] = ['deductive', 'inductive', 'abductive', 'causal', 'bayesian'];
const AX_C: ThinkingAxisC[] = ['intuitive', 'analytic', 'metacognitive'];
const AX_D: ThinkingAxisD[] = ['understanding', 'planning', 'critical', 'creative', 'normative', 'social'];

const CAPS_KEYS: (keyof ActivityCaps)[] = [
  'operations',
  'actions',
  'activity',
  'reactive',
  'proactive',
  'regulatory',
  'reflective',
  'sensorimotor',
  'instrumental',
  'communicative',
  'constructor',
  'creative',
  'normative',
  'existential',
];

function clamp01(x: unknown, fallback = 0) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function l2norm(v: number[]) {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

/**
 * Build a normalized vector that encodes thinking axes + caps.
 * Used for cosine-distance similarity comparisons.
 */
export function thinkingVector(th: ThinkingProfile, caps?: ActivityCaps): number[] {
  const v: number[] = [];

  for (const k of AX_A) v.push(clamp01(th?.representation?.[k], 0));
  for (const k of AX_B) v.push(clamp01(th?.inference?.[k], 0));
  for (const k of AX_C) v.push(clamp01(th?.control?.[k], 0));
  for (const k of AX_D) v.push(clamp01(th?.function?.[k], 0));

  v.push(clamp01(th?.metacognitiveGain, 0));

  if (caps) {
    for (const k of CAPS_KEYS) v.push(clamp01(caps[k], 0));
  } else {
    for (let i = 0; i < CAPS_KEYS.length; i++) v.push(0);
  }

  // normalize to unit vector for cosine distance stability
  const n = l2norm(v);
  if (n > 1e-9) {
    for (let i = 0; i < v.length; i++) v[i] /= n;
  }
  return v;
}

export function cosineDistance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  // a,b already normalized, but keep safe
  const dist = 1 - dot;
  if (!Number.isFinite(dist)) return 1;
  return Math.max(0, Math.min(2, dist));
}

export type ThinkingNeighbor<T> = { item: T; distance: number };

export function nearestByThinkingVector<T>(
  anchor: number[],
  items: { item: T; vec: number[] }[],
  k = 5
): ThinkingNeighbor<T>[] {
  const scored = items
    .map(x => ({ item: x.item, distance: cosineDistance(anchor, x.vec) }))
    .sort((p, q) => p.distance - q.distance);
  return scored.slice(0, Math.max(0, k));
}
