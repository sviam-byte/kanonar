// tests/simkit/scenario_engine.test.ts
import { describe, it, expect } from 'vitest';
import { PhaseManager } from '../../lib/simkit/scenario/phaseManager';
import { TriggerEngine } from '../../lib/simkit/scenario/triggerEngine';
import type { SimWorld } from '../../lib/simkit/core/types';

function makeWorld(tick: number, facts?: any): SimWorld {
  return {
    tickIndex: tick,
    seed: 42,
    characters: { a: { id: 'a', name: 'A', locId: 'l', stress: 0, health: 1, energy: 1 } },
    locations: { l: { id: 'l', name: 'L', neighbors: [] } },
    facts: { ...(facts || {}) } as any,
    events: [],
  };
}

describe('PhaseManager', () => {
  it('transitions when exit condition met', () => {
    const pm = new PhaseManager([
      { id: 'search', label: 'Search', exitCondition: (w) => (w.facts as any).route_found === true },
      { id: 'evac', label: 'Evacuation' },
    ]);

    const w = makeWorld(5);
    expect(pm.check(w)).toBeNull();

    (w.facts as any).route_found = true;
    const t = pm.check(w);
    expect(t).not.toBeNull();
    expect(t!.from).toBe('search');
    expect(t!.to).toBe('evac');
    expect(pm.currentId).toBe('evac');
  });

  it('writes phase to world facts', () => {
    const pm = new PhaseManager([
      { id: 'p1', label: 'Phase 1', exitCondition: () => true },
      { id: 'p2', label: 'Phase 2' },
    ]);

    const w = makeWorld(1);
    pm.check(w);
    expect((w.facts as any)['scenario:phase']).toBe('p2');
    expect((w.facts as any)['scenario:phaseLabel']).toBe('Phase 2');
  });

  it('applies goal weight overrides', () => {
    const pm = new PhaseManager([
      { id: 'p1', label: 'P1', goalWeightOverrides: { safety: 1.5 } },
    ]);

    const w = makeWorld(0);
    pm.applyGoalOverrides(w);
    expect((w.facts as any)['scenario:goalWeightOverrides']).toEqual({ safety: 1.5 });
  });
});

describe('TriggerEngine', () => {
  it('fires trigger when condition met', () => {
    const te = new TriggerEngine([
      { id: 't1', when: (w) => w.tickIndex === 5, once: true, effect: { type: 'change_fact', key: 'alarm', value: true } },
    ]);

    const w1 = makeWorld(3);
    te.evaluate(w1);
    expect((w1.facts as any).alarm).toBeUndefined();

    const w2 = makeWorld(5);
    te.evaluate(w2);
    expect((w2.facts as any).alarm).toBe(true);
  });

  it('once triggers fire only once', () => {
    const te = new TriggerEngine([
      { id: 't1', when: () => true, once: true, effect: { type: 'change_fact_delta', key: 'count', delta: 1 } },
    ]);

    const w = makeWorld(0);
    te.evaluate(w);
    expect((w.facts as any).count).toBe(1);
    te.evaluate(w);
    expect((w.facts as any).count).toBe(1);
  });

  it('inject_event returns events', () => {
    const te = new TriggerEngine([
      { id: 't1', when: () => true, once: false, effect: { type: 'inject_event', event: { type: 'collapse', payload: { severity: 0.8 } } } },
    ]);

    const w = makeWorld(10);
    const events = te.evaluate(w);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('collapse');
  });

  it('degradation applies per tick', () => {
    const te = new TriggerEngine([], [{ key: 'env:air', delta: -0.01, perTick: true }]);

    const w = makeWorld(0, { 'env:air': 0.5 });
    te.applyDegradation(w);
    expect((w.facts as any)['env:air']).toBeCloseTo(0.49, 4);
    te.applyDegradation(w);
    expect((w.facts as any)['env:air']).toBeCloseTo(0.48, 4);
  });

  it('conditional degradation respects condition', () => {
    const te = new TriggerEngine([], [
      { key: 'env:air', delta: -0.01, perTick: true, condition: (w) => (w.facts as any).sealed === true },
    ]);

    const w = makeWorld(0, { 'env:air': 0.5, sealed: false });
    te.applyDegradation(w);
    expect((w.facts as any)['env:air']).toBe(0.5);

    (w.facts as any).sealed = true;
    te.applyDegradation(w);
    expect((w.facts as any)['env:air']).toBeCloseTo(0.49, 4);
  });
});
