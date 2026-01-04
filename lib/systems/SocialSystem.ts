
// lib/systems/SocialSystem.ts

import { AgentState, ActionOutcome, WorldState } from '../../types';
import { estimateInfluenceState } from '../tom/update';
import { safe01, safeNum, clamp } from "../util/safe";
import { updateTomPolicyPriorForTarget } from '../tom/policy';
import { getRelationshipFromTom } from '../tom/rel';

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

export function initializeRelationships(agent: AgentState, all_agents: AgentState[]) {
    agent.relationships = {}; 

    for (const other of all_agents) {
        if (agent.entityId === other.entityId) continue;

        let initial_trust = 0.5;
        let initial_align = 0.5;
        let initial_conflict = 0.0;
        let initial_respect = 0.5;
        let initial_fear = 0.1;
        let initial_bond = 0.1;

        const historyEvent = agent.context?.social_history?.find(e => e.target_id === other.entityId);
        if (historyEvent) {
             if (historyEvent.event === 'SAVED_MY_LIFE') {
                initial_trust = 0.9;
                initial_align = 0.8;
                initial_bond = 0.7;
            } else if (historyEvent.event === 'RIVALRY') {
                initial_trust = 0.3;
                initial_conflict = 0.6;
                initial_respect = 0.7;
            }
        }
        
        const other_faction = other.context?.faction;
        if (other_faction && agent.context?.faction_relations?.[other_faction]) {
            initial_trust += (agent.context.faction_relations[other_faction] * 0.2);
        }

        agent.relationships[other.entityId] = {
            history: [],
            trust: Math.max(0, Math.min(1, initial_trust)),
            align: Math.max(0, Math.min(1, initial_align)),
            conflict: Math.max(0, Math.min(1, initial_conflict)),
            respect: Math.max(0, Math.min(1, initial_respect)),
            fear: Math.max(0, Math.min(1, initial_fear)),
            bond: Math.max(0, Math.min(1, initial_bond)),
        };
    }
}

export function computePhi(
    agent: AgentState, 
    donor: AgentState, 
    influenceState: ReturnType<typeof estimateInfluenceState>, 
    level: "S" | "L",
    world: WorldState
): number {
    if (!agent.behavioralParams) return 0;

    const { trust, align, powerDiff, bond, conflict } = influenceState;
    const b = agent.behavioralParams.phi_beta;

    const safeTrust = safe01(trust, 0.5);
    const safeAlign = clamp(align, 0, 1);
    const safeDPow = safeNum(powerDiff, 0);
    const safeBond = safe01(bond, 0.5);
    const safeNConf = clamp(safeNum(conflict, 0), 0, 1);

    const temp0 = clamp(safeNum(agent.temperature, 0.6), 0, 1);
    const match = (agent.intent_idx !== undefined && donor.intent_idx_lag !== undefined && agent.intent_idx === donor.intent_idx_lag) ? 1 : 0;
    
    const isLeader = world.leadership.currentLeaderId === donor.entityId;

    const logit = b.b0 
                + b.bAlign * safeAlign 
                + b.bMatch * match
                + b.bTrust * (2 * safeTrust - 1)
                + b.bPower * safeDPow 
                + b.bBond * ((safeBond * 2) - 1)
                + b.bLeadership * (isLeader ? 1 : 0)
                - b.bConflict * safeNConf
                - 0.55 * clamp((temp0 - 0.6) / 0.3, 0, 1); 

    const phiMax = agent.behavioralParams.phi_max ?? 0.8;
    let base = phiMax * sigmoid(logit);
    
    const coopFloor = (safeAlign > 0.50 && safeTrust > 0.55) ? 0.05*phiMax : 0;
    const matchFloor= (match && safeTrust > 0.60 && safeAlign > 0.60) ? 0.08*phiMax : 0;

    const raw = Math.max(coopFloor, matchFloor, base);

    const levelMultiplier = level === 'S' ? 0.5 : 1.0;

    return clamp(raw, 0, phiMax) * levelMultiplier;
}


