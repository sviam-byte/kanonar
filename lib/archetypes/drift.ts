


import { AgentState, TraumaLoad, CharacterGoalId } from '../../types';
import { allArchetypes } from '../../data/archetypes';
import { computeSelfGap } from './system';
import { computeArchetypeEffects } from './effects';

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

interface DriftRule {
    targetMu: 'SR' | 'OR' | 'SN' | 'ON';
    condition: (t: TraumaLoad, moral: any, selfGap: number) => number; // Returns probability boost
}

const DRIFT_RULES: DriftRule[] = [
    // System Trauma -> Rebellion (SR) or Withdrawal (OR)
    {
        targetMu: 'SR', // Radical
        condition: (t) => t.system > 0.6 ? 0.05 : 0
    },
    {
        targetMu: 'OR', // Glitch/Victim
        condition: (t) => t.system > 0.8 ? 0.1 : 0
    },
    // World Trauma -> Radical Change (SR) or Withdrawal (OR)
    {
        targetMu: 'OR',
        condition: (t) => t.world > 0.5 ? 0.05 : 0
    },
    // Self Trauma -> Loss of Agency (OR) or Tool (ON)
    {
        targetMu: 'ON',
        condition: (t) => t.self > 0.6 ? 0.05 : 0
    },
     {
        targetMu: 'OR',
        condition: (t) => t.self > 0.8 ? 0.1 : 0
    },
    // Others Trauma -> Withdrawal (OR) or Strictness (ON/SN - protective)
    {
        targetMu: 'OR',
        condition: (t) => t.others > 0.7 ? 0.05 : 0
    },
    // Guilt + SelfGap -> Martyr (OR)
    {
        targetMu: 'OR',
        condition: (t, moral, selfGap) => (moral.guilt > 0.6 && selfGap > 0.4) ? 0.1 : 0
    },
    // Shame + SelfGap -> Radical (SR - compensate) or Tool (ON - hide)
    {
        targetMu: 'SR',
        condition: (t, moral, selfGap) => (moral.shame > 0.7 && selfGap > 0.3) ? 0.05 : 0
    }
];

export function updateArchetypeTension(
    agent: AgentState,
    actionTags: string[],
    topGoalId: CharacterGoalId | undefined
): void {
    if (!agent.archetype) return;
    
    const effects = computeArchetypeEffects(agent);
    let tension = agent.archetypeTension ?? 0;

    // Check if action matches archetype preferences
    const isOnBrandAction = actionTags.some(t => effects.preferredTags.includes(t));
    const isOffBrandAction = actionTags.some(t => effects.avoidedTags.includes(t));
    
    // Check if goal matches archetype preferences (if defined in goalMods with positive bias)
    const isOnBrandGoal = topGoalId && effects.goalMods[topGoalId] && effects.goalMods[topGoalId]! > 0.2;

    if (isOnBrandGoal || isOnBrandAction) {
        tension = Math.max(0, tension - 0.1);
    }

    if (isOffBrandAction) {
        tension = Math.min(1, tension + 0.15);
    }
    
    // Decay over time if neutral
    if (!isOnBrandAction && !isOffBrandAction) {
        tension *= 0.95;
    }

    agent.archetypeTension = tension;
    
    // Trigger Shadow Flip if tension is critical
    if (tension > 0.8 && agent.archetype.shadowId) {
        // Increase shadow activation
        agent.archetype.shadowActivation = clamp01(agent.archetype.shadowActivation + 0.2);
        // Reset tension slightly after flip
        agent.archetypeTension = 0.6;
    }
}

export function checkArchetypeDrift(agent: AgentState) {
    if (!agent.identityProfile || !agent.archetype) return;

    const tension = agent.identityProfile.tensionSelfObserved;
    const stress = (agent.body.acute.stress ?? 0) / 100;
    const trauma = agent.trauma || { self: 0, others: 0, world: 0, system: 0 };
    const avgTrauma = (trauma.self + trauma.others + trauma.world + trauma.system) / 4;
    
    const moral = agent.psych?.moral || { guilt: 0, shame: 0 };
    const selfGap = computeSelfGap(agent);

    // Base drift probability increased by trauma, moral dissonance and self-gap
    const driftProbability = sigmoid(10 * (tension + stress * 0.4 + avgTrauma * 1.5 + selfGap * 0.5 + (moral.guilt + moral.shame)*0.3 - 1.2));
    
    const r = agent.rngChannels?.decide?.nextFloat?.() ?? 0;
    if (r < driftProbability * 0.1) { 
        // Determine target based on Trauma Rules
        const candidates = allArchetypes.filter(a => a.id !== agent.archetype!.actualId);
        let bestCandidate = agent.archetype!.shadowId; // Default to shadow
        let maxWeight = 0;

        // Calculate weights for all archetypes based on rules
        for (const arch of candidates) {
            let w = 0.1; // base chance
            // Apply rules
            for (const rule of DRIFT_RULES) {
                if (arch.mu === rule.targetMu) {
                    w += rule.condition(trauma, moral, selfGap);
                }
            }
            
            if (w > maxWeight) {
                maxWeight = w;
                bestCandidate = arch.id;
            }
        }
        
        // Apply Drift
        if (bestCandidate) {
             // console.log(`[Archetype Drift] ${agent.title} drifts to ${bestCandidate} due to Trauma/Tension/Psych`);
             // Force update self-concept
             agent.identityProfile.archetypeSelf = bestCandidate;
             agent.archetype.self.selfId = bestCandidate;
             // In severe cases, update Actual too
             if (avgTrauma > 0.6 || selfGap > 0.7) {
                 agent.archetype.actualId = bestCandidate;
             }
        }
        
        agent.identityProfile.tensionSelfObserved = 0;
    }
}

export function calculateIdentityProfile(agent: AgentState) {
    const actualId = agent.archetype?.actualId;
    const selfId = agent.archetype?.self.selfId;
    
    if (!actualId || !selfId) return;

    // Calculate tension between Self and Observed (Actual)
    const actualArch = allArchetypes.find(a => a.id === actualId);
    const selfArch = allArchetypes.find(a => a.id === selfId);
    
    let tension = 0;
    if (actualArch && selfArch) {
        let diffSum = 0;
        for (const key of Object.keys(actualArch.metrics)) {
            diffSum += Math.abs((actualArch.metrics[key] ?? 0.5) - (selfArch.metrics[key] ?? 0.5));
        }
        tension = diffSum / Object.keys(actualArch.metrics).length;
    }

    if (!agent.identityProfile) {
        agent.identityProfile = {
            archetypeObserved: actualId,
            archetypeSelf: selfId,
            archetypePerceivedBy: {},
            tensionSelfObserved: tension,
            tensionSelfGroup: {}
        };
    } else {
        agent.identityProfile.archetypeObserved = actualId;
        agent.identityProfile.archetypeSelf = selfId;
        // Smooth tension update
        agent.identityProfile.tensionSelfObserved = (agent.identityProfile.tensionSelfObserved * 0.9) + (tension * 0.1);
    }
}
