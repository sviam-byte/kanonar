
import { PersonalEvent } from '../../types';
import { BioFeatureId, RelationalBioFeatureId } from '../life-goals/v4-types';

/**
 * Scans the biography for specific patterns and returns a set of weighted feature flags.
 * Returns a record of { FeatureID: Strength (usually 0..1, can be >1 for accumulation) }
 */
export function extractBioFeatures(events: PersonalEvent[]): Record<BioFeatureId, number> {
    const features: Record<BioFeatureId, number> = {} as any;
    
    // Helper to accumulate
    const add = (id: BioFeatureId, val: number) => {
        features[id] = (features[id] || 0) + val;
    };

    for (const ev of events) {
        const tags = ev.tags || [];
        const intensity = ev.intensity ?? 0.5;
        const kind = ev.domain; // Using domain as kind

        // --- 1. Trauma & Negative ---
        if (kind === 'trauma' || tags.includes('trauma')) {
            if (tags.includes('attachment') || kind === 'loss') add('B_attachment_trauma', intensity);
            if (kind === 'loss' || tags.includes('loss')) add('B_loss', intensity);
            
            if (tags.includes('betrayal') && (kind === 'betrayal_by_leader' || kind === 'betrayal_experienced')) add('B_betrayed_by_peer', intensity);
            if (kind === 'betrayal_by_leader') add('B_betrayed_system', intensity);
            if (kind === 'betrayal_committed') add('B_betrayal_committed', intensity);
            if (tags.includes('humiliation')) add('B_humiliation', intensity);
            if (tags.includes('moral_injury') || kind === 'moral_compromise') add('B_moral_injury', intensity);
            
            if (kind === 'torture' || tags.includes('coercion')) {
                add('B_coercion', intensity);
                if (kind === 'torture') add('B_torture', intensity);
            }

            if (kind === 'group_trauma' || tags.includes('mass_casualties')) add('B_group_trauma', intensity);
            if (kind === 'abandonment') add('B_abandonment', intensity);
            if (kind === 'bullying') add('B_bullying', intensity);
            if (kind === 'sleep_disorder') add('B_sleep_disorders', intensity);
            
            if (kind === 'failed_rescue') add('B_failed_rescue', intensity);
        }

        // --- 2. Roles & Experience ---
        if (tags.includes('heroism') || tags.includes('rescue')) {
            add('B_saved_others', intensity);
            if (tags.includes('heroism')) add('B_hero_complex', intensity * 0.5);
        }

        if (kind === 'caregiving' || tags.includes('parenting')) add('B_parent_role', intensity);
        
        if (tags.includes('leadership') || kind === 'command_success') {
            add('B_leader_exp', intensity);
            add('B_high_responsibility', intensity * 0.5);
        }
        
        if (kind === 'service' || tags.includes('military') || tags.includes('discipline') || kind === 'training') {
             add('B_military_socialization', intensity);
        }
        
        // --- 3. Conditions ---
        if (kind === 'illness' || kind === 'injury') {
            add('B_chronic_pain', intensity * 0.5);
            if (kind === 'injury') add('B_injury', intensity);
        }

        if (tags.includes('stress') || kind === 'crisis') add('B_chronic_stress', intensity * 0.5);
        
        if (kind === 'scarcity' || tags.includes('deprivation')) {
            add('B_approval_deprivation', intensity);
            if (kind === 'scarcity') add('B_scarcity', intensity);
        }
        
        if (kind === 'captivity' || tags.includes('escape')) {
            add('B_exile', intensity);
            if (kind === 'captivity') {
                add('B_captivity', intensity);
                add('B_political_prisoner', intensity * 0.5);
            }
        }

        if (kind === 'burnout') {
            add('B_burnout', intensity);
            add('B_overwork', intensity);
        }

        if (kind === 'sensory_overload') add('B_sensory_sensitivity', intensity);
        if (tags.includes('identity_threat')) add('B_identity_threats', intensity);
        
        // --- 4. System/World Interaction ---
        if (tags.includes('chaos') || kind === 'dark_exposure') add('B_exposed_to_chaos', intensity);
        if (tags.includes('injustice')) add('B_witnessed_injustice', intensity);
        if (kind === 'training' && tags.includes('discipline')) add('B_raised_in_strict_order', intensity);
        
        if (kind === 'oath_take') {
            add('B_long_term_commitments', intensity);
            add('B_oath_taken', intensity);
        }
        
        if (tags.includes('deception') && ev.valence < 0) add('B_lied_to_history', intensity);
        if (kind === 'near_death') add('B_existential_crises', intensity);
        if (tags.includes('dissociation')) add('B_dissociation_history', intensity);
        if (kind === 'childhood_trauma') add('B_no_safe_place_childhood', intensity);
        if (kind === 'moral_upbringing') add('B_strict_moral_upbringing', intensity);
        
        if (kind === 'failure' || kind === 'demotion') add('B_status_loss_history', intensity);
        
        if (kind === 'achievement' || kind === 'success') add('B_success', intensity);
        
        if (tags.includes('survival') || kind === 'survival') add('B_survival_mode', intensity);
    }

    // Saturate features at reasonable levels (e.g. 1.0) to prevent explosion
    for (const key in features) {
        const k = key as BioFeatureId;
        features[k] = Math.tanh(features[k]); 
    }

    return features;
}

