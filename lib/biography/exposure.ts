
import { PersonalEvent, ExposureTraces, Worldview } from '../../types';

// Decay config
const EXPOSURE_LAMBDA = 0.15; 

function timeDecay(age: number, lambda: number): number {
  if (age <= 0) return 1;
  return Math.exp(-lambda * age);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function emptyExposure(): ExposureTraces {
    return {
        E_threat: 0, E_betrayal_leader: 0, E_betrayal_peer: 0, E_helpless: 0, E_chaos: 0,
        E_loss: 0, E_secrecy: 0, E_scarcity: 0, E_humiliation: 0, E_care_load: 0,
        E_system_arbitrariness: 0, E_mastery_success: 0
    };
}

export const TAG_TO_EXPOSURE: Record<string, Partial<Record<keyof ExposureTraces, number>>> = {
    'trauma': { E_threat: 0.8, E_chaos: 0.4 },
    'betrayal': { E_betrayal_peer: 0.6 }, 
    'betrayal_by_leader': { E_betrayal_leader: 1.0 },
    'betrayal_by_peer': { E_betrayal_peer: 1.0 },
    'loss': { E_loss: 0.9 },
    'humiliation': { E_humiliation: 1.0, E_helpless: 0.5 },
    'captivity': { E_helpless: 1.0, E_threat: 0.5, E_system_arbitrariness: 0.3 },
    'torture': { E_threat: 1.0, E_helpless: 0.8, E_humiliation: 0.7 },
    'dark_exposure': { E_chaos: 1.0, E_threat: 0.4 },
    'failure': { E_helpless: 0.4, E_humiliation: 0.3 },
    'success': { E_mastery_success: 0.8 },
    'achievement': { E_mastery_success: 1.0 },
    'rescue': { E_mastery_success: 0.5 },
    'care': { E_care_load: 0.5 },
    'secret': { E_secrecy: 0.8 },
    'scarcity': { E_scarcity: 1.0 },
    'hunger': { E_scarcity: 1.0 },
    'blockade': { E_scarcity: 1.0 },
    'rationing': { E_scarcity: 0.8 },
    'siege': { E_scarcity: 0.9, E_threat: 0.5 },
    'poverty': { E_scarcity: 0.7 },
    'lack': { E_scarcity: 0.5 },
    'resource_deficit': { E_scarcity: 0.8 }
};

export const DOMAIN_TO_EXPOSURE: Record<string, Partial<Record<keyof ExposureTraces, number>>> = {
    'captivity': { E_helpless: 1.0 },
    'torture': { E_threat: 1.0 },
    'betrayal_experienced': { E_betrayal_peer: 0.5 },
    'loss': { E_loss: 1.0 },
    'power_grab': { E_betrayal_leader: 0.5, E_chaos: 0.3 },
    'scarcity': { E_scarcity: 1.0 }
};

export function computeExposureTraces(events: PersonalEvent[]): ExposureTraces {
    const traces = emptyExposure();
    if (!events) return traces;
    
    for (const ev of events) {
        const ageYears = ev.years_ago ?? 0;
        const decay = timeDecay(ageYears, EXPOSURE_LAMBDA);
        
        // Duration logic: (1 + 0.2 * ln(1 + duration))
        const durationFactor = 1 + 0.2 * Math.log1p(ev.duration_days || 0);
        const weight = (ev.intensity ?? 0) * decay * durationFactor;

        // 0. Explicit Trauma Object Handling
        if (ev.trauma) {
            const w = weight * (ev.trauma.severity ?? 1.0);
            switch(ev.trauma.domain) {
                case 'system':
                    traces.E_system_arbitrariness += w;
                    if (ev.trauma.kind === 'betrayal_by_leader') traces.E_betrayal_leader += w;
                    break;
                case 'others':
                    if (ev.trauma.kind === 'torture' || ev.trauma.kind === 'violence') {
                        traces.E_threat += w;
                        traces.E_humiliation += w * 0.5;
                    } else {
                        traces.E_betrayal_peer += w;
                    }
                    break;
                case 'world':
                    traces.E_chaos += w;
                    traces.E_threat += w * 0.5;
                    break;
                case 'self':
                    traces.E_helpless += w;
                    traces.E_humiliation += w * 0.3;
                    break;
            }
        }

        // 1. Map from tags
        if (ev.tags) {
            for (const tag of ev.tags) {
                const map = TAG_TO_EXPOSURE[tag.toLowerCase()];
                if (map) {
                    for (const [key, val] of Object.entries(map)) {
                        const k = key as keyof ExposureTraces;
                        traces[k] += weight * (val ?? 0);
                    }
                }
            }
        }

        // 2. Map from domain/kind
        const domainMap = DOMAIN_TO_EXPOSURE[ev.domain];
        if (domainMap) {
             for (const [key, val] of Object.entries(domainMap)) {
                const k = key as keyof ExposureTraces;
                traces[k] += weight * (val ?? 0);
            }
        }
        
        // 3. Specific attributes
        if (ev.secrecy === 'private' || ev.secrecy === 'ingroup') {
            traces.E_secrecy += weight * 0.3;
        }
        if (ev.controllability !== undefined && ev.controllability < 0.3) {
            traces.E_helpless += weight * 0.4;
        }
        if (ev.valence > 0) {
            traces.E_mastery_success += weight * 0.5;
        }
    }

    return traces;
}

// UPDATED: Base bias is now 0.0 to result in sigmoid(0) = 0.5 for neutral state
const BASE_BIAS = 0.0; 

export function computeWorldview(E: ExposureTraces): Worldview {
    const w: Worldview = {
        world_benevolence: 0.5,
        people_trust: 0.5,
        system_legitimacy: 0.5,
        predictability: 0.5,
        controllability: 0.5,
        fairness: 0.5,
        scarcity: 0.5,
        meaning_coherence: 0.5
    };

    // 3.1. People Trust
    w.people_trust = sigmoid(BASE_BIAS - 1.2 * E.E_betrayal_peer - 1.0 * E.E_humiliation - 0.8 * E.E_threat + 0.3 * E.E_care_load);

    // 3.2. Benevolence
    w.world_benevolence = sigmoid(BASE_BIAS + 0.1 - 1.5 * E.E_threat - 0.8 * E.E_loss - 0.8 * E.E_chaos - 0.7 * E.E_betrayal_peer);

    // 3.3. System Legitimacy
    w.system_legitimacy = sigmoid(BASE_BIAS - 1.2 * E.E_system_arbitrariness - 1.0 * E.E_betrayal_leader - 0.5 * E.E_humiliation);

    // 3.4. Controllability
    w.controllability = sigmoid(BASE_BIAS + 0.8 * E.E_mastery_success - 1.5 * E.E_helpless - 0.5 * E.E_system_arbitrariness);

    // 3.5. Fairness
    w.fairness = sigmoid(BASE_BIAS - 1.0 * E.E_humiliation - 0.8 * E.E_system_arbitrariness - 0.5 * E.E_betrayal_leader);

    // 3.6. Predictability
    w.predictability = sigmoid(BASE_BIAS - 1.0 * E.E_chaos - 0.5 * E.E_threat);

    // 3.7. Meaning
    w.meaning_coherence = sigmoid(BASE_BIAS + 0.1 - 0.8 * E.E_chaos - 0.5 * E.E_loss + 0.5 * E.E_mastery_success);
    
    // 3.8. Scarcity (Bias -0.5 to default to low scarcity if no events, ~0.38)
    w.scarcity = sigmoid(-0.5 + 1.5 * E.E_scarcity + 0.5 * E.E_care_load);

    return w;
}
