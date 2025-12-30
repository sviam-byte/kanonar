import {
  WorldState,
  AgentId,
  ScenarioId,
  SceneAffordance,
  SocialActionId,
  LocationId,
  LocationEntity,
} from "../types";
import { allScenarioDefs } from "../../data/scenarios/index";
import { getAgentRole } from "../social/role_mechanics";
import { computeAvailableActionIds } from "../actions/availability";
import { getActionCatalog } from "../actions/catalog";

// Helper to get agent by ID from world state
function getAgentById(world: WorldState, agentId: AgentId) {
  return world.agents.find((a) => a.entityId === agentId);
}

function getLocationById(world: WorldState, locationId?: LocationId): LocationEntity | undefined {
  if (!locationId) return undefined;
  return (world as any).locations?.find((l: any) => l.entityId === locationId);
}

export function listSceneAffordances(
  world: WorldState,
  agentId: AgentId,
  scenarioId: ScenarioId
): SceneAffordance[] {
  const scenario = allScenarioDefs[scenarioId];
  const scene = world.scene;
  const agent = getAgentById(world, agentId);

  if (!scenario || !scene || !agent) return [];

  const role = getAgentRole(agent, world);
  const ctx = world.scenarioContext;
  const phase = ctx?.activePhase;

  // Phase tag filters (from ScenarioDef)
  let allowedTags: string[] | undefined;
  let bannedTags: string[] | undefined;

  const phaseId = phase?.id ?? scene.currentPhaseId;
  if (phaseId) {
    const phaseDef = scenario.phases?.find((p) => p.id === phaseId);
    if (phaseDef) {
      allowedTags = phaseDef.allowedActionTags;
      bannedTags = phaseDef.bannedActionTags;
    }
  }

  const locationId: LocationId | undefined =
    (scene.locationId as any) ?? ((agent as any).locationId as any);
  const location = getLocationById(world, locationId);

  const actionIds = computeAvailableActionIds({
    roleId: role,
    location: location ?? null,
    allowedActionTags: allowedTags ?? null,
    bannedActionTags: bannedTags ?? null,
    alwaysAllowIds: ['wait', 'observe'],
  });

  // Keep only known actions (catalog is source of truth)
  const { byId } = getActionCatalog();
  const filtered = actionIds.filter((id) => Boolean(byId[id]));

  return filtered.map<SceneAffordance>((act) => ({
    id: `${scenarioId}:${phaseId ?? 'no_phase'}:${agentId}:${act}`,
    kind: "social",
    actionId: act as SocialActionId,
    agentId,
    scenarioId,
    sceneId: phaseId,
    locationId,
    role,
  }));
}
