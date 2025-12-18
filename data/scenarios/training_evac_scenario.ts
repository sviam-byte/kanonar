

// data/scenarios/training_evac_scenario.ts
import { ScenarioDef, SocialActionId, ScenarioOutcome, WorldState } from "../../types";

export const TRAINING_EVAC_SCENARIO: ScenarioDef = {
  id: "training_evac",
  title: "Учебная эвакуация в спокойной обстановке",
  phases: [
    {
      id: "default",
      label: "Учебная фаза",
      description: "Отработка базовых действий.",
      missionGoalWeights: {},
      preferredActions: ["evacuate_wounded", "support_leader"],
      entryCondition: (metrics) => metrics.tick <= 1,
    }
  ],
  metrics: {
    tick: { min: 0, max: 1000, initial: 0 },
    timer: { min: 0, max: 100, initial: 80 },
    evac_total: { min: 0, max: 20, initial: 5 },
    evac_done: { min: 0, max: 20, initial: 0 },
    evac_missed: { min: 0, max: 20, initial: 0 },
    cohesion: { min: 0, max: 100, initial: 70 },
    // Other metrics to satisfy type
    threat: { min: 0, max: 100, initial: 0 },
    discipline: { min: 0, max: 100, initial: 100 },
    route_known: { min: 0, max: 100, initial: 100 },
    wounded_total: { min: 0, max: 10, initial: 5 },
    wounded_unsorted: { min: 0, max: 10, initial: 0 },
    wounded_stable: { min: 0, max: 10, initial: 5 },
    wounded_evacuated: { min: 0, max: 10, initial: 0 },
    wounded_dead: { min: 0, max: 10, initial: 0 },
    conflict: { min: 0, max: 100, initial: 0 },
    legitimacy: { min: 0, max: 100, initial: 70 },
    consensus: { min: 0, max: 100, initial: 80 },
    evac_started: { min: 0, max: 1, initial: 0 },
    consensus_streak: { min: 0, max: 20, initial: 0 }
  },
  actionEffects: [
    { actionId: "evacuate_wounded",
      metricDelta: { evac_done: 1, timer: -1, wounded_stable: -1, wounded_evacuated: 1 } },
    { actionId: "argue", 
      metricDelta: { cohesion: -5, timer: -1 } },
    { actionId: "support_leader",
      metricDelta: { cohesion: 3 } },
    { actionId: "wait",
      metricDelta: { timer: -1 } },
  ],
  phasePriorities: {
    default: ["evacuate_wounded", "support_leader"],
  },
  evaluateOutcome: (m, world) => {
    if (m.evac_done >= m.evac_total) {
      return { outcome: "full_success", summary: "Все эвакуированы на учебке." };
    }
    if (m.wounded_stable <= 0) {
        if (m.evac_done >= m.evac_total * 0.6) {
            return { outcome: "partial_success", summary: "Часть эвакуирована, но не все. Раненые закончились." };
        }
        return { outcome: "failure", summary: "Не успели эвакуировать достаточное количество." };
    }
    if (m.timer <= 0) {
      if (m.evac_done >= m.evac_total * 0.6) {
        return { outcome: "partial_success", summary: "Часть эвакуирована, остальное провалено." };
      }
      return { outcome: "failure", summary: "Не успели даже частично." };
    }
    return { outcome: "ongoing", summary: "Учебка продолжается." };
  },
  sceneGoals: [],
  roleSlots: [],
};
