






import {
  WorldState,
  ScenarioId,
  DomainEvent,
  AgentId,
  CharacterGoalId,
  ScenarioDef
} from "../../types";
import { listSceneAffordances } from "./affordances";
import { mapSimulationEventsToUnified } from "../events/simulation-bridge"; 
import { mapSimulationEventToDomain } from "../events/domainBridge";
import { updateScenarioContextFromEvents } from "../context/engine";
import { applyDomainEventsToTom } from "../tom/eventsIntegration";
import { applyDomainEventsToRelationships } from "../social/fromEvents";
import { resolveActionRequest } from "./actionResolution";
import { computePlan } from "../planning/planner-v4";
import { getScenarioParticipantIds } from "./relationsToScene";
import { getScenarioDefinition } from "./registry";
import { buildContextSnapshot } from '../context/v2/builder';
import { scoreContextualGoals } from '../context/v2/scoring';
import { ContextSnapshot, ContextualGoalScore } from '../context/v2/types';
let __scriptedIdCounter = 0;

// Re-export alias for consistency
const listSceneAgents = getScenarioParticipantIds;

export function scenarioInit(world: WorldState, scenario: ScenarioDef) {
    world.scenario = scenario;
    world.scene = {
        scenarioDef: scenario,
        metrics: { tick: 0, ...Object.fromEntries(Object.entries(scenario.metrics).map(([k, v]) => [k, (v as any).initial])) } as any,
        currentPhaseId: scenario.phases?.[0].id,
        tick: 0
    };
}

export function scenarioTick(ctx: { world: WorldState, actionsExecuted: { actorId: string, actionId: string }[] }) {
    const { world, actionsExecuted } = ctx;
    if (!world.scene || !world.scenario) return;
    
    const { metrics } = world.scene;
    const { actionEffects, evaluateOutcome, phases } = world.scenario;

    // Apply action effects
    for (const action of actionsExecuted) {
        const effect = actionEffects?.find(e => e.actionId === action.actionId);
        if (effect && effect.metricDelta) {
            for (const [key, delta] of Object.entries(effect.metricDelta)) {
                // Apply delta with clamping based on metric definition
                const currentVal = (metrics as any)[key] ?? 0;
                const def = world.scenario.metrics[key];
                let newVal = currentVal + (delta as number);
                if (def) {
                    newVal = Math.max(def.min, Math.min(def.max, newVal));
                }
                (metrics as any)[key] = newVal;
            }
        }
    }

    // Check phase transitions
    if (world.scene.currentPhaseId) {
        const currentPhaseIdx = phases?.findIndex(p => p.id === world.scene?.currentPhaseId);
        if (currentPhaseIdx !== undefined && currentPhaseIdx !== -1 && phases && currentPhaseIdx < phases.length - 1) {
            const nextPhase = phases[currentPhaseIdx + 1];
            if (nextPhase.entryCondition && nextPhase.entryCondition(metrics)) {
                world.scene.currentPhaseId = nextPhase.id;
            }
        }
    }

    // Check outcome
    if (evaluateOutcome) {
        const outcome = evaluateOutcome(metrics, world);
        if (outcome.outcome !== 'ongoing') {
            world.scene.done = true;
            world.scene.outcome = outcome;
        }
    }
}

/**
 * Один шаг сценария:
 * - генерирует внешние события сцены (по фазе);
 * - даёт персонажам сценовые аффордансы;
 * - вызывает планировщик;
 * - пропускает действия через NormGate / последствия;
 * - возвращает новый мир + DomainEvent-лог за шаг.
 */
