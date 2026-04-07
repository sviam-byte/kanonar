import type { CognitionProfile } from '../../types';
import { clamp01, safe01 } from '../util/math';

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
  const caps = prior.activityCaps ?? ({});
  const s = prior.scalars;
  const p = prior.policy;

  const v: number[] = [];

  // A/B/C/D distributions (thinking axes).
  v.push(safe01(th.representation.enactive), safe01(th.representation.imagery), safe01(th.representation.verbal), safe01(th.representation.formal));
  v.push(safe01(th.inference.deductive), safe01(th.inference.inductive), safe01(th.inference.abductive), safe01(th.inference.causal), safe01(th.inference.bayesian));
  v.push(safe01(th.control.intuitive), safe01(th.control.analytic), safe01(th.control.metacognitive));
  v.push(safe01(th.function.understanding), safe01(th.function.planning), safe01(th.function.critical), safe01(th.function.creative), safe01(th.function.normative), safe01(th.function.social));
  v.push(safe01(th.metacognitiveGain));

  // Scalars (E–H + R1–R3).
  for (const k of SCALAR_KEYS) v.push(safe01((s as any)?.[k], 0.5));

  // Policy signals.
  for (const k of POLICY_KEYS) v.push(safe01((p as any)?.[k], 0.5));

  // Key caps (subset to keep signal dense).
  v.push(
    safe01(caps.operations),
    safe01(caps.actions),
    safe01(caps.activity),
    safe01(caps.reactive),
    safe01(caps.proactive),
    safe01(caps.regulatory),
    safe01(caps.reflective),
    safe01(caps.communicative),
    safe01(caps.constructor),
    safe01(caps.creative)
  );

  if (opts?.normalize !== false) {
    const n = l2(v);
    if (n > 1e-9) for (let i = 0; i < v.length; i++) v[i] /= n;
  }
  return v;
}
