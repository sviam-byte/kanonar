import type {
  ThinkingAxisA,
  ThinkingAxisB,
  ThinkingAxisC,
  ThinkingAxisD,
  ThinkingProfile,
  ActivityCaps,
  ActionDispositionScalars,
  PolicyKnobs,
  CognitionEvidence,
  CognitionProfile,
} from '../../types';

type CharacterLike = {
  vector_base?: Record<string, any>;
  latents?: Record<string, number>;
  competencies?: Record<string, any>;
};

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const num = (x: unknown, fallback = 0) => {
  const value = Number(x);
  return Number.isFinite(value) ? value : fallback;
};
const avg = (...xs: number[]) =>
  xs.length ? xs.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0) / xs.length : 0;

function normalize<T extends string>(m: Record<T, number>): Record<T, number> {
  const keys = Object.keys(m) as T[];
  let sum = 0;
  for (const key of keys) sum += Math.max(0, m[key] ?? 0);
  if (!Number.isFinite(sum) || sum <= 1e-9) {
    const uniform = 1 / Math.max(1, keys.length);
    const out: Record<T, number> = {} as Record<T, number>;
    for (const key of keys) out[key] = uniform;
    return out;
  }
  const out: Record<T, number> = {} as Record<T, number>;
  for (const key of keys) out[key] = clamp01(Math.max(0, m[key] ?? 0) / sum);
  return out;
}

function argmaxKey<T extends string>(m: Record<T, number>): T {
  const keys = Object.keys(m) as T[];
  let best = keys[0];
  let bestValue = -Infinity;
  for (const key of keys) {
    const value = m[key] ?? 0;
    if (value > bestValue) {
      bestValue = value;
      best = key;
    }
  }
  return best;
}

function softmax<T extends string>(scores: Record<T, number>, temperature = 1): Record<T, number> {
  const keys = Object.keys(scores) as T[];
  const temp = Math.max(1e-6, Number.isFinite(temperature) ? temperature : 1);
  let max = -Infinity;
  for (const key of keys) max = Math.max(max, scores[key] ?? 0);
  const exps: Record<T, number> = {} as Record<T, number>;
  let sum = 0;
  for (const key of keys) {
    const z = ((scores[key] ?? 0) - max) / temp;
    const value = Math.exp(z);
    exps[key] = value;
    sum += value;
  }
  const out: Record<T, number> = {} as Record<T, number>;
  const denom = sum > 1e-9 ? sum : 1;
  for (const key of keys) out[key] = clamp01(exps[key] / denom);
  return out;
}

function V(c: CharacterLike, key: string, fallback = 0.5) {
  return clamp01(num(c.vector_base?.[key], fallback));
}

function L(c: CharacterLike, key: string, fallback = 0.5) {
  return clamp01(num(c.latents?.[key], fallback));
}

function C(c: CharacterLike, key: string, fallback = 0.5) {
  return clamp01(num((c.competencies as Record<string, any> | undefined)?.[key], fallback));
}

/**
 * Logic predicates (0..1 “truthiness”).
 * These are the “вариант 3” core, but graded, not boolean.
 */
