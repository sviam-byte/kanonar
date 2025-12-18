
import { SocialGraph, CharacterState } from '../../types';

export interface EdgeState {
    source: string;
    target: string;
    w: number;
    relation: 'ally' | 'rival' | 'neutral';
    severed: boolean;
}

interface StepNetworkResult {
  nextStates: Map<string, CharacterState>;
  updatedEdges: EdgeState[];
}

export function stepNetwork(
  graph: SocialGraph,
  currentStates: Map<string, CharacterState>,
  currentEdges: EdgeState[],
  alpha: number,
  vsigmaThreshold: number
): StepNetworkResult {
    const nextStates = new Map<string, CharacterState>();
    const influenceMap = new Map<string, number>();
    const stressMap = new Map<string, number>();

    // --- 1. Diffusion of stress and influence ---
    for (const node of graph.nodes) {
        const state = currentStates.get(node.id);
        if (!state) continue;

        let influenceSum = 0;
        let stressSum = 0;
        let totalWeight = 0;

        currentEdges.filter(e => !e.severed && (e.source === node.id || e.target === node.id)).forEach(edge => {
            const neighborId = edge.source === node.id ? edge.target : edge.source;
            const neighborState = currentStates.get(neighborId);
            if (neighborState) {
                const weight = edge.w;
                influenceSum += neighborState.influence * weight;
                stressSum += neighborState.stress * weight;
                totalWeight += weight;
            }
        });
        
        const avgNeighborInfluence = totalWeight > 0 ? influenceSum / totalWeight : state.influence;
        const avgNeighborStress = totalWeight > 0 ? stressSum / totalWeight : state.stress;

        influenceMap.set(node.id, (1 - alpha) * state.influence + alpha * avgNeighborInfluence);
        stressMap.set(node.id, (1 - alpha) * state.stress + alpha * avgNeighborStress);
    }
    
    // Apply diffused values to a new state map
    currentStates.forEach((state, id) => {
        const nextState = { ...state };
        if (influenceMap.has(id)) {
            nextState.influence = influenceMap.get(id)!;
        }
        if (stressMap.has(id)) {
            nextState.stress = stressMap.get(id)!;
        }
        nextStates.set(id, nextState);
    });

    // --- 2. Threshold-based link severing ---
    const updatedEdges = currentEdges.map(edge => {
        if (edge.severed) return edge; // Already severed, do nothing

        const sourceState = nextStates.get(edge.source);
        const targetState = nextStates.get(edge.target);
        
        if (sourceState && targetState) {
            const vsigmaDiff = Math.abs(sourceState.vsigma - targetState.vsigma);
            if (vsigmaDiff > vsigmaThreshold) {
                // Sever the link if Vsigma difference is too high
                return { ...edge, severed: true };
            }
        }
        return edge;
    });

    return { nextStates, updatedEdges };
}
