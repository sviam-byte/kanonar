

// data/scenarios/council_vote_scenario.ts
import { ScenarioDef, SocialActionId, ScenarioOutcome, SceneMetrics, WorldState } from "../../types";

export const COUNCIL_VOTE_SCENARIO: ScenarioDef = {
  id: 'council_simple',
  title: 'Совет: принять решение',
  // Single room topology implicitly handles "no movement", but we enforce it via tags
  topology: {
      nodes: [{ id: "council_chamber", label: "Зал Совета", description: "Закрытое помещение для дебатов." }],
      edges: []
  },
  // Global Goal Modifiers: Make "leaving" or "physical survival" irrelevant to scoring in this context
  globalGoalModifiers: {
      "go_to_surface": 0.0,       // Can't leave
      "search_route": 0.0,        // No route to search
      "protect_self": 0.0,        // STRICTLY DISABLE self-preservation in Council to prevent cowardice
      "avoid_pain": 0.0,          // Pain unlikely
      "escape": 0.0,
      "help_wounded": 0.0,        // No wounded here usually
      "maintain_legitimacy": 2.0, // High stakes
      "maintain_cohesion": 1.5,
      "assert_autonomy": 1.2,     // Enable autonomy battles
      "support_leader": 1.5
  },
  phases: [
    {
      id: 'main',
      label: 'Обсуждение',
      description: 'Обсуждение и попытка договориться.',
      missionGoalWeights: {},
      preferredActions: ['share_information', 'persuade', 'support_leader'],
      // Whitelist only social/communicative actions. Ban physical/topo actions.
      allowedActionTags: ["social", "COMM", "hierarchy", "MANIP", "INFO", "decision", "boundary"],
      bannedActionTags: ["physical", "topo", "progress", "medical", "care"], 
      entryCondition: (metrics) => metrics.tick <= 1,
      exitCondition: (metrics) => metrics.timer <= 0,
    }
  ],
  metrics: {
    tick:       { min: 0, max: 1000, initial: 0 },
    timer:      { min: 0, max: 100, initial: 40 },
    consensus:  { min: 0, max: 100, initial: 30 },
    conflict:   { min: 0, max: 100, initial: 30 },
    legitimacy: { min: 0, max: 100, initial: 60 },
    // Dummy metrics to satisfy type
    threat: { min: 0, max: 100, initial: 0 },
    discipline: { min: 0, max: 100, initial: 0 },
    route_known: { min: 0, max: 100, initial: 0 },
    wounded_total: { min: 0, max: 10, initial: 0 },
    wounded_unsorted: { min: 0, max: 10, initial: 0 },
    wounded_stable: { min: 0, max: 10, initial: 0 },
    wounded_evacuated: { min: 0, max: 10, initial: 0 },
    wounded_dead: { min: 0, max: 10, initial: 0 },
    cohesion: { min: 0, max: 100, initial: 0 },
    evac_total: { min: 0, max: 10, initial: 0 },
    evac_done: { min: 0, max: 10, initial: 0 },
    evac_missed: { min: 0, max: 10, initial: 0 },
    evac_started: { min: 0, max: 1, initial: 0 },
    consensus_streak: { min: 0, max: 20, initial: 0 }
  },
  phasePriorities: {
    main: ['share_information', 'persuade', 'support_leader'],
  },
  actionEffects: [
    {
      actionId: 'share_information',
      metricDelta: { consensus: 1, conflict: -0.5, legitimacy: 1, timer: -1 },
    },
    {
      actionId: 'persuade',
      metricDelta: { consensus: 2, conflict: 1, timer: -1 },
    },
    {
      actionId: 'support_leader',
      metricDelta: { legitimacy: 1, conflict: -1, timer: -1 },
    },
    {
      actionId: 'blame_other',
      metricDelta: { conflict: 6, legitimacy: -3, timer: -1 },
    },
    {
      actionId: 'form_subgroup',
      metricDelta: { conflict: 8, legitimacy: -4, timer: -2 },
    },
    {
      actionId: 'wait',
      metricDelta: { timer: -1, conflict: 1, legitimacy: -1 },
    },
  ],
  evaluateOutcome: (m: SceneMetrics, world: WorldState) => {
    const { timer, consensus, conflict, legitimacy, tick, consensus_streak } = m;

    // Minimum time before success is possible
    if (tick < 10) {
      return {
        outcome: 'ongoing',
        summary: 'Слишком рано для окончательного решения.'
      };
    }
    
    // Full success: requires sustained consensus
    if (timer! > 0 && consensus! >= 70 && conflict! <= 40 && legitimacy! >= 70 && (consensus_streak ?? 0) >= 5) {
      return {
        outcome: 'full_success',
        summary: 'Совет удерживал консенсус достаточно долго, решение стабильно.',
      };
    }

    // Partial success: achieved consensus, but with issues
    if (timer! > 0 && consensus! >= 50) {
      return {
        outcome: 'partial_success',
        summary: 'Решение формально принято, но есть проблемы с конфликтами или доверием.',
      };
    }

    // Ran out of time
    if (timer! <= 0) {
      if (consensus! >= 50) {
        return {
          outcome: 'partial_success',
          summary: 'Решение продавили в последний момент, но процесс оставил много вопросов.',
        };
      }
      return {
        outcome: 'failure',
        summary: 'Время вышло, совет так и не договорился.',
      };
    }

    // Failure by high conflict or low legitimacy
    if (conflict! >= 90) {
      return {
        outcome: 'failure',
        summary: 'Конфликт перешёл в раскол, заседание сорвано.',
      };
    }

    if (legitimacy! <= 30 && consensus! < 50) {
      return {
        outcome: 'failure',
        summary: 'Процесс воспринимается как фальшивый, решения нет.',
      };
    }

    return {
      outcome: 'ongoing',
      summary: 'Совет продолжает обсуждение.',
    };
  },
  sceneGoals: [],
  roleSlots: [],
};
