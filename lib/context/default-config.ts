
import type { ScenarioConfig, ActionDef, GoalDef, ContextWorldState } from './types';
import type { TickConfig, ResolutionRules } from './engine';

export const EMPTY_SCENARIO: ScenarioConfig = {
  id: 'default',
  label: 'Default scenario',
  kind: 'generic',
  map: {
    locations: [],
    connections: [],
  },
  stages: [],
  activeNorms: [],
  contextSeed: [],
  contextRules: [],
  outcomeRules: { success: [], failure: [] },
  affordances: [],
  contextMode: 'routine',
  governance: 'mixed'
};

export function makeDefaultTickConfig(world: ContextWorldState): TickConfig {
  const scenario = world.contextEx?.scenarioConfig ?? EMPTY_SCENARIO;

  const actionCatalog: Record<string, ActionDef> = {};
  const goalDefs: Record<string, GoalDef> = {};
  const resolutionRules: ResolutionRules = {
      exclusivityKeys: () => [],
      priority: () => 0
  };

  return {
    scenario,
    actionCatalog,
    goalDefs,
    resolutionRules,
    exclusiveMandates: [],
    proposalGenerator: () => [],
    pickIntent: () => null,
  };
}

export function makeScenarioTickConfig(world: ContextWorldState): TickConfig {
  const scenario: ScenarioConfig = world.contextEx?.scenarioConfig ?? EMPTY_SCENARIO;

  // In a full implementation, these would be loaded from the scenario definition 
  // or a registry based on scenario.id
  const actionCatalog: Record<string, ActionDef> = {};
  const goalDefs: Record<string, GoalDef> = {};

  const resolutionRules: ResolutionRules = {
    exclusivityKeys: () => [],
    priority: () => 0,
  };

  return {
    scenario,
    actionCatalog,
    goalDefs,
    resolutionRules,
    exclusiveMandates: [],
    proposalGenerator: () => [],
    pickIntent: () => null,
  };
}
