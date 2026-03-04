/**
 * tests/pipeline/driver_layers.test.ts
 *
 * Tests for the 5-layer driver computation pipeline (curves -> inhibition -> accumulation -> surprise).
 * These checks are intentionally layer-oriented to keep S6 traceability regressions visible.
 */

import { describe, it, expect } from 'vitest';
import { deriveDriversAtoms } from '../../lib/drivers/deriveDrivers';
import { normalizeAtom } from '../../lib/context/v2/infer';
import type { CurveSpec } from '../../lib/utils/curves';

function mkAtom(id: string, magnitude: number, ns = 'ctx'): any {
  return normalizeAtom({ id, ns, kind: 'test', origin: 'world', source: 'test', magnitude, confidence: 1 } as any);
}

function buildAtoms(selfId: string, overrides: Record<string, number> = {}): any[] {
  const defaults: Record<string, number> = {
    [`ctx:final:danger:${selfId}`]: 0,
    [`ctx:final:control:${selfId}`]: 0.5,
    [`ctx:final:publicness:${selfId}`]: 0,
    [`ctx:final:normPressure:${selfId}`]: 0,
    [`ctx:final:uncertainty:${selfId}`]: 0,
    [`emo:fear:${selfId}`]: 0,
    [`emo:shame:${selfId}`]: 0,
    [`emo:care:${selfId}`]: 0,
    [`emo:anger:${selfId}`]: 0,
    ...overrides,
  };

  return Object.entries(defaults).map(([id, mag]) =>
    mkAtom(id, mag, id.startsWith('emo:') ? 'emo' : 'ctx')
  );
}

function getDrv(atoms: any[], selfId: string, name: string): number {
  const a = atoms.find((x: any) => x.id === `drv:${name}:${selfId}`);
  return a ? Number(a.magnitude) : NaN;
}

function getParts(atoms: any[], selfId: string, name: string): any {
  const a = atoms.find((x: any) => x.id === `drv:${name}:${selfId}`);
  return (a as any)?.trace?.parts ?? {};
}

describe('Layer 2: Response Curves', () => {
  const selfId = 'test_agent_curve';

  it('sigmoid curve creates a threshold-like jump around center', () => {
    const curves: Partial<Record<string, CurveSpec>> = {
      safetyNeed: { type: 'sigmoid', center: 0.3, slope: 10 },
    };

    const low = deriveDriversAtoms({
      selfId,
      atoms: buildAtoms(selfId, { [`ctx:final:danger:${selfId}`]: 0.45 }),
      driverCurves: curves,
    });

    const high = deriveDriversAtoms({
      selfId,
      atoms: buildAtoms(selfId, { [`ctx:final:danger:${selfId}`]: 0.55 }),
      driverCurves: curves,
    });

    const sLow = getDrv(low.atoms, selfId, 'safetyNeed');
    const sHigh = getDrv(high.atoms, selfId, 'safetyNeed');
    // We assert a noticeable jump near the configured center (raw ~= 0.30).
    expect(sHigh - sLow).toBeGreaterThan(0.12);
  });

  it('linear curve preserves baseline output', () => {
    const atoms = buildAtoms(selfId, { [`ctx:final:danger:${selfId}`]: 0.5 });

    const withCurve = deriveDriversAtoms({
      selfId,
      atoms,
      driverCurves: { safetyNeed: { type: 'linear' } },
    });
    const withoutCurve = deriveDriversAtoms({ selfId, atoms });

    expect(getDrv(withCurve.atoms, selfId, 'safetyNeed')).toBeCloseTo(getDrv(withoutCurve.atoms, selfId, 'safetyNeed'), 4);
  });

  it('trace carries curve layer fields', () => {
    const res = deriveDriversAtoms({
      selfId,
      atoms: buildAtoms(selfId, { [`ctx:final:danger:${selfId}`]: 0.5 }),
      driverCurves: { safetyNeed: { type: 'sigmoid', center: 0.3, slope: 8 } },
    });

    const parts = getParts(res.atoms, selfId, 'safetyNeed');
    expect(parts.rawLinear).toBeDefined();
    expect(parts.curveSpec).toBeDefined();
    expect(parts.shaped).toBeDefined();
    expect(parts.curveSpec.type).toBe('sigmoid');
  });
});

