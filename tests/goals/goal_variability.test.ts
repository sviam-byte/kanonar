/**
 * tests/goals/goal_variability.test.ts
 *
 * Tests for FC.goal.variability: controlled stochastic MoE mode selection.
 * Contract:
 *  - default config (enabled:false) is a NO-OP: goal:mode unchanged, deterministic.
 *  - enabled path is seeded (selfId+tick) => replay-safe (same input => same output).
 *  - enabled path is explainable: goal:mode trace.parts.variability is populated,
 *    and the emitted mode equals the sampled mode.
 *
 * Run: npx vitest run tests/goals/goal_variability.test.ts
 */

import { describe, it, expect } from 'vitest';
import { deriveGoalAtoms } from '../../lib/goals/goalAtoms';
import { normalizeAtom } from '../../lib/context/v2/infer';
import { FC } from '../../lib/config/formulaConfig';

function mkAtom(id: string, magnitude: number, ns = 'ctx'): any {
  return normalizeAtom({ id, ns, kind: 'test', origin: 'world', source: 'test', magnitude, confidence: 1 } as any);
}

function buildAtoms(selfId: string): any[] {
  return [
    mkAtom(`ctx:final:danger:${selfId}`, 0.5),
    mkAtom(`ctx:final:control:${selfId}`, 0.4),
    mkAtom(`ctx:final:publicness:${selfId}`, 0.4),
    mkAtom(`ctx:final:normPressure:${selfId}`, 0.4),
    mkAtom(`ctx:final:uncertainty:${selfId}`, 0.5),
    mkAtom(`ctx:final:scarcity:${selfId}`, 0.3),
    mkAtom(`drv:safetyNeed:${selfId}`, 0.5, 'drv'),
    mkAtom(`drv:controlNeed:${selfId}`, 0.5, 'drv'),
    mkAtom(`drv:affiliationNeed:${selfId}`, 0.5, 'drv'),
    mkAtom(`drv:statusNeed:${selfId}`, 0.5, 'drv'),
    mkAtom(`drv:curiosityNeed:${selfId}`, 0.5, 'drv'),
    mkAtom(`drv:restNeed:${selfId}`, 0.3, 'drv'),
    mkAtom(`cap:fatigue:${selfId}`, 0.3, 'cap'),
    // High temperament => the enabled path uses a non-zero sampling temperature.
    mkAtom(`feat:char:${selfId}:trait.decisionTemperature`, 0.95, 'feat'),
    mkAtom(`feat:char:${selfId}:trait.ambiguityTolerance`, 0.95, 'feat'),
  ];
}

function modeAtom(out: { atoms: any[] }, selfId: string): any {
  return out.atoms.find((a: any) => a.id === `goal:mode:${selfId}`);
}

describe('FC.goal.variability', () => {
  const selfId = 'agent_var';

  it('default path is a no-op: goal:mode is deterministic and carries no variability sample', () => {
    const a = deriveGoalAtoms(selfId, buildAtoms(selfId), { topN: 3 });
    const b = deriveGoalAtoms(selfId, buildAtoms(selfId), { topN: 3 });
    const ma = modeAtom(a, selfId);
    const mb = modeAtom(b, selfId);
    expect(ma).toBeTruthy();
    expect(ma.meta.mode).toBe(mb.meta.mode);
    // default config => no stochastic sample recorded
    expect(ma.trace?.parts?.variability ?? null).toBeNull();
  });

  it('enabled path is seeded => replay-safe and explainable', () => {
    const prev = { ...FC.goal.variability };
    try {
      const v = FC.goal.variability as any;
      v.enabled = true;
      v.modeTemperatureBase = 0.2;
      v.traitTemperatureScale = 1.0;
      v.modeSharpen = 1.0;

      const a = deriveGoalAtoms(selfId, buildAtoms(selfId), { topN: 3 });
      const b = deriveGoalAtoms(selfId, buildAtoms(selfId), { topN: 3 });
      const ma = modeAtom(a, selfId);
      const mb = modeAtom(b, selfId);

      // Replay-safe: identical input + tick => identical sampled mode.
      expect(ma.meta.mode).toBe(mb.meta.mode);

      // Explainable: variability sample is recorded with required fields.
      const sample = ma.trace?.parts?.variability;
      expect(sample).toBeTruthy();
      expect(typeof sample.sampled).toBe('string');
      expect(sample.T).toBeGreaterThan(0);
      // Emitted mode equals the sampled mode (no surprise override in this fixture).
      expect(ma.meta.mode).toBe(sample.sampled);
    } finally {
      const v = FC.goal.variability as any;
      v.enabled = prev.enabled;
      v.modeTemperatureBase = prev.modeTemperatureBase;
      v.traitTemperatureScale = prev.traitTemperatureScale;
      v.modeSharpen = prev.modeSharpen;
    }
  });
});
