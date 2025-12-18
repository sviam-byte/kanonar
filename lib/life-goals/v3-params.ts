// lib/life-goals/v3-params.ts

import type { GoalAxisId, DistortionProfile } from '../../types';
import type { ExposureTraces, Worldview } from '../../types';

// --- Axis Definitions ---
export const GOAL_AXES: GoalAxisId[] = [
    'fix_world', 'preserve_order', 'free_flow', 'control', 'care',
    'power_status', 'truth', 'chaos_change', 'efficiency', 'escape_transcend'
];

export const EXPOSURE_KEYS: (keyof ExposureTraces)[] = [
    'E_threat', 'E_betrayal_leader', 'E_betrayal_peer', 'E_helpless', 
    'E_chaos', 'E_loss', 'E_secrecy', 'E_scarcity', 'E_humiliation', 
    'E_care_load', 'E_system_arbitrariness', 'E_mastery_success'
];

export const WORLDVIEW_KEYS: (keyof Worldview)[] = [
    'world_benevolence', 'people_trust', 'system_legitimacy', 'predictability',
    'controllability', 'fairness', 'scarcity', 'meaning_coherence'
];

// Matrix B_Bio: [Exposures] -> 10 Axes
// SCALING NOTE: Reduced from ~2.0 to ~0.2-0.4 to prevent domination.
export const MATRIX_B_BIO: Partial<Record<GoalAxisId, Partial<Record<keyof ExposureTraces, number>>>> = {
    control: { 
        E_helpless: 0.04,  
        E_chaos: 0.03, 
        E_scarcity: 0.03,
        E_system_arbitrariness: 0.02 
    },
    care: { 
        E_care_load: 0.04, 
        E_loss: 0.03,      
        E_humiliation: 0.02 
    },
    power_status: { 
        E_humiliation: 0.05, // Compensatory
        E_mastery_success: 0.03, 
        E_helpless: 0.02 
    },
    truth: { 
        E_secrecy: 0.04, 
        E_betrayal_peer: 0.02,
        E_betrayal_leader: 0.02
    },
    preserve_order: { 
        E_chaos: 0.04, 
        E_betrayal_leader: -0.02,
        E_system_arbitrariness: -0.02 
    },
    free_flow: { 
        E_system_arbitrariness: 0.04,
        E_helpless: -0.01 
    },
    escape_transcend: { 
        E_helpless: 0.04, 
        E_loss: 0.03, 
        E_humiliation: 0.02,
        E_scarcity: 0.02
    },
    fix_world: { 
        E_system_arbitrariness: 0.05, 
        E_mastery_success: 0.02,
        E_chaos: 0.02
    },
    chaos_change: { 
        E_chaos: -0.03, 
        E_system_arbitrariness: 0.03,
        E_betrayal_leader: 0.03
    },
    efficiency: { 
        E_scarcity: 0.05 
    }
};

// Matrix C: Worldview -> Axes
// SCALING NOTE: Reduced from ~2.0 to ~0.3
export const MATRIX_C_WV: Partial<Record<GoalAxisId, Partial<Record<keyof Worldview, number>>>> = {
    control: { 
        controllability: -0.05, 
        predictability: -0.03,
        world_benevolence: -0.02,
        people_trust: -0.02,
        scarcity: 0.04 
    },
    preserve_order: { 
        predictability: -0.03, 
        fairness: -0.02,       
        system_legitimacy: 0.04, 
        scarcity: 0.02
    },
    truth: { 
        predictability: -0.02,
        system_legitimacy: -0.03, 
        people_trust: -0.03
    },
    care: { 
        world_benevolence: -0.03, 
        people_trust: 0.03,       
        fairness: -0.02
    },
    efficiency: { 
        scarcity: 0.05, 
        predictability: -0.02 
    },
    escape_transcend: { 
        meaning_coherence: -0.04, 
        world_benevolence: -0.03, 
        scarcity: 0.02 
    },
    fix_world: { 
        fairness: -0.04, 
        system_legitimacy: -0.03, 
        world_benevolence: -0.02 
    },
    power_status: { 
        system_legitimacy: -0.02, 
        people_trust: -0.02,
        controllability: 0.03
    },
    free_flow: { 
        predictability: -0.03,
        controllability: -0.03,
        system_legitimacy: -0.03
    },
    chaos_change: { 
        system_legitimacy: -0.04, 
        fairness: -0.02
    }
};

// Matrix K: Distortions -> Axes
// SCALING NOTE: Reduced from ~2.0 to ~0.3. Made more sparse to avoid "everything up".
export const MATRIX_K_DIST: Partial<Record<GoalAxisId, Partial<Record<keyof DistortionProfile, number>>>> = {
    control: { 
        controlIllusion: 0.06, 
        threatBias: 0.04,
        blackWhiteThinking: 0.02
    },
    preserve_order: { 
        blackWhiteThinking: 0.05, 
        controlIllusion: 0.03,
        catastrophizing: 0.02
    },
    truth: { 
        trustBias: -0.04, // High trust bias (distrust) makes you question everything
        mindReading: -0.03, // Mind reading distorts truth finding
        blackWhiteThinking: -0.03
    },
    care: { 
        trustBias: -0.04,
        selfBlameBias: 0.03 // "I must fix it for them"
    }, 
    efficiency: { 
        controlIllusion: 0.03 
    },
    escape_transcend: { 
        catastrophizing: 0.06, 
        threatBias: 0.05,
        selfBlameBias: 0.04
    },
    fix_world: { 
        selfBlameBias: 0.05,
        personalization: 0.03
    },
    power_status: { 
        mindReading: 0.04, 
        threatBias: 0.04 // Defensive power
    },
    free_flow: { 
        blackWhiteThinking: -0.04, 
        controlIllusion: -0.04
    },
    chaos_change: { 
        catastrophizing: 0.04, 
        controlIllusion: -0.03 
    }
};