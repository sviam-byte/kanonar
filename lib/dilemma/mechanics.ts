// lib/dilemma/mechanics.ts
//
// Core mechanical classes for DilemmaLab v2.
// Presets in scenarios.ts should only skin or parameterize these mechanics.

import type { MechanicTemplate, ActionTemplate, MechanicId, ProtocolCardView, ScenarioStakes, ScenarioVisibility } from './types';

function action(
  id: string,
  label: string,
  description: string,
  socialTags: string[],
  profile: ActionTemplate['profile'],
  requires?: ActionTemplate['requires'],
  payoffVs?: Record<string, number>,
): ActionTemplate {
  return { id, label, description, socialTags, profile, requires, payoffVs };
}

function mechanic(
  id: MechanicId,
  name: string,
  description: string,
  protocol: ProtocolCardView,
  defaultCooperativeActionId: string,
  actionPool: ActionTemplate[],
  defaultStakes: ScenarioStakes,
  defaultVisibility: ScenarioVisibility,
  defaultInstitutionalPressure: number,
): MechanicTemplate {
  return {
    id,
    name,
    description,
    protocol,
    defaultCooperativeActionId,
    actionPool,
    defaultStakes,
    defaultVisibility,
    defaultInstitutionalPressure,
  };
}

export const TRUST_EXCHANGE = mechanic(
  'trust_exchange',
  'Доверительный обмен',
  'Скрытый одновременный выбор: полностью довериться, схеджировать или выиграть в одностороннем порядке.',
  {
    title: 'Доверительный обмен',
    kernel: 'trust_exchange',
    symmetry: 'symmetric',
    timing: 'simultaneous',
    information: 'partial_observation',
    typeLabel: 'simultaneous hidden choice',
    roles: [
      { id: 'a_peer', label: 'A = peer', description: 'симметричный участник обмена' },
      { id: 'b_peer', label: 'B = peer', description: 'симметричный участник обмена' },
    ],
    phases: [
      { id: 'commit', label: 'Оба выбирают уровень доверия', description: 'trust / hedge / betray / manipulate', actor: 'both' },
      { id: 'reveal', label: 'Выборы раскрываются', description: 'сравнение доверия, хеджа и предательства', actor: 'system' },
      { id: 'update', label: 'Обновление отношений', description: 'trust, bond и betrayalDebt меняются по исходу', actor: 'system' },
    ],
    observation: 'действия скрыты до reveal; последствия отложены',
    primaryParameter: 'visibility / betrayal cost',
    secondaryParameter: 'institutional pressure',
    coreRule: 'оба trust усиливают bond; trust против betray даёт victim trust-- и betrayalDebt++; mutual betray поднимает fear/conflict',
    stateVariables: ['trust', 'bond', 'fear', 'conflict', 'betrayalDebt'],
    attractorRisks: ['mutual suspicion', 'exploitation spiral', 'repairable trust loop'],
  },
  'cooperate',
  [
    action('cooperate', 'Полное доверие', 'Открыто вложиться в пару и принять личный риск.', ['support'], { goalFit: 0.2, relationalFit: 0.7, identityFit: 0.4, legitimacyFit: 0.1, safetyFit: -0.4, mirrorFit: 0.6, expectedCost: 0.4 }, undefined, { cooperate: 0.35, defect: -0.55, hedge: 0.1, manipulate: -0.7 }),
    action('defect', 'Односторонний выигрыш', 'Забрать преимущество себе, переложив риск на второго.', ['betrayal'], { goalFit: 0.45, relationalFit: -0.9, identityFit: -0.3, legitimacyFit: -0.2, safetyFit: 0.55, mirrorFit: -0.75, expectedCost: 0.2 }, undefined, { cooperate: 0.7, defect: -0.1, hedge: 0.4, manipulate: 0.15 }),
    action('hedge', 'Ограниченный обмен', 'Оставить мосты, но не отдавать всю позицию сразу.', ['neutral'], { goalFit: 0.25, relationalFit: 0.2, identityFit: 0.05, legitimacyFit: 0, safetyFit: 0.15, mirrorFit: 0.1, expectedCost: 0.3 }, undefined, { cooperate: 0.25, defect: -0.1, hedge: 0.25, manipulate: -0.2 }),
    action('manipulate', 'Манипулировать обменом', 'Сделать вид, что участвуешь в обмене, чтобы запутать второго или выиграть время.', ['deceive'], { goalFit: 0.35, relationalFit: 0.1, identityFit: -0.2, legitimacyFit: -0.55, safetyFit: 0.15, mirrorFit: -0.05, expectedCost: 0.55 }, undefined, { cooperate: 0.45, defect: -0.15, hedge: 0.15, manipulate: -0.2 }),
  ],
  { personal: 0.65, relational: 0.55, institutional: 0.2, physical: 0.25 },
  { actionsVisible: false, audiencePresent: false, consequencesDeferred: true },
  0.25,
);

