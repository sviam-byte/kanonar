import { CONFLICT_LAB_DYNAMICS_FORMULA } from '../../config/formulaConfig';
import { clamp01, invLogit, logit } from '../../util/math';
import type { ConflictActionId, StrategyProfile } from './types';

const cfg = CONFLICT_LAB_DYNAMICS_FORMULA;

export function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function boundedLogitShift(current: number, drive: number, driveScale: number): number {
  const eps = cfg.transition.epsilon;
  const safeCurrent = Math.min(1 - eps, Math.max(eps, clamp01(current)));
  const safeDriveScale = Number.isFinite(driveScale) ? driveScale : 1;
  const safeDrive = finiteOrZero(drive);
  return clamp01(invLogit(logit(safeCurrent) + safeDriveScale * safeDrive));
}

export function normalizeActionProbabilities(
  probabilities: Readonly<Partial<Record<ConflictActionId, number>>>,
  actionOrder: readonly ConflictActionId[],
): Record<ConflictActionId, number> {
  const raw = actionOrder.map((actionId) => Math.max(cfg.replicator.minProbability, finiteOrZero(probabilities[actionId] ?? 0)));
  const sum = raw.reduce((acc, value) => acc + value, 0);
  const normalized: Partial<Record<ConflictActionId, number>> = {};

  if (sum <= 0) {
    const p = 1 / Math.max(1, actionOrder.length);
    for (const actionId of actionOrder) normalized[actionId] = p;
  } else {
    for (let i = 0; i < actionOrder.length; i++) normalized[actionOrder[i]] = raw[i] / sum;
  }

  return normalized as Record<ConflictActionId, number>;
}

export function uniformStrategy(playerId: string, actionOrder: readonly ConflictActionId[]): StrategyProfile {
  return {
    playerId,
    probabilities: normalizeActionProbabilities({}, actionOrder),
  };
}
