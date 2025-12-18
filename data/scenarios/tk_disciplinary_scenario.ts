

import { ScenarioDef, SocialActionId, ScenarioOutcome, WorldState } from "../../types";

export const TK_DISCIPLINARY_SCENARIO: ScenarioDef = {
  id: "tk_disciplinary",
  title: "Крепость: Дисциплинарный разбор",
  phases: [
    {
      id: "accusation",
      label: "Обвинение",
      description: "Теган предъявляет претензии к качеству исполнения. Кристар или другие должны реагировать.",
      missionGoalWeights: { maintain_legitimacy: 0.8, avoid_blame: 0.4 },
      preferredActions: ["intimidate", "blame_other", "ask_question"],
      entryCondition: (metrics) => metrics.tick <= 1,
      exitCondition: (metrics) => metrics.conflict >= 40 || metrics.legitimacy >= 80,
    },
    {
      id: "judgment",
      label: "Вердикт / Реакция",
      description: "Группа реагирует: сплочение вокруг лидера или тихий ропот.",
      missionGoalWeights: { maintain_cohesion: 0.6, protect_other: 0.3 },
      preferredActions: ["support_leader", "reassure", "share_personal_belief", "refuse_order"],
      entryCondition: (metrics) => metrics.conflict >= 40 || metrics.legitimacy >= 80,
      exitCondition: (metrics) => metrics.timer <= 0,
    }
  ],
  metrics: {
    tick: { min: 0, max: 1000, initial: 0 },
    timer: { min: 0, max: 100, initial: 50 },
    threat: { min: 0, max: 100, initial: 0 },
    discipline: { min: 0, max: 100, initial: 50 },
    conflict: { min: 0, max: 100, initial: 20 },
    legitimacy: { min: 0, max: 100, initial: 60 }, // Ключевой ресурс Тегана
    consensus: { min: 0, max: 100, initial: 50 },   // Согласие группы с решением
    // Заглушки
    route_known: { min: 0, max: 100, initial: 0 },
    wounded_total: { min: 0, max: 10, initial: 0 },
    wounded_unsorted: { min: 0, max: 10, initial: 0 },
    wounded_stable: { min: 0, max: 10, initial: 0 },
    wounded_evacuated: { min: 0, max: 10, initial: 0 },
    wounded_dead: { min: 0, max: 10, initial: 0 },
    cohesion: { min: 0, max: 100, initial: 50 },
    evac_total: { min: 0, max: 10, initial: 0 },
    evac_done: { min: 0, max: 10, initial: 0 },
    evac_missed: { min: 0, max: 10, initial: 0 },
    evac_started: { min: 0, max: 1, initial: 0 },
    consensus_streak: { min: 0, max: 20, initial: 0 }
  },
  actionEffects: [
    { actionId: "intimidate", metricDelta: { legitimacy: 2, conflict: 5, consensus: -2 } },
    { actionId: "blame_other", metricDelta: { conflict: 8, consensus: -5 } },
    { actionId: "support_leader", metricDelta: { legitimacy: 4, consensus: 3, conflict: -2 } },
    { actionId: "reassure", metricDelta: { conflict: -5, consensus: 2 } },
    { actionId: "refuse_order", metricDelta: { legitimacy: -10, conflict: 10 } },
    { actionId: "share_personal_belief", metricDelta: { consensus: 4 } },
    { actionId: "wait", metricDelta: { timer: -1 } },
  ],
  objectives: {
      "character-tegan-nots": { "intimidate": 2.0, "issue_order": 1.5, "blame_other": 0.5 },
      "character-krystar-mann": { "acknowledge_order": 3.0, "reassure": 1.0, "blame_other": -5.0 }, // Кристар берет вину на себя
      "character-bernard": { "support_leader": 1.0, "intimidate": 0.5 }, 
      "character-larson": { "share_personal_belief": 2.0, "observe": 1.0 }, // Ларсон оценивает
      "character-olaf": { "observe": 2.0 },
  },
  evaluateOutcome: (m, world) => {
    if (m.timer <= 0) {
        if (m.legitimacy >= 80 && m.consensus >= 60) {
            return { outcome: "full_success", summary: "Авторитет Тегана абсолютен. Группа приняла урок." };
        }
        if (m.legitimacy >= 50) {
            return { outcome: "partial_success", summary: "Разбор закончен, но осадок остался." };
        }
        return { outcome: "failure", summary: "Авторитет подорван. В рядах брожение." };
    }
    if (m.conflict >= 90) {
        return { outcome: "failure", summary: "Разбор перерос в открытый конфликт!" };
    }
    return { outcome: "ongoing", summary: "Разбор продолжается." };
  },
  sceneGoals: [],
  roleSlots: [
      { roleId: "judge", count: 1, capabilityProfile: { command: 1.0 }, goalProfile: { maintain_legitimacy: 1.0 } },
      { roleId: "accused", count: 1, capabilityProfile: {}, goalProfile: { redeem_self: 1.0 } },
      { roleId: "jury", count: 4, capabilityProfile: {}, goalProfile: { maintain_cohesion: 0.5 } }
  ],
};