function derivePredicates(c: CharacterLike) {
  const formalCapacity = avg(L(c, 'FORMAL', 0.5), V(c, 'E_Model_calibration', 0.5), V(c, 'A_Legitimacy_Procedure', 0.5));
  const sensorimotorIteration = avg(
    L(c, 'ACTION', 0.5),
    V(c, 'E_Skill_ops_fieldcraft', 0.5),
    V(c, 'D_fine_motor', 0.5),
    V(c, 'B_exploration_rate', 0.4)
  );
  const imageryCapacity = avg(L(c, 'IMAGERY', 0.5), V(c, 'A_Aesthetic_Meaning', 0.5), V(c, 'E_KB_topos', 0.5));
  const verbalCapacity = avg(L(c, 'VERBAL', 0.5), V(c, 'A_Knowledge_Truth', 0.5), V(c, 'E_KB_civic', 0.5));
  const ambiguityTol = avg(V(c, 'B_tolerance_ambiguity', 0.5), V(c, 'F_Plasticity', 0.5), 1 - V(c, 'D_HPA_reactivity', 0.5));
  const needsControl = avg(V(c, 'B_cooldown_discipline', 0.5), 1 - V(c, 'B_decision_temperature', 0.5));
  const actionImpulse = avg(V(c, 'B_decision_temperature', 0.5), V(c, 'D_HPA_reactivity', 0.5));
  const futureHorizon = avg(
    1 - V(c, 'B_discount_rate', 0.5),
    V(c, 'G_Narrative_agency', 0.5),
    V(c, 'resilience.futureHorizon' as any, 0.5)
  );
  const tom = avg(V(c, 'C_reciprocity_index', 0.5), V(c, 'C_dominance_empathy', 0.5), V(c, 'C_coalition_loyalty', 0.5));
  const normPressure = avg(V(c, 'A_Legitimacy_Procedure', 0.5), V(c, 'C_reputation_sensitivity', 0.5), V(c, 'A_Justice_Fairness', 0.5));

  // “метакогниция” как контроль качества мышления
  const metacog = avg(V(c, 'G_Metacog_accuracy', 0.5), ambiguityTol, V(c, 'E_Model_calibration', 0.5));

  // --- R1 confidence calibration (separate from bayesian "style") ---
  // Penalize calibration if distortions imply overconfidence/catastrophizing; reward model_calibration + metacog.
  const overconf = V(c, 'distortion.overconfidence' as any, 0.5);
  const catastroph = V(c, 'distortion.catastrophizing' as any, 0.5);
  const confCal = clamp01(avg(V(c, 'E_Model_calibration', 0.5), metacog, 1 - 0.5 * overconf, 1 - 0.5 * catastroph));

  // --- R2 executive capacity (resource, not "analytic preference") ---
  // Combines discipline + low impulsivity + metacog + low stress reactivity.
  const executiveCapacity = clamp01(
    0.35 * V(c, 'B_cooldown_discipline', 0.5) +
      0.25 * (1 - V(c, 'B_decision_temperature', 0.5)) +
      0.25 * metacog +
      0.15 * (1 - V(c, 'D_HPA_reactivity', 0.5))
  );

  // --- R3 experimentalism (small tests / probes) ---
  // Reward exploration + abductive/causal inclination proxies + ambiguity tolerance; penalize avoidance.
  const avoidance = V(c, 'coping.avoid' as any, 0.5);
  const experimentalism = clamp01(
    0.35 * V(c, 'B_exploration_rate', 0.4) +
      0.20 * V(c, 'E_Skill_causal_surgery', 0.5) +
      0.25 * ambiguityTol +
      0.20 * (1 - avoidance)
  );

  return {
    formalCapacity,
    sensorimotorIteration,
    imageryCapacity,
    verbalCapacity,
    ambiguityTol,
    needsControl,
    actionImpulse,
    futureHorizon,
    tom,
    normPressure,
    metacog,
    confCal,
    executiveCapacity,
    experimentalism,
  };
}

/**
 * Fuzzy rules → distributions on A/B/C/D.
 * Это мягкая версия логики: набор вкладов (вместо "если/то").
 */
