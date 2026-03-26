import type { Condition } from '../../ontology/conditions';

/**
 * Layer F: canonical intent descriptor — enriched.
 *
 * An intent is a strategic response type: "HOW to realise a goal?"
 * Not a concrete action. Not a synonym for talk.
 *
 * Two intents that always produce the same runtime action are a smell.
 */

export type IntentFamily =
  | 'communicative'
  | 'movement'
  | 'physical'
  | 'epistemic'
  | 'regulatory'
  | 'coordinative';

export interface IntentSpecV1 {
  id: string;
  family: IntentFamily;
  label: string;
  description: string;

  /** Goal IDs that can source this intent. Empty = universal. */
  allowedGoalIds: string[];

  /** Targeting: 'inherit' = use goal's, or override. */
  targeting: 'inherit' | 'self' | 'other' | 'optional_other';

  /** Must hold for this intent to be a candidate. */
  prerequisites: Condition[];

  /** Block intent even if prerequisites pass. */
  blockers: Condition[];

  scoreBase: number;
  scoreModifiers: Array<
    | { kind: 'weighted_metric'; metric: string; weight: number; clamp?: [number, number] }
    | { kind: 'weighted_appraisal'; tag: string; weight: number; clamp?: [number, number] }
    | { kind: 'constant'; value: number }
  >;

  /** Dialogue act for communicative family. */
  dialogueAct?: string;
  /** Desired effect on target/world. */
  desiredEffect?: string;

  /** Preferred action schema families for grounding. */
  groundingHints: string[];

  /** Minimum ticks between repeated selection (anti-spam). */
  cooldownTicks?: number;
  /** Mutual exclusion with other intents. */
  conflictsWith?: string[];

  tags?: string[];

  // ── BACK-COMPAT: old shape without family/targeting/etc still loads ──
  // evaluateIntentSpec fills defaults for missing fields.
  /** @deprecated use prerequisites */
  arisesFrom?: Condition[];
}

export interface DerivedIntentCandidateV1 {
  intentId: string;
  family: IntentFamily;
  score: number;
  active: boolean;
  label: string;
  targetId?: string;
  dialogueAct?: string;
  desiredEffect?: string;
  groundingHints: string[];
  goalContribs: Array<{ goalId: string; pressure: number; contribution: number }>;
  reasons: string[];
  trace: {
    usedAtomIds: string[];
    notes: string[];
    parts: Record<string, unknown>;
  };
}
