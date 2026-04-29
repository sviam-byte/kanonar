// tests/simkit/perturbation_runner.test.ts
// ProConflict Lab unit tests: ε-perturbation primitive must be pure, clamping,
// and target-correct. Full runPair semantic determinism is covered separately
// because it requires a full CharacterEntity/LocationEntity fixture.

import { describe, it, expect } from 'vitest';
import {
  applyPerturbations,
  describePerturbation,
  type PerturbationVector,
} from '../../lib/simkit/compare/perturbationVector';
import { computeDivergenceTrace } from '../../lib/simkit/compare/divergenceMetrics';
import { attributeAmplifiers } from '../../lib/simkit/compare/amplifierAttribution';
import type { RunResult } from '../../lib/simkit/compare/batchRunner';
import type { SimTickRecord, SimWorld } from '../../lib/simkit/core/types';

function makeWorld(): SimWorld {
  return {
    tickIndex: 0,
    seed: 42,
    characters: {
      a: { id: 'a', name: 'A', locId: 'l1', stress: 0.3, health: 0.8, energy: 0.7 },
      b: { id: 'b', name: 'B', locId: 'l1', stress: 0.5, health: 0.5, energy: 0.4 },
    },
    locations: { l1: { id: 'l1', name: 'L1', neighbors: [] } },
    facts: { 'ctx:danger:a': 0.25 } as any,
    events: [],
  };
}

function makeRecord(tick: number, actionsApplied: any[] = []): SimTickRecord {
  return {
    snapshot: {
      schema: 'SimKitSnapshotV1',
      id: `snap:${tick}`,
      time: `t${tick}`,
      tickIndex: tick,
      characters: [],
      locations: [],
      events: [],
      debug: {},
    },
    trace: {
      tickIndex: tick,
      time: `t${tick}`,
      actionsProposed: [],
      actionsApplied,
      eventsApplied: [],
      deltas: { chars: [], facts: {} },
      notes: [],
    },
  };
}

function makeRun(partial: Partial<RunResult>): RunResult {
  return {
    label: partial.label || 'run',
    seed: 42,
    ticks: partial.records?.length ?? 2,
    records: partial.records || [makeRecord(0), makeRecord(1)],
    finalWorld: makeWorld(),
    tensionHistory: partial.tensionHistory || [0, 0],
    beats: [],
    agentTraces: {},
    stressHistory: partial.stressHistory || { a: [0.3, 0.3] },
    actionCounts: {},
    pipelineHistory: partial.pipelineHistory || {},
  };
}

describe('applyPerturbations', () => {
  it('does not mutate input world', () => {
    const w = makeWorld();
    const before = JSON.stringify(w);
    applyPerturbations(w, [
      { agentId: 'a', target: { kind: 'body', field: 'stress' }, delta: 0.1 },
    ]);
    expect(JSON.stringify(w)).toBe(before);
  });

  it('applies body delta and clamps to [0,1]', () => {
    const w = makeWorld();
    const r = applyPerturbations(w, [
      { agentId: 'a', target: { kind: 'body', field: 'stress' }, delta: 2.0 },
    ]);
    expect(r.world.characters.a.stress).toBe(1);
    expect(r.applied.length).toBe(1);
    expect(r.skipped.length).toBe(0);
  });

  it('applies negative delta with clamping', () => {
    const w = makeWorld();
    const r = applyPerturbations(w, [
      { agentId: 'a', target: { kind: 'body', field: 'energy' }, delta: -5 },
    ]);
    expect(r.world.characters.a.energy).toBe(0);
  });

  it('applies tom relation delta into facts.relations', () => {
    const w = makeWorld();
    const r = applyPerturbations(w, [
      { agentId: 'a', target: { kind: 'tom', toId: 'b', field: 'trust' }, delta: -0.2 },
    ]);
    const trust = (r.world.facts as any).relations.a.b.trust;
    expect(trust).toBeCloseTo(0.3, 6); // baseline 0.5 + (-0.2)
  });

  it('applies fact delta to numeric world fact', () => {
    const w = makeWorld();
    const r = applyPerturbations(w, [
      { agentId: 'a', target: { kind: 'fact', key: 'ctx:danger:a' }, delta: 0.3 },
    ]);
    expect((r.world.facts as any)['ctx:danger:a']).toBeCloseTo(0.55, 6);
  });

  it('skips perturbation for missing agent with reason', () => {
    const w = makeWorld();
    const vec: PerturbationVector = {
      agentId: 'ghost',
      target: { kind: 'body', field: 'stress' },
      delta: 0.1,
    };
    const r = applyPerturbations(w, [vec]);
    expect(r.applied.length).toBe(0);
    expect(r.skipped.length).toBe(1);
    expect(r.skipped[0].reason).toMatch(/not in world/);
  });

  it('applies multiple perturbations in order', () => {
    const w = makeWorld();
    const r = applyPerturbations(w, [
      { agentId: 'a', target: { kind: 'body', field: 'stress' }, delta: 0.1 },
      { agentId: 'b', target: { kind: 'body', field: 'health' }, delta: -0.1 },
    ]);
    expect(r.world.characters.a.stress).toBeCloseTo(0.4, 6);
    expect(r.world.characters.b.health).toBeCloseTo(0.4, 6);
    expect(r.applied.length).toBe(2);
  });

  it('returns deep-cloned world (independent reference)', () => {
    const w = makeWorld();
    const r = applyPerturbations(w, []);
    expect(r.world).not.toBe(w);
    expect(r.world.characters).not.toBe(w.characters);
    expect(r.world.facts).not.toBe(w.facts);
  });

  it('empty vector list yields applied=[] skipped=[] and clean clone', () => {
    const w = makeWorld();
    const r = applyPerturbations(w, []);
    expect(r.applied).toEqual([]);
    expect(r.skipped).toEqual([]);
    expect(JSON.stringify(r.world)).toBe(JSON.stringify(w));
  });

  it('trait perturbation writes into entity.body.cognition', () => {
    const w = makeWorld();
    const r = applyPerturbations(w, [
      { agentId: 'a', target: { kind: 'trait', traitId: 'paranoia' }, delta: 0.05 },
    ]);
    const cog = (r.world.characters.a.entity as any).body.cognition;
    expect(cog.paranoia).toBeCloseTo(0.55, 6);
  });

  it('belief perturbation skips when atom not present', () => {
    const w = makeWorld();
    const r = applyPerturbations(w, [
      {
        agentId: 'a',
        target: { kind: 'belief', atomId: 'belief:foo', field: 'magnitude' },
        delta: 0.1,
      },
    ]);
    expect(r.applied.length).toBe(0);
    expect(r.skipped[0].reason).toMatch(/belief atom .* not found/);
  });
});

