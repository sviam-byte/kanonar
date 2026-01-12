// lib/metrics/thinking.ts
import type {
  AgentPsychState,
  ActivityCaps,
  ThinkingAxisA,
  ThinkingAxisB,
  ThinkingAxisC,
  ThinkingAxisD,
  ThinkingProfile,
} from '../../types';

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

function normalizeDict<T extends string>(m: Record<T, number>): Record<T, number> {
  const ks = Object.keys(m) as T[];
  const xs = ks.map((k) => Math.max(0, m[k] ?? 0));
  const s = xs.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(s) || s <= 1e-9) {
    const u = 1 / Math.max(1, ks.length);
    const out: Record<T, number> = {} as any;
    ks.forEach((k) => (out[k] = u));
    return out;
  }
  const out: Record<T, number> = {} as any;
  ks.forEach((k, i) => (out[k] = xs[i] / s));
  return out;
}

function argmaxKey<T extends string>(m: Record<T, number>): T {
  const ks = Object.keys(m) as T[];
  let best = ks[0];
  let bv = -Infinity;
  for (const k of ks) {
    const v = m[k] ?? 0;
    if (v > bv) {
      bv = v;
      best = k;
    }
  }
  return best;
}

/**
 * Heuristic cognitive-profile derivation.
 * - deterministic, stable
 * - derived from existing psych + latents (if provided)
 * - safe fallbacks
 */