export const AUTHORITY_CONFLICT = mechanic(
  'authority_conflict',
  'Конфликт власти',
  'Один или оба игрока зажаты между вертикалью, защитой людей и риском открытого разрыва.',
  {
    title: 'Конфликт власти',
    kernel: 'authority_conflict',
    symmetry: 'asymmetric',
    timing: 'sequential',
    information: 'partial_observation',
    typeLabel: 'asymmetric authority protocol',
    roles: [
      { id: 'authority', label: 'A = authority', description: 'источник приказа, санкции или процедуры' },
      { id: 'subject', label: 'B = subject', description: 'подчинённый, исполнитель или носитель риска' },
    ],
    phases: [
      { id: 'directive', label: 'A задаёт приказ/рамку', description: 'order / negotiate / threaten / delegate', actor: 'A' },
      { id: 'response', label: 'B отвечает на вертикаль', description: 'obey / question / refuse / sabotage', actor: 'B' },
      { id: 'legitimacy_update', label: 'Легитимность пересчитывается', description: 'страх, лояльность и resentment расходятся', actor: 'system' },
    ],
    observation: 'вердикт/приказ публичен; мотив и готовность саботажа частично скрыты',
    primaryParameter: 'legitimacy / obedience pressure',
    secondaryParameter: 'institutional pressure',
    coreRule: 'легитимный приказ повышает loyalty; нелегитимное давление повышает resentment; punishment даёт fear+, trust-',
    stateVariables: ['legitimacy', 'fear', 'resentment', 'loyalty', 'conflictMomentum'],
    attractorRisks: ['obedience lock-in', 'sabotage', 'rupture'],
  },
  'protect',
  [
    action('comply', 'Подчиниться', 'Следовать процедуре или приказу, даже если цена высока.', ['hierarchical'], { goalFit: 0.15, relationalFit: -0.35, identityFit: -0.2, legitimacyFit: 0.85, safetyFit: 0.25, mirrorFit: -0.1, expectedCost: 0.25 }, undefined, { comply: 0.1, protect: -0.2, delay: 0.15, rupture: -0.1 }),
    action('protect', 'Защитить человека', 'Поставить конкретного человека или группу выше процедуры.', ['support', 'protect'], { goalFit: 0.55, relationalFit: 0.85, identityFit: 0.55, legitimacyFit: -0.55, safetyFit: -0.25, mirrorFit: 0.45, expectedCost: 0.45 }, undefined, { comply: 0.25, protect: 0.4, delay: 0.2, rupture: -0.1 }),
    action('delay', 'Сорвать прямое решение', 'Тянуть время, саботировать исполнение или искать обход.', ['neutral'], { goalFit: 0.3, relationalFit: 0.2, identityFit: 0.1, legitimacyFit: -0.2, safetyFit: 0.05, mirrorFit: 0.05, expectedCost: 0.35 }, undefined, { comply: 0.1, protect: 0.2, delay: 0.15, rupture: -0.05 }),
    action('rupture', 'Пойти на разрыв', 'Открыто нарушить порядок, взять удар на себя или перехватить контроль.', ['harm'], { goalFit: 0.55, relationalFit: -0.55, identityFit: 0.35, legitimacyFit: -0.85, safetyFit: -0.45, mirrorFit: -0.25, expectedCost: 0.7 }, undefined, { comply: 0.4, protect: 0.15, delay: 0.2, rupture: -0.35 }),
  ],
  { personal: 0.6, relational: 0.8, institutional: 0.85, physical: 0.45 },
  { actionsVisible: true, audiencePresent: true, consequencesDeferred: false },
  0.85,
);

