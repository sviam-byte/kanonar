
import { CharacterEntity } from '../../types';
import { calculateLatentsAndQuickStates } from '../metrics';
import { getNestedValue } from '../param-utils';
import { allArchetypes, getArchetypeData } from '../../data/archetypes';
import { Branch } from '../../types';

// --- Types matching your specification ---

export interface ArchetypeVectorFingerprint {
  values_axis_group: {
    care_vs_power: number;
    law_vs_chaos: number;
    sacrifice_vs_self: number;
  };
  social_axis_group: {
    dominance: number;
    affiliation: number;
    manipulation: number;
  };
  cognition_axis_group: {
    abstract_vs_concrete: number; // Proxy for Intuition vs Sensing
    fast_vs_deliberate: number;
  };
}

export interface ArchetypeLatentMetrics {
  leadership: number;
  risk_tolerance: number;
  stability: number;
  cruelty: number;
  empathy: number;
  loyalty: number;
  autonomy_drive: number;
  secrecy: number;
  cooperativeness: number;
}

export interface ArchetypeAssignmentRules {
  required_ranges: Record<string, [number, number]>;
  incompatible_flags: string[];
  preferred_shadow_candidates: string[];
}

export interface ArchetypeStressProfile {
  stress_triggers: {
    overload_responsibility: number;
    social_isolation: number;
    moral_conflict: number;
    boredom: number;
  };
  shadow_shift_under_stress: number;
  shadow_shift_under_guilt: number;
  phase_behavior: {
    calm_phase_note: string;
    escalation_phase_note: string;
    breakdown_phase_note: string;
  };
}

export interface ArchetypeDyadDefaults {
  default_trust_to: Record<string, number>;
  default_fear_to: Record<string, number>;
  default_respect_to: Record<string, number>;
  tom_bias_axes: {
    trust_bias: number;
    paranoia_bias: number;
    projection_bias: number;
    idealization_bias: number;
  };
}

export interface ArchetypeDefinition {
  id: string;
  label: string;
  tagline: string;
  summary: string;
  core_goals: string[];
  typical_roles: string[];
  vectorFingerprint: ArchetypeVectorFingerprint;
  latentMetrics: ArchetypeLatentMetrics;
  assignment: ArchetypeAssignmentRules;
  stressProfile: ArchetypeStressProfile;
  dyadDefaults: ArchetypeDyadDefaults;
  version: string;
  // Metadata
  lambda: string;
  mu: string;
  role: string;
}

// --- Mapper Function ---

export function computeArchetypeDefinition(character: CharacterEntity): ArchetypeDefinition {
    const get = (key: string) => getNestedValue(character.vector_base, key) ?? 0.5;
    const getN = (path: string, def: number = 0.5) => (getNestedValue(character, path) as number | undefined) ?? def;

    // 1. Identify Base Archetype Info
    const archId = character.identity?.arch_true_dominant_id;
    const staticData = allArchetypes.find(a => a.id === archId);
    const desc = staticData?.data;

    // 2. Calculate Vector Fingerprint (Aggregates)
    // Values
    const care = get('A_Safety_Care');
    const power = get('A_Power_Sovereignty');
    const law = get('A_Legitimacy_Procedure');
    const chaos = get('B_exploration_rate'); // Proxy
    const sacrifice = get('C_coalition_loyalty');
    const self = get('A_Liberty_Autonomy');

    // Social
    const dominance = (1 - get('C_dominance_empathy')) * 0.7 + get('A_Power_Sovereignty') * 0.3;
    const affiliation = get('C_reciprocity_index');
    const manip = (1 - get('A_Transparency_Secrecy'));

    // Cognition
    const abstract = get('E_KB_topos');
    const fast = get('B_decision_temperature');

    const vectorFingerprint: ArchetypeVectorFingerprint = {
        values_axis_group: {
            care_vs_power: (care + (1 - power)) / 2, // 0=Power, 1=Care
            law_vs_chaos: (law + (1 - chaos)) / 2,   // 0=Chaos, 1=Law
            sacrifice_vs_self: (sacrifice + (1 - self)) / 2
        },
        social_axis_group: {
            dominance,
            affiliation,
            manipulation: manip
        },
        cognition_axis_group: {
            abstract_vs_concrete: abstract,
            fast_vs_deliberate: fast
        }
    };

    // 3. Calculate Latents
    const { latents, quickStates } = calculateLatentsAndQuickStates(character.vector_base || {});
    
    const latentMetrics: ArchetypeLatentMetrics = {
        leadership: (latents.SD ?? 0.5) * 0.5 + dominance * 0.5,
        risk_tolerance: latents.RP ?? 0.5,
        stability: getN('body.acute.stress') ? 1 - (getN('body.acute.stress')/100) : 0.5, // Dynamic placeholder
        cruelty: 1 - (latents.EW ?? 0.5),
        empathy: get('C_dominance_empathy'),
        loyalty: get('C_coalition_loyalty'),
        autonomy_drive: get('A_Liberty_Autonomy'),
        secrecy: get('A_Transparency_Secrecy'),
        cooperativeness: latents.CL ?? 0.5
    };

    // 4. Stress Profile
    const stressProfile: ArchetypeStressProfile = {
        stress_triggers: {
            overload_responsibility: get('C_reputation_sensitivity'),
            social_isolation: 1 - get('A_Liberty_Autonomy'),
            moral_conflict: get('A_Justice_Fairness'),
            boredom: get('B_exploration_rate')
        },
        shadow_shift_under_stress: getN('state.overload_sensitivity', 50) / 100,
        shadow_shift_under_guilt: getN('cognitive.shame_guilt_sensitivity', 50) / 100,
        phase_behavior: {
            calm_phase_note: "Действует согласно процедуре и базовым целям.",
            escalation_phase_note: "Усиливает контроль, снижает эмпатию.",
            breakdown_phase_note: "Переход в теневой режим: отказ от обязательств."
        }
    };

    // 5. Assignment Rules (Mock based on dominant traits)
    const assignment: ArchetypeAssignmentRules = {
        required_ranges: {
            "AGENCY": [0.6, 1.0],
            "TRUTH": [0.5, 1.0]
        },
        incompatible_flags: ["pacifist", "follower"],
        preferred_shadow_candidates: [character.identity?.arch_self_dominant_id || "unknown"]
    };

    // 6. Dyad Defaults (Mock)
    const dyadDefaults: ArchetypeDyadDefaults = {
        default_trust_to: { "H-1-SN": 0.8, "H-3-SR": 0.2 },
        default_fear_to: { "D-11-SR": 0.9 },
        default_respect_to: { "H-15-SN": 0.7 },
        tom_bias_axes: {
            trust_bias: -0.1,
            paranoia_bias: 0.2,
            projection_bias: 0.1,
            idealization_bias: 0.0
        }
    };

    return {
        id: character.entityId,
        label: character.title,
        tagline: character.subtitle || "Нет слогана",
        summary: desc?.description || character.description,
        core_goals: ["Сохранение системы", "Защита своих", "Поиск истины"], // Placeholder extraction
        typical_roles: character.roles?.global || [],
        vectorFingerprint,
        latentMetrics,
        assignment,
        stressProfile,
        dyadDefaults,
        version: "4.0",
        lambda: staticData?.lambda || "?",
        mu: staticData?.mu || "?",
        role: character.roles?.global?.[0] || "Unknown"
    };
}
