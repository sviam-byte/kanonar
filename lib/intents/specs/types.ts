import type { Condition } from '../../ontology/conditions';

/**
 * Layer F: canonical intent descriptor.
 * Intent defines *what* move to make, independent from concrete action schema.
 */
export interface IntentSpecV1 {
  id: string;
  label: string;
  description: string;
  allowedGoalIds: string[];
  arisesFrom?: Condition[];
  blockers?: Condition[];
  scoreBase: number;
  scoreModifiers: Array<
    | { kind: 'weighted_metric'; metric: string; weight: number; clamp?: [number, number] }
    | { kind: 'weighted_appraisal'; tag: string; weight: number; clamp?: [number, number] }
  >;
  tags?: string[];
}

export interface DerivedIntentCandidateV1 {
  intentId: string;
  score: number;
  active: boolean;
  label: string;
  goalContribs: Array<{ goalId: string; pressure: number; contribution: number }>;
  reasons: string[];
  trace: {
    usedAtomIds: string[];
    notes: string[];
    parts: Record<string, unknown>;
  };
}