export const JUDGMENT_SANCTION = mechanic(
  'judgment_sanction',
  'Санкция и помилование',
  'Один из игроков решает, как оформить нарушение: наказать, простить или снять с себя решение.',
  {
    title: 'Суд командира',
    kernel: 'judgment_sanction',
    symmetry: 'asymmetric',
    timing: 'sequential',
    information: 'partial_observation',
    typeLabel: 'authority judgment protocol',
    roles: [
      { id: 'judge', label: 'A = judge / commander', description: 'имеет право санкции и несёт цену легитимности' },
      { id: 'accused', label: 'B = accused / subordinate', description: 'оценивает справедливость и решает принять или внутренне отвергнуть' },
    ],
    phases: [
      { id: 'verdict', label: 'A выносит вердикт', description: 'punish / pardon / delegate', actor: 'A' },
      { id: 'response', label: 'B принимает или копит долг', description: 'visible compliance, hidden resentment', actor: 'B' },
      { id: 'legitimacy_update', label: 'Система обновляет порядок', description: 'procedure, fear, loyalty и resentment получают дельты', actor: 'system' },
    ],
    observation: 'вердикт публичен; внутренний мотив и resentment скрыты',
    primaryParameter: 'legitimacy / sanction credibility',
    secondaryParameter: 'institutional pressure',
    coreRule: 'санкция укрепляет procedure и fear, но бьёт по trust; помилование чинит bond, но может снижать perceived order',
    stateVariables: ['legitimacy', 'fear', 'resentment', 'loyalty', 'trust'],
    attractorRisks: ['obedience', 'sabotage debt', 'authority rupture'],
  },
  'pardon',
  [
    action('punish', 'Наказать', 'Применить санкцию и подтвердить силу процедуры.', ['harm', 'punish'], { goalFit: 0.2, relationalFit: -0.5, identityFit: 0.25, legitimacyFit: 0.9, safetyFit: 0.15, mirrorFit: -0.4, expectedCost: 0.2 }, { roles: ['commander', 'caretaker', 'advisor'] }, { punish: -0.15, pardon: 0.25, delegate: 0.1 }),
    action('pardon', 'Помиловать', 'Оставить доверие, но ослабить жёсткость порядка.', ['support'], { goalFit: 0.3, relationalFit: 0.65, identityFit: 0.05, legitimacyFit: -0.45, safetyFit: -0.05, mirrorFit: 0.4, expectedCost: 0.1 }, undefined, { punish: -0.25, pardon: 0.3, delegate: 0.15 }),
    action('delegate', 'Передать решение', 'Снять с себя персональный выбор и отдать его инстанции.', ['neutral'], { goalFit: 0.05, relationalFit: 0.1, identityFit: -0.25, legitimacyFit: 0.45, safetyFit: 0.35, mirrorFit: -0.15, expectedCost: 0.1 }, undefined, { punish: 0.05, pardon: 0.05, delegate: 0.1 }),
  ],
  { personal: 0.35, relational: 0.6, institutional: 0.85, physical: 0.1 },
  { actionsVisible: true, audiencePresent: true, consequencesDeferred: false },
  0.9,
);

