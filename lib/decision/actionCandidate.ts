import type { ContextAtom } from '../context/v2/types';

export type ActionCandidate = {
  id: string;
  kind: string;
  actorId: string;

  targetId?: string | null;
  targetNodeId?: string | null;

  /** Expected satisfaction change per goal (Δg). */
  deltaGoals: Record<string, number>;

  /** Explicit costs (energy, risk, social, etc). */
  cost: number;

  /** Confidence / feasibility in [0,1]. */
  confidence: number;

  /** Atoms justifying this action. */
  supportAtoms: ContextAtom[];

  /** Optional payload for execution layer. */
  payload?: Record<string, any>;
};
