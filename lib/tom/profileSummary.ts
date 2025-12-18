
// Профиль персонажа: векторный отпечаток, структурная диагностика, стресс-профиль.
// Здесь только агрегаты из уже посчитанных метрик / латентов, без тяжёлых вычислений.

import type { 
    CharacterDossier, 
    VectorFingerprint, 
    TomStructuralDiagnosis, 
    TomStressProfile, 
    ProfileSummary,
    VectorAxis
} from "./noncontextTom";

export type { ProfileSummary };

function clamp01(x: number | undefined | null): number {
  if (x == null || Number.isNaN(x)) return 0.5;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

// Безопасно достать число из nested-структур с дефолтом 0.5.
function getNum(root: any, path: string[], fallback = 0.5): number {
  let cur = root;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return fallback;
    cur = cur[key];
  }
  if (typeof cur !== "number" || Number.isNaN(cur)) return fallback;
  return cur;
}

// --- Векторный отпечаток ---

export function computeVectorFingerprint(d: CharacterDossier): VectorFingerprint {
  const vb = (d as any).raw_data?.vector_base ?? {};
  const analysis = (d as any).analysis ?? {};
  const worldview = (d as any).analysis?.worldview ?? {};

  // Забота ↔ Власть
  const careVal = [
    getNum(vb, ["A_Safety_Care"], 0.5),
    getNum(vb, ["C_reciprocity_index"], 0.5),
    getNum(vb, ["C_coalition_loyalty"], 0.5),
  ].reduce((a, b) => a + b, 0) / 3;

  const powerVal = [
    getNum(vb, ["A_Power_Sovereignty"], 0.5),
    getNum(vb, ["A_Status_Reputation"], 0.5),
  ].reduce((a, b) => a + b, 0) / 2;

  // 0 → забота, 1 → власть
  const careVsPower = clamp01(
    0.5 + 0.7 * (powerVal - careVal),
  );

  // Порядок ↔ Хаос
  const orderVal = [
    getNum(vb, ["A_Order_Stability"], 0.5),
    getNum(analysis, ["derived_metrics", "NeedForStructure"], 0.5),
  ].reduce((a, b) => a + b, 0) / 2;

  const chaosVal = [
    getNum(analysis, ["life_goals_probs", "chaos_change"], 0.0),
    getNum(vb, ["A_Novelty_Exploration"], 0.5),
  ].reduce((a, b) => a + b, 0) / 2;

  const orderVsChaos = clamp01(
    0.5 + 0.7 * (chaosVal - orderVal), // 0 — порядок, 1 — хаос
  );

  // Жертва ↔ Эго (поведение в кризисе)
  const altruismLatent = getNum(analysis, ["latents", "altruism_index"], 0.5);
  const egoismLatent = 1 - altruismLatent;
  const sacrificeVsEgo = clamp01(
    0.5 + 0.8 * (egoismLatent - altruismLatent), // 0 — жертвенность, 1 — эго
  );

  // Доминирование
  const dominance = clamp01(
    0.6 * getNum(vb, ["C_dominance"], 0.5) +
      0.4 * getNum(analysis, ["latents", "dominance_style"], 0.5),
  );

  // Аффилиация
  const affiliation = clamp01(
    0.5 * getNum(vb, ["C_affiliation_need"], 0.5) +
      0.5 * getNum(analysis, ["latents", "social_bond_importance"], 0.5),
  );

  // Манипуляция
  const manipulation = clamp01(
    0.6 * getNum(analysis, ["latents", "manipulation_index"], 0.5) +
      0.4 * getNum(vb, ["C_reputation_sensitivity"], 0.5),
  );

  const axes: VectorAxis[] = [
    {
      id: "care_power",
      labelLeft: "Забота",
      labelRight: "Власть",
      value: careVsPower,
    },
    {
      id: "order_chaos",
      labelLeft: "Порядок",
      labelRight: "Хаос",
      value: orderVsChaos,
    },
    {
      id: "sacrifice_ego",
      labelLeft: "Жертва",
      labelRight: "Эго",
      value: sacrificeVsEgo,
    },
    {
      id: "dominance",
      labelLeft: "Ведомый",
      labelRight: "Доминант",
      value: dominance,
    },
    {
      id: "affiliation",
      labelLeft: "Одиночка",
      labelRight: "Группа",
      value: affiliation,
    },
    {
      id: "manipulation",
      labelLeft: "Прямота",
      labelRight: "Манипуляция",
      value: manipulation,
    },
  ];

  return { values: axes };
}

// --- Структурная диагностика ---