function deriveThinkingFromPredicates(p: ReturnType<typeof derivePredicates>) {
  // Axis A (representation)
  const repScores: Record<ThinkingAxisA, number> = {
    enactive: 0.65 * p.sensorimotorIteration + 0.25 * (1 - p.formalCapacity) + 0.10 * p.actionImpulse,
    imagery: 0.75 * p.imageryCapacity + 0.25 * p.ambiguityTol,
    verbal: 0.70 * p.verbalCapacity + 0.30 * p.needsControl,
    formal: 0.80 * p.formalCapacity + 0.20 * p.needsControl,
  };

  // Axis B (inference)
  const infScores: Record<ThinkingAxisB, number> = {
    deductive: 0.75 * p.formalCapacity + 0.25 * p.needsControl,
    inductive: 0.55 * p.sensorimotorIteration + 0.45 * p.ambiguityTol,
    abductive: 0.55 * p.ambiguityTol + 0.45 * p.metacog,
    causal: 0.55 * p.formalCapacity + 0.25 * p.futureHorizon + 0.20 * p.metacog,
    // "bayesian" here is now explicitly tied to confidence calibration (R1) + metacog.
    bayesian: 0.45 * p.metacog + 0.35 * p.ambiguityTol + 0.20 * p.confCal,
  };

  // Axis C (control)
  const ctrlScores: Record<ThinkingAxisC, number> = {
    intuitive: 0.65 * p.actionImpulse + 0.35 * (1 - p.needsControl),
    // analytic depends on actual executive resource (R2), not only preference
    analytic: 0.45 * p.needsControl + 0.25 * p.formalCapacity + 0.30 * p.executiveCapacity,
    metacognitive: 0.85 * p.metacog + 0.15 * p.futureHorizon,
  };

  // Axis D (function)
  const fnScores: Record<ThinkingAxisD, number> = {
    understanding: 0.55 * p.metacog + 0.45 * p.verbalCapacity,
    planning: 0.60 * p.futureHorizon + 0.25 * p.formalCapacity + 0.15 * p.needsControl,
    critical: 0.65 * p.metacog + 0.35 * p.formalCapacity,
    // creative: add experimentalism (R3) (generative exploration)
    creative: 0.45 * p.imageryCapacity + 0.25 * p.ambiguityTol + 0.30 * p.experimentalism,
    normative: 0.65 * p.normPressure + 0.35 * p.formalCapacity,
    social: 0.80 * p.tom + 0.20 * p.ambiguityTol,
  };

  // Use softmax for smoothness (instead of raw normalize)
  const representation = softmax(repScores, 1);
  const inference = softmax(infScores, 1);
  const control = softmax(ctrlScores, 1);
  const fn = softmax(fnScores, 1);

  const thinking: ThinkingProfile = {
    representation,
    inference,
    control,
    function: fn,
    dominantA: argmaxKey(representation),
    dominantB: argmaxKey(inference),
    dominantC: argmaxKey(control),
    dominantD: argmaxKey(fn),
    metacognitiveGain: clamp01(control.metacognitive),
  };

  return thinking;
}

/**
 * Extra scalars E–H (direct drivers of "plan vs act").
 */
function deriveDispositionScalars(c: CharacterLike, p: ReturnType<typeof derivePredicates>): ActionDispositionScalars {
  const futureHorizon = clamp01(p.futureHorizon);

  const uncertaintyTolerance = clamp01(
    0.55 * p.ambiguityTol +
      0.25 * p.metacog +
      0.20 * (1 - V(c, 'distortion.catastrophizing' as any, 0.5))
  );

  const normPressureSensitivity = clamp01(p.normPressure);

  // H: actionBiasVsFreeze (1=act, 0=freeze)
  // freeze increases with HPA_reactivity + avoidance (if present), decreases with agency & control
  const avoidance = clamp01(V(c, 'coping.avoid' as any, 0.5));
  const agency = clamp01(avg(L(c, 'AGENCY', 0.5), V(c, 'B_goal_coherence', 0.5), V(c, 'G_Narrative_agency', 0.5)));
  const freeze = clamp01(0.45 * V(c, 'D_HPA_reactivity', 0.5) + 0.35 * avoidance + 0.20 * (1 - agency));
  const actionBiasVsFreeze = clamp01(1 - freeze);

  return {
    futureHorizon,
    uncertaintyTolerance,
    normPressureSensitivity,
    actionBiasVsFreeze,
    confidenceCalibration: clamp01(p.confCal),
    executiveCapacity: clamp01(p.executiveCapacity),
    experimentalism: clamp01(p.experimentalism),
  };
}

