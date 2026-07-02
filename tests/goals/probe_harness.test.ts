import { describe, it, expect } from 'vitest';

import { runProbe } from '@/lib/goal-lab/probe/runProbe';
import { sweepAxis, toCsv, linspace } from '@/lib/goal-lab/probe/sweep';
import { PROBE_SCENES, S_neutral, S_vulnerable, sceneById } from '@/lib/goal-lab/probe/scenes';
import { SIGN_TABLE, activePredictions } from '@/lib/goal-lab/probe/signTable';

// These tests assert the HARNESS CONTRACT (it runs, surfaces both readout
// layers, sweeps, serializes). They do NOT assert the behavioral sign
// predictions — those are the experiment (Phase 3 triage), not unit invariants.

describe('probe harness: contract', () => {
  it('S_neutral runs and surfaces an S7 goal layer', () => {
    const r = runProbe({ scene: S_neutral, seeds: [1, 2, 3] });
    expect(r.ok).toBe(true);
    expect(r.seedsUsed).toBeGreaterThan(0);
    expect(Object.keys(r.s7Domains).length).toBeGreaterThan(0);
    // Drivers (S6) should also be present.
    expect(Object.keys(r.drivers).length).toBeGreaterThan(0);
  });

  it('multi-seed S8 distribution is a normalized probability map', () => {
    const r = runProbe({ scene: S_vulnerable, seeds: [1, 2, 3, 4] });
    const probs = Object.values(r.s8Distribution);
    if (probs.length > 0) {
      const sum = probs.reduce((s, v) => s + v, 0);
      expect(sum).toBeCloseTo(1, 5);
      expect(r.s8ActionEntropy).toBeGreaterThanOrEqual(0);
    }
  });

  it('S7 readout is deterministic for fixed axes + seed', () => {
    const a = runProbe({ scene: S_neutral, axisOverrides: { A_Safety_Care: 0.7 }, seeds: [1] });
    const b = runProbe({ scene: S_neutral, axisOverrides: { A_Safety_Care: 0.7 }, seeds: [1] });
    expect(a.s7Domains).toEqual(b.s7Domains);
  });
});

describe('probe harness: sweep + export', () => {
  it('sweeps an axis and emits long-format records across both layers', () => {
    const values = linspace(0, 1, 5);
    const records = sweepAxis({ axis: 'A_Care_Compassion', scene: S_vulnerable, values });

    // one block of readouts per swept value
    const distinctValues = new Set(records.map(r => r.value));
    expect(distinctValues.size).toBe(values.length);

    expect(records.some(r => r.layer === 'S7')).toBe(true);
    expect(records.some(r => r.readout === 'action_entropy')).toBe(true);
    expect(records.every(r => r.axis === 'A_Care_Compassion')).toBe(true);
  });

  it('toCsv produces a header and one line per record', () => {
    const records = sweepAxis({ axis: 'A_Safety_Care', scene: S_neutral, values: [0, 1] });
    const csv = toCsv(records);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('axis,value,scene,layer,readout,result');
    expect(lines.length).toBe(records.length + 1);
  });
});

describe('probe harness: pre-registered sign table', () => {
  it('active predictions reference scenes that exist', () => {
    const active = activePredictions();
    expect(active.length).toBeGreaterThan(0);
    for (const p of active) {
      expect(sceneById(p.scene), `scene ${p.scene} for axis ${p.axis}`).toBeTruthy();
    }
  });

  it('payoff scenes (S_contest/S_defection) are built and registered', () => {
    // Step 1 (2026-06-19): these scenes now exist, so no prediction stays pending
    // and both scenes are discoverable in PROBE_SCENES.
    expect(SIGN_TABLE.filter(p => p.pending)).toHaveLength(0);
    for (const id of ['S_contest', 'S_defection']) {
      expect(PROBE_SCENES.find(s => s.id === id), `scene ${id} registered`).toBeTruthy();
      expect(sceneById(id)).toBeTruthy();
    }
  });
});
