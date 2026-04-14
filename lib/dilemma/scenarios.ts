// lib/dilemma/scenarios.ts
//
// Scenario catalog for DilemmaLab v2.

import type { ScenarioTemplate, ActionTemplate, DilemmaClass } from './types';

function action(
  id: string,
  label: string,
  description: string,
  socialTags: string[],
  profile: ActionTemplate['profile'],
  requires?: ActionTemplate['requires'],
): ActionTemplate {
  return { id, label, description, socialTags, profile, requires };
}

function scenario(
  id: string,
  name: string,
  dilemmaClass: DilemmaClass,
  setup: string,
  cooperativeActionId: string,
  institutionalPressure: number,
  actionPool: ActionTemplate[],
  stakes: ScenarioTemplate['stakes'],
  visibility: ScenarioTemplate['visibility'],
): ScenarioTemplate {
  return { id, name, dilemmaClass, setup, cooperativeActionId, institutionalPressure, actionPool, stakes, visibility };
}

export const TRUST_INTERROGATION = scenario(
  'trust_interrogation',
  'Допрос: раскрыть или молчать',
  'trust',
  'Два союзника допрашиваются раздельно после провала операции.',
  'stay_silent',
  0.3,
  [
    action('stay_silent', 'Молчать', 'Не выдавать партнёра.', ['support'], { goalFit: -0.2, relationalFit: 0.8, identityFit: 0.6, legitimacyFit: 0.3, safetyFit: -0.4, mirrorFit: 0.7, expectedCost: 0.5 }),
    action('give_testimony', 'Дать показания', 'Сдать напарника ради самосохранения.', ['betrayal'], { goalFit: 0.3, relationalFit: -0.9, identityFit: -0.3, legitimacyFit: -0.2, safetyFit: 0.7, mirrorFit: -0.8, expectedCost: 0.2 }),
    action('partial_truth', 'Частичная правда', 'Дать безопасную часть информации.', ['neutral'], { goalFit: 0.1, relationalFit: 0.2, identityFit: 0, legitimacyFit: -0.1, safetyFit: 0.3, mirrorFit: -0.1, expectedCost: 0.4 }, { minTrait: { axis: 'E_Skill_opsec_hacking', threshold: 0.5 } }),
    action('disinform', 'Дезинформация', 'Запутать следствие ложной версией.', ['deceive'], { goalFit: 0.4, relationalFit: 0.3, identityFit: -0.2, legitimacyFit: -0.6, safetyFit: 0.2, mirrorFit: 0.0, expectedCost: 0.6 }),
  ],
  { personal: 0.8, relational: 0.7, institutional: 0.3, physical: 0.4 },
  { actionsVisible: false, audiencePresent: false, consequencesDeferred: true },
);

export const PROTECTION_ORDER = scenario(
  'protection_order',
  'Приказ против защиты',
  'protection',
  'Легитимный приказ угрожает тому, кого нужно защищать.',
  'protect_ward',
  0.8,
  [
    action('execute_order', 'Выполнить приказ', 'Следовать процедуре.', ['hierarchical'], { goalFit: 0.3, relationalFit: -0.6, identityFit: -0.4, legitimacyFit: 0.9, safetyFit: 0.3, mirrorFit: -0.3, expectedCost: 0.3 }),
    action('protect_ward', 'Защитить', 'Нарушить приказ ради защиты.', ['support'], { goalFit: 0.6, relationalFit: 0.9, identityFit: 0.7, legitimacyFit: -0.7, safetyFit: -0.3, mirrorFit: 0.5, expectedCost: 0.5 }),
    action('negotiate_delay', 'Оттянуть', 'Формально принять приказ, но затянуть.', ['neutral'], { goalFit: 0.2, relationalFit: 0.3, identityFit: 0.1, legitimacyFit: -0.2, safetyFit: 0.1, mirrorFit: 0.1, expectedCost: 0.4 }, { minTrait: { axis: 'E_Skill_diplomacy_negotiation', threshold: 0.5 } }),
    action('take_blame', 'Взять вину', 'Подставиться самому, чтобы защитить.', ['support'], { goalFit: 0.4, relationalFit: 0.7, identityFit: 0.5, legitimacyFit: 0, safetyFit: -0.8, mirrorFit: 0.6, expectedCost: 0.8 }, { minTrait: { axis: 'D_pain_tolerance', threshold: 0.6 } }),
  ],
  { personal: 0.5, relational: 0.9, institutional: 0.7, physical: 0.6 },
  { actionsVisible: true, audiencePresent: true, consequencesDeferred: false },
);

