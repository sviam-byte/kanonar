
import { DyadConfigForA } from '../../lib/tom/dyad-metrics';
import { makeDefaultDyadConfig } from '../../lib/tom/dyad-defaults';

export interface ScenePreset {
    id: string;
    title: string;
    description: string;
    locationId: string;
    suggestedScenarioId: string;
    enginePresetId: string; // Links to lib/scene/presets.ts (metrics/norms)
    characters: string[];
    configs: Record<string, DyadConfigForA>; // ObserverId -> Config
}

const baseConfig = makeDefaultDyadConfig();

export const TEST_SCENES: ScenePreset[] = [
    {
        id: 'tegan_krystar_quarters',
        title: 'Теган и Кристар (Покои)',
        description: 'Приватная сцена. Максимальная близость, преданность и иерархия.',
        locationId: 'ka_palace.tegan_quarters',
        suggestedScenarioId: 'council_chamber',
        enginePresetId: 'safe_hub', // Relaxed, private
        characters: ['character-tegan-nots', 'character-krystar-mann'],
        configs: {
            'character-tegan-nots': {
                ...baseConfig,
                bias_trust: 0.9,
                bias_closeness: 0.8,
                bias_respect: 0.5,
                bias_dominance: 0.6,
                like_sim_axes: { 'C_coalition_loyalty': 1.0 },
                trust_partner_axes: { 'C_coalition_loyalty': 1.0, 'A_Legitimacy_Procedure': 0.8 }
            },
            'character-krystar-mann': {
                ...baseConfig,
                bias_trust: 1.0,
                bias_closeness: 0.9,
                bias_respect: 1.0,
                bias_dominance: -0.8,
                bias_fear: 0.2,
                trust_partner_axes: { 'A_Power_Sovereignty': 1.0 }
            }
        }
    },
    {
        id: 'underground_standoff',
        title: 'Конфликт в Нижних Коридорах',
        description: 'Старкад против Асси и Гидеона. Напряжение и угроза.',
        locationId: 'ka_city.lower_corridors',
        suggestedScenarioId: 'cave_rescue',
        enginePresetId: 'crackdown', // High tension, danger
        characters: ['deicide-mentor', 'assi-the-runner', 'master-gideon'],
        configs: {
            'deicide-mentor': {
                ...baseConfig,
                bias_trust: -0.8,
                bias_fear: 0.0,
                bias_liking: -0.9,
                bias_dominance: 0.5,
                fear_threat_axes: { 'A_Liberty_Autonomy': 1.0, 'B_exploration_rate': 0.8 }
            },
            'assi-the-runner': {
                ...baseConfig,
                trust_partner_axes: { 'A_Safety_Care': 1.0 },
                bias_trust: 0.3,
                bias_fear: 0.4
            },
            'master-gideon': {
                ...baseConfig,
                bias_trust: 0.2,
                bias_dominance: 0.1
            }
        }
    }
];
