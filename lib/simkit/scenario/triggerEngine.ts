// lib/simkit/scenario/triggerEngine.ts
// Evaluates scenario triggers and environmental degradation rules.

import type { SimWorld, SimEvent } from '../core/types';
import { clamp01 } from '../../util/math';

export type TriggerEffect =
  | { type: 'inject_event'; event: Partial<SimEvent> }
  | { type: 'change_fact'; key: string; value: any }
  | { type: 'change_fact_delta'; key: string; delta: number };

export type TriggerSpec = {
  id: string;
  when: (world: SimWorld) => boolean;
  once: boolean;
  effect: TriggerEffect;
};

export type DegradationRule = {
  key: string;
  delta: number;
  perTick: boolean;
  condition?: (world: SimWorld) => boolean;
};

export class TriggerEngine {
  private triggers: TriggerSpec[];
  private degradation: DegradationRule[];
  private firedOnce: Set<string> = new Set();
  private log: Array<{ tick: number; triggerId: string; effect: TriggerEffect }> = [];

  constructor(triggers: TriggerSpec[], degradation: DegradationRule[] = []) {
    this.triggers = triggers;
    this.degradation = degradation;
  }

  get firedLog() { return this.log; }

  evaluate(world: SimWorld): SimEvent[] {
    const injected: SimEvent[] = [];

    for (const t of this.triggers) {
      if (t.once && this.firedOnce.has(t.id)) continue;

      let fired = false;
      try { fired = t.when(world); } catch { }
      if (!fired) continue;

      if (t.once) this.firedOnce.add(t.id);
      this.log.push({ tick: world.tickIndex, triggerId: t.id, effect: t.effect });

      switch (t.effect.type) {
        case 'inject_event': {
          const ev: SimEvent = {
            id: `trigger:${t.id}:${world.tickIndex}`,
            type: String((t.effect.event as any)?.type ?? 'trigger'),
            payload: (t.effect.event as any)?.payload,
          };
          injected.push(ev);
          break;
        }
        case 'change_fact': {
          (world.facts as any)[t.effect.key] = t.effect.value;
          break;
        }
        case 'change_fact_delta': {
          const prev = Number((world.facts as any)[t.effect.key] ?? 0);
          (world.facts as any)[t.effect.key] = Number.isFinite(prev) ? prev + t.effect.delta : t.effect.delta;
          break;
        }
      }
    }
    return injected;
  }

  applyDegradation(world: SimWorld): void {
    for (const r of this.degradation) {
      if (!r.perTick) continue;
      if (r.condition) {
        let ok = false;
        try { ok = r.condition(world); } catch { }
        if (!ok) continue;
      }
      const prev = Number((world.facts as any)[r.key] ?? 1);
      if (!Number.isFinite(prev)) continue;
      (world.facts as any)[r.key] = clamp01(prev + r.delta);
    }
  }

  reset(): void {
    this.firedOnce.clear();
    this.log = [];
  }
}
