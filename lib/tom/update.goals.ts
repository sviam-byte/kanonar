
// lib/tom/update.goals.ts

import {
  TomState,
  SocialActionId,
  WorldState,
} from "../../types";
import { GOAL_DEFS } from "../goals/space";
import { socialActions } from "../../data/actions-social";
import { clamp01 } from "../util/safe";
import { GOAL_ALPHA, EVENT_INTENSITY } from "../social/tuning";
import { listify } from '../utils/listify';

export interface GoalObservation {
  observerId: string; // i
  targetId: string;   // j
  actionId: SocialActionId;
  success: number;    // [-1,1] или [0,1]
  world: WorldState;
}

export interface GoalUpdateContext {
  effectiveIntensity: number;
  baseValence: number;
}

/**
 * Инициализация goal-вектора, если его ещё нет:
 * берём все CharacterGoalId из GOAL_DEFS и даём им равномерный prior.
 */
function ensureTomEntryGoals(
  tom: TomState,
  observerId: string,
  targetId: string,
  world: WorldState
) {
  if (!tom[observerId]) tom[observerId] = {};
  let entry = tom[observerId][targetId] as any;
  if (!entry) {
    entry = tom[observerId][targetId] = {
      goals: { goalIds: [], weights: [] },
      traits: {
        trust: 0.5,
        align: 0.5,
        bond: 0.1,
        competence: 0.5,
        dominance: 0.5,
        reliability: 0.5,
        obedience: 0.5,
        uncertainty: 0.8,
        conflict: 0.1,
      },
      uncertainty: 0.8,
      lastUpdatedTick: world.tick ?? 0,
      lastInteractionTick: world.tick ?? 0,
    };
  }

  const goalIds =
    entry.goals?.goalIds && entry.goals.goalIds.length
      ? entry.goals.goalIds
      : Object.keys(GOAL_DEFS);

  if (!entry.goals || entry.goals.goalIds.length === 0) {
    const n = goalIds.length || 1;
    const base = 1 / n;
    entry.goals = {
      goalIds,
      weights: goalIds.map(() => base),
    };
  }

  return entry as {
    goals: { goalIds: string[]; weights: number[] };
    uncertainty: number;
    lastUpdatedTick: number;
    lastInteractionTick: number;
    evidenceCount?: number;
  };
}

/**
 * Обновление belief W_{i→j}(g) по одному событию.
 */
export function updateTomGoals(
    tom: TomState, 
    obs: GoalObservation,
    ctx?: GoalUpdateContext
) {
  const { observerId, targetId, actionId, success, world } = obs;
  const entry = ensureTomEntryGoals(tom, observerId, targetId, world);

  const { goalIds, weights } = entry.goals;
  if (goalIds.length === 0) return { goalDelta: {} };

  // Use effective intensity from context if available, else fallback
  let intensity = ctx?.effectiveIntensity;
  if (intensity === undefined) {
      const intensityTag: keyof typeof EVENT_INTENSITY = "medium";
      intensity = EVENT_INTENSITY[intensityTag] ?? 0.5;
  }

  // сигнал по каждой цели: насколько это действие поддерживает/опровергает гипотезу "у j есть goal g"
  const signal: number[] = new Array(goalIds.length).fill(0);

  goalIds.forEach((gId, idx) => {
    const def = (GOAL_DEFS as any)[gId];
    if (!def) return;
    const allowed: string[] = listify(def.allowedActions);
    if (allowed.includes(actionId)) {
      // успех усиливает, провал — ослабляет
      const s = success; 
      signal[idx] += s;
    }
  });

  if (signal.every((v) => Math.abs(v) < 1e-6)) {
    return { goalDelta: {} };
  }

  // Эффективная инерция
  const alpha = GOAL_ALPHA * intensity;

  const newWeights: number[] = [];
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    const s = signal[i];
    const updated = clamp01(w + alpha * s);
    newWeights.push(updated);
  }

  const sum = newWeights.reduce((acc, v) => acc + v, 0);
  const normWeights =
    sum > 1e-8 ? newWeights.map((v) => v / sum) : weights.slice();

  // Оценим суммарный сдвиг для update uncertainty
  let magnitude = 0;
  for (let i = 0; i < weights.length; i++) {
    magnitude += Math.abs(normWeights[i] - weights[i]);
  }

  entry.goals = { goalIds, weights: normWeights };

  const prevUnc = entry.uncertainty ?? 0.8;
  const infoGain = clamp01(magnitude); 
  const UNC_ALPHA = 0.2;
  const newUnc = prevUnc * (1 - UNC_ALPHA) + (1 - infoGain) * UNC_ALPHA;
  entry.uncertainty = clamp01(newUnc);

  const prevCount = entry.evidenceCount ?? 0;
  entry.evidenceCount = prevCount + 1;

  entry.lastInteractionTick = world.tick ?? entry.lastInteractionTick ?? 0;
  entry.lastUpdatedTick = world.tick ?? entry.lastUpdatedTick ?? 0;

  const goalDelta: Record<string, number> = {};
  for (let i = 0; i < goalIds.length; i++) {
    if (Math.abs(normWeights[i] - weights[i]) > 1e-4) {
      goalDelta[goalIds[i]] = normWeights[i] - weights[i];
    }
  }

  return { goalDelta };
}
