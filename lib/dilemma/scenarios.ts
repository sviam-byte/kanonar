// lib/dilemma/scenarios.ts
//
// Scenario presets for DilemmaLab v2.
// Each preset is a skin / parameterization over a small set of reusable mechanics.

import { getMechanic } from './mechanics';
import type {
  ActionPresetOverride,
  ActionTemplate,
  ScenarioPreset,
  ScenarioStakes,
  ScenarioTemplate,
  ScenarioVisibility,
} from './types';

function mergeAction(base: ActionTemplate, override?: ActionPresetOverride): ActionTemplate | null {
  if (override?.disabled) return null;
  return {
    ...base,
    label: override?.label ?? base.label,
    description: override?.description ?? base.description,
    socialTags: override?.socialTags ?? base.socialTags,
    requires: override?.requires ?? base.requires,
    profile: {
      ...base.profile,
      ...(override?.profile ?? {}),
    },
    payoffVs: override?.payoffVs ?? base.payoffVs,
  };
}

function mergeStakes(base: ScenarioStakes, patch?: Partial<ScenarioStakes>): ScenarioStakes {
  return { ...base, ...(patch ?? {}) };
}

function mergeVisibility(base: ScenarioVisibility, patch?: Partial<ScenarioVisibility>): ScenarioVisibility {
  return { ...base, ...(patch ?? {}) };
}

