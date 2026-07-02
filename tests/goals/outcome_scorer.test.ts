import { describe, it, expect } from 'vitest';

import { runProbe } from '@/lib/goal-lab/probe/runProbe';
import { sweepAxis } from '@/lib/goal-lab/probe/sweep';
import { S_contest, S_defection, S_neutral } from '@/lib/goal-lab/probe/scenes';
import {
  scoreAction,
  verbOfActionKey,
  UNCLASSIFIED,
  type Game,
  type OtherPolicy,
} from '@/lib/goal-lab/probe/game';
import { OUTCOME_SIGN_TABLE, outcomeActivePredictions } from '@/lib/goal-lab/probe/outcomeSignTable';

// T1 (2026-07-02): HARNESS CONTRACT tests for observable B (outcomes).
// The frozen v2 directional predictions (outcomeSignTable.ts) are NOT asserted
// here — they go to Phase 3 triage; a miss there is a ledger row, not a test
// failure. These tests pin the scorer's mechanics only.

const G_CONTEST = S_contest.game as Game;
const G_DEFECTION = S_defection.game as Game;
const POLICIES: OtherPolicy[] = ['cooperate', 'defect'];

describe('game contract: scoring mechanics', () => {
  it('verbOfActionKey extracts segment 1 of possibility ids', () => {
    expect(verbOfActionKey('aff:negotiate:A:B')).toBe('negotiate');
    expect(verbOfActionKey('exit:escape:A')).toBe('escape');
    expect(verbOfActionKey('bare')).toBe('bare');
  });

  it('scoreAction is deterministic', () => {
    for (const g of [G_CONTEST, G_DEFECTION]) {
      for (const policy of POLICIES) {
        const a = scoreAction(g, 'aff:negotiate:A:B', policy);
        const b = scoreAction(g, 'aff:negotiate:A:B', policy);
        expect(a).toEqual(b);
      }
    }
  });

  it('resolve is total: every declared verb × policy yields a label in outcomes', () => {
    for (const g of [G_CONTEST, G_DEFECTION]) {
      for (const verb of Object.keys(g.moves)) {
        for (const policy of POLICIES) {
          const s = scoreAction(g, `aff:${verb}:A:B`, policy);
          expect(s.move, `${g.id}: ${verb} classified`).not.toBeNull();
          expect(Object.keys(g.outcomes), `${g.id}: ${verb}/${policy} -> ${s.label}`).toContain(s.label);
        }
      }
    }
  });

  it('unknown verbs score UNCLASSIFIED with zero payoff', () => {
    const s = scoreAction(G_CONTEST, 'aff:teleport:A:B', 'cooperate');
    expect(s).toEqual({ verb: 'teleport', move: null, label: UNCLASSIFIED, self: 0, other: 0 });
  });

  it('game outcomes are a superset of the scene payoff outcomes, values equal', () => {
    for (const [scene, g] of [[S_contest, G_CONTEST], [S_defection, G_DEFECTION]] as const) {
      for (const [label, pair] of Object.entries(scene.payoff!.outcomes)) {
        expect(g.outcomes[label], `${g.id}: ${label}`).toEqual(pair);
      }
    }
    // and the game path reproduces a frozen magnitude
    expect(scoreAction(G_CONTEST, 'aff:negotiate:A:B', 'cooperate')).toMatchObject({
      label: 'fair_split', self: 5, other: 5,
    });
  });

  it('otherPolicy semantics: cooperate vs defect vs disengage', () => {
    // self cooperates: outcome depends on B's stipulated move
    expect(scoreAction(G_DEFECTION, 'aff:share:A:B', 'cooperate').label).toBe('both_cooperate');
    expect(scoreAction(G_DEFECTION, 'aff:share:A:B', 'defect').label).toBe('they_defect');
    // self defects
    expect(scoreAction(G_DEFECTION, 'aff:threaten:A:B', 'cooperate').label).toBe('i_defect');
    expect(scoreAction(G_DEFECTION, 'aff:threaten:A:B', 'defect').label).toBe('both_defect');
    // passive moves never score as exploitation/victimhood
    for (const policy of POLICIES) {
      const s = scoreAction(G_DEFECTION, 'cog:wait:A', policy);
      expect(s.label).toBe('no_engagement');
      expect([s.self, s.other]).toEqual([0, 0]);
    }
    // contest is unilateral: policy-independent
    expect(scoreAction(G_CONTEST, 'aff:command:A:B', 'cooperate').label).toBe('self_favoring');
    expect(scoreAction(G_CONTEST, 'aff:command:A:B', 'defect').label).toBe('self_favoring');
  });
});

