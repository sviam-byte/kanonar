
// lib/gil/apply.ts
import { computePhiRowFromTom } from "./goal_inheritance_from_tom";
import { AgentState, WorldState } from "../../types";
import { TomState, TomEntry } from "../../types";
import { GOAL_DEFS } from "../goals/space";

interface GilParams {
  phiMax: Record<string, number>;
}

export function constructTom(agents: AgentState[]): TomState {
    const tom: TomState = {};
    for (const i of agents) {
        tom[i.entityId] = {};
        for (const j of agents) {
            if (i.entityId === j.entityId) continue;

            const rel = i.relationships?.[j.entityId];
            const goalIds = Object.keys(GOAL_DEFS);
            const weights = new Array(goalIds.length).fill(1 / goalIds.length);
            
            // Safe access for competencies
            const comp = j.competencies?.competence_core || 50;
            const clear = j.identity.clearance_level || 0;

            const tomEntry: TomEntry = {
                goals: { goalIds, weights },
                traits: {
                    trust: rel?.trust ?? 0.5,
                    align: rel?.align ?? 0.5,
                    bond: rel?.bond ?? 0.1,
                    competence: comp / 100,
                    dominance: clear / 5,
                    reliability: 0.5,
                    obedience: 0.5,
                    uncertainty: 1.0, // Initial high uncertainty
                    vulnerability: 0.5,
                    conflict: rel?.conflict ?? 0.1,
                    respect: 0.5, // Added
                    fear: 0.1 // Added
                },
                uncertainty: 1.0,
                lastUpdatedTick: 0,
                lastInteractionTick: 0
            };
            tom[i.entityId][j.entityId] = tomEntry;
        }
    }
    return tom;
}

export function constructGil(agents: AgentState[]): GilParams {
    const gil: GilParams = { phiMax: {} };
    for (const agent of agents) {
        gil.phiMax[agent.entityId] = agent.behavioralParams?.phi_max ?? 0.6;
    }
    return gil;
}

export function applyGoalInheritanceForCharacter(
  selfId: string,
  charGoalIds: string[],
  wSelf: number[],
  donors: string[],
  goalsByChar: Record<string, number[]>,
  tom: TomState,
  gil: GilParams,
  world: WorldState
): { wEff: number[]; totalPhi: number } {
  const { phi, totalPhi } = computePhiRowFromTom(selfId, donors, tom, gil, world);

  // Calculate effective weights
  const wEff = [...wSelf];
  
  if (totalPhi > 0) {
      for (const donorId of donors) {
          const p = phi[donorId] ?? 0;
          if (p <= 0) continue;
          
          const donorWeights = goalsByChar[donorId];
          if (!donorWeights) continue;

          for(let k=0; k<wEff.length; k++) {
              // Simple additive inheritance: w_i = (1-phi)*w_i + phi*w_j
              // Or rather w_i += phi * (w_j - w_i) -> approach donor
               wEff[k] += p * (donorWeights[k] - wEff[k]);
          }
      }
  }
  
  return { wEff, totalPhi };
}