export const SocialSystem = {
    updateBeliefs: (agent: AgentState, world: WorldState): void => {
        if (!agent.relationships) {
            initializeRelationships(agent, world.agents);
        }
        
        agent.perceivedStates.set(agent.entityId, { hp: agent.hp });

        // IMPORTANT: In the new pipeline, dyadic ToM (world.tom / agent.tom)
        // often carries the *real* relationship signal (bond/trust/align/etc.)
        // while agent.relationships may still be uninitialized/default.
        // Seed relationships from dyadic ToM to avoid "everyone feels like a stranger".

        const isDefaultRel = (r: any): boolean => {
            if (!r) return true;
            const hlen = Array.isArray(r.history) ? r.history.length : 0;
            if (hlen > 0) return false;
            // Default-ish initializer values used across the codebase.
            const near = (a: number, b: number, eps = 1e-6) => Math.abs((a ?? 0) - b) <= eps;
            return (
                near(r.trust, 0.5) &&
                near(r.align, 0.5) &&
                near(r.respect, 0.5) &&
                near(r.fear, 0.1) &&
                near(r.bond, 0.1) &&
                near(r.conflict, 0.0)
            );
        };

        const seedRelFromTom = (otherId: string, current?: any) => {
            // Only seed if the relationship looks uninitialized.
            if (!isDefaultRel(current)) return current;

            const relFromTom = getRelationshipFromTom({
                world,
                agent,
                selfId: agent.entityId,
                otherId,
            });

            if (!relFromTom) return current;

            return {
                history: Array.isArray(current?.history) ? current.history : [],
                trust: clamp(safeNum(relFromTom.trust, 0.5), 0, 1),
                align: clamp(safeNum(relFromTom.align, 0.5), 0, 1),
                respect: clamp(safeNum(relFromTom.respect, 0.5), 0, 1),
                fear: clamp(safeNum(relFromTom.fear, 0.1), 0, 1),
                bond: clamp(safeNum(relFromTom.bond, 0.1), 0, 1),
                conflict: clamp(safeNum(relFromTom.conflict, 0.0), 0, 1),
            };
        };
        
        world.agents.forEach(other => {
            if (other.entityId !== agent.entityId) {
                agent.perceivedStates.set(other.entityId, { hp: other.hp });
                 if (!agent.relationships[other.entityId]) {
                    agent.relationships[other.entityId] = {
                        history: [], trust: 0.5, align: 0.5, respect: 0.5,
                        fear: 0.1, bond: 0.1, conflict: 0.0,
                    };
                }

                // Seed (or refresh defaults) from ToM dyad traits when available.
                agent.relationships[other.entityId] = seedRelFromTom(other.entityId, agent.relationships[other.entityId]);
                
                // Update Policy Prior (Expectations)
                if (world.tom) {
                    updateTomPolicyPriorForTarget(agent, other.entityId, world.tom, world);
                }
            }
        });
    },

    updateRelationships: (observer: AgentState, outcome: ActionOutcome, world: WorldState): void => {
        const actorId = outcome.actorId;
        const action = outcome.intention;
        if (!observer.relationships[actorId] || !action) return;

        const relationship = observer.relationships[actorId];
        const zeta = observer.behavioralParams.zeta_belief;

        let trustChange = 0; 
        let alignChange = 0;
        let conflictChange = 0;

        switch (action.id) {
            case 'aid_ally':
                if (action.targetId === observer.entityId) {
                    trustChange = 0.2;
                    relationship.bond = (1 - zeta) * relationship.bond + zeta * (relationship.bond + 0.1);
                }
                break;
            case 'attack':
                if (action.targetId === observer.entityId) {
                    trustChange = -0.5;
                    conflictChange = 0.6;
                    relationship.fear = (1 - zeta) * relationship.fear + zeta * (relationship.fear + 0.3);
                } else {
                    trustChange = -0.05;
                    conflictChange = 0.1;
                }
                break;
            case 'intimidate':
                 if (action.targetId === observer.entityId) {
                    trustChange = -0.2;
                    conflictChange = 0.3;
                    relationship.fear = (1 - zeta) * relationship.fear + zeta * (relationship.fear + 0.2);
                }
                break;
            case 'deceive':
                if (observer.rngChannels.perceive.nextFloat() > (observer.competencies.OPSEC_literacy || 50) / 100) {
                     if (action.targetId === observer.entityId) {
                        trustChange = -0.8;
                        conflictChange = 0.5;
                    }
                }
                break;
            case 'introduce':
                 if (action.targetId === observer.entityId) {
                    trustChange = 0.05;
                 }
                 break;
            case 'share_information':
                if (action.targetId === observer.entityId) {
                    trustChange = 0.1;
                }
                break;
        }
        
        // Positive Feedback Loop for Trust
        // If trust/bond is already high, positive actions have magnified effect
        let feedbackFactor = 1.0;
        if (trustChange > 0) {
             feedbackFactor = 1.0 + relationship.trust + relationship.bond;
        }

        relationship.trust = clamp( (1 - zeta) * relationship.trust + zeta * (relationship.trust + trustChange * feedbackFactor), 0, 1);
        relationship.align = clamp( (1 - zeta) * relationship.align + zeta * (relationship.align + alignChange), 0, 1);
        relationship.conflict = clamp( (1 - zeta) * relationship.conflict + zeta * (relationship.conflict + conflictChange), 0, 1);
        
        Object.keys(relationship).forEach(key => {
            if(typeof (relationship as any)[key] === 'number') {
                 (relationship as any)[key] = Math.max(0, Math.min(1, (relationship as any)[key]));
            }
        });

        relationship.history.push({ event: action.id, tick: world.tick, intensity: Math.abs(trustChange) + Math.abs(conflictChange) });
        if (relationship.history.length > 50) relationship.history.shift();
    },
    
    updateInfluences: (agent: AgentState, world: WorldState): {donors: { phi: number, WLag: number[], WSLag: number[] }[], log: string} => {
        const donors: { phi: number, WLag: number[], WSLag: number[] }[] = [];
        let log = `GIL: ${agent.title} не подвержен влиянию.`;

        let totalPhi = 0;
        let topDonorName = '';
        let topPhi = 0;
        let topDonorAlign = 0;
        let topDonorTrust = 0;
        let topDonorMatch = 0;


        for (const donor of world.agents) {
            if (donor.entityId === agent.entityId) continue;
            
            const influenceState = estimateInfluenceState(agent, donor);
            
            const phiL = computePhi(agent, donor, influenceState, "L", world);
            if (phiL > 1e-3) {
                donors.push({ phi: phiL, WLag: donor.W_L_lag, WSLag: donor.W_S_lag });
                totalPhi += phiL;
                if (phiL > topPhi) {
                    topPhi = phiL;
                    topDonorName = donor.title;
                    topDonorAlign = influenceState.align;
                    topDonorTrust = influenceState.trust;
                    topDonorMatch = (agent.intent_idx !== undefined && donor.intent_idx_lag !== undefined && agent.intent_idx === donor.intent_idx_lag) ? 1 : 0;
                }
            }
        }
    
        if (donors.length > 0) {
            log = `GIL: ${agent.title} под влиянием (Σφ=${totalPhi.toFixed(2)}), в основном от ${topDonorName} (φ=${topPhi.toFixed(2)}, align=${topDonorAlign.toFixed(2)}, trust=${topDonorTrust.toFixed(2)}, match=${topDonorMatch}).`;
        }
        
        (agent as any).temp_gil_log = log;

        return { donors, log };
    }
};