describe('Layer 3: Cross-Inhibition', () => {
  const selfId = 'test_agent_inh';

  it('high safety contributes suppression for affiliation', () => {
    const res = deriveDriversAtoms({
      selfId,
      atoms: buildAtoms(selfId, {
        [`ctx:final:danger:${selfId}`]: 0.9,
        [`emo:fear:${selfId}`]: 0.8,
        [`emo:care:${selfId}`]: 0.5,
      }),
    });

    const parts = getParts(res.atoms, selfId, 'affiliationNeed');
    expect(parts.inhibition.suppression).toBeGreaterThan(0);
  });

  it('inhibition trace records source contributions', () => {
    const res = deriveDriversAtoms({
      selfId,
      atoms: buildAtoms(selfId, {
        [`ctx:final:danger:${selfId}`]: 0.8,
        [`emo:fear:${selfId}`]: 0.6,
      }),
    });

    const parts = getParts(res.atoms, selfId, 'statusNeed');
    if (parts.inhibition.suppression > 0) {
      expect(Object.keys(parts.inhibition.sources).length).toBeGreaterThan(0);
    }
  });

  it('per-agent inhibition override shifts target magnitude', () => {
    const atoms = buildAtoms(selfId, {
      [`ctx:final:danger:${selfId}`]: 0.8,
      [`emo:fear:${selfId}`]: 0.6,
    });

    const strong = deriveDriversAtoms({
      selfId,
      atoms,
      inhibitionOverrides: { safetyNeed: { affiliationNeed: 0.8 } },
    });

    const none = deriveDriversAtoms({
      selfId,
      atoms,
      inhibitionOverrides: { safetyNeed: { affiliationNeed: 0.0 } },
    });

    const affStrong = getDrv(strong.atoms, selfId, 'affiliationNeed');
    const affNone = getDrv(none.atoms, selfId, 'affiliationNeed');
    expect(affNone).toBeGreaterThanOrEqual(affStrong);
  });
});

describe('Layer 4: Temporal Accumulation', () => {
  const selfId = 'test_agent_acc';

  it('previous pressure atoms affect current output', () => {
    const baseAtoms = buildAtoms(selfId, { [`ctx:final:danger:${selfId}`]: 0.3 });

    const fresh = deriveDriversAtoms({ selfId, atoms: baseAtoms });
    const withPressure = deriveDriversAtoms({
      selfId,
      atoms: [...baseAtoms, mkAtom(`belief:pressure:safetyNeed:${selfId}`, 0.8, 'belief')],
    });

    const sFresh = getDrv(fresh.atoms, selfId, 'safetyNeed');
    const sPressure = getDrv(withPressure.atoms, selfId, 'safetyNeed');
    expect(sPressure).toBeGreaterThan(sFresh);
  });

  it('accumulation trace records prev/alpha/blended fields', () => {
    const res = deriveDriversAtoms({
      selfId,
      atoms: [
        ...buildAtoms(selfId, { [`ctx:final:danger:${selfId}`]: 0.4 }),
        mkAtom(`belief:pressure:safetyNeed:${selfId}`, 0.6, 'belief'),
      ],
    });

    const parts = getParts(res.atoms, selfId, 'safetyNeed');
    expect(parts.accumulation.prevPressure).toBeDefined();
    expect(parts.accumulation.alpha).toBeDefined();
    expect(parts.accumulation.blended).toBeDefined();
  });
});

describe('Integration: pressure cooker effect', () => {
  const selfId = 'test_agent_snap';

  it('sigmoid + accumulation increases safetyNeed across repeated mild ticks', () => {
    const curves: Partial<Record<string, CurveSpec>> = {
      safetyNeed: { type: 'sigmoid', center: 0.35, slope: 10 },
    };

    let prevPressure = 0;
    const outputs: number[] = [];

    for (let tick = 0; tick < 6; tick++) {
      const res = deriveDriversAtoms({
        selfId,
        atoms: [
          ...buildAtoms(selfId, { [`ctx:final:danger:${selfId}`]: 0.25 }),
          mkAtom(`belief:pressure:safetyNeed:${selfId}`, prevPressure, 'belief'),
        ],
        driverCurves: curves,
      });

      const safety = getDrv(res.atoms, selfId, 'safetyNeed');
      outputs.push(safety);
      const parts = getParts(res.atoms, selfId, 'safetyNeed');
      prevPressure = Number(parts.accumulation?.blended ?? safety);
    }

    expect(outputs[0]).toBeLessThan(0.5);
    expect(outputs[5]).toBeGreaterThan(outputs[0]);
  });
});