/**
 * Activity caps from thinking + disposition.
 */
function deriveActivityCaps(c: CharacterLike, thinking: ThinkingProfile, scalars: ActionDispositionScalars): ActivityCaps {
  const discipline = V(c, 'B_cooldown_discipline', 0.5);
  const enactiveSkill = avg(L(c, 'ACTION', 0.5), V(c, 'E_Skill_ops_fieldcraft', 0.5), V(c, 'D_fine_motor', 0.5));
  const verbalSkill = avg(L(c, 'VERBAL', 0.5), V(c, 'A_Knowledge_Truth', 0.5), V(c, 'E_KB_civic', 0.5));
  const formalSkill = avg(L(c, 'FORMAL', 0.5), V(c, 'E_Model_calibration', 0.5), V(c, 'A_Legitimacy_Procedure', 0.5));
  const agency = avg(L(c, 'AGENCY', 0.5), V(c, 'B_goal_coherence', 0.5), V(c, 'G_Narrative_agency', 0.5));
  const tom = avg(V(c, 'C_reciprocity_index', 0.5), V(c, 'C_dominance_empathy', 0.5), V(c, 'C_coalition_loyalty', 0.5));

  return {
    operations: clamp01(avg(enactiveSkill, discipline, scalars.actionBiasVsFreeze)),
    // actions improve with executive resource + confidence calibration (less thrash)
    actions: clamp01(
      avg(
        agency,
        thinking.function.planning,
        thinking.function.critical,
        scalars.uncertaintyTolerance,
        scalars.executiveCapacity,
        scalars.confidenceCalibration
      )
    ),
    activity: clamp01(avg(V(c, 'G_Narrative_agency', 0.5), thinking.metacognitiveGain, scalars.futureHorizon)),

    reactive: clamp01(avg(V(c, 'D_HPA_reactivity', 0.5), V(c, 'B_decision_temperature', 0.5), 1 - scalars.actionBiasVsFreeze)),
    proactive: clamp01(avg(scalars.futureHorizon, thinking.function.planning, scalars.actionBiasVsFreeze)),
    regulatory: clamp01(
      avg(discipline, thinking.metacognitiveGain, 1 - V(c, 'B_decision_temperature', 0.5), scalars.executiveCapacity)
    ),
    reflective: clamp01(
      avg(thinking.metacognitiveGain, scalars.uncertaintyTolerance, V(c, 'F_Value_update_rate', 0.5), scalars.confidenceCalibration)
    ),

    sensorimotor: clamp01(avg(thinking.representation.enactive, enactiveSkill)),
    instrumental: clamp01(avg(thinking.representation.verbal, thinking.representation.formal, verbalSkill, formalSkill)),
    communicative: clamp01(avg(thinking.function.social, tom, C(c, 'diplomacy', 0.5), V(c, 'E_Skill_diplomacy_negotiation', 0.5))),
    constructor: clamp01(avg(thinking.representation.formal, thinking.function.planning, V(c, 'E_Skill_repair_topology', 0.5))),
    creative: clamp01(avg(thinking.function.creative, thinking.representation.imagery, scalars.uncertaintyTolerance, scalars.experimentalism)),
    normative: clamp01(avg(thinking.function.normative, scalars.normPressureSensitivity)),
    existential: clamp01(avg(thinking.metacognitiveGain, scalars.futureHorizon, scalars.uncertaintyTolerance)),
  };
}

/**
 * Policy knobs: what the decision system should prefer.
 * This is the bridge “мышление → склонность к действиям”.
 */