export const RESOURCE_SPLIT = mechanic(
  'resource_split',
  'Раздел дефицита',
  'Обе стороны решают, как делить ограниченный ресурс и насколько перераспределение терпимо для пары.',
  {
    title: 'Раздел дефицита',
    kernel: 'resource_split',
    symmetry: 'symmetric',
    timing: 'simultaneous',
    information: 'complete',
    typeLabel: 'resource allocation bargain',
    roles: [
      { id: 'claimant_a', label: 'A = claimant', description: 'участник с притязанием на ресурс' },
      { id: 'claimant_b', label: 'B = claimant', description: 'участник с притязанием на ресурс' },
    ],
    phases: [
      { id: 'claim', label: 'Оба выбирают claim policy', description: 'fair split / take all / give more', actor: 'both' },
      { id: 'allocation', label: 'Ресурс распределяется', description: 'проверяется сумма притязаний и цена перекоса', actor: 'system' },
      { id: 'debt_update', label: 'Долг и доверие обновляются', description: 'fairness, resourceDebt и trust получают дельты', actor: 'system' },
    ],
    observation: 'выбор скрыт до распределения; итог распределения наблюдаем обоими',
    primaryParameter: 'scarcity / fairness tolerance',
    secondaryParameter: 'institutional pressure',
    coreRule: 'fair split стабилизирует trust; take_all даёт краткий выигрыш и debt++; give_more покупает bond ценой собственного ресурса',
    stateVariables: ['resourceShare', 'trust', 'fairnessDebt', 'resentment', 'scarcity'],
    attractorRisks: ['extraction spiral', 'dependency', 'stable reciprocity'],
  },
  'share_fair',
  [
    action('share_fair', 'Честный раздел', 'Поделить ресурс по понятному правилу.', ['support'], { goalFit: 0.4, relationalFit: 0.6, identityFit: 0.3, legitimacyFit: 0.5, safetyFit: 0.0, mirrorFit: 0.5, expectedCost: 0.2 }, undefined, { share_fair: 0.35, take_all: -0.4, give_more: 0.1 }),
    action('take_all', 'Забрать всё', 'Максимизировать личную выгоду ценой второй стороны.', ['harm'], { goalFit: 0.6, relationalFit: -0.8, identityFit: -0.2, legitimacyFit: -0.6, safetyFit: 0.3, mirrorFit: -0.7, expectedCost: 0.1 }, undefined, { share_fair: 0.6, take_all: -0.2, give_more: 0.8 }),
    action('give_more', 'Отдать больше', 'Пожертвовать частью своего ресурса ради доверия или символического жеста.', ['support'], { goalFit: 0.1, relationalFit: 0.8, identityFit: 0.4, legitimacyFit: 0.2, safetyFit: -0.2, mirrorFit: 0.8, expectedCost: 0.3 }, undefined, { share_fair: 0.2, take_all: -0.65, give_more: 0.25 }),
  ],
  { personal: 0.6, relational: 0.5, institutional: 0.2, physical: 0.1 },
  { actionsVisible: false, audiencePresent: false, consequencesDeferred: false },
  0.3,
);

export const CARE_UNDER_SURVEILLANCE = mechanic(
  'care_under_surveillance',
  'Помощь под наблюдением',
  'Помощь одному персонажу оценивается третьей стороной или публикой и плохо сводится к простой dyad-модели.',
  {
    title: 'Помощь под наблюдением',
    kernel: 'care_under_surveillance',
    symmetry: 'asymmetric',
    timing: 'multi_phase',
    information: 'partial_observation',
    typeLabel: 'observed care / reputation protocol',
    roles: [
      { id: 'helper', label: 'A = helper', description: 'может помочь открыто, скрытно или отказать' },
      { id: 'receiver', label: 'B = vulnerable receiver', description: 'получает помощь, но не контролирует аудиторию' },
    ],
    phases: [
      { id: 'need', label: 'B демонстрирует нужду', description: 'потребность видна не полностью', actor: 'B' },
      { id: 'aid', label: 'A выбирает способ помощи', description: 'open help / covert help / refuse', actor: 'A' },
      { id: 'audience_update', label: 'Публика оценивает жест', description: 'status, bond и surveillance risk меняются', actor: 'system' },
    ],
    observation: 'помощь может быть публичной или скрытой; мотив помощи скрыт',
    primaryParameter: 'visibility / reputation cost',
    secondaryParameter: 'institutional pressure',
    coreRule: 'open help повышает bond и status cost; covert help снижает публичную цену; refuse защищает статус, но создаёт relational debt',
    stateVariables: ['bond', 'status', 'surveillanceRisk', 'gratitudeDebt', 'reputation'],
    attractorRisks: ['martyrdom', 'status punishment', 'covert dependency'],
  },
  'help_openly',
  [
    action('help_openly', 'Помочь открыто', 'Открыто оказать помощь и принять удар по статусу.', ['support', 'help'], { goalFit: 0.2, relationalFit: 0.8, identityFit: 0.5, legitimacyFit: -0.2, safetyFit: -0.3, mirrorFit: 0.6, expectedCost: 0.4 }),
    action('help_covertly', 'Помочь скрытно', 'Сохранить часть статуса за счёт непрямой поддержки.', ['support'], { goalFit: 0.3, relationalFit: 0.5, identityFit: 0.2, legitimacyFit: -0.3, safetyFit: 0.1, mirrorFit: 0.0, expectedCost: 0.4 }, { minTrait: { axis: 'E_Skill_opsec_hacking', threshold: 0.4 } }),
    action('refuse', 'Отказать', 'Сохранить позицию и не помогать.', ['neutral'], { goalFit: 0.0, relationalFit: -0.5, identityFit: -0.3, legitimacyFit: 0.3, safetyFit: 0.5, mirrorFit: -0.4, expectedCost: 0.0 }),
  ],
  { personal: 0.4, relational: 0.7, institutional: 0.5, physical: 0.1 },
  { actionsVisible: true, audiencePresent: true, consequencesDeferred: false },
  0.5,
);

