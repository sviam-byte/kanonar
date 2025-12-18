
import { AgentState, CharacterGoalId, ToMV2DashboardMetrics } from '../../types';
import { allArchetypes } from '../../data/archetypes';
import { clamp01 } from '../util/math';

export interface ArchetypeEffects {
  goalMods: Partial<Record<CharacterGoalId, number>>;
  tomMods: Record<string, number>;
  actionBiases: Record<string, number>; // tag -> utility delta
  preferredTags: string[];
  avoidedTags: string[];
}

// Helpers to build effects
const g = (id: CharacterGoalId, val: number) => ({ [id]: val });
const t = (key: string, val: number) => ({ [key]: val });
const a = (tag: string, val: number) => ({ [tag]: val });

// Base effects by Function (1-16)
const FUNCTION_EFFECTS: Record<number, Partial<ArchetypeEffects>> = {
  // 1: Dogmatist (Truth/Order)
  1: {
    goalMods: { ...g('maintain_legitimacy', 0.3), ...g('seek_information', 0.2) },
    actionBiases: { ...a('procedure', 0.3), ...a('deceive', -0.2) },
    tomMods: { ...t('norm_conflict', 0.2) } // Highly sensitive to norm violations
  },
  // 5: Fortifier (Defense/Walls)
  5: {
    goalMods: { ...g('protect_self', 0.2), ...g('maintain_cohesion', 0.3) },
    actionBiases: { ...a('stability', 0.4), ...a('risk', -0.3) },
    tomMods: { ...t('coalition_cohesion', 0.2) }
  },
  // 9: Planner (Time/Order)
  9: {
    goalMods: { ...g('go_to_surface', 0.3), ...g('maintain_legitimacy', 0.2) },
    actionBiases: { ...a('progress', 0.2), ...a('wait', 0.1) },
    tomMods: { ...t('rationality_fit', 0.3) }
  },
  // 11: Executioner (Justice/Force)
  11: {
    goalMods: { ...g('immediate_compliance', 0.4), ...g('contain_enemy', 0.3) },
    actionBiases: { ...a('force', 0.4), ...a('mercy', -0.5) },
    tomMods: { ...t('detect_power', 0.3) }
  },
  // 13: Bureaucrat (Identity/Status)
  13: {
    goalMods: { ...g('maintain_legitimacy', 0.5), ...g('avoid_blame', 0.3) },
    actionBiases: { ...a('hierarchy', 0.4), ...a('solo', -0.2) },
    tomMods: { ...t('cred_commit', 0.3) }
  },
  // 14: Diplomat (Connection)
  14: {
    goalMods: { ...g('maintain_cohesion', 0.5), ...g('protect_other', 0.2) },
    actionBiases: { ...a('social', 0.4), ...a('conflict', -0.3) },
    tomMods: { ...t('coalition_cohesion', 0.4), ...t('norm_conflict', -0.2) }
  },
  // 15: Leader (Will/Command)
  15: {
    goalMods: { ...g('maintain_legitimacy', 0.4), ...g('follow_order', -0.3) },
    actionBiases: { ...a('hierarchy', 0.3), ...a('coordination', 0.4) },
    tomMods: { ...t('detect_power', 0.2), ...t('pivotality', 0.3) }
  },
  // 16: Confessor/Healer (Memory/Care)
  16: {
    goalMods: { ...g('help_wounded', 0.5), ...g('protect_other', 0.4) },
    actionBiases: { ...a('care', 0.5), ...a('force', -0.4) },
    tomMods: { ...t('trust_bias', 0.2) } // custom field support
  }
};