export function computeStructuralDiagnosis(d: CharacterDossier): TomStructuralDiagnosis {
  const analysis = (d as any).analysis ?? {};
  const worldview = (d as any).analysis?.worldview ?? {};

  // SELF
  const subjectivity = clamp01(
    getNum(analysis, ["latents", "self_agency"], 0.7),
  );
  const cohesion = clamp01(
    getNum(analysis, ["latents", "self_cohesion"], 0.6),
  );
  const selfGap = clamp01(
    getNum(analysis, ["derived_metrics", "MoralDissonance", "SelfGap"], 0.3),
  );
  const alignment = clamp01(1 - selfGap); // согласованность
  const split = selfGap;

  // WORLD
  const acceptance = clamp01(
    getNum(worldview, ["world_acceptance"], 0.5),
  );
  const worldThreat = clamp01(
    getNum(analysis, ["derived_metrics", "FieldWorldThreat"], 0.5),
  );
  const fairness = clamp01(
    getNum(analysis, ["derived_metrics", "WorldFairness"], 0.5),
  );
  const radicalism = clamp01(
    getNum(analysis, ["latents", "world_radicalism"], 0.5),
  );

  // OTHERS
  const care = clamp01(
    getNum(analysis, ["derived_metrics", "FieldOthersCare"], 0.5),
  );
  const trust = clamp01(
    getNum(worldview, ["people_trust"], 0.5),
  );
  const dependence = clamp01(
    getNum(analysis, ["latents", "others_dependence"], 0.5),
  );
  const othersThreat = clamp01(
    getNum(analysis, ["derived_metrics", "FieldOthersThreat"], 0.5),
  );

  // SYSTEM
  const formalism = clamp01(
    getNum(analysis, ["latents", "system_formalism"], 0.5),
  );
  const loyalty = clamp01(
    getNum(analysis, ["latents", "system_loyalty"], 0.5),
  );
  const critic = clamp01(
    getNum(analysis, ["latents", "system_criticism"], 0.5),
  );
  const sacred = clamp01(
    getNum(analysis, ["latents", "system_sacralization"], 0.5),
  );

  return {
    SELF: { subjectivity, cohesion, alignment, split },
    WORLD: { acceptance, threat: worldThreat, fairness, radicalism },
    OTHERS: { care, trust, dependence, threat: othersThreat },
    SYSTEM: { formalism, loyalty, critic, sacred },
  };
}

// --- Стресс-профиль ---

export function computeStressProfile(d: CharacterDossier): TomStressProfile {
  const analysis = (d as any).analysis ?? {};

  const ch = clamp01(getNum(analysis, ["derived_metrics", "CH"], 0.5));
  const sd = clamp01(getNum(analysis, ["derived_metrics", "SD"], 0.5));
  const rp = clamp01(getNum(analysis, ["derived_metrics", "RP"], 0.5));
  const so = clamp01(getNum(analysis, ["derived_metrics", "SO"], 0.5));
  const cl = clamp01(getNum(analysis, ["derived_metrics", "CL"], 0.5));

  const traumaLoad = clamp01(
    getNum(analysis, ["latents", "trauma_load"], 0.5),
  );
  const hypervigilance = clamp01(
    getNum(analysis, ["latents", "hypervigilance"], 0.5),
  );
  const stressTolerance = clamp01(
    getNum(analysis, ["latents", "stress_tolerance"], 0.5),
  );

  const copingAvoidance = clamp01(
    getNum(analysis, ["latents", "coping_avoidance"], 0.5),
  );
  const copingAggression = clamp01(
    getNum(analysis, ["latents", "coping_aggression"], 0.5),
  );
  const copingRescue = clamp01(
    getNum(analysis, ["latents", "coping_rescue"], 0.5),
  );
  const copingOvercontrol = clamp01(
    getNum(analysis, ["latents", "coping_overcontrol"], 0.5),
  );

  return {
    state: {
      cognitiveLoad: ch,
      emotionalDepletion: sd,
      bodyReserve: rp,
      overcontrol: so,
      volatility: cl,
    },
    trait: {
      traumaLoad,
      hypervigilance,
      stressTolerance,
    },
    coping: {
      avoidance: copingAvoidance,
      aggression: copingAggression,
      rescue: copingRescue,
      overcontrol: copingOvercontrol,
    },
  };
}

export function computeProfileSummary(d: CharacterDossier): ProfileSummary {
  return {
    vector: computeVectorFingerprint(d),
    structural: computeStructuralDiagnosis(d),
    stress: computeStressProfile(d),
  };
}
