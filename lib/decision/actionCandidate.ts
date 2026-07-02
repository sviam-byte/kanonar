import type { ContextAtom } from '../context/v2/types';

export type ActionWhyModifier = {
  stage: string;
  label: string;
  goalId?: string | null;
  targetId?: string | null;
  multiplier?: number;
  delta?: number;
  value?: number;
  usedAtomIds?: string[];
  note?: string;
};

export type ActionWhyTrace = {
  usedAtomIds: string[];
  notes: string[];
  parts: Record<string, any>;
  modifiers?: ActionWhyModifier[];
  blockedBy?: string[];
};

export type ActionCandidate = {
  id?: string;
  kind?: string;
  actorId?: string;

  targetId?: string | null;
  targetNodeId?: string | null;

  /** Expected satisfaction change per goal (Δg). */
  deltaGoals?: Record<string, number>;

  /** Explicit costs (energy, risk, social, etc). */
  cost?: number;

  /** Confidence / feasibility in [0,1]. */
  confidence?: number;

  /**
   * Possibility magnitude in [0,1] — the act:prior carrier. Scored into Q only
   * when FC.actionScoring.priorInfluence.enabled (default off; T1.5,
   * ledger Q-PRIOR-DROP).
   */
  priorMagnitude?: number;

  /** Atoms justifying this action. */
  supportAtoms?: ContextAtom[];

  /** Explainability payload accumulated across the action-building/scoring chain. */
  why?: ActionWhyTrace;

  /** Optional payload for execution layer. */
  payload?: Record<string, any>;
  meta?: Record<string, any>;
};
