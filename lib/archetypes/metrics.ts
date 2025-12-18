// lib/archetypes/metrics.ts
import { CharacterEntity } from '../../types';
import { getNestedValue } from '../param-utils';

export const METRIC_NAMES: Record<string, string> = {
    AGENCY: 'AGENCY (субъектность)',
    ACCEPT: 'ACCEPT (принятие)',
    ACTION: 'ACTION (действие)',
    RADICAL: 'RADICAL (радикальность)',
    SCOPE: 'SCOPE (масштаб)',
    TRUTH: 'TRUTH (истина)',
    CARE: 'CARE (забота)',
    MANIP: 'MANIP (манипуляция)',
    FORMAL: 'FORMAL (формализм)',
};


// 1. Нотация
const clip = (x: number): number => Math.min(Math.max(x, 0), 1);

// --- Model for calculating pure archetype metrics from coordinates ---

const METRIC_KEYS = Object.keys(METRIC_NAMES);

// Base values for each MODUS (mu)
const MU_VECTORS: Record<string, Record<string, number>> = {
    'SR': { AGENCY: 0.9, ACCEPT: 0.2, ACTION: 0.8, RADICAL: 0.7, SCOPE: 0.6, TRUTH: 0.6, CARE: 0.3, MANIP: 0.5, FORMAL: 0.3 },
    'OR': { AGENCY: 0.1, ACCEPT: 0.4, ACTION: 0.2, RADICAL: 0.5, SCOPE: 0.2, TRUTH: 0.5, CARE: 0.5, MANIP: 0.2, FORMAL: 0.2 },
    'SN': { AGENCY: 0.6, ACCEPT: 0.9, ACTION: 0.6, RADICAL: 0.2, SCOPE: 0.7, TRUTH: 0.7, CARE: 0.4, MANIP: 0.4, FORMAL: 0.8 },
    'ON': { AGENCY: 0.2, ACCEPT: 0.8, ACTION: 0.4, RADICAL: 0.1, SCOPE: 0.4, TRUTH: 0.4, CARE: 0.3, MANIP: 0.1, FORMAL: 0.9 },
};

// Biases for each DOMAIN (from f)
const DOMAIN_BIASES: Record<number, Record<string, number>> = {
    0: { TRUTH: 0.1, FORMAL: 0.15 }, // Логический
    1: { ACTION: 0.15, CARE: -0.1 },  // Физический
    2: { SCOPE: 0.2, AGENCY: 0.1 },  // Темпоральный
    3: { CARE: 0.15, MANIP: 0.15 },  // Витальный
};

// Biases for each FUNCTION within a domain (from f)
const FUNC_BIASES: Record<number, Record<string, number>> = {
    0: { RADICAL: 0.1, FORMAL: 0.1 },  // e.g., Догматик
    1: { MANIP: 0.1, TRUTH: -0.1 }, // e.g., Цензор
    2: { RADICAL: 0.2, SCOPE: 0.1 },  // e.g., Идеолог
    3: { TRUTH: 0.15, FORMAL: 0.1 }, // e.g., Верификатор
};

// Biases for LAMBDA
const LAMBDA_BIASES: Record<string, Record<string, number>> = {
    'H': {},
    'D': { SCOPE: 0.2, RADICAL: 0.1, AGENCY: 0.1 },
    'O': { RADICAL: 0.2, MANIP: 0.1, ACTION: -0.1 },
};

/**
 * Calculates the 9 core metrics for a pure archetype based on its coordinates.
 * This restores the original differentiated logic.
 */
export const calculateArchetypeMetrics = (lambda: string, f: number, mu: string): Record<string, number> => {
    const domainIndex = Math.floor((f - 1) / 4);
    const funcIndex = (f - 1) % 4;

    const baseVector = MU_VECTORS[mu] || {};
    const domainBias = DOMAIN_BIASES[domainIndex] || {};
    const funcBias = FUNC_BIASES[funcIndex] || {};
    const lambdaBias = LAMBDA_BIASES[lambda] || {};

    const finalMetrics: Record<string, number> = {};

    for (const key of METRIC_KEYS) {
        const base = baseVector[key] || 0.5;
        const biasD = domainBias[key] || 0;
        const biasF = funcBias[key] || 0;
        const biasL = lambdaBias[key] || 0;
        
        finalMetrics[key] = clip(base + biasD + biasF + biasL);
    }

    return finalMetrics;
};


export const calculateArchetypeMetricsFromVectorBase = (character: CharacterEntity): Record<string, number> => {
    const vb = character.vector_base || {};
    const get = (key: string) => getNestedValue(vb, key) ?? 0.5;

    // These formulas are derived from the conceptual descriptions of the metrics and their relation to vector base parameters.
    const AGENCY = (get('G_Narrative_agency') + get('A_Liberty_Autonomy') - get('C_coalition_loyalty') + 1) / 3;
    const ACCEPT = (get('A_Legitimacy_Procedure') + get('A_Tradition_Continuity') + get('B_cooldown_discipline') - get('B_exploration_rate') + 1) / 4;
    const ACTION = (get('B_decision_temperature') + (1 - get('B_cooldown_discipline')) + get('D_HPA_reactivity')) / 3;
    const RADICAL = (get('B_exploration_rate') + get('F_Value_update_rate') + (1 - get('A_Tradition_Continuity')) + (1 - get('A_Legitimacy_Procedure'))) / 4;
    const SCOPE = (get('A_Power_Sovereignty') + get('G_Narrative_agency') + get('E_Model_calibration')) / 3;
    const TRUTH = (get('A_Knowledge_Truth') + get('A_Memory_Fidelity') + get('E_Skill_chronicle_verify') - (getNestedValue(character, 'cognitive.deception_propensity') ?? 50)/100 + 1) / 4;
    const CARE = (get('A_Safety_Care') + (1 - get('C_dominance_empathy')) + get('C_reciprocity_index')) / 3;
    const MANIP = ((1 - get('A_Transparency_Secrecy')) + (getNestedValue(character, 'competencies.deception_skill') ?? 50)/100 + (get('C_dominance_empathy') < 0.5 ? (0.5 - get('C_dominance_empathy')) * 2 : 0)) / 3;
    const FORMAL = (get('A_Legitimacy_Procedure') + get('E_KB_civic') + (getNestedValue(character, 'cognitive.protocol_fidelity') ?? 50)/100) / 3;

    return { 
        AGENCY: clip(AGENCY), 
        ACCEPT: clip(ACCEPT), 
        ACTION: clip(ACTION), 
        RADICAL: clip(RADICAL), 
        SCOPE: clip(SCOPE), 
        TRUTH: clip(TRUTH), 
        CARE: clip(CARE), 
        MANIP: clip(MANIP), 
        FORMAL: clip(FORMAL) 
    };
};