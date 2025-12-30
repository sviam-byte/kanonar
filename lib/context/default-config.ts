
import type { ScenarioConfig, ActionDef, GoalDef, ContextWorldState } from './types';
import type { TickConfig, ResolutionRules } from './engine';
import { DEFAULT_ACTION_CATALOG } from './actions/defaultActionCatalog';
import { defaultProposalGenerator } from './actions/proposalGenerator';
import { defaultPickIntent } from './actions/pickIntent';

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

  const actionCatalog =
    (world.contextEx?.actionCatalog as Record<string, ActionDef> | undefined) ??
    DEFAULT_ACTION_CATALOG;
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
    proposalGenerator: defaultProposalGenerator,
    pickIntent: defaultPickIntent,
  };
}

export function makeScenarioTickConfig(world: ContextWorldState): TickConfig {
  const scenario: ScenarioConfig = world.contextEx?.scenarioConfig ?? EMPTY_SCENARIO;

  // In a full implementation, these would be loaded from the scenario definition 
  // or a registry based on scenario.id
  const actionCatalog =
    (world.contextEx?.actionCatalog as Record<string, ActionDef> | undefined) ??
    DEFAULT_ACTION_CATALOG;
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
    proposalGenerator: defaultProposalGenerator,
    pickIntent: defaultPickIntent,
  };
}
