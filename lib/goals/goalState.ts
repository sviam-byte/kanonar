import { clamp01 } from '../util/math';
import { FC } from '../config/formulaConfig';
export type GoalState = {
  tension: number;
  lockIn: number;
  fatigue: number;
  progress: number;
  lastActiveTick: number;
  /** Exponential moving average of activation (goal score) to reduce flicker. */
  activationEMA: number;
};

function clamp11(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(-1, Math.min(1, x));
}

export function initGoalState(): GoalState {
  return { tension: 0.5, lockIn: 0, fatigue: 0, progress: 0, lastActiveTick: -1, activationEMA: 0 };
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
  const actRaw = clamp01(opts.activation);
  const isActive = Boolean(opts.active);

  // Activation hysteresis (EMA): more lockIn => more inertia.
  const ae = FC.goalState.activationEMA;
  const alpha = clamp01(ae.alphaBase + ae.lockInBoost * (p.lockIn ?? 0));
  const activationEMA = clamp01(alpha * (p.activationEMA ?? 0) + (1 - alpha) * actRaw);
  const act = activationEMA;

  // lockIn
  const lk = FC.goalState.lock;
  const lockUp = isActive ? lk.upBase + lk.upActivation * act : 0;
  const lockDown = isActive ? 0 : lk.downInactive;
  const lockIn = clamp01(p.lockIn * lk.inertia + lockUp - lockDown);

  // fatigue
  const ft = FC.goalState.fatigue;
  const fatUp = isActive ? ft.upBase + ft.upActivation * act : 0;
  const fatDown = isActive ? ft.downActive : ft.downInactive;
  const fatigue = clamp01(p.fatigue * ft.inertia + fatUp - fatDown);

  // tension: treat low activation while active as unmet need
  const tn = FC.goalState.tension;
  const tenUp = isActive ? tn.upBase + tn.upAntiActivation * (1 - act) : 0;
  const tenDown = isActive ? tn.downActive * act : tn.downInactive;
  const tension = clamp01(p.tension * tn.inertia + tenUp - tenDown);

  // progress: can be fed from outcome atoms (signed delta: success +, setback -)
  const pr = FC.goalState.progress;
  const dProg = clamp11(opts.progressDelta ?? 0);
  let progress = clamp01(p.progress * pr.inertia + dProg);

  // If progress reaches completion, release tension and slightly reduce sticky/fatigue.
  let nextTension = tension;
  let nextLockIn = lockIn;
  let nextFatigue = fatigue;
  if (progress >= pr.completionThreshold && dProg > 0) {
    progress = 1;
    nextTension = clamp01(nextTension * pr.completionTensionScale);
    nextLockIn = clamp01(nextLockIn * pr.completionLockInScale);
    nextFatigue = clamp01(nextFatigue * pr.completionFatigueScale);
  }

  return {
    tension: nextTension,
    lockIn: nextLockIn,
    fatigue: nextFatigue,
    progress,
    lastActiveTick: isActive ? opts.tick : p.lastActiveTick,
    activationEMA,
  };
}
