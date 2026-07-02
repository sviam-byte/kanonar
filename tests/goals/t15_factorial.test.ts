import { describe, it, expect, afterEach } from 'vitest';

import { runProbe } from '@/lib/goal-lab/probe/runProbe';
import {
  S_contest, S_contest_pressure, S_defection_pressure, S_coercive_order, sceneById,
} from '@/lib/goal-lab/probe/scenes';
import { scoreAction as scoreGame, type Game, type OtherPolicy } from '@/lib/goal-lab/probe/game';
import { OUTCOME_SIGN_TABLE_V3 } from '@/lib/goal-lab/probe/outcomeSignTableV3';
import { scoreAction } from '@/lib/decision/scoreAction';
import { FC } from '@/lib/config/formulaConfig';

// T1.5 HARNESS CONTRACT tests. Frozen v3 directions are NOT asserted here —
// they go to outcome_triage_v3. These pin: (1) the flag is default-off and a
// no-op when off; (2) event pressure actually spawns coercive candidates;
// (3) the new scenes stay fully classified; (4) ctx:authority derives from the
// scene metric; (5) v3 table structure.

const PI = (FC.actionScoring as any).priorInfluence;
afterEach(() => { PI.enabled = false; });

describe('priorInfluence flag (Q-PRIOR-DROP fix, default OFF)', () => {
  it('is off by default and off ⇒ scoreAction ignores priorMagnitude', () => {
    expect(PI.enabled).toBe(false);
    const cand: any = { deltaGoals: { safety: 0.5 }, cost: 0.1, confidence: 1, priorMagnitude: 0.9 };
    const energy = { safety: 1 };
    const qOff = scoreAction(cand, energy);
    const qNoPrior = scoreAction({ ...cand, priorMagnitude: 0 }, energy);
    expect(qOff).toBe(qNoPrior);
  });

  it('on ⇒ adds weight·priorMagnitude to Q', () => {
    const cand: any = { deltaGoals: { safety: 0.5 }, cost: 0.1, confidence: 1, priorMagnitude: 0.8 };
    const energy = { safety: 1 };
    const qOff = scoreAction(cand, energy);
    PI.enabled = true;
    const qOn = scoreAction(cand, energy);
    expect(qOn - qOff).toBeCloseTo(PI.weight * 0.8, 6);
  });
});

describe('pressure scenes: event channel spawns coercive candidates', () => {
  it('S_contest_pressure surfaces coercive verbs among ranked S8 candidates', () => {
    const r = runProbe({
      scene: S_contest_pressure,
      axisOverrides: { A_Power_Sovereignty: 0.9 },
      seeds: [1, 2, 3],
    });
    expect(r.ok).toBe(true);
    const rankedVerbs = new Set(Object.keys(r.s8MeanQ).map(k => k.split(':')[1]));
    expect(
      ['threaten', 'confront', 'accuse', 'command'].some(v => rankedVerbs.has(v)),
      `coercive candidate in ranked; got: ${[...rankedVerbs].join(',')}`,
    ).toBe(true);
  });

  it('static S_contest does NOT surface them (the contrast that makes the cell meaningful)', () => {
    const r = runProbe({
      scene: S_contest,
      axisOverrides: { A_Power_Sovereignty: 0.9 },
      seeds: [1, 2, 3],
    });
    const rankedVerbs = new Set(Object.keys(r.s8MeanQ).map(k => k.split(':')[1]));
    for (const v of ['threaten', 'confront', 'accuse', 'command']) {
      expect(rankedVerbs.has(v), `${v} unexpectedly present in static scene`).toBe(false);
    }
  });

  it('ctx:authority derives from the scene metric (GATE-SOURCES fix)', () => {
    const r = runProbe({ scene: S_contest_pressure, seeds: [1] });
    // the derived aux atom is read by the command gate; surface via ctx
    // readouts is indirect — assert through the scene build instead:
    const { world } = S_contest_pressure.build(
      // minimal agent stub — build only mutates the world
      { entityId: 'A' } as any,
    );
    expect((world as any).sceneSnapshot.metrics.authority).toBeCloseTo(0.5);
    expect(((world as any).eventLog.events ?? []).length).toBeGreaterThan(0);
    expect(r.ok).toBe(true);
  });
});

describe('new scenes stay fully classified on observable B', () => {
  const CELLS: Array<[any, Record<string, number>]> = [
    [S_contest_pressure, { A_Power_Sovereignty: 0.1 }],
    [S_contest_pressure, { A_Power_Sovereignty: 0.9 }],
    [S_defection_pressure, { A_Care_Compassion: 0.9 }],
    [S_coercive_order, { A_Liberty_Autonomy: 0.9 }],
  ];
  it('unclassified_rate === 0 and outcome mass = 1 across representative cells (both flag states)', () => {
    for (const enabled of [false, true]) {
      PI.enabled = enabled;
      for (const [scene, axisOverrides] of CELLS) {
        const r = runProbe({ scene, axisOverrides, seeds: [1, 2, 3, 4] });
        expect(r.ok, `${scene.id} runs (flag=${enabled})`).toBe(true);
        expect(r.unclassifiedRate, `${scene.id} unclassified (flag=${enabled})`).toBe(0);
        const mass = Object.values(r.outcomeDistribution).reduce((s, v) => s + v, 0);
        expect(mass).toBeCloseTo(1, 6);
      }
    }
  });

  it('G_coercive is total and unilateral', () => {
    const g = S_coercive_order.game as Game;
    for (const verb of Object.keys(g.moves)) {
      for (const policy of ['cooperate', 'defect'] as OtherPolicy[]) {
        const s = scoreGame(g, `aff:${verb}:A:B`, policy);
        expect(Object.keys(g.outcomes)).toContain(s.label);
      }
    }
    expect(scoreGame(g, 'con:challenge:A:B', 'cooperate').label).toBe('defied');
    expect(scoreGame(g, 'aff:submit:A:B', 'defect').label).toBe('complied');
  });
});

describe('v3 pre-registration structure (directions go to triage, not tests)', () => {
  it('9 frozen rows over existing scenes; flat/interaction cells present', () => {
    expect(OUTCOME_SIGN_TABLE_V3).toHaveLength(9);
    for (const p of OUTCOME_SIGN_TABLE_V3) {
      expect(['on', 'off']).toContain(p.priorInfluence);
      expect(sceneById(p.scene), `scene ${p.scene} exists`).toBeTruthy();
      expect(p.layer).toBe('OUTCOME');
    }
    expect(OUTCOME_SIGN_TABLE_V3.filter(p => p.direction === 'flat')).toHaveLength(3);
    expect(OUTCOME_SIGN_TABLE_V3.filter(p => p.direction === 'interaction')).toHaveLength(1);
  });
});
