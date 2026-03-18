// lib/simkit/scenario/phaseManager.ts
// Scenario phase management: evaluates exit/entry conditions, transitions between phases.

import type { SimWorld } from '../core/types';

export type PhaseSpec = {
  id: string;
  label: string;
  tickDuration?: number;
  entryCondition?: (world: SimWorld) => boolean;
  exitCondition?: (world: SimWorld) => boolean;
  goalWeightOverrides?: Record<string, number>;
  allowedActionKinds?: string[];
  bannedActionKinds?: string[];
};

export type PhaseTransition = {
  tick: number;
  from: string;
  to: string;
};

export class PhaseManager {
  private phases: PhaseSpec[];
  private currentIndex: number = 0;
  private transitions: PhaseTransition[] = [];

  constructor(phases: PhaseSpec[]) {
    this.phases = phases.length ? phases : [{ id: 'default', label: 'Default' }];
  }

  get current(): PhaseSpec { return this.phases[this.currentIndex]; }
  get currentId(): string { return this.current.id; }
  get history(): PhaseTransition[] { return this.transitions; }

  check(world: SimWorld): PhaseTransition | null {
    const cur = this.phases[this.currentIndex];
    if (!cur) return null;

    if (cur.exitCondition && !cur.exitCondition(world)) return null;

    for (let i = this.currentIndex + 1; i < this.phases.length; i++) {
      const next = this.phases[i];
      if (!next.entryCondition || next.entryCondition(world)) {
        const t: PhaseTransition = { tick: world.tickIndex, from: cur.id, to: next.id };
        this.currentIndex = i;
        this.transitions.push(t);

        (world.facts as any)['scenario:phase'] = next.id;
        (world.facts as any)['scenario:phaseLabel'] = next.label;

        return t;
      }
    }
    return null;
  }

  applyGoalOverrides(world: SimWorld): void {
    const overrides = this.current.goalWeightOverrides;
    if (!overrides) return;
    (world.facts as any)['scenario:goalWeightOverrides'] = overrides;
  }

  reset(): void {
    this.currentIndex = 0;
    this.transitions = [];
  }
}
