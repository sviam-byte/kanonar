
// /lib/tom/update.ts

import { AgentState, TomState, TomEntry, TomBeliefTraits } from '../../types';
import { cosSim } from '../math/core';
import { computeEffectiveNorms } from './norms';
import { updateAffectFromStress } from './affect';
import { computeErrorProfile } from './errors';
import { computeShame } from './shame_guilt';

export interface InfluenceState {
    trust: number;
    align: number;
    conflict: number;
    bond: number;
    mentor: boolean;
    powerDiff: number;
}


/**
 * Placeholder function for updating an observer's beliefs about a target based on the target's last action.
 * In a full implementation, this would contain complex Bayesian updates or EMA filtering.
 */
export function updateBeliefsFromLastAction(observer: AgentState, target: AgentState) {
    // This function is implemented in SocialSystem.ts for the new engine.
}

/**
 * Core of ToM: estimating the relationship state between two agents.
 * Now dynamically calculates alignment based on goal similarity and reads dynamic trust.
 */
export function estimateInfluenceState(observer: AgentState, target: AgentState): InfluenceState {
    // Dynamic alignment based on cosine similarity of lagged Long-term goals.
    const align = cosSim(observer.W_L_lag || [], target.W_L_lag || []);
    
    // Read dynamic trust from the relationships map, defaulting to 0.5
    const relationship = observer.relationships?.[target.entityId];
    const trust = relationship?.trust ?? 0.5;
    const conflict = relationship?.conflict ?? 0.1;
    const bond = relationship?.bond ?? 0.1;


    return {
        trust: trust,
        align: align,
        conflict: conflict, 
        bond: bond,
        mentor: false, // Stub
        powerDiff: (target.identity.clearance_level || 0) - (observer.identity.clearance_level || 0),
    };
}

export function updateTomEntry(entry: TomEntry, world: any) {
    // Cast entry to local TomEntry if needed, but we should rely on shared types
    // Since shared type TomEntry is imported from '../../types', let's use that.
    
    // --- EPISTEMIC ---
    if (entry.epistemic) {
        // decay/normalization — опционально
    }

    // --- ROLE ---
    if (entry.roleProfile) {
        // role updates происходят через внешние события
    }

    // --- NORMS ---
    if (entry.norms) {
        computeEffectiveNorms(entry as any, world.groupNorms);
    }

    // --- AFFECT ---
    if (entry.affect) {
        updateAffectFromStress(entry as any, entry.stress?.load ?? 0.3, entry.uncertainty ?? 0.5);
    }

    // --- ERRORS ---
    computeErrorProfile(entry as any);

    // --- SHAME & GUILT ---
    if (entry.secondOrderSelf && entry.affect && entry.norms) {
        computeShame(entry as any);
    }
}
