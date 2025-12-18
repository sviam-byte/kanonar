
// lib/goals/psych-modifiers.ts

import {
  NarrativeIdentity,
  GoalKind,
  TraumaLoad,
  MoralDissonance,
  AgentState
} from "../../types";

// Helper to clamp values between 0 and 1 (or -1 and 1 for deltas if needed)
const clip01 = (x: number) => Math.min(1, Math.max(0, x));

// Interface for the output map of goal modifiers
// Changed to string to support specific Goal IDs
export type NarrativeGoalModifiers = Partial<Record<string, number>>;

/**
 * Computes goal weight modifiers based on the agent's narrative identity, trauma history, and moral state.
 * These modifiers are additive deltas to the base goal weights.
 *
 * @param narrative The agent's current narrative identity (role, plot).
 * @param trauma The accumulated trauma load in different domains.
 * @param moral The current moral dissonance state (guilt, shame).
 * @returns A map of GoalKind/GoalId to numeric modifiers.
 */
export function computeNarrativeGoalModifiers(
  narrative: NarrativeIdentity,
  trauma: TraumaLoad,
  moral: MoralDissonance,
): NarrativeGoalModifiers {
  const mods: NarrativeGoalModifiers = {};

  // Helper to safely add to mods
  const addMod = (kind: string, delta: number) => {
    mods[kind] = (mods[kind] ?? 0) + delta;
  };

  const tSelf   = trauma.self   ?? 0;
  const tOthers = trauma.others ?? 0;
  const tWorld  = trauma.world  ?? 0;
  const tSystem = trauma.system ?? 0;

  const { role, plot } = narrative;

  // --- 1. Narrative Role Impacts ---

  if (role === "hero") {
    addMod("protect_others", 0.3);
    addMod("self_preservation", -0.1);
  }

  if (role === "martyr") {
    addMod("protect_others", 0.2);
    addMod("redemption", 0.4); // Assuming 'redemption' maps to a specific goal
    addMod("self_preservation", -0.2);
    addMod("self_punishment", 0.3);
  }

  if (role === "savior") {
    addMod("protect_others", 0.4);
    addMod("preserve_system", 0.2); // Assuming 'preserve_system' maps to a specific goal
    addMod("reputation", 0.2);
  }

  if (role === "monster") {
    addMod("revenge", 0.3);
    addMod("self_punishment", 0.2);
    addMod("protect_others", -0.2);
  }

  if (role === "tool") {
    addMod("preserve_system", 0.3);
    addMod("self_preservation", -0.1);
  }

  // --- 2. Narrative Plot Impacts ---

  if (plot === "redemption") {
    addMod("redemption", 0.5);
  }

  if (plot === "revenge") {
    addMod("revenge", 0.5);
    addMod("protect_others", -0.1);
  }

  if (plot === "duty") {
    addMod("preserve_system", 0.4);
    addMod("reputation", 0.2);
  }

  if (plot === "survival") {
    addMod("self_preservation", 0.4);
  }

  if (plot === "decay") {
    addMod("escape", 0.3);
    addMod("self_punishment", 0.3);
  }

  // --- 3. Moral & Trauma Impacts ---

  const guilt = moral.guilt ?? 0;
  const shame = moral.shame ?? 0;
  // Specific Gaps
  const gapSelf = moral.valueBehaviorGapSelf ?? 0;
  const gapOthers = moral.valueBehaviorGapOthers ?? 0;
  const gapSystem = moral.valueBehaviorGapSystem ?? 0;

  // High Guilt OR High Others-Gap -> Drive to redeem and protect
  const othersFactor = clip01(Math.max(guilt, gapOthers));
  addMod("redemption", 0.4 * othersFactor);
  addMod("protect_others", 0.2 * othersFactor);

  // High Shame OR High Self-Gap -> Self-punishment, Escape
  const selfFactor = clip01(Math.max(shame, gapSelf));
  addMod("self_punishment", 0.4 * selfFactor);
  addMod("escape", 0.2 * selfFactor);
  addMod("reputation", -0.2 * selfFactor);

  // High System Gap in a high-trauma context -> Revenge against the system
  const systemRebellionFactor = clip01(gapSystem);
  if (tSystem + tWorld > 0.6) {
    addMod("revenge", 0.3 * systemRebellionFactor);
    addMod("preserve_system", -0.3 * systemRebellionFactor);
  }

  return mods;
}

export function computePsychGoalBoosts(agent: AgentState): NarrativeGoalModifiers {
    if (!agent.psych) return {};
    
    const trauma = agent.trauma || { self: 0, others: 0, world: 0, system: 0 };
    
    return computeNarrativeGoalModifiers(
        agent.psych.narrative,
        trauma,
        agent.psych.moral
    );
}