
// lib/biography/types-biography.ts
import type { StoryTime, VectorAxisId, LocationId } from '../types';

export type BiographicalEventValence = -1 | 0 | 1;

export type BiographicalEventKind =
  | 'combat'
  | 'injury'
  | 'loss'
  | 'bond_formed'
  | 'promotion'
  | 'betrayal'
  | 'service'
  | 'caregiving'
  | 'training'
  | 'imprisonment'
  | 'crisis'
  | 'other';

export interface BiographicalEvent {
  id: string;
  time: StoryTime;              // Story time of occurrence
  kind: BiographicalEventKind;
  valence: BiographicalEventValence; // Emotional impact sign
  intensity: number;            // 0..1: Scale of the event
  duration?: number;            // Optional duration
  tags?: string[];              // Arbitrary tags
  
  // Weight for specific 44-axes
  axisWeights?: Partial<Record<VectorAxisId, number>>;
  
  // Local projection of event into life goals (e.g., "for what purpose")
  lifeGoalWeights?: Partial<Record<string, number>>; // LifeGoalId -> weight
}

export interface Biography {
  characterId: string;
  events: BiographicalEvent[];
}

// Biography Latent Vector components (named)
export interface BiographyLatent extends Record<string, number> {}

export interface LocationValenceEntry {
  valence: number;   // усреднённая валентность [-1..1]
  intensity: number; // накопленная "значимость" места [0..+∞)
  lastUpdated: StoryTime;
}

export interface BiographyState {
  latent: BiographyLatent;
  lastUpdateTime: StoryTime;
  axisDeltas: Record<string, number>;
  /**
   * Личное отношение персонажа к конкретным местам.
   * Обновляется из событий с locationId.
   */
  locationValence?: Record<LocationId, LocationValenceEntry>;
  events: BiographicalEvent[];
}
