// lib/simkit/scenes/sceneCatalog.ts
// Scene catalog for setup presets (expandable with more environments later).

export type CatalogLocation = {
  id: string;
  name: string;
  neighbors?: string[];
  hazards?: Record<string, number>;
  norms?: Record<string, number>;
};

export type CatalogCharacter = {
  id: string;
  name: string;
  tags?: string[];
  stress?: number;
  health?: number;
  energy?: number;
};

export type ScenePreset = {
  id: string;
  title: string;
  description?: string;
  locations: CatalogLocation[];
  characters: CatalogCharacter[];
};

export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: 'basic:v1',
    title: 'Basic (2 halls)',
    description: 'Минимальная сцена для отладки перемещений.',
    locations: [
      { id: 'loc:a', name: 'Hall A', neighbors: ['loc:b'], hazards: { radiation: 0.1 }, norms: { order: 0.4 } },
      { id: 'loc:b', name: 'Hall B', neighbors: ['loc:a'], hazards: { radiation: 0.2 }, norms: { order: 0.2 } },
    ],
    characters: [
      { id: 'ch:kr', name: 'Krystar', tags: ['loyal'], stress: 0.25, health: 1.0, energy: 0.7 },
      { id: 'ch:tg', name: 'Tegan', tags: ['control'], stress: 0.15, health: 1.0, energy: 0.8 },
    ],
  },
];
