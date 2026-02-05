export type GoalState = {
  tension: number;
  lockIn: number;
  fatigue: number;
  progress: number;
  lastActiveTick: number;
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function clamp11(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(-1, Math.min(1, x));
}

export function initGoalState(): GoalState {
  return { tension: 0.5, lockIn: 0, fatigue: 0, progress: 0, lastActiveTick: -1 };
}

/**
 * Update a goal state using only internal signals (no explicit world outcome required).
 *
 * This is intentionally conservative and “physics-like”:
 * - lockIn grows when goal stays active, decays when inactive
 * - fatigue grows when goal stays active, decays slowly when inactive
 * - tension drifts up if active-but-not-strong, drifts down when inactive
 * - progress is a placeholder hook (kept for future goal/outcome links)
 */
export function updateGoalState(
  prev: GoalState | null | undefined,
  opts: { active: boolean; activation: number; tick: number; progressDelta?: number }
): GoalState {
  const p = prev ? { ...prev } : initGoalState();
  const act = clamp01(opts.activation);
  const isActive = Boolean(opts.active);

  // lockIn
  const lockUp = isActive ? 0.22 + 0.18 * act : 0;
  const lockDown = isActive ? 0 : 0.10;
  const lockIn = clamp01(p.lockIn * 0.85 + lockUp - lockDown);

  // fatigue
  const fatUp = isActive ? 0.12 + 0.10 * act : 0;
  const fatDown = isActive ? 0 : 0.04;
  const fatigue = clamp01(p.fatigue * 0.92 + fatUp - fatDown);

  // tension: treat low activation while active as unmet need
  const tenUp = isActive ? 0.10 + 0.25 * (1 - act) : 0;
  const tenDown = isActive ? 0.02 * act : 0.08;
  const tension = clamp01(p.tension * 0.85 + tenUp - tenDown);

  // progress: can be fed from outcome atoms (signed delta: success +, setback -)
  const dProg = clamp11(opts.progressDelta ?? 0);
  let progress = clamp01(p.progress * 0.97 + dProg);

  // If progress reaches completion, release tension and slightly reduce sticky/fatigue.
  let nextTension = tension;
  let nextLockIn = lockIn;
  let nextFatigue = fatigue;
  if (progress >= 0.99 && dProg > 0) {
    progress = 1;
    nextTension = clamp01(nextTension * 0.25);
    nextLockIn = clamp01(nextLockIn * 0.8);
    nextFatigue = clamp01(nextFatigue * 0.75);
  }

  return {
    tension: nextTension,
    lockIn: nextLockIn,
    fatigue: nextFatigue,
    progress,
    lastActiveTick: isActive ? opts.tick : p.lastActiveTick,
  };
}
