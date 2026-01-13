import type { CognitionProfile } from '../../types';

const clamp01 = (x: unknown, fallback = 0) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
};

function l2(v: number[]) {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

// Stable order for cognition scalars (E–H + R1–R3).
const SCALAR_KEYS = [
  'futureHorizon',
  'uncertaintyTolerance',
  'normPressureSensitivity',
  'actionBiasVsFreeze',
  'confidenceCalibration',
  'executiveCapacity',
  'experimentalism',
] as const;

// Policy distribution.
const POLICY_KEYS = ['planFirst', 'actNow', 'probeAndUpdate'] as const;

/**
 * Build a cognition vector using a stable feature order to avoid collapse.
 */
export function cognitionVector(cog?: CognitionProfile, opts?: { normalize?: boolean }): number[] {
  const prior = cog?.prior;
  if (!prior) return [];
  const th = prior.thinking;
  if (!th) return [];
  const caps = prior.activityCaps ?? ({} as any);
  const s = prior.scalars;
  const p = prior.policy;

  const v: number[] = [];

  // A/B/C/D distributions (thinking axes).
  v.push(clamp01(th.representation.enactive), clamp01(th.representation.imagery), clamp01(th.representation.verbal), clamp01(th.representation.formal));
  v.push(clamp01(th.inference.deductive), clamp01(th.inference.inductive), clamp01(th.inference.abductive), clamp01(th.inference.causal), clamp01(th.inference.bayesian));
  v.push(clamp01(th.control.intuitive), clamp01(th.control.analytic), clamp01(th.control.metacognitive));
  v.push(clamp01(th.function.understanding), clamp01(th.function.planning), clamp01(th.function.critical), clamp01(th.function.creative), clamp01(th.function.normative), clamp01(th.function.social));
  v.push(clamp01(th.metacognitiveGain));

  // Scalars (E–H + R1–R3).
  for (const k of SCALAR_KEYS) v.push(clamp01((s as any)?.[k], 0.5));

  // Policy signals.
  for (const k of POLICY_KEYS) v.push(clamp01((p as any)?.[k], 0.5));

  // Key caps (subset to keep signal dense).
  v.push(
    clamp01(caps.operations),
    clamp01(caps.actions),
    clamp01(caps.activity),
    clamp01(caps.reactive),
    clamp01(caps.proactive),
    clamp01(caps.regulatory),
    clamp01(caps.reflective),
    clamp01(caps.communicative),
    clamp01(caps.constructor),
    clamp01(caps.creative)
  );

  if (opts?.normalize !== false) {
    const n = l2(v);
    if (n > 1e-9) for (let i = 0; i < v.length; i++) v[i] /= n;
  }
  return v;
}
