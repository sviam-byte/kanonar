// lib/capabilities.ts

import { CharacterEntity, CapabilityId } from "../types";

const get = (obj: Record<string, number> | undefined, key: string, def: number = 0.5): number => obj?.[key] ?? def;
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const normalize = (val: number, min: number, max: number) => {
    return Math.max(0, Math.min(1, (val - min) / (max - min)));
}

/**
 * Maps a character's detailed model to a compact capability vector understood by scenarios.
 * @param character The character entity.
 * @returns A record of capability scores.
 */
export function mapCharacterToCapabilities(character: CharacterEntity): Record<CapabilityId, number> {
    const p = character.vector_base;
    const body = character.body;

    const medical_skill = sigmoid(
        2 * get(p, 'E_KB_stem') +
        1.5 * get(p, 'A_Safety_Care') +
        1 * get(p, 'D_fine_motor') - 2.5
    );

    const strength = normalize(
        (body.constitution?.strength_max ?? 0.5) * 100,
        40, 90
    );

    const stamina = normalize(
        (body.constitution?.endurance_max ?? 0.5) * 100,
        40, 90
    );
    
    const command = sigmoid(
        2.5 * get(p, 'A_Power_Sovereignty') +
        -2.0 * get(p, 'C_dominance_empathy', 0) + // Dominance is low on this scale
        1.0 * get(p, 'G_Narrative_agency') - 1.5
    );

    const calm_under_stress = 1 - sigmoid(
        3 * get(p, 'D_HPA_reactivity') - 1.5
    );

    const navigation = sigmoid(
        2.5 * get(p, 'E_Skill_ops_fieldcraft') +
        1.0 * get(p, 'B_exploration_rate') - 2.0
    );

    const logistics = sigmoid(
        2.0 * get(p, 'E_KB_civic') +
        1.5 * get(p, 'B_cooldown_discipline') - 2.0
    );

    return {
        medical_skill,
        strength,
        stamina,
        command,
        calm_under_stress,
        navigation,
        logistics,
    };
}