describe('runProbe contract: outcome readouts', () => {
  it('outcomeDistribution sums to 1 and every chosen verb is classified (contest grid)', () => {
    for (const value of [0.1, 0.5, 0.9]) {
      const r = runProbe({
        scene: S_contest,
        axisOverrides: { A_Power_Sovereignty: value },
        seeds: [1, 2, 3, 4, 5, 6, 7, 8],
      });
      expect(r.ok).toBe(true);
      const mass = Object.values(r.outcomeDistribution).reduce((s, v) => s + v, 0);
      expect(mass).toBeCloseTo(1, 6);
      // the loud vocabulary-drift gate
      expect(r.unclassifiedRate, `unclassified at A_Power=${value}`).toBe(0);
    }
  });

  it('defection scene classifies fully too, and coopRate is a probability', () => {
    const r = runProbe({ scene: S_defection, seeds: [1, 2, 3, 4, 5, 6, 7, 8] });
    expect(r.ok).toBe(true);
    expect(r.unclassifiedRate).toBe(0);
    expect(r.coopRate).toBeGreaterThanOrEqual(0);
    expect(r.coopRate).toBeLessThanOrEqual(1);
  });

  it('scenes without a game emit empty outcome readouts', () => {
    const r = runProbe({ scene: S_neutral, seeds: [1, 2] });
    expect(r.outcomeDistribution).toEqual({});
    expect(r.outcomeMeanSelf).toBe(0);
    expect(r.coopRate).toBe(0);
  });
});

describe('sweep contract: OUTCOME layer', () => {
  it('payoff scenes emit OUTCOME records; S_neutral emits none; schema unchanged', () => {
    const contest = sweepAxis({
      axis: 'A_Power_Sovereignty', scene: S_contest, values: [0.2, 0.8], seeds: [1, 2, 3],
    });
    const outcomeRecords = contest.filter(r => r.layer === 'OUTCOME');
    expect(outcomeRecords.length).toBeGreaterThan(0);
    const readouts = new Set(outcomeRecords.map(r => r.readout));
    expect(readouts.has('coop_rate')).toBe(true);
    expect(readouts.has('unclassified_rate')).toBe(true);
    expect(readouts.has('outcome_mean_self')).toBe(true);
    for (const r of outcomeRecords) {
      // same long-format columns as every other record
      expect(Object.keys(r).sort()).toEqual(['axis', 'layer', 'readout', 'result', 'scene', 'value']);
    }

    const neutral = sweepAxis({
      axis: 'A_Power_Sovereignty', scene: S_neutral, values: [0.2, 0.8], seeds: [1, 2, 3],
    });
    expect(neutral.filter(r => r.layer === 'OUTCOME')).toHaveLength(0);
  });
});

describe('frozen v2 pre-registration (structure only — directions go to triage)', () => {
  it('table shape: 3 rows, OUTCOME layer, scenes exist, readouts well-formed', () => {
    expect(OUTCOME_SIGN_TABLE).toHaveLength(3);
    for (const p of OUTCOME_SIGN_TABLE) {
      expect(p.layer).toBe('OUTCOME');
      expect(['S_contest', 'S_defection']).toContain(p.scene);
      expect(
        p.readout.startsWith('outcome:') ||
          ['outcome_mean_self', 'outcome_mean_other', 'coop_rate'].includes(p.readout),
      ).toBe(true);
    }
    expect(outcomeActivePredictions()).toHaveLength(3);
  });
});
