// lib/simkit/scenario/types.ts

export type ScenarioDraft = {
  id: string;
  title?: string;
  locations: any[];   // SimLocation[]
  characters: any[];  // SimCharacter[]

  // импорт исходного goal-lab spec (для карты)
  locationSpecs?: Array<any>; // GoalLabLocationV1[]

  // Placement on location map
  placements?: Array<{
    characterId: string;
    locationId: string;
    // either node-based or free xy (map coordinates)
    nodeId?: string | null;
    x?: number | null;
    y?: number | null;
  }>;

  // Danger / safety points placed on the same map
  hazardPoints?: Array<{
    id: string;
    locationId: string;
    kind: 'danger' | 'safe';
    x: number;
    y: number;
    radius: number;     // influence radius in map units
    strength: number;   // 0..1
    tags?: string[];
  }>;
};