// Base effects by Mode (Mu)
const MODE_EFFECTS: Record<string, Partial<ArchetypeEffects>> = {
  'SR': { // Radical (Change/Self) - "The Rebel / Hero"
    goalMods: { assert_autonomy: 1.2, maintain_legitimacy: -0.5, go_to_surface: 0.6 },
    actionBiases: { 
        risk: 0.8, challenge: 0.8, force: 0.5,
        obedience: -0.8, procedure: -0.5, wait: -0.5 
    },
    preferredTags: ['risk', 'challenge', 'force', 'autonomy'],
    avoidedTags: ['obedience', 'procedure', 'wait', 'passive'],
    tomMods: { norm_conflict: 0.3, coalition_cohesion: -0.2, betrayal_risk: 0.2 }
  },
  'SN': { // Norm (Order/System) - "The Ruler / Bureaucrat"
    goalMods: { maintain_legitimacy: 1.2, maintain_cohesion: 0.8, follow_order: 0.5 },
    actionBiases: { 
        hierarchy: 0.8, procedure: 0.7, coordination: 0.6,
        chaos: -0.8, deception: -0.6, solo: -0.4
    },
    preferredTags: ['hierarchy', 'procedure', 'coordination', 'social'],
    avoidedTags: ['chaos', 'deception', 'solo', 'rebellion'],
    tomMods: { cred_commit: 0.3, norm_conflict: 0.1, coalition_cohesion: 0.2 }
  },
  'OR': { // Victim/Glitch (Escape/Pain) - "The Trickster / Victim"
    goalMods: { avoid_blame: 1.2, protect_self: 0.9, assert_autonomy: 0.5, maintain_cohesion: -0.4 },
    actionBiases: { 
        deception: 0.8, hide: 0.8, conflict: -0.4,
        hierarchy: -0.6, care: -0.3
    },
    preferredTags: ['deception', 'hide', 'avoidance', 'self'],
    avoidedTags: ['hierarchy', 'care', 'responsibility', 'conflict'],
    tomMods: { betrayal_risk: 0.4, trust_bias: -0.3, coalition_cohesion: -0.2 }
  },
  'ON': { // Tool/Function (Efficiency) - "The Soldier / Expert"
    goalMods: { follow_order: 1.0, immediate_compliance: 0.8, complete_mission: 0.7 },
    actionBiases: { 
        compliance: 0.8, progress: 0.5, efficiency: 0.6,
        solo: -0.2, emotion: -0.5
    },
    preferredTags: ['compliance', 'progress', 'efficiency', 'work'],
    avoidedTags: ['solo', 'emotion', 'chaos', 'autonomy'],
    tomMods: { delegability: 0.4, reliability: 0.3 }
  }
};

function mergeEffects(base: ArchetypeEffects, add: Partial<ArchetypeEffects>, weight: number = 1.0): ArchetypeEffects {
    const res: ArchetypeEffects = {
        goalMods: { ...base.goalMods },
        tomMods: { ...base.tomMods },
        actionBiases: { ...base.actionBiases },
        preferredTags: [...base.preferredTags],
        avoidedTags: [...base.avoidedTags]
    };

    if (add.goalMods) {
        for (const [k, v] of Object.entries(add.goalMods)) {
            const gid = k as CharacterGoalId;
            res.goalMods[gid] = (res.goalMods[gid] || 0) + (v || 0) * weight;
        }
    }
    if (add.tomMods) {
        for (const [k, v] of Object.entries(add.tomMods)) {
            res.tomMods[k] = (res.tomMods[k] || 0) + (v || 0) * weight;
        }
    }
    if (add.actionBiases) {
        for (const [k, v] of Object.entries(add.actionBiases)) {
            res.actionBiases[k] = (res.actionBiases[k] || 0) + (v || 0) * weight;
        }
    }
    if (add.preferredTags) {
        res.preferredTags = Array.from(new Set([...res.preferredTags, ...add.preferredTags]));
    }
    if (add.avoidedTags) {
        res.avoidedTags = Array.from(new Set([...res.avoidedTags, ...add.avoidedTags]));
    }
    return res;
}

export function computeArchetypeEffects(agent: AgentState): ArchetypeEffects {
    let effects: ArchetypeEffects = { goalMods: {}, tomMods: {}, actionBiases: {}, preferredTags: [], avoidedTags: [] };
    
    if (!agent.archetype) return effects;

    const { actualId, shadowId, shadowActivation } = agent.archetype;

    const resolve = (archId: string, weight: number) => {
        const arch = allArchetypes.find(a => a.id === archId);
        if (!arch) return;
        
        // 1. Function Effects
        const fEffect = FUNCTION_EFFECTS[arch.f];
        if (fEffect) effects = mergeEffects(effects, fEffect, weight);

        // 2. Mode Effects
        const mEffect = MODE_EFFECTS[arch.mu];
        if (mEffect) effects = mergeEffects(effects, mEffect, weight);
    };

    const shadowWeight = clamp01(shadowActivation);
    const actualWeight = 1 - shadowWeight;

    if (actualId) resolve(actualId, actualWeight);
    // If high shadow activation, apply shadow effects strongly, potentially overriding
    if (shadowId && shadowWeight > 0.2) resolve(shadowId, shadowWeight);

    return effects;
}