function derivePolicyKnobs(thinking: ThinkingProfile, caps: ActivityCaps, scalars: ActionDispositionScalars): PolicyKnobs {
  const planFirst = clamp01(
    0.45 * thinking.control.analytic +
      0.35 * thinking.function.planning +
      0.20 * scalars.futureHorizon +
      0.20 * scalars.executiveCapacity -
      0.15 * (1 - scalars.actionBiasVsFreeze)
  );

  const actNow = clamp01(
    0.45 * thinking.representation.enactive +
      0.30 * thinking.control.intuitive +
      0.25 * scalars.actionBiasVsFreeze -
      0.20 * scalars.normPressureSensitivity
  );

  const probeAndUpdate = clamp01(
    0.35 * thinking.inference.abductive +
      0.25 * thinking.inference.causal +
      0.20 * thinking.inference.bayesian +
      0.20 * thinking.control.metacognitive -
      0.10 * (1 - scalars.uncertaintyTolerance) +
      0.20 * scalars.experimentalism +
      0.10 * scalars.confidenceCalibration
  );

  // small coupling from capabilities: if actions low, reduce actNow
  const actNowAdj = clamp01(actNow * (0.6 + 0.4 * caps.actions));

  return { planFirst, actNow: actNowAdj, probeAndUpdate };
}

/**
 * Light Bayes: posterior = normalize( prior * likelihood(evidence|type) ).
 * We only update a few key distributions (A/B/C/D) using evidence on plan/act/probe.
 */
function bayesUpdateAxis<T extends string>(
  prior: Record<T, number>,
  likelihood: Record<T, number>,
  strength = 0.65
): Record<T, number> {
  // strength controls how much evidence pulls from prior (0=no update, 1=full bayes)
  const keys = Object.keys(prior) as T[];
  const out: Record<T, number> = {} as Record<T, number>;
  for (const key of keys) {
    const p = Math.max(1e-9, prior[key] ?? 0);
    const l = Math.max(1e-9, likelihood[key] ?? 1);
    // geometric interpolation between prior and posterior
    const post = p * l;
    out[key] = Math.pow(p, 1 - strength) * Math.pow(post, strength);
  }
  return normalize(out);
}

function evidenceLikelihood(thinking: ThinkingProfile, e: CognitionEvidence) {
  // Evidence dims: planRate/actRate/probeRate/waitRate (0..1)
  const plan = clamp01(e.planRate ?? 0);
  const act = clamp01(e.actRate ?? 0);
  const probe = clamp01(e.probeRate ?? 0);
  const wait = clamp01(e.waitRate ?? 0);

  // Likelihoods are defined by “which styles would generate such behavior”.
  // This is “немножко Байеса”: a small, explicit likelihood model.
  const likeC: Record<ThinkingAxisC, number> = {
    intuitive: 1 + 2.0 * act + 1.0 * (1 - plan) - 1.5 * probe - 0.5 * wait,
    analytic: 1 + 2.0 * plan + 1.0 * probe - 1.0 * act,
    metacognitive: 1 + 2.0 * probe + 0.7 * plan - 0.7 * act,
  };

  const likeD: Record<ThinkingAxisD, number> = {
    understanding: 1 + 1.0 * probe + 0.5 * plan,
    planning: 1 + 2.0 * plan + 0.7 * probe - 0.7 * act,
    critical: 1 + 1.2 * probe + 0.4 * plan,
    creative: 1 + 0.5 * act + 0.8 * probe,
    normative: 1 + 0.6 * plan - 0.4 * act + 0.6 * wait,
    social: 1 + 0.3 * probe + 0.3 * plan,
  };

  const likeB: Record<ThinkingAxisB, number> = {
    deductive: 1 + 0.9 * plan,
    inductive: 1 + 0.7 * act + 0.3 * probe,
    abductive: 1 + 1.4 * probe,
    causal: 1 + 0.8 * probe + 0.6 * plan,
    bayesian: 1 + 1.2 * probe + 0.4 * plan,
  };

  // A is weakly affected by evidence here; keep near-uniform likelihood
  const likeA: Record<ThinkingAxisA, number> = {
    enactive: 1 + 0.6 * act,
    imagery: 1 + 0.2 * probe,
    verbal: 1 + 0.2 * plan,
    formal: 1 + 0.4 * plan + 0.2 * probe,
  };

  // clamp negatives
  const clampLike = <T extends string>(m: Record<T, number>) => {
    const out: Record<T, number> = {} as Record<T, number>;
    for (const key of Object.keys(m) as T[]) out[key] = Math.max(1e-3, m[key]);
    return out;
  };

  return {
    likeA: clampLike(likeA),
    likeB: clampLike(likeB),
    likeC: clampLike(likeC),
    likeD: clampLike(likeD),
  };
}

