import type { GoalSpecV1 } from './types';

/**
 * Canonical starter registry for GoalSpecV1.
 *
 * Scope: intentionally small (foundation set) to keep migration safe and observable.
 * Legacy goal space remains active in parallel until downstream consumers fully migrate.
 */
export const GOAL_SPECS_V1: GoalSpecV1[] = [
  {
    id: 'reduce_self_threat',
    family: 'survival',
    label: 'Снизить угрозу себе',
    description: 'Агент стремится уменьшить непосредственную опасность для себя.',
    targeting: 'self',
    arisesFrom: [
      { kind: 'appraisal_tag', tags: ['danger_to_self'], minScore: 0.35 },
      { kind: 'metric', metric: 'hazard', op: '>=', value: 0.35 },
    ],
    preconditions: [],
    blockers: [],
    priorityBase: 0.2,
    priorityRules: [
      { kind: 'weighted_appraisal', tag: 'danger_to_self', weight: 1.3, clamp: [0, 2] },
      { kind: 'weighted_metric', metric: 'self_stress', weight: 0.25, clamp: [0, 0.6] },
    ],
    compatibleIntents: ['withdraw', 'seek_cover', 'move_to_safe_place', 'warn_group'],
    tags: ['survival', 'hazard'],
  },
  {
    id: 'stabilize_other',
    family: 'social',
    label: 'Стабилизировать другого',
    description: 'Снизить дистресс, боль или потерю контроля у другого персонажа.',
    targeting: 'other',
    arisesFrom: [
      { kind: 'appraisal_tag', tags: ['target_distress', 'target_injury'], minScore: 0.35, targetRole: 'target' },
    ],
    preconditions: [
      { kind: 'target_exists' },
      {
        kind: 'any',
        conditions: [
          { kind: 'metric', metric: 'closeness', op: '>=', value: 0.3 },
          { kind: 'metric', metric: 'dependency', op: '>=', value: 0.3 },
          { kind: 'instrumental_need', minValue: 0.35 },
        ],
      },
    ],
    blockers: [
      { kind: 'metric', metric: 'self_stress', op: '>=', value: 0.95 },
      {
        kind: 'not',
        condition: {
          kind: 'any',
          conditions: [
            { kind: 'target_communicable', maxDistance: 3 },
            { kind: 'target_reachable', maxDistance: 6 },
          ],
        },
      },
    ],
    priorityBase: 0.1,
    priorityRules: [
      { kind: 'weighted_appraisal', tag: 'target_distress', weight: 1.0, clamp: [0, 1.5] },
      { kind: 'weighted_appraisal', tag: 'target_injury', weight: 1.2, clamp: [0, 1.7] },
      { kind: 'weighted_metric', metric: 'closeness', weight: 0.35, clamp: [0, 0.7] },
      { kind: 'weighted_metric', metric: 'utility_of_target', weight: 0.45, clamp: [0, 0.8] },
    ],
    compatibleIntents: ['reassure_target', 'assist_target', 'escort_target', 'treat_target'],
    conflictsWith: ['punish_target'],
    tags: ['social_support', 'care'],
  },
  {
    id: 'verify_claim',
    family: 'epistemic',
    label: 'Проверить утверждение',
    description: 'Понизить неопределённость насчёт слуха, заявления или наблюдения.',
    targeting: 'optional_other',
    arisesFrom: [
      { kind: 'appraisal_tag', tags: ['information_gap', 'suspicion'], minScore: 0.3 },
      { kind: 'metric', metric: 'uncertainty', op: '>=', value: 0.45 },
    ],
    preconditions: [],
    blockers: [
      { kind: 'metric', metric: 'hazard', op: '>=', value: 0.95 },
    ],
    priorityBase: 0.05,
    priorityRules: [
      { kind: 'weighted_metric', metric: 'uncertainty', weight: 1.0, clamp: [0, 1.4] },
      { kind: 'weighted_appraisal', tag: 'suspicion', weight: 0.8, clamp: [0, 1.0] },
    ],
    compatibleIntents: ['ask_fact', 'observe_target', 'inspect_location', 'crosscheck_claim'],
    tags: ['epistemic'],
  },
  {
    id: 'preserve_cooperation',
    family: 'social',
    label: 'Сохранить кооперацию',
    description: 'Удержать рабочее взаимодействие с нужным персонажем или группой.',
    targeting: 'other',
    arisesFrom: [
      { kind: 'appraisal_tag', tags: ['cooperation_risk', 'relationship_strain'], minScore: 0.25, targetRole: 'target' },
      { kind: 'instrumental_need', minValue: 0.35 },
    ],
    preconditions: [
      { kind: 'target_exists' },
    ],
    blockers: [
      { kind: 'appraisal_tag', tags: ['danger_to_self'], minScore: 0.95 },
    ],
    priorityBase: 0.08,
    priorityRules: [
      { kind: 'weighted_metric', metric: 'utility_of_target', weight: 0.8, clamp: [0, 1.2] },
      { kind: 'weighted_metric', metric: 'dependency', weight: 0.6, clamp: [0, 1.0] },
      { kind: 'weighted_appraisal', tag: 'relationship_strain', weight: 0.7, clamp: [0, 1.0] },
    ],
    compatibleIntents: ['clarify', 'coordinate', 'apologize', 'reassure_target'],
    tags: ['cooperation'],
  },
  {
    id: 'confront_threat_source',
    family: 'identity',
    label: 'Противостоять источнику угрозы',
    description: 'Подавить или ограничить персонажа, воспринимаемого как источник опасности.',
    targeting: 'other',
    arisesFrom: [
      { kind: 'appraisal_tag', tags: ['target_as_threat', 'norm_breach_by_target'], minScore: 0.35, targetRole: 'target' },
    ],
    preconditions: [
      { kind: 'target_exists' },
    ],
    blockers: [
      { kind: 'metric', metric: 'self_health', op: '<=', value: 0.15 },
      { kind: 'metric', metric: 'distance', op: '>', value: 8 },
    ],
    priorityBase: 0,
    priorityRules: [
      { kind: 'weighted_appraisal', tag: 'target_as_threat', weight: 1.1, clamp: [0, 1.8] },
      { kind: 'weighted_metric', metric: 'authority', weight: 0.4, clamp: [0, 0.6] },
    ],
    compatibleIntents: ['challenge_target', 'threaten_target', 'attack_target', 'command_target'],
    conflictsWith: ['stabilize_other'],
    tags: ['conflict'],
  },
  {
    id: 'restore_self_control',
    family: 'affect',
    label: 'Восстановить самоконтроль',
    description: 'Снизить собственную перегрузку и вернуть способность действовать осмысленно.',
    targeting: 'self',
    arisesFrom: [
      { kind: 'metric', metric: 'self_stress', op: '>=', value: 0.65 },
      { kind: 'metric', metric: 'self_fatigue', op: '>=', value: 0.65 },
    ],
    preconditions: [],
    blockers: [],
    priorityBase: 0.1,
    priorityRules: [
      { kind: 'weighted_metric', metric: 'self_stress', weight: 1.0, clamp: [0, 1.5] },
      { kind: 'weighted_metric', metric: 'self_fatigue', weight: 0.8, clamp: [0, 1.2] },
    ],
    compatibleIntents: ['pause', 'withdraw', 'breathe', 'seek_support'],
    tags: ['self_regulation'],
  },
  {
    id: 'maintain_trust_signal',
    family: 'social',
    label: 'Поддержать сигнал доверия',
    description: 'Удержать доверительный контур при умеренном напряжении отношений.',
    targeting: 'other',
    arisesFrom: [
      { kind: 'metric', metric: 'trust', op: '<=', value: 0.45 },
      { kind: 'appraisal_tag', tags: ['relationship_strain'], minScore: 0.25, targetRole: 'target' },
    ],
    preconditions: [{ kind: 'target_exists' }],
    blockers: [{ kind: 'metric', metric: 'hazard', op: '>=', value: 0.9 }],
    priorityBase: 0.03,
    priorityRules: [
      { kind: 'weighted_metric', metric: 'dependency', weight: 0.5, clamp: [0, 0.8] },
      { kind: 'weighted_metric', metric: 'closeness', weight: 0.4, clamp: [0, 0.6] },
    ],
    compatibleIntents: ['clarify', 'reassure_target', 'apologize'],
    tags: ['trust'],
  },
  {
    id: 'deescalate_interaction',
    family: 'affect',
    label: 'Деэскалировать взаимодействие',
    description: 'Снизить интенсивность конфликта без прямой конфронтации.',
    targeting: 'other',
    arisesFrom: [
      { kind: 'appraisal_tag', tags: ['target_as_threat', 'cooperation_risk'], minScore: 0.3, targetRole: 'target' },
    ],
    preconditions: [{ kind: 'target_exists' }],
    blockers: [{ kind: 'metric', metric: 'distance', op: '>', value: 10 }],
    priorityBase: 0.04,
    priorityRules: [
      { kind: 'weighted_metric', metric: 'hazard', weight: 0.7, clamp: [0, 1.0] },
      { kind: 'weighted_metric', metric: 'trust', weight: -0.3, clamp: [-0.3, 0] },
    ],
    compatibleIntents: ['withdraw', 'reassure_target', 'coordinate'],
    conflictsWith: ['confront_threat_source'],
    tags: ['deescalation'],
  },
  {
    id: 'protect_status_position',
    family: 'identity',
    label: 'Сохранить статусную позицию',
    description: 'Поддержать социальный ранг и избежать потери влияния.',
    targeting: 'other',
    arisesFrom: [
      { kind: 'appraisal_tag', tags: ['status_loss_risk', 'norm_breach_by_target'], minScore: 0.3, targetRole: 'target' },
      { kind: 'metric', metric: 'authority', op: '<=', value: 0.45 },
    ],
    preconditions: [{ kind: 'target_exists' }],
    blockers: [{ kind: 'metric', metric: 'self_health', op: '<=', value: 0.1 }],
    priorityBase: 0,
    priorityRules: [
      { kind: 'weighted_metric', metric: 'authority', weight: -0.5, clamp: [-0.5, 0] },
      { kind: 'weighted_appraisal', tag: 'status_loss_risk', weight: 1.0, clamp: [0, 1.2] },
    ],
    compatibleIntents: ['command_target', 'challenge_target', 'coordinate'],
    tags: ['status'],
  },
  {
    id: 'recover_resources',
    family: 'resource',
    label: 'Восстановить ресурсы',
    description: 'Снизить истощение и вернуть оперативный ресурс.',
    targeting: 'self',
    arisesFrom: [
      { kind: 'metric', metric: 'self_fatigue', op: '>=', value: 0.6 },
      { kind: 'metric', metric: 'self_health', op: '<=', value: 0.4 },
    ],
    preconditions: [],
    blockers: [{ kind: 'metric', metric: 'hazard', op: '>=', value: 0.85 }],
    priorityBase: 0.05,
    priorityRules: [
      { kind: 'weighted_metric', metric: 'self_fatigue', weight: 0.9, clamp: [0, 1.2] },
      { kind: 'weighted_metric', metric: 'self_health', weight: -0.5, clamp: [-0.5, 0] },
    ],
    compatibleIntents: ['pause', 'seek_cover', 'move_to_safe_place'],
    tags: ['resource_recovery'],
  },
  {
    id: 'maintain_contact_channel',
    family: 'procedural',
    label: 'Удерживать канал связи',
    description: 'Сохранять коммуникационную связность с нужной целью.',
    targeting: 'optional_other',
    arisesFrom: [
      { kind: 'instrumental_need', minValue: 0.3 },
      { kind: 'appraisal_tag', tags: ['information_gap'], minScore: 0.25 },
    ],
    preconditions: [{ kind: 'target_exists' }],
    blockers: [
      {
        kind: 'not',
        condition: { kind: 'target_communicable', maxDistance: 4 },
      },
    ],
    priorityBase: 0.02,
    priorityRules: [
      { kind: 'weighted_metric', metric: 'utility_of_target', weight: 0.7, clamp: [0, 1.0] },
      { kind: 'weighted_metric', metric: 'uncertainty', weight: 0.4, clamp: [0, 0.6] },
    ],
    compatibleIntents: ['ask_fact', 'coordinate', 'share_signal'],
    tags: ['communication'],
  },
];