export const AUTHORITY_JUDGMENT = scenario(
  'authority_judgment',
  'Суд командира',
  'authority',
  'Нарушение протокола помогло миссии; нужно решить, как наказать.',
  'pardon',
  0.9,
  [
    action('punish', 'Наказать', 'Применить санкцию по протоколу.', ['harm', 'punish'], { goalFit: 0.2, relationalFit: -0.5, identityFit: 0.3, legitimacyFit: 0.9, safetyFit: 0.2, mirrorFit: -0.4, expectedCost: 0.2 }, { roles: ['commander', 'caretaker', 'advisor'] }),
    action('pardon', 'Помиловать', 'Простить с предупреждением.', ['support'], { goalFit: 0.3, relationalFit: 0.6, identityFit: 0, legitimacyFit: -0.5, safetyFit: -0.1, mirrorFit: 0.4, expectedCost: 0.1 }),
    action('delegate', 'Делегировать', 'Передать решение инстанции.', ['neutral'], { goalFit: 0.0, relationalFit: 0.1, identityFit: -0.3, legitimacyFit: 0.4, safetyFit: 0.4, mirrorFit: -0.2, expectedCost: 0.1 }),
  ],
  { personal: 0.3, relational: 0.6, institutional: 0.8, physical: 0.1 },
  { actionsVisible: true, audiencePresent: true, consequencesDeferred: false },
);

export const LOYALTY_CONFLICT = scenario(
  'loyalty_conflict',
  'Верность: институт или человек',
  'loyalty',
  'Институция требует выдать человека, которого ты защищаешь.',
  'protect_individual',
  1,
  [
    action('comply_institution', 'Выдать', 'Подчиниться институции.', ['betrayal'], { goalFit: 0.2, relationalFit: -0.9, identityFit: -0.5, legitimacyFit: 0.8, safetyFit: 0.5, mirrorFit: -0.7, expectedCost: 0.3 }),
    action('protect_individual', 'Защитить', 'Отказать институции, сохранить верность человеку.', ['support', 'protect'], { goalFit: 0.5, relationalFit: 0.9, identityFit: 0.6, legitimacyFit: -0.8, safetyFit: -0.4, mirrorFit: 0.6, expectedCost: 0.5 }),
    action('negotiate_both', 'Договориться', 'Искать компромисс.', ['neutral'], { goalFit: 0.4, relationalFit: 0.4, identityFit: 0.2, legitimacyFit: 0.2, safetyFit: 0.1, mirrorFit: 0.3, expectedCost: 0.6 }, { minTrait: { axis: 'E_Skill_diplomacy_negotiation', threshold: 0.6 } }),
  ],
  { personal: 0.6, relational: 0.9, institutional: 0.9, physical: 0.3 },
  { actionsVisible: true, audiencePresent: true, consequencesDeferred: false },
);

export const OPACITY_DEAL = scenario(
  'opacity_deal',
  'Торг в тумане',
  'opacity',
  'У каждого есть ценная информация и ограниченное доверие.',
  'reveal_partial',
  0.2,
  [
    action('reveal_full', 'Раскрыться полностью', 'Отдать всю информацию.', ['support'], { goalFit: 0.3, relationalFit: 0.6, identityFit: 0.2, legitimacyFit: 0, safetyFit: -0.7, mirrorFit: 0.5, expectedCost: 0.3 }),
    action('reveal_partial', 'Частичная сделка', 'Обменять только часть.', ['neutral'], { goalFit: 0.5, relationalFit: 0.3, identityFit: 0, legitimacyFit: 0, safetyFit: 0.2, mirrorFit: 0.2, expectedCost: 0.3 }),
    action('stay_opaque', 'Не раскрываться', 'Получать данные, не раскрываясь.', ['neutral'], { goalFit: 0.2, relationalFit: -0.3, identityFit: 0.1, legitimacyFit: 0, safetyFit: 0.5, mirrorFit: -0.3, expectedCost: 0.1 }),
  ],
  { personal: 0.5, relational: 0.3, institutional: 0.1, physical: 0.2 },
  { actionsVisible: false, audiencePresent: false, consequencesDeferred: true },
);