export const SCENARIO_PRESETS: Record<string, ScenarioPreset> = {
  trust_interrogation: {
    id: 'trust_interrogation',
    name: 'Допрос: раскрыть или молчать',
    mechanicId: 'trust_exchange',
    dilemmaClass: 'trust',
    setup: 'Два союзника допрашиваются раздельно после провала операции.',
    institutionalPressure: 0.3,
    stakes: { personal: 0.8, relational: 0.7, institutional: 0.3, physical: 0.4 },
    visibility: { actionsVisible: false, audiencePresent: false, consequencesDeferred: true },
    actionOverrides: {
      cooperate: {
        label: 'Молчать',
        description: 'Не выдавать партнёра.',
        socialTags: ['support'],
        profile: { goalFit: -0.2, relationalFit: 0.8, identityFit: 0.6, legitimacyFit: 0.3, safetyFit: -0.4, mirrorFit: 0.7, expectedCost: 0.5 },
        payoffVs: { cooperate: 0.45, defect: -0.85, hedge: 0.05, manipulate: -0.6 },
      },
      defect: {
        label: 'Дать показания',
        description: 'Сдать напарника ради самосохранения.',
        socialTags: ['betrayal'],
        profile: { goalFit: 0.3, relationalFit: -0.9, identityFit: -0.3, legitimacyFit: -0.2, safetyFit: 0.7, mirrorFit: -0.8, expectedCost: 0.2 },
        payoffVs: { cooperate: 0.85, defect: -0.15, hedge: 0.5, manipulate: 0.2 },
      },
      hedge: {
        label: 'Частичная правда',
        description: 'Дать безопасную часть информации.',
        socialTags: ['neutral'],
        requires: { minTrait: { axis: 'E_Skill_opsec_hacking', threshold: 0.5 } },
        profile: { goalFit: 0.1, relationalFit: 0.2, identityFit: 0, legitimacyFit: -0.1, safetyFit: 0.3, mirrorFit: -0.1, expectedCost: 0.4 },
        payoffVs: { cooperate: 0.1, defect: -0.25, hedge: 0.15, manipulate: -0.15 },
      },
      manipulate: {
        label: 'Дезинформация',
        description: 'Запутать следствие ложной версией.',
        socialTags: ['deceive'],
        profile: { goalFit: 0.4, relationalFit: 0.3, identityFit: -0.2, legitimacyFit: -0.6, safetyFit: 0.2, mirrorFit: 0.0, expectedCost: 0.6 },
        payoffVs: { cooperate: 0.35, defect: -0.2, hedge: 0.15, manipulate: -0.1 },
      },
    },
  },
  opacity_deal: {
    id: 'opacity_deal',
    name: 'Торг в тумане',
    mechanicId: 'trust_exchange',
    dilemmaClass: 'opacity',
    setup: 'У каждого есть ценная информация и ограниченное доверие.',
    cooperativeActionId: 'hedge',
    institutionalPressure: 0.2,
    stakes: { personal: 0.5, relational: 0.3, institutional: 0.1, physical: 0.2 },
    visibility: { actionsVisible: false, audiencePresent: false, consequencesDeferred: true },
    actionOverrides: {
      cooperate: {
        label: 'Раскрыться полностью',
        description: 'Отдать всю информацию.',
        socialTags: ['support'],
        profile: { goalFit: 0.3, relationalFit: 0.6, identityFit: 0.2, legitimacyFit: 0, safetyFit: -0.7, mirrorFit: 0.5, expectedCost: 0.3 },
        payoffVs: { cooperate: 0.55, defect: -0.65, hedge: 0.15 },
      },
      hedge: {
        label: 'Частичная сделка',
        description: 'Обменять только часть.',
        socialTags: ['neutral'],
        profile: { goalFit: 0.5, relationalFit: 0.3, identityFit: 0, legitimacyFit: 0, safetyFit: 0.2, mirrorFit: 0.2, expectedCost: 0.3 },
        payoffVs: { cooperate: 0.3, defect: -0.1, hedge: 0.35 },
      },
      defect: {
        label: 'Не раскрываться',
        description: 'Получать данные, не раскрываясь.',
        socialTags: ['neutral'],
        profile: { goalFit: 0.2, relationalFit: -0.3, identityFit: 0.1, legitimacyFit: 0, safetyFit: 0.5, mirrorFit: -0.3, expectedCost: 0.1 },
        payoffVs: { cooperate: 0.45, defect: 0.1, hedge: 0.2 },
      },
      manipulate: {
        disabled: true,
      },
    },
  },
  protection_order: {
    id: 'protection_order',
    name: 'Приказ против защиты',
    mechanicId: 'authority_conflict',
    dilemmaClass: 'protection',
    setup: 'Легитимный приказ угрожает тому, кого нужно защищать.',
    institutionalPressure: 0.8,
    stakes: { personal: 0.5, relational: 0.9, institutional: 0.7, physical: 0.6 },
    visibility: { actionsVisible: true, audiencePresent: true, consequencesDeferred: false },
    actionOverrides: {
      comply: {
        label: 'Выполнить приказ',
        description: 'Следовать процедуре.',
        socialTags: ['hierarchical'],
        profile: { goalFit: 0.3, relationalFit: -0.6, identityFit: -0.4, legitimacyFit: 0.9, safetyFit: 0.3, mirrorFit: -0.3, expectedCost: 0.3 },
      },
      protect: {
        label: 'Защитить',
        description: 'Нарушить приказ ради защиты.',
        socialTags: ['support'],
        profile: { goalFit: 0.6, relationalFit: 0.9, identityFit: 0.7, legitimacyFit: -0.7, safetyFit: -0.3, mirrorFit: 0.5, expectedCost: 0.5 },
      },
      delay: {
        label: 'Оттянуть',
        description: 'Формально принять приказ, но затянуть.',
        socialTags: ['neutral'],
        requires: { minTrait: { axis: 'E_Skill_diplomacy_negotiation', threshold: 0.5 } },
        profile: { goalFit: 0.2, relationalFit: 0.3, identityFit: 0.1, legitimacyFit: -0.2, safetyFit: 0.1, mirrorFit: 0.1, expectedCost: 0.4 },
      },
      rupture: {
        label: 'Взять вину',
        description: 'Подставиться самому, чтобы защитить.',
        socialTags: ['support'],
        requires: { minTrait: { axis: 'D_pain_tolerance', threshold: 0.6 } },
        profile: { goalFit: 0.4, relationalFit: 0.7, identityFit: 0.5, legitimacyFit: 0, safetyFit: -0.8, mirrorFit: 0.6, expectedCost: 0.8 },
        payoffVs: { comply: 0.2, protect: 0.35, delay: 0.1, rupture: -0.05 },
      },
    },
  },
  // loyalty_conflict removed — structurally near-identical to protection_order
  // (same mechanic, same core actions: comply/protect/delay, similar stakes).
  // Merged into protection_order by raising its pressure ceiling.
  mutiny_order: {
    id: 'mutiny_order',
    name: 'Приказ, с которым нельзя согласиться',
    mechanicId: 'authority_conflict',
    dilemmaClass: 'mutiny',
    setup: 'Командир дал губительный приказ, есть шанс саботажа или перехвата.',
    cooperativeActionId: 'comply',
    institutionalPressure: 0.95,
    stakes: { personal: 0.7, relational: 0.8, institutional: 0.9, physical: 0.5 },
    visibility: { actionsVisible: true, audiencePresent: true, consequencesDeferred: false },
    actionOverrides: {
      comply: {
        label: 'Подчиниться',
        description: 'Выполнить приказ.',
        socialTags: ['hierarchical'],
        profile: { goalFit: -0.4, relationalFit: 0.3, identityFit: -0.5, legitimacyFit: 0.9, safetyFit: 0.2, mirrorFit: 0, expectedCost: 0.4 },
      },
      protect: {
        disabled: true,
      },
      delay: {
        label: 'Саботировать',
        description: 'Сорвать выполнение скрытно.',
        socialTags: ['betrayal'],
        requires: { minTrait: { axis: 'E_Skill_opsec_hacking', threshold: 0.4 } },
        profile: { goalFit: 0.5, relationalFit: -0.4, identityFit: 0.2, legitimacyFit: -0.8, safetyFit: -0.2, mirrorFit: -0.3, expectedCost: 0.5 },
        payoffVs: { comply: 0.25, delay: 0.15, rupture: 0.1 },
      },
      rupture: {
        label: 'Перехватить',
        description: 'Открыто взять контроль.',
        socialTags: ['harm'],
        requires: { minTrait: { axis: 'A_Power_Sovereignty', threshold: 0.7 } },
        profile: { goalFit: 0.7, relationalFit: -0.8, identityFit: 0.6, legitimacyFit: -1, safetyFit: -0.6, mirrorFit: -0.5, expectedCost: 0.7 },
      },
    },
  },
  authority_judgment: {
    id: 'authority_judgment',
    name: 'Суд командира',
    mechanicId: 'judgment_sanction',
    dilemmaClass: 'authority',
    setup: 'Нарушение протокола помогло миссии; нужно решить, как наказать.',
    institutionalPressure: 0.9,
    stakes: { personal: 0.3, relational: 0.6, institutional: 0.8, physical: 0.1 },
    visibility: { actionsVisible: true, audiencePresent: true, consequencesDeferred: false },
  },
  bargain_resource: {
    id: 'bargain_resource',
    name: 'Ресурсная передача',
    mechanicId: 'resource_split',
    dilemmaClass: 'bargain',
    setup: 'Ресурс нужно распределить между двумя сторонами.',
    institutionalPressure: 0.3,
    stakes: { personal: 0.6, relational: 0.5, institutional: 0.2, physical: 0.1 },
    visibility: { actionsVisible: false, audiencePresent: false, consequencesDeferred: false },
  },
  care_asymmetry: {
    id: 'care_asymmetry',
    name: 'Помощь ценой статуса',
    mechanicId: 'care_under_surveillance',
    dilemmaClass: 'care',
    setup: 'Помощь слабому снижает твой политический капитал.',
    institutionalPressure: 0.5,
    stakes: { personal: 0.4, relational: 0.7, institutional: 0.5, physical: 0.1 },
    visibility: { actionsVisible: true, audiencePresent: true, consequencesDeferred: false },
    disabled: true,
    disabledReason: 'Этот сценарий на деле триадный: помощь, получатель помощи и наблюдающая инстанция. В dyad-v2 он пока искажает механику.',
  },
  // ── Ultimatum ──
  ultimatum_ration: {
    id: 'ultimatum_ration',
    name: 'Раздел пайка',
    mechanicId: 'ultimatum_split',
    dilemmaClass: 'bargain',
    setup: 'Единственный комплект снаряжения. Один решает, как делить; другой может только принять или уничтожить.',
    institutionalPressure: 0.2,
    stakes: { personal: 0.7, relational: 0.5, institutional: 0.2, physical: 0.5 },
    visibility: { actionsVisible: true, audiencePresent: false, consequencesDeferred: false },
    actionOverrides: {
      offer_fair: {
        label: 'Поровну',
        description: 'Предложить равный раздел.',
        socialTags: ['support'],
      },
      offer_skewed: {
        label: 'Себе больше',
        description: 'Оставить большую часть себе.',
        socialTags: ['harm'],
      },
      accept: {
        label: 'Принять',
        description: 'Согласиться с предложенным.',
        socialTags: ['neutral'],
      },
      reject: {
        label: 'Уничтожить',
        description: 'Ни мне, ни тебе.',
        socialTags: ['harm', 'punish'],
      },
    },
  },
  // ── Volunteer ──
  volunteer_mission: {
    id: 'volunteer_mission',
    name: 'Опасная вылазка',
    mechanicId: 'volunteer_sacrifice',
    dilemmaClass: 'sacrifice',
    setup: 'Кто-то должен идти первым в нестабильную зону. Если никто не пойдёт — конвой стоит и теряет окно.',
    institutionalPressure: 0.5,
    stakes: { personal: 0.8, relational: 0.5, institutional: 0.5, physical: 0.8 },
    visibility: { actionsVisible: true, audiencePresent: true, consequencesDeferred: false },
    actionOverrides: {
      volunteer: {
        label: 'Пойти первым',
        description: 'Принять риск на себя.',
        socialTags: ['support', 'protect'],
      },
      wait: {
        label: 'Ждать',
        description: 'Надеяться, что пойдёт другой.',
        socialTags: ['neutral'],
      },
      push_other: {
        label: 'Указать на него',
        description: 'Открыто заявить: это его задача.',
        socialTags: ['harm', 'betrayal'],
      },
    },
  },
  volunteer_report: {
    id: 'volunteer_report',
    name: 'Кто доложит',
    mechanicId: 'volunteer_sacrifice',
    dilemmaClass: 'opacity',
    setup: 'Оба знают о нарушении в цепочке снабжения. Доклад несёт персональный риск, молчание — коллективный.',
    institutionalPressure: 0.7,
    stakes: { personal: 0.6, relational: 0.7, institutional: 0.8, physical: 0.2 },
    visibility: { actionsVisible: false, audiencePresent: false, consequencesDeferred: true },
    actionOverrides: {
      volunteer: {
        label: 'Доложить',
        description: 'Подать рапорт и принять последствия.',
        socialTags: ['support'],
        profile: { goalFit: 0.4, relationalFit: 0.3, identityFit: 0.7, legitimacyFit: 0.6, safetyFit: -0.5, mirrorFit: 0.4, expectedCost: 0.6 },
      },
      wait: {
        label: 'Молчать',
        description: 'Считать, что не моё дело.',
        socialTags: ['neutral'],
      },
      push_other: {
        label: 'Намекнуть ему',
        description: 'Дать понять, что он должен доложить.',
        socialTags: ['neutral'],
        profile: { goalFit: 0.3, relationalFit: -0.3, identityFit: 0.0, legitimacyFit: -0.1, safetyFit: 0.2, mirrorFit: -0.2, expectedCost: 0.1 },
      },
    },
  },
  // ── Signaling ──
  signal_distress: {
    id: 'signal_distress',
    name: 'Сигнал бедствия',
    mechanicId: 'signaling_trust',
    dilemmaClass: 'trust',
    setup: 'Пришёл сигнал бедствия с неизвестного маршрута. Один может подать сигнал, другой — решить, реагировать ли.',
    institutionalPressure: 0.3,
    stakes: { personal: 0.5, relational: 0.6, institutional: 0.2, physical: 0.7 },
    visibility: { actionsVisible: false, audiencePresent: false, consequencesDeferred: true },
    actionOverrides: {
      costly_signal: {
        label: 'Маркер с привязкой',
        description: 'Передать координаты и подтвердить присутствие — раскрыть себя.',
        socialTags: ['support'],
      },
      cheap_signal: {
        label: 'Анонимный маркер',
        description: 'Передать сигнал без привязки к себе.',
        socialTags: ['neutral'],
      },
      silence: {
        label: 'Молчать',
        description: 'Не подавать сигнала.',
        socialTags: ['neutral'],
      },
      trust_signal: {
        label: 'Выдвинуться',
        description: 'Довериться сигналу и направить ресурсы.',
        socialTags: ['support', 'protect'],
      },
      test_signal: {
        label: 'Разведка',
        description: 'Отправить разведку для подтверждения.',
        socialTags: ['neutral'],
        requires: { minTrait: { axis: 'E_Skill_ops_fieldcraft', threshold: 0.4 } },
      },
      ignore_signal: {
        label: 'Проигнорировать',
        description: 'Не тратить ресурсы на непроверенное.',
        socialTags: ['neutral'],
      },
    },
  },
};