/**
 * Extracts bio features relative to a specific target (Person, Group, etc.)
 */
export function extractRelationalBioFeatures(events: PersonalEvent[], targetId: string): Record<RelationalBioFeatureId, number> {
    const features: Record<RelationalBioFeatureId, number> = {} as any;
    const counts: Record<RelationalBioFeatureId, number> = {} as any;

    const add = (id: RelationalBioFeatureId, val: number) => {
        features[id] = (features[id] || 0) + val;
        counts[id] = (counts[id] || 0) + 1;
    };

    for (const ev of events) {
        // Check if target is involved
        let involvesTarget = false;
        if (ev.participants && ev.participants.includes(targetId)) involvesTarget = true;
        else if (ev.payload) {
             if (ev.payload.targetId === targetId || ev.payload.otherId === targetId) involvesTarget = true;
        }

        if (!involvesTarget) continue;

        const intensity = ev.intensity ?? 0.5;
        const tags = ev.tags || [];
        const kind = ev.domain;

        // Positive Interactions
        if (tags.includes('rescue') || tags.includes('heroism') || tags.includes('protecting_target')) add('B_rel_saved', intensity);
        if (tags.includes('care') || kind === 'caregiving') add('B_rel_care_from', intensity); 
        
        // Devotion / Goal Embrace (Critical for Krystar-Tegan dynamic)
        if (kind === 'goal_embrace' || tags.includes('devotion') || (kind === 'oath_take' && ev.valence > 0)) {
            add('B_rel_devotion', intensity * 1.5); // Strong bond
        }
        
        // Romance / Deep Bond (Explicit)
        if (tags.includes('romance') || tags.includes('love') || tags.includes('intimacy')) {
            add('B_rel_romance', intensity * 2.0); // Very strong
        }
        
        // Friendship / Alliance
        if (tags.includes('friend') || tags.includes('friendship') || tags.includes('ally')) {
            add('B_rel_friendship', intensity);
        }
        
        // Negative Interactions
        if (tags.includes('betrayal')) add('B_rel_betrayed_by', intensity);
        if (tags.includes('humiliation')) add('B_rel_humiliated_by', intensity);
        if (tags.includes('harm') || kind === 'violence') add('B_rel_harmed', intensity);
        
        // Hierarchy / Obedience
        if (tags.includes('obedience') || kind === 'service') add('B_rel_obeyed', intensity);
        if (tags.includes('coercion') || kind === 'captivity') add('B_rel_controlled_by', intensity);
        
        // Shared Experience
        // FIX: Expanded check for various trauma tags
        const isTrauma = tags.includes('trauma') || tags.includes('shared_trauma') || tags.includes('group_trauma') || !!ev.trauma;
        const isSocial = tags.includes('social') || tags.includes('joint') || tags.includes('group') || (ev.participants && ev.participants.length > 0);

        if (isTrauma && isSocial) {
             add('B_rel_shared_trauma', intensity);
        }
        
        // Joint action bonus (cumulative)
        if (tags.includes('joint')) add('B_rel_shared_trauma', intensity * 0.5);
        
        // Failure to get needs met
        if (kind === 'scarcity' || tags.includes('rejection')) add('B_rel_approval_deprivation', intensity);
    }
    
    // Apply Non-Linear Synergy
    // Multiple events of the same type reinforce each other more than linearly
    for (const key in features) {
        const k = key as RelationalBioFeatureId;
        const raw = features[k] || 0;
        const count = counts[k] || 1;
        
        // If we have repeated interactions, apply a boost multiplier
        // e.g. 3 events of intensity 1 -> raw 3 -> with bonus (1 + 3*0.2) = 1.6 -> 4.8 effectively before tanh
        // This makes accumulation faster for patterns
        const patternBonus = count > 1 ? (1 + count * 0.1) : 1;
        
        // Smooth saturation
        features[k] = 1 - Math.exp(-(raw * patternBonus));
    }

    return features;
}