export const ULTIMATUM_SPLIT = mechanic(
  'ultimatum_split',
  'Ультиматум',
  'Асимметричная власть: один предлагает раздел, другой принимает или отвергает. '
    + 'Отказ уничтожает ресурс для обоих.',
  {
    title: 'Ультиматум',
    kernel: 'ultimatum_split',
    symmetry: 'asymmetric',
    timing: 'sequential',
    information: 'complete',
    typeLabel: 'sequential asymmetric bargaining',
    roles: [
      { id: 'proposer', label: 'A = proposer', description: 'задаёт split x' },
      { id: 'responder', label: 'B = responder', description: 'accept / reject после наблюдения split' },
    ],
    phases: [
      { id: 'offer', label: 'A предлагает split x', description: 'fair или skewed offer', actor: 'A' },
      { id: 'response', label: 'B accepts / rejects', description: 'принять ресурс или уничтожить сделку', actor: 'B' },
      { id: 'payoff', label: 'Payoff применяется', description: 'accept -> x и 1-x; reject -> 0 / 0', actor: 'system' },
    ],
    observation: 'offer публичен для responder; скрыта только tolerance к несправедливости',
    primaryParameter: 'rejection cost / unfairness tolerance',
    secondaryParameter: 'institutional pressure',
    coreRule: 'accept распределяет ресурс по split; reject зануляет material payoff обоим и поднимает conflict',
    stateVariables: ['resourceShare', 'resentment', 'legitimacy', 'conflict', 'unfairness'],
    attractorRisks: ['spite rejection', 'coercive bargaining', 'fair legitimacy'],
  },
  'offer_fair',
  [
    action('offer_fair', 'Честное предложение', 'Предложить равный или близкий к равному раздел.', ['support'], { goalFit: 0.3, relationalFit: 0.7, identityFit: 0.4, legitimacyFit: 0.5, safetyFit: 0.1, mirrorFit: 0.6, expectedCost: 0.3 }, undefined, { offer_fair: 0.4, offer_skewed: -0.1, accept: 0.45, reject: -0.15 }),
    action('offer_skewed', 'Перекос в свою пользу', 'Предложить минимально приемлемый раздел: почти всё себе.', ['harm'], { goalFit: 0.7, relationalFit: -0.6, identityFit: -0.1, legitimacyFit: -0.3, safetyFit: 0.2, mirrorFit: -0.5, expectedCost: 0.1 }, undefined, { offer_fair: 0.6, offer_skewed: -0.15, accept: 0.15, reject: -0.5 }),
    action('accept', 'Принять', 'Согласиться с предложенным, сохранить отношения.', ['neutral'], { goalFit: 0.2, relationalFit: 0.4, identityFit: -0.1, legitimacyFit: 0.2, safetyFit: 0.3, mirrorFit: 0.0, expectedCost: 0.1 }, undefined, { offer_fair: 0.35, offer_skewed: -0.1, accept: 0.2, reject: -0.05 }),
    action('reject', 'Отвергнуть', 'Уничтожить ресурс, чтобы наказать несправедливость.', ['harm', 'punish'], { goalFit: -0.3, relationalFit: -0.4, identityFit: 0.3, legitimacyFit: -0.1, safetyFit: -0.4, mirrorFit: 0.1, expectedCost: 0.7 }, undefined, { offer_fair: -0.2, offer_skewed: -0.3, accept: -0.1, reject: -0.35 }),
  ],
  { personal: 0.5, relational: 0.6, institutional: 0.3, physical: 0.1 },
  { actionsVisible: true, audiencePresent: false, consequencesDeferred: false },
  0.3,
);

