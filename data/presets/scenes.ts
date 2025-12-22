
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

export const TEST_SCENES: ScenePreset[] = [];
