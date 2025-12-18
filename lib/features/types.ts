
// lib/features/types.ts

export type FeatureValue = number; // canonical 0..1

export type FeatureSet = Record<string, FeatureValue>;

export type FeatureExtractionTrace = {
  source: string;               // e.g. "character.body.acute.fatigue"
  notes?: string[];
};

export type Features = {
  schemaVersion: number;
  kind: 'character' | 'location' | 'scene';
  entityId: string;
  values: FeatureSet;
  trace: Record<string, FeatureExtractionTrace>;
};

export type ModsLayer = {
  schemaVersion: number;
  // featureKey -> override value (0..1). If null => delete feature (rare).
  overrides: Record<string, number | null>;
  // featureKey -> add delta (can be negative), applied after overrides if not null
  deltas?: Record<string, number>;
  // featureKey -> multiply, applied after override+delta
  mults?: Record<string, number>;
};

export type ModsStore = {
  schemaVersion: number;
  characters: Record<string, ModsLayer>;
  locations: Record<string, ModsLayer>;
  scenes: Record<string, ModsLayer>;
};
