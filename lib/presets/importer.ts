
import { DyadRelationPresetV1, TomViewPreset } from './types';
import { CharacterEntity } from '../../types';
import { decodeSnippetToCharacter } from '../character-snippet';
import { DyadConfigForA } from '../tom/dyad-metrics';
import { makeDefaultDyadConfig } from '../tom/dyad-defaults';

// Хелпер для конвертации 0..1 метрик пресета в -1..1 bias'ы конфига
const mapToBias = (val: number) => (val - 0.5) * 1.5; // Немного усиливаем эффект
const mapToBiasSigned = (val: number) => val * 0.8;   // Для liking/dominance (-1..1)

function createConfigFromPreset(targetView: TomViewPreset): DyadConfigForA {
    const cfg = makeDefaultDyadConfig();
    
    // Мы используем bias'ы, чтобы "форсировать" отношения, заданные в пресете,
    // поверх естественной совместимости персонажей.
    cfg.bias_trust = mapToBias(targetView.trust);
    cfg.bias_fear = mapToBias(targetView.fear);
    cfg.bias_respect = mapToBias(targetView.respect);
    cfg.bias_closeness = mapToBias(targetView.closeness);
    
    cfg.bias_liking = mapToBiasSigned(targetView.liking);
    cfg.bias_dominance = mapToBiasSigned(targetView.dominance);

    return cfg;
}

export interface ImportResult {
    characters: CharacterEntity[];
    configs: Record<string, DyadConfigForA>;
    message: string;
}

export function importDyadPreset(preset: DyadRelationPresetV1): ImportResult {
    const charA = decodeSnippetToCharacter(preset.actors.a_snippet);
    const charB = decodeSnippetToCharacter(preset.actors.b_snippet);

    // Ensure IDs are unique-ish if they clash? 
    // For now assume the preset creator handled this or we overwrite (desired behavior for updates)

    const configA = createConfigFromPreset(preset.tom_a_about_b);
    const configB = createConfigFromPreset(preset.tom_b_about_a);

    return {
        characters: [charA, charB],
        configs: {
            [charA.entityId]: configA,
            [charB.entityId]: configB,
        },
        message: `Загружена сцена: ${preset.meta.label}. Персонажи ${charA.title} и ${charB.title} добавлены с настроенными отношениями.`
    };
}