function applyEvidence(priorThinking: ThinkingProfile, evidence: CognitionEvidence): ThinkingProfile {
  const { likeA, likeB, likeC, likeD } = evidenceLikelihood(priorThinking, evidence);

  const representation = bayesUpdateAxis(priorThinking.representation, likeA, 0.55);
  const inference = bayesUpdateAxis(priorThinking.inference, likeB, 0.65);
  const control = bayesUpdateAxis(priorThinking.control, likeC, 0.70);
  const fn = bayesUpdateAxis(priorThinking.function, likeD, 0.70);

  return {
    representation,
    inference,
    control,
    function: fn,
    dominantA: argmaxKey(representation),
    dominantB: argmaxKey(inference),
    dominantC: argmaxKey(control),
    dominantD: argmaxKey(fn),
    metacognitiveGain: clamp01(control.metacognitive),
  };
}

export function deriveCognitionProfileFromCharacter(args: {
  character: CharacterLike;
  evidence?: CognitionEvidence; // optional behavioral evidence
}): CognitionProfile {
  const predicates = derivePredicates(args.character);
  const priorThinking = deriveThinkingFromPredicates(predicates);
  const priorScalars = deriveDispositionScalars(args.character, predicates);
  const priorCaps = deriveActivityCaps(args.character, priorThinking, priorScalars);
  const priorPolicy = derivePolicyKnobs(priorThinking, priorCaps, priorScalars);

  const out: CognitionProfile = {
    prior: {
      thinking: priorThinking,
      activityCaps: priorCaps,
      scalars: priorScalars,
      policy: priorPolicy,
    },
  };

  if (args.evidence && (args.evidence.sampleSize ?? 0) > 0) {
    const postThinking = applyEvidence(priorThinking, args.evidence);
    // For posterior: scalars shift mildly toward observed behavior (optional; keep conservative)
    const postScalars: ActionDispositionScalars = {
      ...priorScalars,
      actionBiasVsFreeze: clamp01(
        0.70 * priorScalars.actionBiasVsFreeze +
          0.30 * (args.evidence.actRate ?? priorScalars.actionBiasVsFreeze)
      ),
    };
    const postCaps = deriveActivityCaps(args.character, postThinking, postScalars);
    const postPolicy = derivePolicyKnobs(postThinking, postCaps, postScalars);

    out.posterior = {
      thinking: postThinking,
      activityCaps: postCaps,
      scalars: postScalars,
      policy: postPolicy,
      evidence: args.evidence,
    };
  }

  return out;
}

/**
 * Optional helper: build evidence from recent action labels (if you have them).
 */
export function evidenceFromActionLabels(labels: string[]): CognitionEvidence {
  const xs = labels.filter(Boolean);
  const n = xs.length;
  if (!n) return { sampleSize: 0 };

  const isPlan = (s: string) => /plan|prepare|negotiate|ask_info|observe|analy/i.test(s);
  const isProbe = (s: string) => /observe|ask_info|probe|test|inspect|analy/i.test(s);
  const isAct = (s: string) => /move|work|attack|build|act|repair/i.test(s);
  const isWait = (s: string) => /wait|rest|idle/i.test(s);

  let plan = 0;
  let probe = 0;
  let act = 0;
  let wait = 0;
  for (const s of xs) {
    if (isPlan(s)) plan++;
    if (isProbe(s)) probe++;
    if (isAct(s)) act++;
    if (isWait(s)) wait++;
  }

  return {
    sampleSize: n,
    planRate: plan / n,
    probeRate: probe / n,
    actRate: act / n,
    waitRate: wait / n,
  };
}
