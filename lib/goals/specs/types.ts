import type { Condition } from '../../ontology/conditions';

/** Goal ontology families for reporting and downstream policy routing. */
export type GoalFamily =
  | 'survival'
  | 'epistemic'
  | 'social'
  | 'procedural'
  | 'identity'
  | 'affect'
  | 'resource'
  | 'concealment';

/**
 * Declarative priority augmentations for GoalSpecV1.
 * Numeric coefficients live in data (registry) instead of hand-written if/else logic.
 */
export type GoalPriorityRule =
  | {
      kind: 'constant';
      value: number;
    }
  | {
      kind: 'weighted_metric';
      metric: string;
      weight: number;
      clamp?: [number, number];
    }
  | {
      kind: 'weighted_appraisal';
      tag: string;
      weight: number;
      clamp?: [number, number];
    };

/**
 * Canonical goal dictionary entry.
 *
 * Note: compatibility with legacy goal space is handled outside this structure;
 * GoalSpecV1 should remain transportable and independent from ad hoc pipeline state.
 */
export interface GoalSpecV1 {
  id: string;
  family: GoalFamily;

  label: string;
  description: string;

  targeting:
    | 'self'
    | 'other'
    | 'location'
    | 'object'
    | 'optional_other';

  arisesFrom: Condition[];
  preconditions: Condition[];
  blockers: Condition[];

  priorityBase: number;
  priorityRules: GoalPriorityRule[];

  decayPerTick?: number;
  maxStacks?: number;

  compatibleIntents: string[];
  conflictsWith?: string[];
  supports?: string[];

  successHints?: string[];
  failureHints?: string[];

  tags?: string[];
}
