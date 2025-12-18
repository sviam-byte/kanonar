
import { AgentState, Action } from '../../types';
import { clamp } from '../util/math';

export function actionCostWithState(baseCost: number, fatigue: number, hp: number): number {
  const f = clamp(fatigue / 100, 0, 1);
  const hpFactor = clamp(1 - (hp - 50) / 100, 0.5, 1.5); 
  const fatigueFactor = 1 + 0.5 * f; 
  return baseCost * hpFactor * fatigueFactor;
}

export function computeCost(agent: AgentState, action: Action, world: any = {}): number {
  const actionCost = action.cost || {};
  let baseTotal = 0;
  
  baseTotal += (actionCost.energy ?? 0);
  if (action.id === 'wait') baseTotal += 0.1; 
  else if (action.id === 'rest') baseTotal -= 0.5; 
  else baseTotal += (actionCost.time ?? 0.05); 
  baseTotal += (actionCost.injury ?? 0);

  // Apply State Modifiers
  let totalCost = actionCostWithState(baseTotal, agent.body.acute.fatigue ?? 0, agent.hp ?? 100);
  return totalCost;
}
