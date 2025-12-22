import { Branch, CharacterEntity, EntityType } from '../../../types';

const vedrfolnir: CharacterEntity = {
  entityId: 'character-genshin-vedrfolnir',
  type: EntityType.Character,
  title: 'Ведрфольнир',
  subtitle: 'The Visionary / The Cynic',
  description:
    'Основатель Приказа Бездны, видящий временные линии сразу. Циничный свидетель катастрофы, которую считает неизбежной.',
  tags: ['genshin', 'abyss', 'seer', 'visionary'],
  versionTags: [Branch.Current],
  body: {
    sex_phenotype: 'typical_male',
    functional: {
      strength_upper: 0.5,
      strength_lower: 0.5,
      explosive_power: 0.4,
      aerobic_capacity: 0.6,
      recovery_speed: 0.6,
      strength_endurance_profile: 0.6,
      injury_risk: { knees: 0.3, ankles: 0.3, lower_back: 0.3, shoulders: 0.3 },
    },
    reserves: {
      energy_store_kJ: 950,
      hydration: 0.8,
      glycemia_mmol: 4.9,
      O2_margin: 0.8,
      sleep_homeostat_S: 0.5,
      circadian_phase_h: 16,
      sleep_debt_h: 0,
      immune_tone: 0.8,
    },
    acute: {
      hp: 90,
      injuries_severity: 0.05,
      pain_now: 0.1,
      temperature_c: 36.7,
      tremor: 0,
      reaction_time_ms: 240,
      fatigue: 15,
      stress: 10,
      moral_injury: 20,
    },
    regulation: { HPA_axis: 0.3, arousal: 0.2 },
  },
  identity: {
    clearance_level: 4,
    version_gates: [Branch.Current],
    self_concept: 'Свидетель сценария',
    oaths: [
      { key: 'observe', description: 'Сохранять дистанцию и читать линии будущего' },
    ],
  },
  axes: {
    timePressure: 0.0,
    controllability: 0.1,
    hope: 0.0,
    clarity: 1.0,
    hostility: 0.2,
    leverage: 0.8,
  },
};

export default vedrfolnir;
