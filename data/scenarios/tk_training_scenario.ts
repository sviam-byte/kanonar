
import { ScenarioDef, SocialActionId, ScenarioOutcome, WorldState } from "../../types";
import { TK_TRAINING_CONTEXT } from "./tk_training_context";

export const TK_TRAINING_SCENARIO: ScenarioDef = {
  id: "tk_training",
  title: "Крепость: Строевая тренировка",
  contextConfig: TK_TRAINING_CONTEXT,
  phases: [
    {
      id: "warmup",
      label: "Разминка / Построение",
      description: "Личный состав строится. Теган проверяет готовность. Задача — войти в ритм подчинения.",
      missionGoalWeights: { maintain_legitimacy: 0.5, follow_order: 0.5 },
      preferredActions: ["issue_order", "acknowledge_order", "wait"],
      entryCondition: (metrics) => metrics.tick <= 1,
      exitCondition: (metrics) => metrics.discipline >= 60,
    },
    {
      id: "drill",
      label: "Активная фаза",
      description: "Выполнение маневров. Нагрузка растет. Кристар должен показывать пример.",
      missionGoalWeights: { maintain_cohesion: 0.6, immediate_compliance: 0.4 },
      preferredActions: ["issue_order", "support_leader", "coordinate_search", "triage_wounded"], // симуляция отработки
      panicActions: ["refuse_order", "blame_other"],
      entryCondition: (metrics) => metrics.discipline >= 60,
      exitCondition: (metrics) => metrics.timer <= 10,
    }
  ],
  metrics: {
    tick: { min: 0, max: 1000, initial: 0 },
    timer: { min: 0, max: 100, initial: 60 },
    threat: { min: 0, max: 100, initial: 10 }, // Здесь угроза — это риск травмы/ошибки
    discipline: { min: 0, max: 100, initial: 40 },
    cohesion: { min: 0, max: 100, initial: 50 },
    // Технические заглушки
    route_known: { min: 0, max: 100, initial: 100 },
    wounded_total: { min: 0, max: 10, initial: 0 },
    wounded_unsorted: { min: 0, max: 10, initial: 0 },
    wounded_stable: { min: 0, max: 10, initial: 0 },
    wounded_evacuated: { min: 0, max: 10, initial: 0 },
    wounded_dead: { min: 0, max: 10, initial: 0 },
    evac_total: { min: 0, max: 10, initial: 0 },
    evac_done: { min: 0, max: 10, initial: 0 },
    evac_missed: { min: 0, max: 10, initial: 0 },
    conflict: { min: 0, max: 100, initial: 0 },
    legitimacy: { min: 0, max: 100, initial: 50 },
    consensus: { min: 0, max: 100, initial: 100 },
    evac_started: { min: 0, max: 1, initial: 0 },
    consensus_streak: { min: 0, max: 20, initial: 0 }
  },
  actionEffects: [
    { actionId: "issue_order", metricDelta: { discipline: 5, legitimacy: 2 } },
    { actionId: "acknowledge_order", metricDelta: { discipline: 3, cohesion: 1 } },
    { actionId: "refuse_order", metricDelta: { discipline: -15, conflict: 10 } },
    { actionId: "support_leader", metricDelta: { legitimacy: 3, cohesion: 2 } },
    { actionId: "form_subgroup", metricDelta: { cohesion: -10, discipline: -5 } },
    // Игровые действия для "тренировки"
    { actionId: "triage_wounded", metricDelta: { timer: -2, threat: -5 }, roleBonus: { medic: 0.5 } },
    { actionId: "coordinate_search", metricDelta: { timer: -2, cohesion: 3 } },
  ],
  objectives: {
      "character-tegan-nots": { "issue_order": 3.0, "support_leader": 0.5 },
      "character-krystar-mann": { "acknowledge_order": 3.0, "support_leader": 2.0, "triage_wounded": 1.0 },
      "character-bernard": { "acknowledge_order": 2.0, "intimidate": 0.5 }, // Бернард может рычать на других
      "character-olaf": { "acknowledge_order": 2.0, "observe": 1.0 },
      "character-larson": { "observe": 2.0, "support_leader": 1.0 }, // Ларсон оценивает
      "character-brand": { "acknowledge_order": 2.5, "support_leader": 1.5 }, // Бранд старается
  },
  evaluateOutcome: (m, world) => {
    if (m.timer <= 0) {
      if (m.discipline >= 80 && m.cohesion >= 70) {
          return { outcome: "full_success", summary: "Тренировка прошла идеально. Гвардия — единый механизм." };
      }
      if (m.discipline >= 50) {
          return { outcome: "partial_success", summary: "Нормативы выполнены, но есть шероховатости." };
      }
      return { outcome: "failure", summary: "Бардак в строю. Теган в ярости." };
    }
    if (m.conflict >= 60) {
        return { outcome: "failure", summary: "Тренировка сорвана дракой или бунтом." };
    }
    return { outcome: "ongoing", summary: "Тренировка продолжается..." };
  },
  sceneGoals: [],
  roleSlots: [
      { roleId: "commander", count: 1, capabilityProfile: { command: 1.0 }, goalProfile: { maintain_legitimacy: 1.0 } },
      { roleId: "sergeant", count: 1, capabilityProfile: { command: 0.6, stamina: 0.8 }, goalProfile: { follow_order: 1.0 } },
      { roleId: "trooper", count: 4, capabilityProfile: { stamina: 0.5 }, goalProfile: { follow_order: 0.8 } }
  ],
};
