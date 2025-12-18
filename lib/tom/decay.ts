
import { TomState } from "./state";
import { WorldState } from "../../types";
import { clamp01 } from "../util/safe";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function applyTomDecay(world: WorldState, currentTick: number): void {
  if (world.tom) {
    tickTomState(world.tom, currentTick);
  }
}

export function tickTomState(tom: TomState, currentTick: number): void {
  const UNCERTAINTY_STEP = 0.005; // базовый шаг роста неопределённости
  const TRAIT_CENTER = 0.5;
  const TRAIT_DECAY = 0.01; // насколько быстро трейт стягиваются к центру
  const MAX_DT = 100; // ограничиваем влияние очень старых dt

  for (const observerId of Object.keys(tom)) {
    const row = tom[observerId];
    for (const targetId of Object.keys(row)) {
      const entry = row[targetId]!;
      const last = entry.lastInteractionTick ?? currentTick;
      const dt = currentTick - last;

      if (dt <= 0) continue;

      const factor = Math.min(1, dt / MAX_DT);

      // 1) Небольшой рост неопределённости, если давно не было контакта
      entry.uncertainty = clamp01(
        entry.uncertainty + factor * UNCERTAINTY_STEP
      );

      // 2) Очень медленный drift трейт к 0.5
      const traits = entry.traits;
      const traitKeys: (keyof typeof traits)[] = [
        "trust",
        "bond",
        "conflict",
        "competence",
        "reliability",
        "align",
        "dominance"
      ].filter((k) => typeof traits[k as keyof typeof traits] === "number") as any;

      for (const k of traitKeys) {
        const v = traits[k] as number;
        const t = factor * TRAIT_DECAY;
        traits[k] = lerp(v, TRAIT_CENTER, t);
      }
    }
  }
}
