/**
 * tests/pipeline/batch4_behavioral.test.ts
 *
 * Tests for Batch 4 patches: cognitive effects, goal saturation, surprise mode override.
 */

import { describe, it, expect } from 'vitest';
import { actionEffectForKind } from '../../lib/decision/actionProjection';
import { initGoalState, updateGoalState, type GoalState } from '../../lib/goals/goalState';

describe('Patch 023: Cognitive Action Effects', () => {
  it('monologue has non-empty feature effects', () => {
    const e = actionEffectForKind('monologue');
    expect(Object.keys(e).length).toBeGreaterThan(0);
    expect(e.stress).toBeDefined();
    expect(Number(e.stress)).toBeLessThan(0);
  });

  it('verify has non-empty feature effects', () => {
    const e = actionEffectForKind('verify');
    expect(Object.keys(e).length).toBeGreaterThan(0);
    expect(Number(e.socialTrust)).toBeGreaterThan(0);
  });

  it('observe has feature effects', () => {
    const e = actionEffectForKind('observe');
    expect(Object.keys(e).length).toBeGreaterThan(0);
  });

  it('self_talk pattern matches to monologue', () => {
    const e = actionEffectForKind('self_talk');
    expect(Object.keys(e).length).toBeGreaterThan(0);
    expect(Number(e.stress)).toBeLessThan(0);
  });

  it('think pattern matches to monologue', () => {
    const e = actionEffectForKind('think');
    expect(Object.keys(e).length).toBeGreaterThan(0);
    expect(Number(e.stress)).toBeLessThan(0);
  });
});

describe('Patch 024: Goal Saturation', () => {
  it('saturation starts at 0', () => {
    const s = initGoalState();
    expect(s.saturation).toBe(0);
  });

  it('saturation grows when goal is active', () => {
    let state: GoalState = initGoalState();
    for (let t = 0; t < 10; t++) {
      state = updateGoalState(state, { active: true, activation: 0.8, tick: t });
    }
    expect(state.saturation).toBeGreaterThan(0.3);
  });

  it('saturation decays fast when goal drops out', () => {
    let state: GoalState = initGoalState();
    for (let t = 0; t < 15; t++) {
      state = updateGoalState(state, { active: true, activation: 0.8, tick: t });
    }
    const peakSat = state.saturation;
    expect(peakSat).toBeGreaterThan(0.5);

    for (let t = 15; t < 20; t++) {
      state = updateGoalState(state, { active: false, activation: 0, tick: t });
    }
    expect(state.saturation).toBeLessThan(peakSat * 0.5);
  });

  it('saturation remains near zero when always inactive', () => {
    let state: GoalState = initGoalState();
    for (let t = 0; t < 10; t++) {
      state = updateGoalState(state, { active: false, activation: 0, tick: t });
    }
    expect(state.saturation).toBeCloseTo(0, 2);
  });
});

describe('Patch 025: Surprise Mode Override Config', () => {
  it('FC.goal.surpriseModeOverride is defined', async () => {
    const { FC } = await import('../../lib/config/formulaConfig');
    const smo = (FC.goal as any).surpriseModeOverride;
    expect(smo).toBeDefined();
    expect(smo.threshold).toBeGreaterThan(0);
    expect(smo.overrideMix).toBeGreaterThan(0);
    expect(smo.featureToMode.threat).toBe('threat_mode');
  });
});