export const VOLUNTEER_SACRIFICE = mechanic(
  'volunteer_sacrifice',
  'Жертва добровольца',
  'Кто-то должен взять на себя цену. Если никто не вызвался — катастрофа для всех. '
    + 'Если оба — цена делится, но удваивается.',
  {
    title: 'Жертва добровольца',
    kernel: 'volunteer_sacrifice',
    symmetry: 'symmetric',
    timing: 'simultaneous',
    information: 'complete',
    typeLabel: 'public-good sacrifice dilemma',
    roles: [
      { id: 'candidate_a', label: 'A = candidate', description: 'может взять стоимость общественного блага' },
      { id: 'candidate_b', label: 'B = candidate', description: 'может ждать, отказаться или переложить цену' },
    ],
    phases: [
      { id: 'choice', label: 'Оба одновременно выбирают', description: 'volunteer / wait / push other', actor: 'both' },
      { id: 'coverage', label: 'Проверяется наличие добровольца', description: 'nobody -> collective failure; one -> cost paid; both -> duplicated/shared cost', actor: 'system' },
      { id: 'debt_update', label: 'Долги и связь обновляются', description: 'sacrifice, guilt, shame и bond получают дельты', actor: 'system' },
    ],
    observation: 'выбор наблюдаем после одновременного reveal; цена добровольца публична',
    primaryParameter: 'sacrifice cost / collective failure cost',
    secondaryParameter: 'institutional pressure',
    coreRule: 'если никто не вызвался, group failure; один volunteer платит cost и спасает группу; оба volunteer дублируют или делят cost',
    stateVariables: ['groupSurvival', 'stress', 'bond', 'guiltDebt', 'shame'],
    attractorRisks: ['free-rider failure', 'martyr burnout', 'reciprocal courage'],
  },
  'volunteer',
  [
    action('volunteer', 'Вызваться', 'Принять риск/цену на себя.', ['support', 'protect'], { goalFit: 0.3, relationalFit: 0.7, identityFit: 0.6, legitimacyFit: 0.2, safetyFit: -0.7, mirrorFit: 0.5, expectedCost: 0.7 }, undefined, { volunteer: 0.2, wait: 0.45, push_other: -0.3 }),
    action('wait', 'Ждать', 'Надеяться, что вызовется другой.', ['neutral'], { goalFit: 0.1, relationalFit: -0.2, identityFit: -0.3, legitimacyFit: 0.0, safetyFit: 0.5, mirrorFit: -0.4, expectedCost: 0.0 }, undefined, { volunteer: 0.6, wait: -0.8, push_other: 0.1 }),
    action('push_other', 'Указать на другого', 'Открыто заявить, что это его задача, не моя.', ['harm', 'betrayal'], { goalFit: 0.2, relationalFit: -0.7, identityFit: -0.2, legitimacyFit: -0.3, safetyFit: 0.3, mirrorFit: -0.6, expectedCost: 0.2 }, undefined, { volunteer: 0.4, wait: -0.3, push_other: -0.5 }),
  ],
  { personal: 0.7, relational: 0.6, institutional: 0.4, physical: 0.6 },
  { actionsVisible: true, audiencePresent: true, consequencesDeferred: false },
  0.4,
);

