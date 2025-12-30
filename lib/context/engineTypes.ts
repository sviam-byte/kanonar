import type {
  ActionDef,
  ActionId,
  AgentId,
  AgentLocationTags,
  LocationId,
  ContextWorldState,
  ScenarioConfig,
} from './types';

export interface TickContext {
  actorId: AgentId;
  participants: AgentId[];
  actionCatalog: Record<ActionId, ActionDef>;
  scenario: ScenarioConfig;
  world: ContextWorldState;
  locationOf: Record<AgentId, LocationId>;
  agentLocationTags: AgentLocationTags;
  goalWeights?: Record<string, number>;
  normViolations?: ActionId[];
}
