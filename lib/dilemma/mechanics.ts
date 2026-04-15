// lib/dilemma/mechanics.ts
//
// Core mechanical classes for DilemmaLab v2.
// Presets in scenarios.ts should only skin or parameterize these mechanics.

import type { MechanicTemplate, ActionTemplate, MechanicId, ScenarioStakes, ScenarioVisibility } from './types';

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

export const MECHANIC_CATALOG: Record<MechanicId, MechanicTemplate> = {
  trust_exchange: TRUST_EXCHANGE,
  authority_conflict: AUTHORITY_CONFLICT,
  judgment_sanction: JUDGMENT_SANCTION,
  resource_split: RESOURCE_SPLIT,
  care_under_surveillance: CARE_UNDER_SURVEILLANCE,
};

export function getMechanic(id: MechanicId): MechanicTemplate {
  const m = MECHANIC_CATALOG[id];
  if (!m) throw new Error(`Unknown dilemma mechanic: ${id}`);
  return m;
}

export function allMechanics(): MechanicTemplate[] {
  return Object.values(MECHANIC_CATALOG);
}