describe('describePerturbation', () => {
  it('formats body target with sign', () => {
    expect(
      describePerturbation({
        agentId: 'a',
        target: { kind: 'body', field: 'stress' },
        delta: 0.05,
      }),
    ).toBe('a.body.stress +0.050');
  });

  it('formats tom target with toId', () => {
    expect(
      describePerturbation({
        agentId: 'a',
        target: { kind: 'tom', toId: 'b', field: 'trust' },
        delta: -0.1,
      }),
    ).toBe('a.tom[b].trust -0.100');
  });

  it('formats fact target', () => {
    expect(
      describePerturbation({
        agentId: 'a',
        target: { kind: 'fact', key: 'ctx:danger:a' },
        delta: 0.2,
      }),
    ).toBe('facts.ctx:danger:a +0.200');
  });
});

describe('ProConflict divergence helpers', () => {
  it('computes goalKL from pipelineHistory instead of snapshot facts', () => {
    const runA = makeRun({
      pipelineHistory: {
        a: [
          { tick: 0, mode: 'safety', decisionMode: 'deliberative', goalScores: { safety: 1 }, drivers: {} },
        ],
      },
    });
    const runB = makeRun({
      pipelineHistory: {
        a: [
          { tick: 0, mode: 'affiliation', decisionMode: 'deliberative', goalScores: { affiliation: 1 }, drivers: {} },
        ],
      },
    });

    const trace = computeDivergenceTrace(runA, runB);
    expect(trace[0].goalKL).toBeGreaterThan(0);
    expect(trace[0].composite).toBeGreaterThan(0);
  });

  it('attributes driver crossings from compact pipelineHistory', () => {
    const runA = makeRun({
      pipelineHistory: {
        a: [
          { tick: 0, mode: 'safety', decisionMode: 'deliberative', goalScores: {}, drivers: { safetyNeed: 0.2 } },
          { tick: 1, mode: 'safety', decisionMode: 'deliberative', goalScores: {}, drivers: { safetyNeed: 0.35 } },
        ],
      },
    });
    const runB = makeRun({
      pipelineHistory: {
        a: [
          { tick: 0, mode: 'safety', decisionMode: 'deliberative', goalScores: {}, drivers: { safetyNeed: 0.2 } },
          { tick: 1, mode: 'safety', decisionMode: 'deliberative', goalScores: {}, drivers: { safetyNeed: 0.25 } },
        ],
      },
    });

    const events = attributeAmplifiers(runA, runB);
    expect(events.some((e) => e.gate === 'driver.crossing' && e.agentId === 'a')).toBe(true);
  });
});
