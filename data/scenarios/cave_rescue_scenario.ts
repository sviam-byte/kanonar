

// data/scenarios/cave_rescue_scenario.ts
import { ScenarioDef, SocialActionId, ScenarioOutcome, WorldState } from "../../types";

export const CAVE_RESCUE_SCENARIO: ScenarioDef = {
  id: "cave_rescue",
  title: "Спасение после обрушения",
  topology: {
    nodes: [
        { id: "start_zone", label: "Зона сбора", description: "Относительно безопасное место, где собралась группа." },
        { id: "debris_field", label: "Завал", description: "Нестабильная зона, требующая расчистки." },
        { id: "exit_tunnel", label: "Туннель к выходу", description: "Путь на поверхность, требует разведки." }
    ],
    edges: [
        { from: "start_zone", to: "debris_field", type: "blocked" },
        { from: "debris_field", to: "exit_tunnel", type: "hidden" }
    ]
  },
  // Hardcode roles for key characters
  defaultRoles: {
      'character-tegan-nots': 'incident_leader',
      'character-krystar-mann': 'stabilizer_guard',
      'master-gideon': 'tactical_coordinator', 
  },
  
  // NEW: Context Engine Configuration
  contextConfig: {
      id: "cave_rescue_ctx",
      label: "Контекст Спасения",
      kind: "rescue",
      contextMode: "physical_survival",
      governance: "hierarchical",
      map: { locations: [], connections: [] }, // Topology handled by legacy field for now
      affordances: [],
      stages: [],
      activeNorms: ["protocol_compliance", "protect_own"],
      contextSeed: [
          // Initial shared facts
          { 
              id: "fact-collapse", kind: "fact", scope: "shared", 
              prop: "tunnel_collapsed", label: "Туннель обрушен", 
              confidence: 1.0, createdTick: 0, source: "system" 
          }
      ],
      contextRules: [
          {
              id: "rule-threat-escalation",
              when: (w) => (w.contextEx.metrics["threat"] ?? 0) > 80,
              thenAdd: (w) => [{
                  id: `event-panic-${w.tick}`, kind: "event", scope: "shared",
                  label: "Паника нарастает", createdTick: w.tick, confidence: 1.0, source: "system"
              }]
          }
      ],
      outcomeRules: { success: [], failure: [] }
  },

  phases: [
    {
      id: "search_and_stabilize",
      label: "Поиск и Стабилизация",
      description: "Группа в критическом состоянии. Необходимо одновременно искать выход и оказывать первую помощь раненым.",
      missionGoalWeights: { seek_information: 0.5, help_wounded: 0.5, maintain_cohesion: 0.2 },
      preferredActions: ["observe", "ask_status", "search_route", "triage_wounded", "reassure", "self_treat", "broadcast_plan"] as SocialActionId[],
      panicActions: ["blame_other", "refuse_order", "intimidate"] as SocialActionId[],
      allowedActionTags: ["care", "physical", "progress", "social", "hierarchy", "risk", "recovery", "topo", "communication", "coordination"],
      bannedActionTags: ["politics", "humiliation", "punishment", "deception", "boundary"],
      entryCondition: (metrics) => metrics.tick <= 1,
      exitCondition: (metrics) => metrics.route_known >= 50 && metrics.wounded_unsorted <= 0,
    },
    {
      id: "evacuation",
      label: "Эвакуация",
      description: "Раненые стабилизированы. Главная задача - эвакуировать всех к выходу.",
      missionGoalWeights: { go_to_surface: 0.7, protect_other: 0.2 },
      preferredActions: ["evacuate_wounded", "clear_debris", "protect_exit", "support_leader"] as SocialActionId[],
      panicActions: ["retreat", "challenge_leader"] as SocialActionId[],
      allowedActionTags: ["physical", "progress", "care", "social", "hierarchy", "risk", "coordination"],
      bannedActionTags: ["politics", "humiliation", "punishment", "deception", "boundary"],
      entryCondition: (metrics) => metrics.route_known >= 50 && metrics.wounded_unsorted <= 0,
      exitCondition: (metrics) => (metrics.wounded_evacuated + metrics.wounded_dead) >= metrics.wounded_total,
    }
  ],
  evaluateOutcome: (metrics, world) => {
    // Failure conditions checked first
    if (metrics.timer <= 0) {
        if (metrics.wounded_evacuated >= metrics.wounded_total * 0.6) {
            return { outcome: "partial_success", summary: "Время вышло, но удалось эвакуировать большинство." };
        }
        return { outcome: "failure", summary: "Время вышло. Миссия провалена." };
    }
    if (metrics.threat >= 120 || metrics.discipline <= 0) {
        return { outcome: "failure", summary: "Угроза или дисциплина вышли из-под контроля." };
    }

    // Success conditions
    if ((metrics.wounded_evacuated + metrics.wounded_dead) >= metrics.wounded_total) {
        const avgCare = world.agents.reduce((s, a) => s + (a.vector_base?.ARCH_CARE ?? 0.5), 0) / world.agents.length;
        const avgManip = world.agents.reduce((s, a) => s + (a.vector_base?.ARCH_MANIP ?? 0.5), 0) / world.agents.length;

        if (avgCare < 0.35 || avgManip > 0.65) {
             return { outcome: "partial_success", summary: "Все эвакуированы, но методы группы были сомнительными, что привело к дополнительным проблемам." };
        }
        
        if (metrics.wounded_dead === 0 && metrics.discipline > 0) {
            return { outcome: "full_success", summary: "Все раненые эвакуированы без потерь." };
        } else if (metrics.wounded_dead <= 1 && metrics.discipline > 0) {
            return { outcome: "full_success", summary: "Все раненые эвакуированы с минимальными потерями." };
        } else {
            return { outcome: "partial_success", summary: "Эвакуация завершена, но с заметными потерями или падением дисциплины." };
        }
    }
    
    return { outcome: "ongoing", summary: "Симуляция продолжается." };
  },
  metrics: {
    tick: { min: 0, max: 1000, initial: 0 },
    timer: { min: 0, max: 300, initial: 200 },
    threat: { min: 0, max: 150, initial: 40 },
    discipline: { min: -20, max: 100, initial: 85 },
    route_known: { min: 0, max: 100, initial: 30 },
    wounded_total: { min: 0, max: 20, initial: 8 },
    wounded_unsorted: { min: 0, max: 20, initial: 8 },
    wounded_stable: { min: 0, max: 20, initial: 0 },
    wounded_evacuated: { min: 0, max: 20, initial: 0 },
    wounded_dead: { min: 0, max: 20, initial: 0 },
    cohesion: { min: 0, max: 100, initial: 75 },
    evac_total: { min: 0, max: 20, initial: 8 },
    evac_done: { min: 0, max: 20, initial: 0 },
    evac_missed: { min: 0, max: 20, initial: 0 },
    conflict: { min: 0, max: 100, initial: 20 },
    legitimacy: { min: 0, max: 100, initial: 70 },
    consensus: { min: 0, max: 100, initial: 50 },
    evac_started: { min: 0, max: 1, initial: 0 },
    consensus_streak: { min: 0, max: 20, initial: 0 }
  },
  sceneGoals: [
    { id: "stabilize_wounded", weight: 1.0, metricLinks: [{ metric: "wounded_stable", dir: "up", strength: 1 }] },
    { id: "evacuate_wounded", weight: 1.2, metricLinks: [{ metric: "wounded_evacuated", dir: "up", strength: 1 }] },
    { id: "keep_cohesion", weight: 0.8, metricLinks: [{ metric: "discipline", dir: "up", strength: 1 }] },
    { id: "keep_route_known", weight: 0.7, metricLinks: [{ metric: "route_known", dir: "up", strength: 1 }] },
    { id: "lower_threat", weight: 0.9, metricLinks: [{ metric: "threat", dir: "down", strength: 1 }] },
    { id: "keep_timer_low", weight: 0.5, metricLinks: [{ metric: "timer", dir: "down", strength: 1 }] },
  ],
  actionEffects: [
    { actionId: "search_route", metricDelta: { route_known: 15, timer: -4, threat: 1 }, roleBonus: { scout: 0.5, incident_leader: 0.5 } },
    { actionId: "clear_debris", metricDelta: { route_known: 5, timer: -8, threat: 5 }, roleBonus: { porter: 0.25, incident_leader: 0.3 } },
    { actionId: "reassure", metricDelta: { discipline: 5, threat: -3 }, roleBonus: { leader: 0.3, medic: 0.2 } },
    { actionId: "issue_order", metricDelta: { discipline: 4 }, roleBonus: { leader: 0.25, incident_leader: 0.3 } },
    { actionId: "refuse_order", metricDelta: { discipline: -10 } },
    { actionId: "challenge_leader", metricDelta: { discipline: -18 } },
    { actionId: "wait", metricDelta: { timer: -2, threat: 2, discipline: -1 } },
    { actionId: "self_treat", metricDelta: { discipline: -2, threat: -1 } },
    { actionId: "blame_other", metricDelta: { discipline: -12 } },
    { actionId: "form_subgroup", metricDelta: { discipline: -20 } },
    { actionId: "share_information", metricDelta: { route_known: 3, threat: -2 }, roleBonus: { tactical_coordinator: 0.5 } },
    { actionId: "support_leader", metricDelta: { discipline: 2 } },
    { actionId: "intimidate", metricDelta: { discipline: -1, threat: 1 } },
    { actionId: "broadcast_plan", metricDelta: { discipline: 5, timer: -1 }, roleBonus: { incident_leader: 0.5, tactical_coordinator: 0.3 } },
    { actionId: "coordinate_search", metricDelta: { route_known: 8, timer: -2 }, roleBonus: { tactical_coordinator: 0.6 } },
    { actionId: "triage_wounded", metricDelta: { wounded_unsorted: -1, wounded_stable: 1, timer: -2 }, roleBonus: { medic: 0.5, stabilizer_guard: 0.5 } },
    { actionId: "protect_exit", metricDelta: { threat: -5, timer: -1 }, roleBonus: { stabilizer_guard: 0.6, guard: 0.5 } },
  ],
  roleSlots: [
    { roleId: "incident_leader", count: 1, capabilityProfile: { command: 0.8, calm_under_stress: 0.6 }, goalProfile: { maintain_legitimacy: 0.4, maintain_cohesion: 0.3 } },
    { roleId: "stabilizer_guard", count: 1, capabilityProfile: { medical_skill: 0.5, strength: 0.7 }, goalProfile: { help_wounded: 0.5, protect_other: 0.4 } },
    { roleId: "tactical_coordinator", count: 1, capabilityProfile: { command: 0.5, navigation: 0.7 }, goalProfile: { seek_information: 0.5, maintain_cohesion: 0.4 } },
    { roleId: "medic", count: 1, capabilityProfile: { medical_skill: 0.9 }, goalProfile: { help_wounded: 0.5 } },
    { roleId: "scout", count: 1, capabilityProfile: { navigation: 0.9 }, goalProfile: { seek_information: 0.4 } },
  ],
  phasePriorities: {
    search_and_stabilize: ["search_route", "triage_wounded", "broadcast_plan", "coordinate_search"],
    evacuation: ["evacuate_wounded", "clear_debris", "protect_exit"],
  },
  objectives: {
      "character-krystar-mann": { "triage_wounded": 3.0, "protect_exit": 2.0 },
      "character-tegan-nots": { "search_route": 2.0, "broadcast_plan": 2.0, "issue_order": 1.0 },
      "master-gideon": { "coordinate_search": 2.5, "share_information": 1.5 }
  }
};
