import traitsLibrary from '../../data/traits_library.json';

export type TraitMatrixScalar = {
  /** multiplicative factor */
  multiplier?: number;
  /** additive bias in logit space */
  bonus?: number;
  /** reserved for axis shaping (not used yet in scoring pipeline) */
  curve_exponent?: number;
};

export type TraitMatrixEntry = {
  modifiers?: Record<string, TraitMatrixScalar>;
};

export type TraitMatrix = Record<string, TraitMatrixEntry>;

const LIB: TraitMatrix = traitsLibrary as unknown as TraitMatrix;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export type TraitLogitBreakdown = {
  traitId: string;
  key: string;
  multiplierApplied?: number;
  bonusApplied?: number;
};

/**
 * Applies Trait Matrix modifiers to a goal's logit.
 *
 * Keys supported in traits_library.json:
 * - Goal:<GoalDefId>  (preferred)
 * - Goal:<GoalName>   (fallback)
 *
 * Example:
 *   "Goal:Socialize": { "multiplier": 0.5 }
 */
export function applyTraitMatrixToGoalLogit(args: {
  goalDefId: string;
  goalName?: string;
  baseLogit: number;
  agentTraits: Record<string, number>;
}): { logit: number; breakdown: TraitLogitBreakdown[] } {
  const { goalDefId, goalName, baseLogit, agentTraits } = args;

  let logit = baseLogit;
  const breakdown: TraitLogitBreakdown[] = [];

  for (const [traitId, traitStrengthRaw] of Object.entries(agentTraits || {})) {
    const strength = clamp01(Number(traitStrengthRaw ?? 0));
    if (strength <= 0) continue;

    const entry = LIB[traitId];
    const mods = entry?.modifiers || {};

    const candidates = [
      `Goal:${goalDefId}`,
      goalName ? `Goal:${goalName}` : null,
    ].filter(Boolean) as string[];

    for (const k of candidates) {
      const m = mods[k];
      if (!m) continue;

      if (typeof m.multiplier === 'number' && Number.isFinite(m.multiplier)) {
        // Interpolate towards the multiplier based on trait strength.
        const mul = 1 + (m.multiplier - 1) * strength;
        logit *= mul;
        breakdown.push({ traitId, key: k, multiplierApplied: mul });
      }

      if (typeof m.bonus === 'number' && Number.isFinite(m.bonus)) {
        const bonus = m.bonus * strength;
        logit += bonus;
        breakdown.push({ traitId, key: k, bonusApplied: bonus });
      }
    }
  }

  return { logit, breakdown };
}

/**
 * Applies Trait Matrix modifiers to an InputAxis-like scalar.
 *
 * Keys supported:
 * - Input:<AxisName>  (e.g., Input:CrowdDensity)
 */
export function applyTraitMatrixToInput(args: {
  axisName: string;
  baseValue: number;
  agentTraits: Record<string, number>;
}): { value: number } {
  const { axisName, baseValue, agentTraits } = args;

  let v = baseValue;
  for (const [traitId, traitStrengthRaw] of Object.entries(agentTraits || {})) {
    const strength = clamp01(Number(traitStrengthRaw ?? 0));
    if (strength <= 0) continue;

    const entry = LIB[traitId];
    const m = entry?.modifiers?.[`Input:${axisName}`];
    if (!m) continue;

    if (typeof m.multiplier === 'number' && Number.isFinite(m.multiplier)) {
      const mul = 1 + (m.multiplier - 1) * strength;
      v *= mul;
    }

    // curve_exponent reserved: v = v**exp (with interpolation) could be added later
    if (typeof m.curve_exponent === 'number' && Number.isFinite(m.curve_exponent)) {
      const exp = 1 + (m.curve_exponent - 1) * strength;
      v = Math.pow(Math.max(0, v), exp);
    }
  }

  return { value: v };
}