export const MUTINY_ORDER = scenario(
  'mutiny_order',
  'Приказ, с которым нельзя согласиться',
  'mutiny',
  'Командир дал губительный приказ, есть шанс саботажа/перехвата.',
  'obey',
  0.95,
  [
    action('obey', 'Подчиниться', 'Выполнить приказ.', ['hierarchical'], { goalFit: -0.4, relationalFit: 0.3, identityFit: -0.5, legitimacyFit: 0.9, safetyFit: 0.2, mirrorFit: 0, expectedCost: 0.4 }),
    action('sabotage', 'Саботировать', 'Сорвать выполнение скрытно.', ['betrayal'], { goalFit: 0.5, relationalFit: -0.4, identityFit: 0.2, legitimacyFit: -0.8, safetyFit: -0.2, mirrorFit: -0.3, expectedCost: 0.5 }, { minTrait: { axis: 'E_Skill_opsec_hacking', threshold: 0.4 } }),
    action('seize_initiative', 'Перехватить', 'Открыто взять контроль.', ['harm'], { goalFit: 0.7, relationalFit: -0.8, identityFit: 0.6, legitimacyFit: -1, safetyFit: -0.6, mirrorFit: -0.5, expectedCost: 0.7 }, { minTrait: { axis: 'A_Power_Sovereignty', threshold: 0.7 } }),
  ],
  { personal: 0.7, relational: 0.8, institutional: 0.9, physical: 0.5 },
  { actionsVisible: true, audiencePresent: true, consequencesDeferred: false },
);

export const CARE_ASYMMETRY = scenario(
  'care_asymmetry',
  'Помощь ценой статуса',
  'care',
  'Помощь слабому снижает твой политический капитал.',
  'help_openly',
  0.5,
  [
    action('help_openly', 'Помочь открыто', 'Помочь публично и принять издержки.', ['support', 'help'], { goalFit: 0.2, relationalFit: 0.8, identityFit: 0.5, legitimacyFit: -0.2, safetyFit: -0.3, mirrorFit: 0.6, expectedCost: 0.4 }),
    action('help_covertly', 'Помочь скрытно', 'Снизить репутационные потери.', ['support'], { goalFit: 0.3, relationalFit: 0.5, identityFit: 0.2, legitimacyFit: -0.3, safetyFit: 0.1, mirrorFit: 0.0, expectedCost: 0.4 }, { minTrait: { axis: 'E_Skill_opsec_hacking', threshold: 0.4 } }),
    action('refuse', 'Отказать', 'Сохранить позицию, не помогать.', ['neutral'], { goalFit: 0.0, relationalFit: -0.5, identityFit: -0.3, legitimacyFit: 0.3, safetyFit: 0.5, mirrorFit: -0.4, expectedCost: 0.0 }),
  ],
  { personal: 0.4, relational: 0.7, institutional: 0.5, physical: 0.1 },
  { actionsVisible: true, audiencePresent: true, consequencesDeferred: false },
);

export const BARGAIN_RESOURCE = scenario(
  'bargain_resource',
  'Ресурсная передача',
  'bargain',
  'Ресурс нужно распределить между двумя сторонами.',
  'share_fair',
  0.3,
  [
    action('share_fair', 'Честный раздел', 'Разделить справедливо.', ['support'], { goalFit: 0.4, relationalFit: 0.6, identityFit: 0.3, legitimacyFit: 0.5, safetyFit: 0.0, mirrorFit: 0.5, expectedCost: 0.2 }),
    action('take_all', 'Забрать всё', 'Максимизировать личную выгоду.', ['harm'], { goalFit: 0.6, relationalFit: -0.8, identityFit: -0.2, legitimacyFit: -0.6, safetyFit: 0.3, mirrorFit: -0.7, expectedCost: 0.1 }),
    action('offer_more', 'Отдать больше', 'Показать добрую волю.', ['support'], { goalFit: 0.1, relationalFit: 0.8, identityFit: 0.4, legitimacyFit: 0.2, safetyFit: -0.2, mirrorFit: 0.8, expectedCost: 0.3 }),
  ],
  { personal: 0.6, relational: 0.5, institutional: 0.2, physical: 0.1 },
  { actionsVisible: false, audiencePresent: false, consequencesDeferred: false },
);

export const SCENARIO_CATALOG: Record<string, ScenarioTemplate> = {
  trust_interrogation: TRUST_INTERROGATION,
  protection_order: PROTECTION_ORDER,
  authority_judgment: AUTHORITY_JUDGMENT,
  loyalty_conflict: LOYALTY_CONFLICT,
  opacity_deal: OPACITY_DEAL,
  mutiny_order: MUTINY_ORDER,
  care_asymmetry: CARE_ASYMMETRY,
  bargain_resource: BARGAIN_RESOURCE,
};

export function getScenario(id: string): ScenarioTemplate {
  const s = SCENARIO_CATALOG[id];
  if (!s) throw new Error(`Unknown scenario: ${id}. Available: ${Object.keys(SCENARIO_CATALOG).join(', ')}`);
  return s;
}

export function allScenarios(): ScenarioTemplate[] {
  return Object.values(SCENARIO_CATALOG);
}
