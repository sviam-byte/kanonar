import { describe, it, expect } from 'vitest';

import { loadRosterAgents, rosterAxes, buildAgentFromEntity } from '@/lib/goal-lab/probe/realAgents';
import { runProbe } from '@/lib/goal-lab/probe/runProbe';
import { rosterSweepRecords } from '@/lib/goal-lab/probe/rosterSweep';
import { S_neutral, S_vulnerable } from '@/lib/goal-lab/probe/scenes';

// Contract test for the real-roster path. Asserts the harness loads real
// characters and runs them through the pipeline — NOT behavioral signs.

describe('roster probe: loader', () => {
  it('loads the real character roster with populated vector_base', () => {
    const members = loadRosterAgents();
    expect(members.length).toBeGreaterThanOrEqual(20);
    for (const m of members) {
      expect(typeof m.id).toBe('string');
      expect(Object.keys(m.baseline).length).toBeGreaterThan(0);
    }
  });

  it('canonical axis union spans the full basis (>30 axes)', () => {
    const axes = rosterAxes(loadRosterAgents());
    expect(axes.length).toBeGreaterThan(30);
    // sanity: known canonical axes present
    expect(axes).toContain('A_Power_Sovereignty');
    expect(axes).toContain('A_Legitimacy_Procedure');
  });

  it('a real agent runs through the pipeline and surfaces both readout layers', () => {
    const member = loadRosterAgents()[0];
    const r = runProbe({ scene: S_neutral, agentTemplate: member.agent, seeds: [1, 2] });
    expect(r.ok).toBe(true);
    expect(r.selfId).toBe(member.id);
    expect(Object.keys(r.s7Domains).length).toBeGreaterThan(0);
  });
});

describe('roster probe: sweep', () => {
  it('emits per-character slope rows over a small subset', () => {
    const members = loadRosterAgents().slice(0, 3);
    const records = rosterSweepRecords({
      members,
      axes: ['A_Power_Sovereignty', 'A_Safety_Care'],
      scenes: [S_vulnerable],
      deltas: [-0.4, 0, 0.4],
      seeds: [1],
    });
    expect(records.length).toBeGreaterThan(0);
    for (const rec of records) {
      expect(Number.isFinite(rec.slope)).toBe(true);
      expect([1, 0, -1]).toContain(rec.sign);
      expect(rec.characterId).toBeTruthy();
    }
  });
});
