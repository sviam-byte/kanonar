// lib/simkit/scenario/types.ts

export type ScenarioDraft = {
  id: string;
  title?: string;
  locations: any[];   // SimLocation[]
  characters: any[];  // SimCharacter[]

  // импорт исходного goal-lab spec (для карты) + размещения
  locationSpecs?: Array<any>; // GoalLabLocationV1[]
  placements?: Array<{
    characterId: string;
    locationId: string;
    nodeId: string;
    x?: number;
    y?: number;
  }>;
};
