
import { AgentState, WorldState, PlanningTask, SituationSpec, CharacterEntity } from '../../types';
import { DecisionSystem } from '../systems/DecisionSystem';
import { ActionSystem } from '../systems/ActionSystem';
import { buildWorldForSituation } from './world-builders';

export interface PlanningSnapshot {
  tick: number;
  world: WorldState;
  agent: AgentState;
  intention?: any;
  outcome?: any;
  details?: any; 
}

export interface PlanningRunResult {
  snapshots: PlanningSnapshot[];
  logs: any[];
}

export function runPlanningSandbox(params: {
  situation: SituationSpec;
  task: PlanningTask;
  ticks: number;
  sandboxCharacters?: CharacterEntity[];
}): PlanningRunResult {
  const { world } = buildWorldForSituation(params.situation, params.sandboxCharacters);
  
  // Find the actor
  const actorIndex = world.agents.findIndex(a => a.entityId === params.task.actorId);
  if (actorIndex === -1) throw new Error(`Actor ${params.task.actorId} not found in situation`);

  const snapshots: PlanningSnapshot[] = [];
  const logs: any[] = [];

  for (let t = 0; t < params.ticks; t++) {
    world.tick = t;
    const agent = world.agents[actorIndex];

    // Force the goal focus for this task
    if (params.task.targetGoalId) {
        agent.drivingGoalId = params.task.targetGoalId;
    }

    // 1. Decide
    const { intention, details } = DecisionSystem.formulateIntention(agent, world);
    
    // 2. Execute (Simple version, no physics)
    // We pass world goals if available, or empty array
    const outcome = ActionSystem.execute(agent, intention, world, []);
    
    // 3. Snapshot
    snapshots.push({
        tick: t,
        world: JSON.parse(JSON.stringify(world)),
        agent: JSON.parse(JSON.stringify(agent)),
        intention,
        outcome,
        details
    });
    
    logs.push({ 
        tick: t, 
        action: intention.id, 
        targetId: intention.targetId,
        topGoalId: details.topGoalId, 
        outcome: outcome.result 
    });
  }

  return { snapshots, logs };
}