export function runScenarioTick(
  world: WorldState,
  scenarioId: ScenarioId
): { world: WorldState; events: DomainEvent[] } {
  // Clone world to avoid mutation issues in React state
  let nextWorld = JSON.parse(JSON.stringify(world));
  
  // Advance tick
  nextWorld.tick = (nextWorld.tick || 0) + 1;
  if (nextWorld.scene) {
      nextWorld.scene.tick = (nextWorld.scene.tick || 0) + 1;
      if (nextWorld.scene.metrics) {
        nextWorld.scene.metrics.tick = (nextWorld.scene.metrics.tick || 0) + 1;
      }
  }

  const allEvents: DomainEvent[] = [];

  // 1) Внешние scripted-события фазы (если есть)
  const scriptedSimulationEvents = generateScriptedEventsForPhase(nextWorld, scenarioId);
  const scriptedDomainEvents = scriptedSimulationEvents.map(e => mapSimulationEventToDomain(e, {
      getId: (ev: any) => `scripted-${nextWorld.tick}-${(__scriptedIdCounter++).toString(36)}`,
      getTick: (ev: any) => nextWorld.tick,
      getActorId: (ev: any) => 'SYSTEM',
      getActionId: (ev: any) => ev.kind || 'scripted_event',
      getDomain: (ev: any) => 'scenario'
  }));
  
  allEvents.push(...scriptedDomainEvents);

  // 2) Обновить контекст (contextAtoms, NormGate-input)
  nextWorld = updateScenarioContextFromEvents(nextWorld, scriptedDomainEvents);

  // 3) Агентам в сцене даём аффордансы + планирование
  const agentIds: AgentId[] = listSceneAgents(nextWorld);
  
  // If no scene agents found via location, iterate all agents
  const agentsToProcess = agentIds.length > 0 ? agentIds : nextWorld.agents.map((a: any) => a.entityId);

  for (const agentId of agentsToProcess) {
    const affordances = listSceneAffordances(nextWorld, agentId, scenarioId);
    const agent = nextWorld.agents.find((a: any) => a.entityId === agentId);
    
    if (!agent) continue;
    
    // Determine driving goal for planning
    const drivingGoalId = agent.drivingGoalId || 'maintain_legitimacy'; // Fallback

    const planResult = computePlan(agent, nextWorld, {
      id: `scene-plan-${agentId}`,
      label: 'Scene Response',
      description: 'Auto-generated scene response plan',
      actorId: agentId,
      targetGoalId: drivingGoalId as CharacterGoalId,
      intentDescription: 'React to scene',
      situationId: scenarioId,
      horizon: 1,
      mode: "scene",
      possibleActions: affordances.map((a) => a.actionId),
    });

    const chosen = planResult.chosen;
    if (!chosen) continue;

    const { bundle } = resolveActionRequest(nextWorld, nextWorld.scenarioContext!, {
        id: `act-${nextWorld.tick}-${agentId}`,
        actorId: agentId,
        actionId: chosen.actionId,
        tags: [], // Could retrieve tags from ActionDef
        targetId: chosen.targetId,
        t: nextWorld.tick
    });

    // Apply bundle events (domain events)
    allEvents.push(...bundle.domainEvents);
  }

  // 4) Финальное обновление контекста по всем событиям
  nextWorld = updateScenarioContextFromEvents(nextWorld, allEvents);
  
  // 5) Обновить ToM и социальные связи
  nextWorld = applyDomainEventsToTom(nextWorld, allEvents);
  nextWorld = applyDomainEventsToRelationships(nextWorld, allEvents);
  
  // 6) Compute Context V2 for all agents (The New Standard)
  const contextV2: Record<string, { snapshot: ContextSnapshot; goals: ContextualGoalScore[] }> = {};

  for (const agent of nextWorld.agents) {
    const snapshot = buildContextSnapshot(nextWorld, agent, {
      // Pass recent events to influence context if needed, currently implied by world state update
    });
    const goals = scoreContextualGoals(agent, nextWorld, snapshot);
    contextV2[agent.entityId] = { snapshot, goals };
  }

  nextWorld.contextV2 = contextV2;

  return { world: nextWorld, events: allEvents };
}

// Пустышка: сюда позже можно подвесить сложные сценарные триггеры по фазам
function generateScriptedEventsForPhase(
  world: WorldState,
  scenarioId: ScenarioId
): any[] {
  // Пока возвращаем пустой массив
  return [];
}
