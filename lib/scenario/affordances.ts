


import {
  WorldState,
  AgentId,
  ScenarioId,
  SceneAffordance,
  SocialActionId,
  LocationId,
} from "../types";
import { allScenarioDefs } from "../../data/scenarios/index";
import { getAgentRole } from "../social/role_mechanics";
import { canAgentEnterLocation } from "../world/locations";
import { socialActions } from "../../data/actions-social";

// Helper to get agent by ID from world state
function getAgentById(world: WorldState, agentId: AgentId) {
    return world.agents.find(a => a.entityId === agentId);
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
  
  // If scene context exists (legacy scene.currentPhaseId), try to map it to ScenarioPhaseState if activePhase not set
  // This bridge handles compatibility between old scene structure and new context engine
  let allowedTags: string[] | undefined = undefined;
  let bannedTags: string[] | undefined = undefined;
  
  if (phase) {
      // Assuming ScenarioPhaseState might carry these if mapped from ScenarioDef,
      // but standard ScenarioPhaseState in types.ts doesn't have tags directly, it has normOverrides.
      // We need to look up the phase def in scenario.
      const phaseDef = scenario.phases?.find(p => p.id === phase.id);
      if (phaseDef) {
          allowedTags = phaseDef.allowedActionTags;
          bannedTags = phaseDef.bannedActionTags;
      }
  } else if (scene.currentPhaseId) {
       const phaseDef = scenario.phases?.find(p => p.id === scene.currentPhaseId);
       if (phaseDef) {
           allowedTags = phaseDef.allowedActionTags;
           bannedTags = phaseDef.bannedActionTags;
       }
  }

  // Simple matrix: Role -> Actions
  // In a full implementation, this would be part of the ScenarioDef
  const baseActions: SocialActionId[] = (() => {
    switch (role) {
      case "leader":
      case "commander":
      case "incident_leader":
        return ["issue_order", "broadcast_plan", "reassure_group"];
      case "medic":
      case "stabilizer_guard":
        return ["triage_wounded", "evacuate_wounded", "self_treat"];
      case "scout":
        return ["search_route", "observe", "share_information"];
      case "guard":
        return ["protect_exit", "intimidate", "restrain_physical"];
      case "coordinator":
      case "tactical_coordinator":
        return ["coordinate_search", "organize_evac", "share_information"];
      default:
        // Generic actions always available if physically capable
        return ["wait", "observe", "share_personal_belief", "ask_status"];
    }
  })();
  
  // Add phase-specific actions if defined
  if (scene.currentPhaseId) {
      const currentPhase = scenario.phases?.find(p => p.id === scene.currentPhaseId);
      if (currentPhase && currentPhase.preferredActions) {
          currentPhase.preferredActions.forEach(act => {
              if (!baseActions.includes(act as SocialActionId)) {
                  baseActions.push(act as SocialActionId);
              }
          });
      }
  }
  
  // Filter by phase constraints
  const filteredActions = baseActions.filter(actionId => {
      const actionDef = socialActions.find((a: any) => a.id === actionId);
      if (!actionDef) return true;
      
      const tags = actionDef.tags || [];
      
      if (allowedTags && allowedTags.length > 0) {
          const allowed = tags.some((t: string) => allowedTags!.includes(t));
          // Special case: wait/observe often allowed
          if (!allowed && actionId !== 'wait' && actionId !== 'observe') return false;
      }
      
      if (bannedTags && bannedTags.length > 0) {
          const banned = tags.some((t: string) => bannedTags!.includes(t));
          if (banned) return false;
      }
      
      return true;
  });

  const locationId: LocationId | undefined = scene.locationId ?? (agent as any).locationId;

  return filteredActions.map<SceneAffordance>((act) => ({
    id: `${scenarioId}:${scene.currentPhaseId}:${agentId}:${act}`,
    kind: "social",
    actionId: act,
    agentId,
    scenarioId,
    sceneId: scene.currentPhaseId,
    locationId,
    role,
  }));
}
