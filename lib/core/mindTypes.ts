// lib/core/mindTypes.ts
// Persistent mental memory types (kept separate to avoid cyclical deps with types.ts).

export type MentalFactConfidence = number; // 0..1

export interface MentalAtom {
  key: string; // Unique fact ID (enemy:seen:123)
  atom: any; // Raw ContextAtom or observation payload
  lastObservedTick: number;
  confidence: MentalFactConfidence;
  source: 'vision' | 'hearing' | 'inference' | 'hallucination';
}

export interface AgentMemory {
  facts: Map<string, MentalAtom>;
  // Fast lookup for object locations (so we do not scan all facts).
  objectLocations: Map<string, { x: number; y: number; locId: string }>;
}
