import { Branch, CharacterEntity, EntityType } from '../../../types';

const rhinedottir: CharacterEntity = {
  entityId: 'character-genshin-rhinedottir',
  type: EntityType.Character,
  title: 'Райндоттир',
  subtitle: 'Gold / The Alchemist',
  description:
    'Аморальный гений из Круга ведьм. Смотрит на катастрофу как на эксперимент и рассматривает людей как объекты.',
  tags: ['genshin', 'hexenzirkel', 'alchemist', 'observer', 'module_only'],
  versionTags: [Branch.Current],
  security: { requiredKey: 'genshin' },
  body: {
    sex_phenotype: 'typical_female',
    functional: {
      strength_upper: 0.4,
      strength_lower: 0.5,
      explosive_power: 0.3,
      aerobic_capacity: 0.6,
      recovery_speed: 0.5,
      strength_endurance_profile: 0.5,
      injury_risk: { knees: 0.2, ankles: 0.2, lower_back: 0.3, shoulders: 0.2 },
    },
    reserves: {
      energy_store_kJ: 900,
      hydration: 0.8,
      glycemia_mmol: 5.0,
      O2_margin: 0.8,
      sleep_homeostat_S: 0.3,
      circadian_phase_h: 14,
      sleep_debt_h: 1,
      immune_tone: 0.7,
    },
    acute: {
      hp: 85,
      injuries_severity: 0.05,
      pain_now: 0.1,
      temperature_c: 36.5,
      tremor: 0,
      reaction_time_ms: 240,
      fatigue: 10,
      stress: 15,
      moral_injury: 5,
    },
    regulation: { HPA_axis: 0.2, arousal: 0.2 },
  },
  identity: {
    clearance_level: 4,
    version_gates: [Branch.Current],
    self_concept: 'Чистое знание',
    oaths: [
      { key: 'pursue_knowledge', description: 'Двигаться за пределы моральных ограничений' },
    ],
  },
  axes: {
    moralLoad: 0.0,
    tabooRisk: 0.0,
    predictability: 1.0,
    threatImmediacy: 0.0,
    intimacy: 0.0,
    objectification: 1.0,
    riskTolerance: 0.9,
    meaningfulness: 1.0,
  },
  legacy: {
    origin: 'pure_science',
    rules: ['Pursue knowledge beyond limits', 'The outcome justifies the method'],
    internalizedVoices: [],
  },
};

export default rhinedottir;
