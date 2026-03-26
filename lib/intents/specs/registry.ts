import type { IntentSpecV1 } from './types';

/**
 * 15 canonical intents for Layer F.
 *
 * Design rule: each intent is a genuinely distinct STRATEGY.
 * If two intents always produce the same runtime action → merge or differentiate.
 *
 * Every intent now has:
 *   - family (communicative/movement/physical/epistemic/regulatory/coordinative)
 *   - targeting (who this intent is directed at)
 *   - prerequisites (Condition[] — spatial, metric, appraisal gates)
 *   - blockers (Condition[] — when to suppress)
 *   - dialogueAct / desiredEffect (for communicative family)
 *   - groundingHints (preferred action schema families)
 *   - cooldownTicks (anti-spam)
 */
export const INTENT_SPECS_V1: IntentSpecV1[] = [
  // ═══════════════════════════ MOVEMENT ═══════════════════════════
  {
    id: 'withdraw',
    family: 'movement',
    label: 'Отступить',
    description: 'Увеличить дистанцию от источника угрозы.',
    allowedGoalIds: ['reduce_self_threat', 'restore_self_control', 'deescalate_interaction'],
    targeting: 'self',
    prerequisites: [
      { kind: 'appraisal_tag', tags: ['danger_to_self'], minScore: 0.2 },
    ],
    blockers: [],
    scoreBase: 0.06,
    scoreModifiers: [
      { kind: 'weighted_metric', metric: 'hazard', weight: 0.8, clamp: [0, 1.2] },
      { kind: 'weighted_metric', metric: 'self_stress', weight: 0.3, clamp: [0, 0.5] },
    ],
    desiredEffect: 'increase_safety',
    groundingHints: ['move', 'escape', 'flee'],
    tags: ['survival', 'spatial'],
  },
  {
    id: 'seek_cover',
    family: 'movement',
    label: 'Найти укрытие',
    description: 'Переместиться в более безопасную позицию с укрытием.',
    allowedGoalIds: ['reduce_self_threat'],
    targeting: 'self',
    prerequisites: [
      { kind: 'metric', metric: 'hazard', op: '>=', value: 0.3 },
    ],
    blockers: [
      { kind: 'metric', metric: 'self_health', op: '<=', value: 0.05 },
    ],
    scoreBase: 0.08,
    scoreModifiers: [
      { kind: 'weighted_metric', metric: 'hazard', weight: 1.0, clamp: [0, 1.3] },
    ],
    desiredEffect: 'find_cover',
    groundingHints: ['move', 'move_cell'],
    tags: ['survival', 'spatial'],
  },
  {
    id: 'approach_target',
    family: 'movement',
    label: 'Подойти к цели',
    description: 'Сократить дистанцию для последующего взаимодействия.',
    allowedGoalIds: ['stabilize_other', 'verify_claim', 'confront_threat_source', 'preserve_cooperation'],
    targeting: 'other',
    prerequisites: [
      { kind: 'target_exists' },
      { kind: 'metric', metric: 'distance', op: '>', value: 2 },
    ],
    blockers: [
      { kind: 'metric', metric: 'hazard', op: '>=', value: 0.9 },
    ],
    scoreBase: 0.05,
    scoreModifiers: [
      { kind: 'weighted_metric', metric: 'distance', weight: 0.3, clamp: [0, 0.8] },
    ],
    desiredEffect: 'enable_interaction',
    groundingHints: ['move', 'move_cell'],
    tags: ['spatial', 'enabling'],
  },

  // ═══════════════════════════ COMMUNICATIVE ═══════════════════════════
  {
    id: 'warn_group',
    family: 'communicative',
    label: 'Предупредить группу',
    description: 'Оповестить ближних об угрозе.',
    allowedGoalIds: ['reduce_self_threat', 'preserve_cooperation', 'stabilize_other'],
    targeting: 'other',
    prerequisites: [
      { kind: 'appraisal_tag', tags: ['danger_to_self', 'danger_to_other'], minScore: 0.3 },
      { kind: 'target_communicable', maxDistance: 4 },
    ],
    blockers: [],
    scoreBase: 0.02,
    scoreModifiers: [
      { kind: 'weighted_appraisal', tag: 'danger_to_other', weight: 0.8, clamp: [0, 1.0] },
      { kind: 'weighted_appraisal', tag: 'danger_to_self', weight: 0.4, clamp: [0, 0.6] },
    ],
    dialogueAct: 'warn',
    desiredEffect: 'increase_target_alertness',
    groundingHints: ['talk', 'signal'],
    cooldownTicks: 2,
    tags: ['safety', 'verbal'],
  },
  {
    id: 'reassure_target',
    family: 'communicative',
    label: 'Успокоить цель',
    description: 'Снизить дистресс цели через речевое воздействие.',
    allowedGoalIds: ['stabilize_other', 'maintain_trust_signal'],
    targeting: 'other',
    prerequisites: [
      { kind: 'target_communicable', maxDistance: 3 },
    ],
    blockers: [
      { kind: 'not_repeated', actionIds: ['reassure_target'], horizon: 4, maxCount: 2 },
    ],
    scoreBase: 0.06,
    scoreModifiers: [
      { kind: 'weighted_appraisal', tag: 'target_distress', weight: 0.8, clamp: [0, 1.2] },
      { kind: 'weighted_metric', metric: 'closeness', weight: 0.3, clamp: [0, 0.5] },
      { kind: 'weighted_metric', metric: 'self_stress', weight: -0.4, clamp: [-0.4, 0] },
    ],
    dialogueAct: 'reassure',
    desiredEffect: 'reduce_target_stress',
    groundingHints: ['comfort', 'talk'],
    cooldownTicks: 3,
    tags: ['care', 'verbal'],
  },
  {
    id: 'ask_fact',
    family: 'communicative',
    label: 'Запросить информацию',
    description: 'Прямо спросить для снижения неопределённости.',
    allowedGoalIds: ['verify_claim', 'maintain_contact_channel'],
    targeting: 'other',
    prerequisites: [
      { kind: 'target_communicable', maxDistance: 3 },
      { kind: 'metric', metric: 'uncertainty', op: '>=', value: 0.3 },
    ],
    blockers: [
      { kind: 'metric', metric: 'trust', op: '<', value: 0.15 },
    ],
    scoreBase: 0.04,
    scoreModifiers: [
      { kind: 'weighted_metric', metric: 'uncertainty', weight: 0.9, clamp: [0, 1.2] },
      { kind: 'weighted_metric', metric: 'trust', weight: 0.3, clamp: [0, 0.5] },
    ],
    dialogueAct: 'ask',
    desiredEffect: 'reduce_uncertainty',
    groundingHints: ['question_about', 'talk'],
    cooldownTicks: 2,
    tags: ['epistemic', 'verbal'],
  },
  {
    id: 'clarify',
    family: 'communicative',
    label: 'Прояснить',
    description: 'Устранить двусмысленность в коммуникации.',
    allowedGoalIds: ['preserve_cooperation', 'maintain_trust_signal'],
    targeting: 'other',
    prerequisites: [
      { kind: 'target_communicable', maxDistance: 3 },
      { kind: 'appraisal_tag', tags: ['relationship_strain', 'cooperation_risk'], minScore: 0.2 },
    ],
    blockers: [],
    scoreBase: 0.03,
    scoreModifiers: [
      { kind: 'weighted_appraisal', tag: 'relationship_strain', weight: 0.6, clamp: [0, 0.8] },
    ],
    dialogueAct: 'inform',
    desiredEffect: 'reduce_ambiguity',
    groundingHints: ['talk'],
    cooldownTicks: 3,
    tags: ['cooperation', 'verbal'],
  },
  {
    id: 'coordinate',
    family: 'coordinative',
    label: 'Координировать',
    description: 'Согласовать план действий с другим агентом.',
    allowedGoalIds: ['preserve_cooperation', 'maintain_contact_channel', 'deescalate_interaction'],
    targeting: 'other',
    prerequisites: [
      { kind: 'target_communicable', maxDistance: 3 },
    ],
    blockers: [],
    scoreBase: 0.03,
    scoreModifiers: [
      { kind: 'weighted_metric', metric: 'utility_of_target', weight: 0.7, clamp: [0, 1.0] },
      { kind: 'weighted_metric', metric: 'dependency', weight: 0.4, clamp: [0, 0.6] },
    ],
    dialogueAct: 'propose',
    desiredEffect: 'establish_shared_plan',
    groundingHints: ['negotiate', 'talk'],
    cooldownTicks: 2,
    tags: ['cooperation', 'verbal'],
  },
  {
    id: 'command_target',
    family: 'communicative',
    label: 'Отдать приказ',
    description: 'Использовать авторитет для управления поведением цели.',
    allowedGoalIds: ['protect_status_position', 'confront_threat_source', 'preserve_cooperation'],
    targeting: 'other',
    prerequisites: [
      { kind: 'target_communicable', maxDistance: 4 },
      { kind: 'metric', metric: 'authority', op: '>=', value: 0.4 },
    ],
    blockers: [],
    scoreBase: 0.01,
    scoreModifiers: [
      { kind: 'weighted_metric', metric: 'authority', weight: 0.8, clamp: [0, 1.0] },
      { kind: 'weighted_appraisal', tag: 'danger_to_self', weight: 0.4, clamp: [0, 0.6] },
    ],
    dialogueAct: 'command',
    desiredEffect: 'increase_compliance',
    groundingHints: ['command', 'talk'],
    cooldownTicks: 3,
    tags: ['authority', 'verbal'],
  },
  {
    id: 'challenge_target',
    family: 'communicative',
    label: 'Бросить вызов',
    description: 'Оспорить действия или позицию цели.',
    allowedGoalIds: ['confront_threat_source', 'protect_status_position'],
    targeting: 'other',
    prerequisites: [
      { kind: 'target_communicable', maxDistance: 3 },
    ],
    blockers: [
      { kind: 'metric', metric: 'self_health', op: '<=', value: 0.2 },
    ],
    scoreBase: 0.02,
    scoreModifiers: [
      { kind: 'weighted_appraisal', tag: 'target_as_threat', weight: 0.9, clamp: [0, 1.3] },
      { kind: 'weighted_appraisal', tag: 'status_loss_risk', weight: 0.7, clamp: [0, 1.0] },
    ],
    dialogueAct: 'accuse',
    desiredEffect: 'assert_dominance',
    groundingHints: ['accuse', 'threaten', 'confront'],
    cooldownTicks: 4,
    conflictsWith: ['reassure_target'],
    tags: ['conflict', 'verbal'],
  },

  // ═══════════════════════════ PHYSICAL ═══════════════════════════
  {
    id: 'assist_target',
    family: 'physical',
    label: 'Физически помочь',
    description: 'Прямая помощь: лечение, стабилизация, защита.',
    allowedGoalIds: ['stabilize_other', 'preserve_cooperation'],
    targeting: 'other',
    prerequisites: [
      { kind: 'target_reachable', maxDistance: 2 },
    ],
    blockers: [
      { kind: 'metric', metric: 'self_health', op: '<=', value: 0.15 },
    ],
    scoreBase: 0.05,
    scoreModifiers: [
      { kind: 'weighted_appraisal', tag: 'target_injury', weight: 1.1, clamp: [0, 1.5] },
      { kind: 'weighted_appraisal', tag: 'target_distress', weight: 0.6, clamp: [0, 0.9] },
      { kind: 'weighted_metric', metric: 'dependency', weight: 0.4, clamp: [0, 0.6] },
    ],
    desiredEffect: 'reduce_target_damage',
    groundingHints: ['treat', 'help', 'escort', 'guard'],
    cooldownTicks: 2,
    tags: ['care', 'physical'],
  },
  {
    id: 'escort_target',
    family: 'physical',
    label: 'Эскортировать',
    description: 'Сопроводить цель в безопасное место.',
    allowedGoalIds: ['stabilize_other'],
    targeting: 'other',
    prerequisites: [
      { kind: 'target_reachable', maxDistance: 3 },
      { kind: 'appraisal_tag', tags: ['target_distress', 'danger_to_other'], minScore: 0.3 },
    ],
    blockers: [
      { kind: 'metric', metric: 'self_health', op: '<=', value: 0.1 },
    ],
    scoreBase: 0.04,
    scoreModifiers: [
      { kind: 'weighted_appraisal', tag: 'target_distress', weight: 0.7, clamp: [0, 1.0] },
      { kind: 'weighted_metric', metric: 'hazard', weight: 0.5, clamp: [0, 0.8] },
    ],
    desiredEffect: 'move_target_to_safety',
    groundingHints: ['escort', 'move'],
    cooldownTicks: 3,
    tags: ['care', 'spatial', 'physical'],
  },

  // ═══════════════════════════ EPISTEMIC ═══════════════════════════
  {
    id: 'observe_target',
    family: 'epistemic',
    label: 'Наблюдать',
    description: 'Собрать информацию через наблюдение без контакта.',
    allowedGoalIds: ['verify_claim', 'confront_threat_source'],
    targeting: 'other',
    prerequisites: [
      { kind: 'target_exists' },
      { kind: 'target_reachable', maxDistance: 8 },
    ],
    blockers: [],
    scoreBase: 0.03,
    scoreModifiers: [
      { kind: 'weighted_metric', metric: 'uncertainty', weight: 0.8, clamp: [0, 1.0] },
      { kind: 'weighted_metric', metric: 'trust', weight: -0.3, clamp: [-0.3, 0] },
    ],
    desiredEffect: 'reduce_uncertainty',
    groundingHints: ['observe', 'observe_target'],
    tags: ['epistemic', 'non_verbal'],
  },

  // ═══════════════════════════ REGULATORY ═══════════════════════════
  {
    id: 'pause',
    family: 'regulatory',
    label: 'Взять паузу',
    description: 'Остановиться для восстановления самоконтроля.',
    allowedGoalIds: ['restore_self_control', 'recover_resources'],
    targeting: 'self',
    prerequisites: [
      { kind: 'any', conditions: [
        { kind: 'metric', metric: 'self_stress', op: '>=', value: 0.5 },
        { kind: 'metric', metric: 'self_fatigue', op: '>=', value: 0.5 },
      ]},
    ],
    blockers: [
      { kind: 'metric', metric: 'hazard', op: '>=', value: 0.8 },
    ],
    scoreBase: 0.05,
    scoreModifiers: [
      { kind: 'weighted_metric', metric: 'self_stress', weight: 0.6, clamp: [0, 0.8] },
      { kind: 'weighted_metric', metric: 'self_fatigue', weight: 0.75, clamp: [0, 1.0] },
    ],
    desiredEffect: 'reduce_self_stress',
    groundingHints: ['wait', 'rest'],
    tags: ['self_regulation'],
  },
];
