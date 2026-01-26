import type { GoalAxisId } from '../../../types';

/**
 * Centralized knobs for reflective (System-2) biases.
 * This replaces ad-hoc "magic numbers" in TypeScript scoring logic.
 *
 * Values are additive logits (roughly in [-1..+1] for typical effects).
 */
export const REFLECTIVE_AXIS_WEIGHTS: {
  authorityPresenceByDomain: Partial<Record<GoalAxisId, number>>;
  leaderPresenceByDomain: Partial<Record<GoalAxisId, number>>;
} = {
  // "King/Authority is present" → domains that get boosted by hierarchy/duty.
  authorityPresenceByDomain: {
    care: 0.8,
    preserve_order: 0.6,
  },
  // "A leader is nearby" (weaker than full authority) → order-keeping reflex.
  leaderPresenceByDomain: {
    preserve_order: 0.4,
  },
};
