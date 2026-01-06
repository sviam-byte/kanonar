export type RelationTag =
  | 'friend'
  | 'ally'
  | 'lover'
  | 'family'
  | 'enemy'
  | 'rival'
  | 'mentor'
  | 'student'
  | 'subordinate'
  | 'superior'
  | 'oathbound'
  | 'protected'
  | 'protector'
  | 'neutral'
  | 'protege';

export type RelationEdge = {
  otherId: string;

  // 0..1 intensities (independent, not forced to sum)
  closeness: number;
  loyalty: number;
  hostility: number;
  dependency: number;
  authority: number; // "they have power over me" (directional)

  tags: RelationTag[];

  // traceability
  sources: Array<{
    type: 'biography' | 'oath' | 'event' | 'manual' | 'legacy' | 'default';
    ref?: string;
    weight?: number;
    tick?: number;
  }>;

  lastUpdatedTick?: number;

  // Social biography layer (slow memory, per dyad)
  bio?: {
    aspects?: Partial<
      Record<
        | 'devotion'
        | 'submission'
        | 'shared_trauma'
        | 'rescue_actor'
        | 'romance'
        | 'friendship'
        | 'betrayed_by'
        | 'humiliated_by'
        | 'care_from'
        | 'approval_deprivation'
        | 'controlled_by'
        | 'harmed',
        number
      >
    >; // 0..1
    vector?: Record<string, number>; // signed [-1..+1]
  };
};

export type RelationMemory = {
  schemaVersion: number;
  edges: Record<string, RelationEdge>; // key = otherId
};

export interface RelationshipEdgeSource {
  kind: string;
  ref?: string;
  weight?: number;
}

export interface RelationshipEdge {
  a: string;
  b: string;
  tags: RelationTag[];
  strength?: number;
  trustPrior?: number;
  threatPrior?: number;
  exclusivity?: number;
  updatedAtTick?: number;
  sources?: RelationshipEdgeSource[];
}

export interface RelationshipGraph {
  schemaVersion: number;
  edges: RelationshipEdge[];
}