export function computeThinkingAndActivityCaps(args: {
  psych: AgentPsychState;
  latents?: Record<string, number>;
  tomQuality?: number;
  tomUncertainty?: number;
  stress01?: number;
}): { thinking: ThinkingProfile; activityCaps: ActivityCaps } {
  const { psych, latents, tomQuality, tomUncertainty, stress01 } = args;

  const L = (k: string, fb = 0.5) => clamp01((latents?.[k] as number) ?? fb);
  const FORMAL = L('FORMAL', L('ARCH_FORMAL', 0.5));
  const ACTION = L('ACTION', L('ARCH_ACTION', 0.5));
  const AGENCY = L('AGENCY', L('ARCH_AGENCY', 0.5));
  const SCOPE = L('SCOPE', L('ARCH_SCOPE', 0.5));
  const RADICAL = L('RADICAL', L('ARCH_RADICAL', 0.4));
  const TRUTH = L('TRUTH', L('ARCH_TRUTH', 0.5));
  const CARE = L('CARE', L('ARCH_CARE', 0.5));

  const tq = clamp01(tomQuality ?? 0.5);
  const tu = clamp01(tomUncertainty ?? 0.5);
  const stress = clamp01(stress01 ?? 0.4);

  const bw = clamp01(psych.distortion?.blackWhiteThinking ?? 0);
  const cat = clamp01(psych.distortion?.catastrophizing ?? 0);
  const cb = clamp01((psych.distortion as any)?.confirmationBias ?? 0.5);
  const threat = clamp01(psych.distortion?.threatBias ?? 0);

  // Axis A
  const repRaw: Record<ThinkingAxisA, number> = {
    enactive: clamp01(((ACTION + AGENCY) * 0.5) * (1 - FORMAL)),
    imagery: clamp01(SCOPE * (1 - FORMAL * 0.6)),
    verbal: clamp01((FORMAL * 0.55 + TRUTH * 0.45) * (1 - FORMAL * 0.15)),
    formal: clamp01(FORMAL),
  };
  const representation = normalizeDict(repRaw);

  // Axis B
  const infRaw: Record<ThinkingAxisB, number> = {
    deductive: clamp01(FORMAL),
    inductive: clamp01(TRUTH * (1 - cb * 0.5)),
    abductive: clamp01((1 - FORMAL) * (0.4 + 0.6 * tq) * (0.3 + 0.7 * tu)),
    causal: clamp01(0.6 * AGENCY + 0.4 * SCOPE),
    bayesian: clamp01((0.45 + 0.55 * tu) * (1 - bw) * (1 - cat) * (1 - cb * 0.6)),
  };
  const inference = normalizeDict(infRaw);

  // Axis C
  const sys1Hint = psych.sysMode === 'SYS-1' ? 1 : psych.sysMode === 'SYS-2' ? 0 : 0.5;
  const intuitiveRaw = clamp01(0.55 * stress + 0.35 * threat + 0.1 * sys1Hint);
  const analyticRaw = clamp01((1 - intuitiveRaw) * (0.5 + 0.5 * FORMAL));
  const metacogRaw = clamp01(
    (0.45 * (1 - bw) + 0.2 * (1 - cb) + 0.15 * psych.resilience?.futureHorizon + 0.2 * tq) * (1 - stress * 0.55)
  );
  const control = normalizeDict<ThinkingAxisC>({
    intuitive: intuitiveRaw,
    analytic: analyticRaw,
    metacognitive: metacogRaw,
  });

  // Axis D
  const fn = normalizeDict<ThinkingAxisD>({
    understanding: clamp01(TRUTH * (0.6 + 0.4 * tq)),
    planning: clamp01((0.55 * AGENCY + 0.45 * SCOPE) * (0.65 + 0.35 * psych.resilience?.futureHorizon)),
    critical: clamp01(FORMAL * (1 - bw * 0.6) * (1 - cb * 0.5)),
    creative: clamp01(0.6 * RADICAL + 0.4 * (1 - FORMAL) * (0.7 + 0.3 * SCOPE)),
    normative: clamp01((0.55 * FORMAL + 0.45 * CARE) * (1 - cat * 0.4)),
    social: clamp01(tq * (0.7 + 0.3 * (1 - stress))),
  });

  const thinking: ThinkingProfile = {
    representation,
    inference,
    control,
    function: fn,
    dominantA: argmaxKey(representation),
    dominantB: argmaxKey(inference),
    dominantC: argmaxKey(control),
    dominantD: argmaxKey(fn),
    metacognitiveGain: clamp01(control.metacognitive * (0.5 + 0.5 * psych.resilience?.futureHorizon)),
  };

  const activityCaps: ActivityCaps = {
    operations: clamp01(0.35 + 0.35 * ACTION + 0.3 * (1 - stress)),
    actions: clamp01(0.25 + 0.35 * thinking.function.planning + 0.2 * thinking.function.critical + 0.2 * (1 - stress)),
    activity: clamp01(
      0.15 + 0.35 * psych.resilience?.futureHorizon + 0.35 * thinking.metacognitiveGain + 0.15 * (1 - stress)
    ),
    reactive: clamp01(0.25 + 0.45 * stress + 0.3 * threat),
    proactive: clamp01(0.2 + 0.45 * thinking.function.planning + 0.35 * (1 - stress)),
    regulatory: clamp01(0.2 + 0.45 * control.metacognitive + 0.2 * (1 - psych.coping?.avoid) + 0.15 * (1 - stress)),
    reflective: clamp01(0.15 + 0.5 * thinking.metacognitiveGain + 0.35 * psych.resilience?.futureHorizon),
    sensorimotor: clamp01(0.2 + 0.8 * thinking.representation.enactive),
    instrumental: clamp01(0.2 + 0.4 * thinking.representation.verbal + 0.4 * thinking.representation.formal),
    communicative: clamp01(0.2 + 0.8 * thinking.function.social),
    constructor: clamp01(0.2 + 0.45 * thinking.representation.formal + 0.35 * thinking.function.planning),
    creative: clamp01(0.2 + 0.8 * thinking.function.creative),
    normative: clamp01(0.2 + 0.8 * thinking.function.normative),
    existential: clamp01(0.1 + 0.55 * psych.resilience?.futureHorizon + 0.35 * thinking.metacognitiveGain),
  };

  return { thinking, activityCaps };
}
