import type {
  ThinkingProfile,
  ActivityCaps,
  ThinkingAxisA,
  ThinkingAxisB,
  ThinkingAxisC,
  ThinkingAxisD,
} from '../../types';

type CharacterEntityLike = {
  vector_base?: Record<string, any>;
  latents?: Record<string, number>;
  competencies?: Record<string, any>;
};

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const num = (x: unknown, fallback = 0) => {
  const value = Number(x);
  return Number.isFinite(value) ? value : fallback;
};

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

function pick<T extends string>(m: Record<T, number>): T {
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

const avg = (...xs: number[]) =>
  xs.length ? xs.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0) / xs.length : 0;

function V(c: CharacterEntityLike, key: string, fallback = 0.5) {
  return clamp01(num(c.vector_base?.[key], fallback));
}

function L(c: CharacterEntityLike, key: string, fallback = 0.5) {
  return clamp01(num(c.latents?.[key], fallback));
}

// Optional helper: allow some fields from competencies if you use them.
function C(c: CharacterEntityLike, key: string, fallback = 0.5) {
  return clamp01(num((c.competencies as Record<string, any> | undefined)?.[key], fallback));
}

/**
 * Константный профиль “мышление/деятельность” (не зависит от тиков).
 * Источники: latents (если есть) + vector_base (основной источник).
 */
export function deriveThinkingAndActivityFromCharacter(c: CharacterEntityLike): {
  thinking: ThinkingProfile;
  activityCaps: ActivityCaps;
} {
  // базовые опоры (берём латенты если есть, иначе vector_base)
  const formal = avg(L(c, 'FORMAL', 0.5), V(c, 'E_Model_calibration', 0.5), V(c, 'A_Legitimacy_Procedure', 0.5));
  const enactive = avg(L(c, 'ACTION', 0.5), V(c, 'E_Skill_ops_fieldcraft', 0.5), V(c, 'D_fine_motor', 0.5));
  const imagery = avg(L(c, 'IMAGERY', 0.5), V(c, 'A_Aesthetic_Meaning', 0.5), V(c, 'E_KB_topos', 0.5));
  const verbal = avg(L(c, 'VERBAL', 0.5), V(c, 'A_Knowledge_Truth', 0.5), V(c, 'E_KB_civic', 0.5));
  const agency = avg(L(c, 'AGENCY', 0.5), V(c, 'B_goal_coherence', 0.5), V(c, 'G_Narrative_agency', 0.5));
  const ambiguityTol = avg(V(c, 'B_tolerance_ambiguity', 0.5), V(c, 'F_Plasticity', 0.5), 1 - V(c, 'D_HPA_reactivity', 0.5));
  const metacog = avg(V(c, 'G_Metacog_accuracy', 0.5), ambiguityTol, V(c, 'E_Model_calibration', 0.5));
  const explore = avg(V(c, 'B_exploration_rate', 0.4), V(c, 'F_Plasticity', 0.5), imagery);
  const tom = avg(V(c, 'C_reciprocity_index', 0.5), V(c, 'C_dominance_empathy', 0.5), V(c, 'C_coalition_loyalty', 0.5));

  const representation = normalize<ThinkingAxisA>({
    enactive: clamp01(avg(enactive, 1 - formal)),
    imagery: clamp01(imagery),
    verbal: clamp01(verbal),
    formal: clamp01(formal),
  });

  const inference = normalize<ThinkingAxisB>({
    deductive: clamp01(avg(formal, V(c, 'A_Legitimacy_Procedure', 0.5))),
    inductive: clamp01(avg(explore, V(c, 'E_Epi_volume', 0.5))),
    abductive: clamp01(avg(ambiguityTol, metacog, V(c, 'A_Knowledge_Truth', 0.5))),
    causal: clamp01(avg(V(c, 'E_Skill_causal_surgery', 0.5), agency, V(c, 'E_Model_calibration', 0.5))),
    bayesian: clamp01(avg(metacog, ambiguityTol, 1 - V(c, 'D_HPA_reactivity', 0.5))),
  });

  const control = normalize<ThinkingAxisC>({
    intuitive: clamp01(avg(V(c, 'B_decision_temperature', 0.5), 1 - V(c, 'B_cooldown_discipline', 0.5))),
    analytic: clamp01(avg(1 - V(c, 'B_decision_temperature', 0.5), V(c, 'B_cooldown_discipline', 0.5), formal)),
    metacognitive: clamp01(metacog),
  });

  const fn = normalize<ThinkingAxisD>({
    understanding: clamp01(avg(V(c, 'A_Knowledge_Truth', 0.5), metacog)),
    planning: clamp01(avg(V(c, 'B_goal_coherence', 0.5), agency, 1 - V(c, 'B_discount_rate', 0.5))),
    critical: clamp01(avg(metacog, verbal, 1 - V(c, 'C_reputation_sensitivity', 0.5))),
    creative: clamp01(avg(imagery, explore, V(c, 'A_Aesthetic_Meaning', 0.5))),
    normative: clamp01(avg(V(c, 'A_Justice_Fairness', 0.5), V(c, 'A_Legitimacy_Procedure', 0.5), formal)),
    social: clamp01(tom),
  });

  const thinking: ThinkingProfile = {
    representation,
    inference,
    control,
    function: fn,
    dominantA: pick(representation),
    dominantB: pick(inference),
    dominantC: pick(control),
    dominantD: pick(fn),
    metacognitiveGain: clamp01(control.metacognitive),
  };

  const activityCaps: ActivityCaps = {
    operations: clamp01(avg(enactive, V(c, 'B_cooldown_discipline', 0.5))),
    actions: clamp01(avg(agency, thinking.function.planning, thinking.function.critical)),
    activity: clamp01(avg(V(c, 'G_Narrative_agency', 0.5), thinking.metacognitiveGain, V(c, 'A_Aesthetic_Meaning', 0.5))),

    reactive: clamp01(avg(V(c, 'D_HPA_reactivity', 0.5), V(c, 'B_decision_temperature', 0.5))),
    proactive: clamp01(avg(agency, thinking.function.planning, 1 - V(c, 'B_discount_rate', 0.5))),
    regulatory: clamp01(avg(V(c, 'B_cooldown_discipline', 0.5), thinking.metacognitiveGain)),
    reflective: clamp01(avg(thinking.metacognitiveGain, V(c, 'F_Value_update_rate', 0.5), ambiguityTol)),

    sensorimotor: clamp01(avg(thinking.representation.enactive, enactive)),
    instrumental: clamp01(avg(thinking.representation.verbal, thinking.representation.formal, verbal)),
    communicative: clamp01(avg(tom, C(c, 'diplomacy', 0.5), V(c, 'E_Skill_diplomacy_negotiation', 0.5))),
    constructor: clamp01(avg(thinking.representation.formal, thinking.function.planning, V(c, 'E_Skill_repair_topology', 0.5))),
    creative: clamp01(avg(thinking.function.creative, imagery, explore)),
    normative: clamp01(avg(thinking.function.normative, formal)),
    existential: clamp01(avg(thinking.metacognitiveGain, V(c, 'G_Narrative_agency', 0.5), ambiguityTol)),
  };

  return { thinking, activityCaps };
}
