
import { decodeSnippetToCharacter } from '../character-snippet';
import { DyadRelationPresetV1, CompatibilityPresetV1, TomViewPreset } from './types';
import { CharacterEntity, Relationship } from '../../types';
import { getNestedValue } from '../param-utils';

// --- DYAD INSTANTIATION ---

export interface InstantiatedDyad {
    characterA: CharacterEntity;
    characterB: CharacterEntity;
    relationAB: Relationship; // A -> B
    relationBA: Relationship; // B -> A
    tomAaboutB: TomViewPreset;
    tomBaboutA: TomViewPreset;
}

function convertTomPresetToRelationship(t: TomViewPreset): Relationship {
    return {
        trust: t.trust,
        align: (t.liking + 1) / 2, // approx -1..1 -> 0..1
        respect: t.respect,
        fear: t.fear,
        bond: t.closeness,
        conflict: Math.max(0, (t.dominance > 0 ? t.dominance * 0.5 : 0) + (1 - t.trust) * 0.5),
        history: [],
    };
}

export function instantiateDyad(preset: DyadRelationPresetV1): InstantiatedDyad {
    const charA = decodeSnippetToCharacter(preset.actors.a_snippet);
    const charB = decodeSnippetToCharacter(preset.actors.b_snippet);

    return {
        characterA: charA,
        characterB: charB,
        relationAB: convertTomPresetToRelationship(preset.tom_a_about_b),
        relationBA: convertTomPresetToRelationship(preset.tom_b_about_a),
        tomAaboutB: preset.tom_a_about_b,
        tomBaboutA: preset.tom_b_about_a,
    };
}

// --- COMPATIBILITY EVALUATION ---

export interface CompatResult {
    ruleName: string;
    slot: string;
    score: number;
    tomView: TomViewPreset;
    flavor: string;
}

export function evaluateCompatibility(
    preset: CompatibilityPresetV1,
    target: CharacterEntity
): CompatResult[] {
    const results: CompatResult[] = [];

    for (const rule of preset.rules) {
        let score = rule.bias || 0;
        
        for (const [key, weight] of Object.entries(rule.weights)) {
            const value = getNestedValue(target, key) ?? getNestedValue(target.vector_base, key) ?? 0.5;
            
            // Optional range check
            if (rule.desired_range && rule.desired_range[key]) {
                const { min, max } = rule.desired_range[key];
                let penalty = 0;
                if (value < min) penalty = min - value;
                if (value > max) penalty = value - max;
                score -= penalty * Math.abs(weight); // Penalty usually detracts
            } else {
                score += value * weight;
            }
        }

        results.push({
            ruleName: rule.name,
            slot: rule.slot,
            score,
            tomView: rule.tom_view,
            flavor: rule.defaultFlavor || 'indifferent',
        });
    }

    return results.sort((a, b) => b.score - a.score);
}

export function applyCompatibilityToWorld(
    match: CompatResult
): { relation: Relationship } {
    return {
        relation: convertTomPresetToRelationship(match.tomView),
    };
}
