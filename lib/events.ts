
// lib/events.ts
import { CharacterEntity, EventImpacts, PersonalEvent, AgentState } from '../types';
import { allEventTemplates } from '../data/event-templates';
import { applyTraumaTag, mapTraumaEventToTag } from './trauma';

export type { EventImpacts };

const getParam = (p: Record<string, number>, key: string, defaultValue: number = 0.5): number => {
    const value = p[key];
    return typeof value === 'number' ? value : defaultValue;
}

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

export function calculateEventImpacts(
  character: CharacterEntity, 
  events: PersonalEvent[],
  flatParams: Record<string, number>
): EventImpacts {
    if (!events || events.length === 0) {
        return { paramDeltas: {}, paramScales: {}, goalActivationDeltas: {}, acuteDeltas: {}, relationDeltas: {} };
    }

    const paramDeltas: Record<string, number> = {};
    const paramScales: Record<string, number> = {};
    const goalActivationDeltas: Record<string, number> = {};
    const acuteDeltas: Record<string, number> = {};
    const relationDeltas: Record<string, number> = {};

    const TAU_RECENCY = 730; // 2 years
    const RHO_IMPRINT = [1.0, 0.6, 0.4]; // Based on age ranges 0-7, 8-12, 13-25

    // FIX: Safely access age
    const currentAge = character.context?.age ?? 30;

    for (const event of events) {
        const template = allEventTemplates.find(t => t.id === event.name || t.domain === event.domain); // Fallback to domain match

        // --- Calculate Event Weight (W_e) ---
        const w_rec = Math.exp(-(event.years_ago ?? 0) * 365 / TAU_RECENCY);
        
        let w_imprint = 1.0;
        const age_at_event = (currentAge - (event.years_ago ?? 0));
        if (age_at_event <= 7) w_imprint = 1 + RHO_IMPRINT[0];
        else if (age_at_event <= 12) w_imprint = 1 + RHO_IMPRINT[1];
        else if (age_at_event <= 25) w_imprint = 1 + RHO_IMPRINT[2];

        const w_chron = 1 + 0.5 * Math.tanh(event.duration_days / 30);
        const w_reh = Math.log(1 + (event.reactivations ?? 0));
        const W_e = event.intensity * Math.abs(event.valence) * w_rec * w_imprint * w_chron * (1 + 0.2 * w_reh);

        // --- Apply Acute Impulses ---
        const s_sec = 1 + (event.secrecy === 'public' ? 0.31 : event.secrecy === 'private' ? -0.21 : 0);
        acuteDeltas['stress'] = (acuteDeltas['stress'] || 0) + (0.6 * event.surprise + 0.4 * (1 - event.controllability)) * event.intensity * s_sec * -event.valence * 25;
        acuteDeltas['fatigue'] = (acuteDeltas['fatigue'] || 0) + 0.4 * Math.pow(event.duration_days, 0.5) * event.intensity * 15;
        
        if(event.tags.includes('injury') || event.tags.includes('illness')) {
            acuteDeltas['pain_now'] = (acuteDeltas['pain_now'] || 0) + 0.7 * event.intensity * 30;
        }
        if(event.tags.includes('humiliation') || event.tags.includes('oath_break') || event.tags.includes('noncombatant_harm')) {
             acuteDeltas['moral_injury'] = (acuteDeltas['moral_injury'] || 0) + (0.5 + 0.5 * event.responsibility_self) * event.intensity * 20;
        }

        // --- Apply Long-term Shifts ---
        const KAPPA_E = 0.05; // Learning rate for shifts
        const sign_e = Math.sign(event.valence);
        
        if (event.domain === 'failure' || event.domain === 'humiliation') {
            paramDeltas['vector_base.G_Self_concept_strength'] = (paramDeltas['vector_base.G_Self_concept_strength'] || 0) + KAPPA_E * sign_e * W_e;
            paramDeltas['cognitive.shame_guilt_sensitivity'] = (paramDeltas['cognitive.shame_guilt_sensitivity'] || 0) - KAPPA_E * sign_e * W_e * 100;
        }
        if (event.domain === 'achievement' || event.domain === 'breakthrough') {
            paramDeltas['vector_base.G_Narrative_agency'] = (paramDeltas['vector_base.G_Narrative_agency'] || 0) + KAPPA_E * sign_e * W_e;
            paramDeltas['vector_base.E_Model_calibration'] = (paramDeltas['vector_base.E_Model_calibration'] || 0) + KAPPA_E * sign_e * W_e;
        }
        if (event.domain === 'dark_exposure') {
            acuteDeltas['dark_exposure'] = (acuteDeltas['dark_exposure'] || 0) + 15 * event.intensity;
        }

        // --- Apply Goal Impulses ---
        const TAU_S = 365; // Decay for goal impulses
        if (template?.goal_impulses) {
            for (const impulse of template.goal_impulses) {
                 goalActivationDeltas[impulse.goalId] = (goalActivationDeltas[impulse.goalId] || 0) + impulse.weight * event.valence * event.intensity * Math.exp(-(event.years_ago ?? 0) * 365 / TAU_S);
            }
        }
        
         // --- Update monstro risk ---
        const EW = getParam(flatParams, 'EW', 0.5);
        const deltaPrMonstro = sigmoid(
            1.6 * (acuteDeltas['stress'] / 100) + 
            1.2 * (acuteDeltas['moral_injury'] / 100) + 
            0.8 * (event.dark_payload ?? 0) - 
            1.0 * EW
        ) / 10; // Scaled down to be an impulse
        paramDeltas['prMonstro'] = (paramDeltas['prMonstro'] || 0) + deltaPrMonstro;

        // --- New: Apply Trauma to Agent State if applicable ---
        // Note: calculateEventImpacts is usually called for static analysis or init.
        // For dynamic simulation, we need to update the AgentState directly.
        // Since `character` here can be an AgentState, we check and apply.
        if (event.trauma && (character as any).trauma) {
             // This logic assumes the function is called during a loop where mutation is allowed
             // OR we need to return trauma deltas. 
             // For simplicity in this architecture, we assume direct mutation for complex state
             // or we simply rely on the dynamic loop to handle new events.
             // BUT for initial load (static page), we might want to re-play trauma?
             // Let's assume `applyTraumaTag` is safe to call here if character is mutable.
             applyTraumaTag(character as AgentState, event.trauma);
        } else if (event.domain === 'trauma' || event.tags.includes('trauma')) {
             // Backward compatibility for events without explicit trauma tag
             const legacyTrauma: any = { kind: event.tags.includes('betrayal') ? 'betrayal_by_peer' : 'random_catastrophe', severity: event.intensity };
             const tag = mapTraumaEventToTag(legacyTrauma);
             // Only apply if state structure exists
             if ((character as any).trauma) {
                applyTraumaTag(character as AgentState, tag);
             }
        }

    }

    return { paramDeltas, paramScales, goalActivationDeltas, acuteDeltas, relationDeltas };
}
