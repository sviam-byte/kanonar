

import {
  BodyModel,
  BodyStructural,
  BodyFunctional,
  BodyAdipose,
  BodyHormonal,
  BodyReproductiveState,
  SexPhenotype,
} from '../types';

const femaleStructural: BodyStructural = {
  height_cm: 170,
  mass_kg: 70,
  shoulder_width_cm: 40,
  pelvis_width_cm: 44,
  limb_lengths: {
    arm_cm: 60,
    leg_cm: 78,
  },
  hand_span_cm: 18,
  foot_length_cm: 24,
  center_of_mass: {
    height_rel: 0.53,
    depth_rel: 0.55,
  },
  joint_laxity: 0.6,
};

const maleStructural: BodyStructural = {
  height_cm: 178,
  mass_kg: 78,
  shoulder_width_cm: 44,
  pelvis_width_cm: 38,
  limb_lengths: {
    arm_cm: 64,
    leg_cm: 84,
  },
  hand_span_cm: 21,
  foot_length_cm: 27,
  center_of_mass: {
    height_rel: 0.56,
    depth_rel: 0.5,
  },
  joint_laxity: 0.4,
};

const femaleFunctional: BodyFunctional = {
  strength_upper: 0.4,
  strength_lower: 0.55,
  explosive_power: 0.5,
  aerobic_capacity: 0.6,
  recovery_speed: 0.6,
  strength_endurance_profile: 0.7,
  injury_risk: {
    knees: 0.7,
    ankles: 0.6,
    lower_back: 0.5,
    shoulders: 0.4,
  },
};

const maleFunctional: BodyFunctional = {
  strength_upper: 0.7,
  strength_lower: 0.8,
  explosive_power: 0.7,
  aerobic_capacity: 0.65,
  recovery_speed: 0.55,
  strength_endurance_profile: 0.6,
  injury_risk: {
    knees: 0.5,
    ankles: 0.5,
    lower_back: 0.6,
    shoulders: 0.6,
  },
};

const femaleAdipose: BodyAdipose = {
  body_fat_percent: 25,
  metabolic_reserve: 0.6,
  fat_distribution: 'gynoid',
};

const maleAdipose: BodyAdipose = {
  body_fat_percent: 16,
  metabolic_reserve: 0.5,
  fat_distribution: 'android',
};

const femaleHormonal: BodyHormonal = {
  has_cyclic_hormones: true,
  cycle_length_days: 28,
  cycle_phase: 0,
  cycle_effects: {
    pain_sensitivity: {
      follicular: 0.95,
      ovulation: 1.0,
      luteal: 1.05,
      menstruation: 1.1,
    },
    fatigue_resistance: {
      follicular: 1.0,
      ovulation: 1.05,
      luteal: 0.95,
      menstruation: 0.9,
    },
    mood_stability: {
      follicular: 1.0,
      ovulation: 1.0,
      luteal: 0.9,
      menstruation: 0.85,
    },
  },
  androgen_baseline: 0.2,
  androgen_circadian_amplitude: 0.1,
  stress_sensitivity: 0.4,
  sleep_sensitivity: 0.5,
  baseline_testosterone: 0.3,
  baseline_estrogen: 0.8,
};

const maleHormonal: BodyHormonal = {
  has_cyclic_hormones: false,
  cycle_length_days: undefined,
  cycle_phase: undefined,
  cycle_effects: undefined,
  androgen_baseline: 0.7,
  androgen_circadian_amplitude: 0.2,
  stress_sensitivity: 0.7,
  sleep_sensitivity: 0.7,
  baseline_testosterone: 0.8,
  baseline_estrogen: 0.3,
};

const femaleReproductive: BodyReproductiveState = {
  can_be_pregnant: true,
  is_pregnant: false,
  gestation_week: undefined,
  fatigue_penalty: 0,
  heart_rate_increase: 0,
  injury_risk_increase: 0,
  emotional_lability: 0,
};

const maleReproductive: BodyReproductiveState = {
  can_be_pregnant: false,
  is_pregnant: false,
  gestation_week: undefined,
  fatigue_penalty: 0,
  heart_rate_increase: 0,
  injury_risk_increase: 0,
  emotional_lability: 0,
};

// Helper to provide default runtime state
const defaultRuntimeState = {
    reserves: {
        energy: 1.0,
        hydration: 1.0,
        O2_margin: 1.0,
        sleep_homeostat_S: 0.0,
        sleep_debt_h: 0,
        immune_tone: 0.5,
        circadian_phase_h: 12, // Added missing property
    },
    acute: {
        hp: 100,
        injuries_severity: 0,
        pain_now: 0,
        temperature_c: 36.6,
        tremor: 0,
        reaction_time_ms: 250,
        fatigue: 0,
        stress: 0,
        moral_injury: 0,
    },
    regulation: {
        HPA_axis: 0.5,
        arousal: 0.5,
    }
};

export const defaultFemaleBody: BodyModel = {
  sex_phenotype: 'typical_female',
  structural: femaleStructural,
  functional: femaleFunctional,
  adipose: femaleAdipose,
  hormonal: femaleHormonal,
  reproductive: femaleReproductive,
  ...defaultRuntimeState,
};

export const defaultMaleBody: BodyModel = {
  sex_phenotype: 'typical_male',
  structural: maleStructural,
  functional: maleFunctional,
  adipose: maleAdipose,
  hormonal: maleHormonal,
  reproductive: maleReproductive,
  ...defaultRuntimeState,
};

export function applySexPreset(current: BodyModel, target: SexPhenotype): BodyModel {
  // Explicitly preserve legacy fields by spreading current
  const base = { ...current } as any;

  // Ensure legacy fields exist if they are missing (to avoid crashes in legacy code)
  if (!base.constitution) base.constitution = {};
  if (!base.capacity) base.capacity = {};
  if (!base.reserves) base.reserves = {};
  if (!base.acute) base.acute = {};
  if (!base.regulation) base.regulation = {};
  
  switch (target) {
    case 'typical_female':
      return { ...base, ...defaultFemaleBody, sex_phenotype: 'typical_female' };
    case 'typical_male':
      return { ...base, ...defaultMaleBody, sex_phenotype: 'typical_male' };
    case 'intermediate':
      // упрощённый смешанный вариант
      return {
        ...base,
        ...defaultFemaleBody, // Ensure all new fields exist
        sex_phenotype: 'intermediate',
        structural: {
          ...femaleStructural,
          height_cm: (femaleStructural.height_cm + maleStructural.height_cm) / 2,
          mass_kg: (femaleStructural.mass_kg + maleStructural.mass_kg) / 2,
        },
        functional: {
          ...femaleFunctional,
          strength_upper:
            (femaleFunctional.strength_upper + maleFunctional.strength_upper) / 2,
          strength_lower:
            (femaleFunctional.strength_lower + maleFunctional.strength_lower) / 2,
        },
        adipose: {
          ...femaleAdipose,
          body_fat_percent:
            (femaleAdipose.body_fat_percent + maleAdipose.body_fat_percent) / 2,
          fat_distribution: 'mixed',
        },
        hormonal: {
          ...femaleHormonal,
          has_cyclic_hormones: false,
          androgen_baseline:
            (femaleHormonal.androgen_baseline + maleHormonal.androgen_baseline) / 2,
        },
      };
    case 'custom':
    default:
      return { ...base, sex_phenotype: 'custom' };
  }
}