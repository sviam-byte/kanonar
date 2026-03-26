import type { Condition } from '../../ontology/conditions';

/**
 * Layer G: concrete execution forms for intents — enriched.
 *
 * Each schema is a distinct executable form, not a synonym.
 * "reassure at distance" vs "approach and comfort" vs "physical stabilize"
 * are three different schemas for the same intent.
 */

export type ActionSchemaFamily =
  | 'verbal'
  | 'spatial'
  | 'physical_contact'
  | 'observation'
  | 'inaction';

export interface ActionSchemaV1 {
  id: string;
  family: ActionSchemaFamily;
  label: string;
  description: string;
  intentIds: string[];

  /** Actor state preconditions. */
  actorPreconditions: Condition[];
  /** Target state preconditions. */
  targetPreconditions: Condition[];
  /** World/spatial preconditions. */
  worldPreconditions: Condition[];
  /** Blockers (any fires → schema blocked). */
  blockers: Condition[];

  scoreBase: number;
  scoreModifiers: Array<
    | { kind: 'constant'; value: number }
    | { kind: 'weighted_metric'; metric: string; weight: number; clamp?: [number, number] }
  >;

  /** SimKit offer kinds that can satisfy this schema. Grounding matches these. */
  requiredOfferKinds: string[];
  /** Fallback: single kind for back-compat (first of requiredOfferKinds). */
  simActionKind: string;

  /** Human-readable narrative label for UI. */
  narrativeLabel: string;
  /** Dialogue hook for communicative schemas. */
  dialogueHook?: { act: string; desiredEffect: string };

  cost?: number;
  cooldownTicks?: number;
  repetitionPenalty?: number;
  publicMode?: 'public' | 'private' | 'any';

  tags?: string[];
}

export interface DerivedActionSchemaCandidateV1 {
  schemaId: string;
  intentId: string;
  family: ActionSchemaFamily;
  simActionKind: string;
  requiredOfferKinds: string[];
  narrativeLabel: string;
  dialogueHook?: { act: string; desiredEffect: string };
  targetId?: string;
  score: number;
  cost: number;
  reasons: string[];
  trace: {
    usedAtomIds: string[];
    notes: string[];
    parts: Record<string, unknown>;
  };
}
