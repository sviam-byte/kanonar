
import { AgentState, WorldState, CharacterGoalId, SocialActionId, Action } from '../../types';
import { PlanningTaskV4, PlanV4, PlanningCandidate, PlanStepV4, PlanningLabResult } from '../../types';
import { listPossibleActions } from '../systems/DecisionSystem';
import { predictReaction } from '../tom/engine-v4';
import { scenarioStep } from '../scenario/physics';
import { actionGoalMap, GOAL_DEFS } from '../goals/space';

// --- Helper: Calculate Sys1 Score (Fast, Heuristic) ---
function computeSys1Score(
    action: Action, 
    agent: AgentState, 
    topGoalId: CharacterGoalId,
    world: WorldState
): number {
    let score = 0;
    
    // 1. Goal Affinity
    const links = actionGoalMap[action.id as SocialActionId];
    const match = links?.find(l => l.goalId === topGoalId);
    if (match) {
        score += match.match * 1.0;
    }
    
    // 2. Habit / Repetition
    if (agent.lastActionId === action.id) score += 0.2;
    
    return score;
}

// Evaluate how good the world state is for a specific goal (Heuristic)
function evaluateGoalInWorld(
  goalId: CharacterGoalId,
  agent: AgentState,
  world: WorldState
): number {
  const metrics = world.scene?.metrics;
  if (!metrics) return 0;

  const def = GOAL_DEFS[goalId];
  let u = 0;
  let wSum = 0;

  for (const dom of def.domains) {
    switch (dom) {
      case 'leader_legitimacy':
        u += (metrics.legitimacy ?? 50) / 100;
        wSum += 1;
        break;
      case 'group_cohesion':
        u += (metrics.cohesion ?? 50) / 100;
        wSum += 1;
        break;
      case 'threat': // Implicit domain
      case 'survival':
        u += 1 - (metrics.threat ?? 50) / 100;
        wSum += 1;
        break;
      case 'information':
        u += (metrics.route_known ?? 50) / 100;
        wSum += 1;
        break;
      default:
        break;
    }
  }

  if (wSum === 0) return 0.5; // neutral
  return u / wSum;
}

// --- Helper: Calculate Sys2 Score (Deep, Lookahead) ---
function computeSys2Score(
    action: Action,
    agent: AgentState,
    topGoalId: CharacterGoalId,
    world: WorldState,
    horizon: number
): number {
    let score = 0;
    let simWorld = world;

    // 0. Current Utility
    const u0 = evaluateGoalInWorld(topGoalId, agent, world);

    // 1. Simulate Action Effect (Physics Rollout)
    // Assume agent does action repeatedly or just once and we drift? 
    // For simplicity: apply action once, then drift
    const joint: Record<string, string> = { [agent.entityId]: action.id };
    
    for (let t = 0; t < horizon; t++) {
        // In first step apply action, subsequent steps are drift/reaction (simplified as same action or wait)
        // Here we just step physics with the action to see accumulated effect
        simWorld = scenarioStep(simWorld, joint);
    }

    const u1 = evaluateGoalInWorld(topGoalId, agent, simWorld);
    const deltaU = u1 - u0;

    // 2. Social Reaction (ToM)
    let reactionScore = 0;
    if (action.targetId) {
        const prediction = predictReaction(agent, action.targetId, action.id as SocialActionId, world);
        // Weight reaction based on goal nature
        if (topGoalId === 'follow_order' || topGoalId === 'maintain_order') {
            reactionScore += prediction.estimatedCompliance;
        }
        if (topGoalId === 'maintain_cohesion' || topGoalId === 'maintain_legitimacy') {
            reactionScore += prediction.estimatedRelationChange;
        }
    }

    // 3. Cognitive Cost
    const cognitiveCost = 0.05 * horizon;

    // Score is improvement + reaction - cost
    // We normalize deltaU (approx -0.2 to 0.2) to be impactful
    score = deltaU * 5 + reactionScore - cognitiveCost;

    // Blend with Sys1 base to anchor
    return computeSys1Score(action, agent, topGoalId, world) + score;
}

export function computePlan(
    agent: AgentState,
    world: WorldState,
    task: PlanningTaskV4,
    config: { sys1Level: number, sys2Level: number, tomMode: 'off'|'full' } = { sys1Level: 1.0, sys2Level: 0.5, tomMode: 'off' }
): PlanningLabResult {
    
    const { sys1Level, sys2Level } = config;
    const horizon = task.horizon ?? 1;
    const candidates: PlanningCandidate[] = [];
    
    // 1. Generate Options
    let possibleActions = listPossibleActions(agent, world);
    
    // Filter by possibleActions from task if provided (Scenario Engine Hook)
    if (task.possibleActions && task.possibleActions.length > 0) {
        possibleActions = possibleActions.filter(a => task.possibleActions!.includes(a.id as SocialActionId));
    }
    
    // 2. Score Options
    for (const action of possibleActions) {
        const q1 = computeSys1Score(action, agent, task.targetGoalId, world);
        const q2 = (sys2Level > 0) ? computeSys2Score(action, agent, task.targetGoalId, world, horizon) : 0;
        
        const qTotal = sys1Level * q1 + sys2Level * q2;
        
        candidates.push({
            actionId: action.id,
            targetId: action.targetId,
            label: action.name,
            qSys1: q1,
            qSys2: q2,
            qTotal,
            supportedGoals: [{ goalId: task.targetGoalId, weight: qTotal }]
        });
    }
    
    // Sort
    candidates.sort((a,b) => b.qTotal - a.qTotal);
    const chosen = candidates[0];
    
    // 3. Build Plan Object (if Sys2 active)
    let bestPlan: PlanV4 | undefined;
    if (sys2Level > 0 && chosen) {
        // Generate a simple linear plan trace
        bestPlan = {
            steps: Array.from({ length: horizon }, (_, i): PlanStepV4 => ({
                tickOffset: i + 1,
                actionId: chosen.actionId, // Simplified: assuming repeat action
                targetId: chosen.targetId,
                expectedUtility: chosen.qTotal,
                description: i === 0 ? "Execute Action" : "Monitor outcome"
            })),
            expectedUtility: chosen.qTotal,
            cognitiveCost: 0.05 * horizon * 10,
            totalScore: chosen.qTotal
        };
    }

    return {
        chosen,
        alternatives: candidates.slice(1, 5),
        bestPlan
    };
}
