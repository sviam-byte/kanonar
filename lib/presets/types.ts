
import { CharacterGoalId } from '../../types';

export type RelationFlavor =
  | 'ally'
  | 'friend'
  | 'rival'
  | 'enemy'
  | 'mentor'
  | 'student'
  | 'romantic_crush'
  | 'cold_professional'
  | 'indifferent';

export interface TomViewPreset {
  liking: number;        // -1..+1
  trust: number;         // 0..1
  fear: number;          // 0..1
  respect: number;       // 0..1
  dominance: number;     // -1..+1
  closeness: number;     // 0..1
  notes?: string;
}

export interface DyadRelationPresetV1 {
  v: 'kanonar4-rel-v1';
  meta: {
    label: string;
    description?: string;
    tags?: string[];
  };
  actors: {
    a_snippet: string;     // KANONAR4-CHAR::...
    b_snippet: string;
  };
  baseRelation: {
    flavor: RelationFlavor;
    affinity: number;      // -1..+1
    tension: number;       // 0..1
    commitment: number;    // 0..1
    history_strength: number; // 0..1
  };
  tom_a_about_b: TomViewPreset;
  tom_b_about_a: TomViewPreset;
}

export type CompatSlotId =
  | 'ideal_partner'
  | 'toxic_partner'
  | 'easy_ally'
  | 'natural_rival'
  | 'idol'
  | 'scapegoat'
  | 'tool'
  | 'custom';

export interface CompatRule {
  id: string;
  slot: CompatSlotId;
  name: string;
  
  // Matching logic: weighted sum of target's axes
  weights: Record<string, number>; 
  bias?: number; 
  desired_range?: Record<string, { min: number, max: number }>;

  // Resulting view if matched
  tom_view: TomViewPreset;
  defaultFlavor?: RelationFlavor;
}

export interface CompatibilityPresetV1 {
  v: 'kanonar4-compat-v1';
  owner_snippet: string;
  meta: {
    label: string;
    description?: string;
    tags?: string[];
  };
  rules: CompatRule[];
}