/**
 * Resolves a preset into an executable scenario template by applying action
 * overrides on top of the selected mechanic base.
 */
function resolveScenarioPreset(preset: ScenarioPreset): ScenarioTemplate {
  const mechanic = getMechanic(preset.mechanicId);
  const actionPool = mechanic.actionPool
    .map((a) => mergeAction(a, preset.actionOverrides?.[a.id]))
    .filter((a): a is ActionTemplate => Boolean(a));

  const cooperativeActionId = preset.cooperativeActionId ?? mechanic.defaultCooperativeActionId;
  if (!actionPool.some((a) => a.id === cooperativeActionId)) {
    throw new Error(`Scenario preset ${preset.id} points to missing cooperative action: ${cooperativeActionId}`);
  }

  return {
    id: preset.id,
    name: preset.name,
    mechanicId: mechanic.id,
    mechanicName: mechanic.name,
    mechanicDescription: mechanic.description,
    dilemmaClass: preset.dilemmaClass,
    setup: preset.setup,
    cooperativeActionId,
    actionPool,
    stakes: mergeStakes(mechanic.defaultStakes, preset.stakes),
    visibility: mergeVisibility(mechanic.defaultVisibility, preset.visibility),
    institutionalPressure: preset.institutionalPressure ?? mechanic.defaultInstitutionalPressure,
    disabled: preset.disabled,
    disabledReason: preset.disabledReason,
  };
}

