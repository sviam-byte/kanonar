import type { ActionSchemaV1 } from './types';

/**
 * 12 canonical action schemas for Layer G.
 *
 * Each schema is a distinct executable form. Two schemas with the same
 * requiredOfferKinds must differ in preconditions, cost, publicMode, or narrative.
 */
export const ACTION_SCHEMAS_V1: ActionSchemaV1[] = [
  // ═══════════════════ SPATIAL ═══════════════════
  {
    id: 'schema_flee_to_safety',
    family: 'spatial',
    label: 'Бежать в безопасное место',
    description: 'Быстрое перемещение прочь от угрозы.',
    intentIds: ['withdraw', 'seek_cover'],
    actorPreconditions: [
      { kind: 'metric', metric: 'self_health', op: '>', value: 0.05 },
    ],
    targetPreconditions: [],
    worldPreconditions: [],
    blockers: [],
    scoreBase: 0.08,
    scoreModifiers: [
      { kind: 'weighted_metric', metric: 'hazard', weight: 0.8, clamp: [0, 1.2] },
    ],
    requiredOfferKinds: ['move', 'move_cell', 'move_xy'],
    simActionKind: 'move',
    narrativeLabel: 'бежать в укрытие',
    cost: 0.03,
    tags: ['survival', 'spatial', 'fast'],
  },
  {
    id: 'schema_approach_for_interaction',
    family: 'spatial',
    label: 'Подойти для взаимодействия',
    description: 'Сблизиться с целью, чтобы начать разговор или помочь.',
    intentIds: ['approach_target', 'assist_target', 'escort_target'],
    actorPreconditions: [],
    targetPreconditions: [],
    worldPreconditions: [
      { kind: 'target_reachable', maxDistance: 10 },
    ],
    blockers: [
      { kind: 'metric', metric: 'hazard', op: '>=', value: 0.85 },
    ],
    scoreBase: 0.06,
    scoreModifiers: [
      { kind: 'weighted_metric', metric: 'distance', weight: 0.2, clamp: [0, 0.5] },
    ],
    requiredOfferKinds: ['move', 'move_cell', 'move_xy'],
    simActionKind: 'move',
    narrativeLabel: 'подойти к цели',
    cost: 0.02,
    tags: ['spatial', 'enabling'],
  },

  // ═══════════════════ VERBAL ═══════════════════
  {
    id: 'schema_reassure_at_distance',
    family: 'verbal',
    label: 'Успокоить на расстоянии',
    description: 'Речевое воздействие без сближения. Быстро, но менее эффективно.',
    intentIds: ['reassure_target', 'clarify'],
    actorPreconditions: [],
    targetPreconditions: [],
    worldPreconditions: [
      { kind: 'target_communicable', maxDistance: 4 },
    ],
    blockers: [],
    scoreBase: 0.06,
    scoreModifiers: [
      { kind: 'weighted_metric', metric: 'self_stress', weight: -0.2, clamp: [-0.2, 0] },
    ],
    requiredOfferKinds: ['comfort', 'talk'],
    simActionKind: 'comfort',
    narrativeLabel: 'успокоить словами на дистанции',
    dialogueHook: { act: 'reassure', desiredEffect: 'reduce_target_stress' },
    cost: 0.02,
    publicMode: 'any',
    tags: ['care', 'verbal', 'low_cost'],
  },
  {
    id: 'schema_direct_warning',
    family: 'verbal',
    label: 'Прямое предупреждение',
    description: 'Короткое, прямое сообщение об угрозе.',
    intentIds: ['warn_group'],
    actorPreconditions: [],
    targetPreconditions: [],
    worldPreconditions: [
      { kind: 'target_communicable', maxDistance: 5 },
    ],
    blockers: [],
    scoreBase: 0.05,
    scoreModifiers: [
      { kind: 'weighted_metric', metric: 'hazard', weight: 0.4, clamp: [0, 0.6] },
    ],
    requiredOfferKinds: ['talk', 'signal'],
    simActionKind: 'talk',
    narrativeLabel: 'коротко предупредить',
    dialogueHook: { act: 'warn', desiredEffect: 'increase_target_alertness' },
    cost: 0.01,
    publicMode: 'any',
    tags: ['safety', 'verbal'],
  },
  {
    id: 'schema_private_question',
    family: 'verbal',
    label: 'Приватный расспрос',
    description: 'Запрос информации в приватном контексте.',
    intentIds: ['ask_fact'],
    actorPreconditions: [],
    targetPreconditions: [],
    worldPreconditions: [
      { kind: 'target_communicable', maxDistance: 2 },
    ],
    blockers: [],
    scoreBase: 0.05,
    scoreModifiers: [
      { kind: 'weighted_metric', metric: 'trust', weight: 0.3, clamp: [0, 0.5] },
    ],
    requiredOfferKinds: ['question_about', 'talk'],
    simActionKind: 'question_about',
    narrativeLabel: 'спросить наедине',
    dialogueHook: { act: 'ask', desiredEffect: 'reduce_uncertainty' },
    cost: 0.02,
    publicMode: 'private',
    tags: ['epistemic', 'verbal'],
  },
  {
    id: 'schema_coordinate_plan',
    family: 'verbal',
    label: 'Согласовать план',
    description: 'Предложить совместный план действий.',
    intentIds: ['coordinate'],
    actorPreconditions: [],
    targetPreconditions: [],
    worldPreconditions: [
      { kind: 'target_communicable', maxDistance: 3 },
    ],
    blockers: [],
    scoreBase: 0.05,
    scoreModifiers: [
      { kind: 'weighted_metric', metric: 'utility_of_target', weight: 0.5, clamp: [0, 0.7] },
    ],
    requiredOfferKinds: ['negotiate', 'talk'],
    simActionKind: 'negotiate',
    narrativeLabel: 'предложить план',
    dialogueHook: { act: 'propose', desiredEffect: 'establish_shared_plan' },
    cost: 0.03,
    tags: ['cooperation', 'verbal'],
  },
  {
    id: 'schema_public_demand',
    family: 'verbal',
    label: 'Публичное требование',
    description: 'Приказ или обвинение при свидетелях — давление, но рискованно.',
    intentIds: ['command_target', 'challenge_target'],
    actorPreconditions: [
      { kind: 'metric', metric: 'authority', op: '>=', value: 0.3 },
    ],
    targetPreconditions: [],
    worldPreconditions: [
      { kind: 'target_communicable', maxDistance: 5 },
    ],
    blockers: [
      { kind: 'metric', metric: 'self_stress', op: '>=', value: 0.9 },
    ],
    scoreBase: 0.03,
    scoreModifiers: [
      { kind: 'weighted_metric', metric: 'authority', weight: 0.6, clamp: [0, 0.8] },
    ],
    requiredOfferKinds: ['command', 'accuse', 'confront', 'talk'],
    simActionKind: 'command',
    narrativeLabel: 'потребовать при свидетелях',
    dialogueHook: { act: 'command', desiredEffect: 'increase_compliance' },
    cost: 0.06,
    publicMode: 'public',
    tags: ['authority', 'verbal', 'high_risk'],
  },

  // ═══════════════════ PHYSICAL ═══════════════════
  {
    id: 'schema_physical_treatment',
    family: 'physical_contact',
    label: 'Оказать физическую помощь',
    description: 'Перевязка, стабилизация, физическая поддержка — требует контакта.',
    intentIds: ['assist_target'],
    actorPreconditions: [
      { kind: 'metric', metric: 'self_health', op: '>=', value: 0.2 },
    ],
    targetPreconditions: [],
    worldPreconditions: [
      { kind: 'target_reachable', maxDistance: 1 },
    ],
    blockers: [],
    scoreBase: 0.06,
    scoreModifiers: [
      { kind: 'weighted_metric', metric: 'closeness', weight: 0.3, clamp: [0, 0.5] },
    ],
    requiredOfferKinds: ['treat', 'help'],
    simActionKind: 'help',
    narrativeLabel: 'перевязать / стабилизировать',
    cost: 0.05,
    tags: ['care', 'physical'],
  },

  // ═══════════════════ OBSERVATION ═══════════════════
  {
    id: 'schema_silent_observation',
    family: 'observation',
    label: 'Молча наблюдать',
    description: 'Собирать информацию без раскрытия интереса.',
    intentIds: ['observe_target'],
    actorPreconditions: [],
    targetPreconditions: [],
    worldPreconditions: [],
    blockers: [],
    scoreBase: 0.04,
    scoreModifiers: [
      { kind: 'weighted_metric', metric: 'uncertainty', weight: 0.6, clamp: [0, 0.8] },
    ],
    requiredOfferKinds: ['observe', 'inspect_feature'],
    simActionKind: 'observe',
    narrativeLabel: 'наблюдать молча',
    cost: 0.01,
    publicMode: 'private',
    tags: ['epistemic', 'covert'],
  },

  // ═══════════════════ INACTION ═══════════════════
  {
    id: 'schema_deliberate_pause',
    family: 'inaction',
    label: 'Осознанная пауза',
    description: 'Остановка для восстановления ресурсов.',
    intentIds: ['pause'],
    actorPreconditions: [],
    targetPreconditions: [],
    worldPreconditions: [],
    blockers: [
      { kind: 'metric', metric: 'hazard', op: '>=', value: 0.85 },
    ],
    scoreBase: 0.05,
    scoreModifiers: [
      { kind: 'weighted_metric', metric: 'self_fatigue', weight: 0.5, clamp: [0, 0.7] },
    ],
    requiredOfferKinds: ['wait', 'rest'],
    simActionKind: 'wait',
    narrativeLabel: 'взять паузу',
    cost: 0.0,
    tags: ['self_regulation', 'recovery'],
  },
];
