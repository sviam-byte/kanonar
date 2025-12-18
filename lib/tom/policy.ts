
import { AgentState, WorldState, SocialActionId } from '../../types';
import { TomState, TomEntry, TomPolicyPrior } from './state';
import { actionGoalMap } from '../goals/space';

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Computes the utility of an action for the target, based on the observer's belief about the target's goals.
 * u(a) = sum_g P(g) * score(g, a)
 */
function computeActionUtilityFromBeliefs(
    entry: TomEntry,
    actionId: SocialActionId
): number {
    const { goalIds, weights } = entry.goals;
    let utility = 0;
    
    const links = actionGoalMap[actionId];
    if (!links) return 0;

    for (let i = 0; i < goalIds.length; i++) {
        const gid = goalIds[i];
        const prob = weights[i];
        
        // Find match score
        const match = links.find(l => l.goalId === gid)?.match ?? 0;
        if (match > 0) {
            utility += prob * match;
        }
    }
    
    return utility;
}

export function computePolicyPriorForTarget(
  observer: AgentState,
  targetId: string,
  tom: TomState,
  world: WorldState
): TomPolicyPrior | null {
  const entry = tom[observer.entityId]?.[targetId];
  if (!entry) return null;

  const actionMask: Record<string, number> = {};
  let maxU = 0;

  // Iterate over all known social actions to build distribution
  // In a real scenario, we might limit this to context-relevant actions
  const allActions = Object.keys(actionGoalMap) as SocialActionId[];

  for (const actionId of allActions) {
      const u = computeActionUtilityFromBeliefs(entry, actionId);
      if (u > 0) {
          actionMask[actionId] = u;
          if (u > maxU) maxU = u;
      }
  }

  // Normalize to 0..1 relative to best option (Softmax-like but kept linear for mask)
  if (maxU > 0) {
      for (const k in actionMask) {
          actionMask[k] /= maxU;
      }
  }

  return { actionMask };
}

export function updateTomPolicyPriorForTarget(
  observer: AgentState,
  targetId: string,
  tom: TomState,
  world: WorldState
): void {
  const row = tom[observer.entityId];
  if (!row) return;
  const entry = row[targetId];
  if (!entry) return;

  const prior = computePolicyPriorForTarget(observer, targetId, tom, world);
  if (!prior) return;

  entry.policyPrior = prior;
}

// Re-export existing predictor for UI consumption
export function predictPolicyForTarget(
  tomEntry: TomEntry | undefined,
  candidateActions: SocialActionId[],
  options: { beta?: number, floorWeight?: number } = {}
) {
    if (!tomEntry) {
        const p = 1 / Math.max(candidateActions.length, 1);
        return candidateActions.map((a) => ({ actionId: a, p }));
    }
    
    const { policyPrior } = tomEntry;
    const beta = options.beta ?? 2.0; // Higher beta = sharper prediction
    const floor = options.floorWeight ?? 0.01;
    
    const scores: number[] = [];
    let sumScore = 0;
    
    for(const act of candidateActions) {
        const base = policyPrior?.actionMask?.[act] ?? 0;
        // Apply softmax logic: exp(beta * utility)
        // Since mask is 0..1, we treat it as utility proxy
        const score = Math.exp(beta * base);
        scores.push(score);
        sumScore += score;
    }
    
    return candidateActions.map((actionId, idx) => ({
        actionId,
        p: sumScore > 0 ? scores[idx] / sumScore : 1 / candidateActions.length
    }));
}