export const RESOLVED_SCENARIO_CATALOG: Record<string, ScenarioTemplate> = Object.fromEntries(
  Object.values(SCENARIO_PRESETS).map((preset) => [preset.id, resolveScenarioPreset(preset)]),
);

export const SCENARIO_CATALOG: Record<string, ScenarioTemplate> = Object.fromEntries(
  Object.values(RESOLVED_SCENARIO_CATALOG)
    .filter((scenario) => !scenario.disabled)
    .map((scenario) => [scenario.id, scenario]),
);

export function getScenario(id: string): ScenarioTemplate {
  const s = SCENARIO_CATALOG[id];
  if (!s) throw new Error(`Unknown active scenario: ${id}. Available: ${Object.keys(SCENARIO_CATALOG).join(', ')}`);
  return s;
}

export function getScenarioResolved(id: string): ScenarioTemplate {
  const s = RESOLVED_SCENARIO_CATALOG[id];
  if (!s) throw new Error(`Unknown scenario preset: ${id}. Available: ${Object.keys(RESOLVED_SCENARIO_CATALOG).join(', ')}`);
  return s;
}

export function allScenarios(options?: { includeDisabled?: boolean }): ScenarioTemplate[] {
  const includeDisabled = options?.includeDisabled ?? false;
  return includeDisabled ? Object.values(RESOLVED_SCENARIO_CATALOG) : Object.values(SCENARIO_CATALOG);
}

export function allScenarioPresets(): ScenarioPreset[] {
  return Object.values(SCENARIO_PRESETS);
}