export const SIGNALING_TRUST = mechanic(
  'signaling_trust',
  'Сигнал и интерпретация',
  'Один передаёт сигнал (дорогой, дешёвый или пустой). Другой решает, верить ли. '
    + 'Дорогой сигнал надёжнее, но стоит больше.',
  {
    title: 'Сигнал и интерпретация',
    kernel: 'signaling_trust',
    symmetry: 'asymmetric',
    timing: 'multi_phase',
    information: 'hidden_type',
    typeLabel: 'incomplete-information signaling game',
    roles: [
      { id: 'sender', label: 'A = sender with hidden type', description: 'тип honest / manipulative / afraid / loyal скрыт от receiver' },
      { id: 'receiver', label: 'B = receiver with belief', description: 'обновляет P(type | signal) и выбирает ответ' },
    ],
    phases: [
      { id: 'type', label: 'A имеет hidden type', description: 'type не наблюдается напрямую', actor: 'system' },
      { id: 'signal', label: 'A посылает signal', description: 'costly / cheap / silence / deception', actor: 'A' },
      { id: 'belief', label: 'B обновляет belief', description: 'costly signal сильнее cheap signal', actor: 'B' },
      { id: 'receiver_action', label: 'B действует', description: 'trust / test / reject / punish', actor: 'B' },
    ],
    observation: 'receiver видит signal, но не hidden type; belief update обязан быть явным',
    primaryParameter: 'signal cost / belief uncertainty',
    secondaryParameter: 'institutional pressure',
    coreRule: 'costly signal сильнее сдвигает belief к honest/loyal; cheap/silence оставляют uncertainty и риск belief error',
    stateVariables: ['belief', 'trust', 'fear', 'signalCost', 'uncertainty'],
    attractorRisks: ['paranoia', 'cheap-talk exploitation', 'credible trust'],
  },
  'costly_signal',
  [
    action('costly_signal', 'Дорогой сигнал', 'Передать достоверный сигнал с высокой ценой для себя.', ['support'], { goalFit: 0.2, relationalFit: 0.8, identityFit: 0.5, legitimacyFit: 0.3, safetyFit: -0.3, mirrorFit: 0.7, expectedCost: 0.6 }, undefined, { costly_signal: 0.15, cheap_signal: 0.1, silence: -0.1, trust_signal: 0.55, test_signal: 0.1, ignore_signal: -0.4 }),
    action('cheap_signal', 'Дешёвый сигнал', 'Передать сигнал, который легко подделать.', ['deceive', 'neutral'], { goalFit: 0.4, relationalFit: 0.2, identityFit: -0.1, legitimacyFit: -0.2, safetyFit: 0.2, mirrorFit: -0.1, expectedCost: 0.1 }, undefined, { costly_signal: 0.1, cheap_signal: 0.05, silence: 0.0, trust_signal: 0.3, test_signal: -0.1, ignore_signal: -0.1 }),
    action('silence', 'Молчание', 'Не давать сигнала. Пусть другой решает без информации.', ['neutral'], { goalFit: 0.1, relationalFit: -0.3, identityFit: 0.0, legitimacyFit: 0.0, safetyFit: 0.4, mirrorFit: -0.3, expectedCost: 0.0 }, undefined, { costly_signal: -0.1, cheap_signal: 0.0, silence: 0.05, trust_signal: -0.3, test_signal: 0.1, ignore_signal: 0.2 }),
    action('trust_signal', 'Поверить', 'Принять сигнал и действовать в соответствии.', ['support'], { goalFit: 0.3, relationalFit: 0.6, identityFit: 0.1, legitimacyFit: 0.1, safetyFit: -0.3, mirrorFit: 0.3, expectedCost: 0.3 }, undefined, { costly_signal: 0.5, cheap_signal: -0.2, silence: -0.3, trust_signal: 0.2, test_signal: 0.1, ignore_signal: -0.1 }),
    action('test_signal', 'Проверить', 'Потратить время и ресурсы на верификацию.', ['neutral'], { goalFit: 0.2, relationalFit: 0.0, identityFit: 0.2, legitimacyFit: 0.3, safetyFit: 0.1, mirrorFit: 0.0, expectedCost: 0.4 }, undefined, { costly_signal: 0.2, cheap_signal: 0.15, silence: 0.1, trust_signal: 0.1, test_signal: 0.1, ignore_signal: 0.05 }),
    action('ignore_signal', 'Проигнорировать', 'Не тратить ресурсы, действовать по умолчанию.', ['neutral'], { goalFit: 0.0, relationalFit: -0.4, identityFit: -0.1, legitimacyFit: 0.0, safetyFit: 0.3, mirrorFit: -0.3, expectedCost: 0.0 }, undefined, { costly_signal: -0.2, cheap_signal: 0.05, silence: 0.15, trust_signal: -0.1, test_signal: 0.0, ignore_signal: 0.1 }),
  ],
  { personal: 0.5, relational: 0.7, institutional: 0.3, physical: 0.3 },
  { actionsVisible: false, audiencePresent: false, consequencesDeferred: true },
  0.2,
);

export const MECHANIC_CATALOG: Record<MechanicId, MechanicTemplate> = {
  trust_exchange: TRUST_EXCHANGE,
  authority_conflict: AUTHORITY_CONFLICT,
  judgment_sanction: JUDGMENT_SANCTION,
  resource_split: RESOURCE_SPLIT,
  care_under_surveillance: CARE_UNDER_SURVEILLANCE,
  ultimatum_split: ULTIMATUM_SPLIT,
  volunteer_sacrifice: VOLUNTEER_SACRIFICE,
  signaling_trust: SIGNALING_TRUST,
};

export function getMechanic(id: MechanicId): MechanicTemplate {
  const m = MECHANIC_CATALOG[id];
  if (!m) throw new Error(`Unknown dilemma mechanic: ${id}`);
  return m;
}

export function allMechanics(): MechanicTemplate[] {
  return Object.values(MECHANIC_CATALOG);
}
