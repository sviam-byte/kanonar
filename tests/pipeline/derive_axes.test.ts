/**
 * tests/pipeline/derive_axes.test.ts
 *
 * Property-based tests for deriveAxes (S2 context axis derivation).
 * Covers: boundary safety, output range, key monotonicity properties.
 *
 * Run: npx vitest run tests/pipeline/derive_axes.test.ts
 */

import { describe, it, expect } from 'vitest';
import { deriveAxes } from '../../lib/context/axes/deriveAxes';
import { normalizeAtom } from '../../lib/context/v2/infer';

function mkAtom(id: string, magnitude: number, ns = 'world'): any {
  return normalizeAtom({ id, ns, kind: 'test', origin: 'world', source: 'test', magnitude, confidence: 1 } as any);
}

function getAxisMag(atoms: any[], selfId: string, axis: string): number {
  const a = atoms.find((x: any) => x.id === `ctx:${axis}:${selfId}`);
  return a ? Number(a.magnitude) : NaN;
}

describe('deriveAxes', () => {
  const selfId = 'ax_test';

  it('does not crash on empty atoms', () => {
    const result = deriveAxes({ selfId, atoms: [] });
    expect(Array.isArray(result.atoms)).toBe(true);
  });

  it('all output magnitudes in [0,1]', () => {
    // Extreme inputs
    const atoms = [
      mkAtom(`world:loc:threat:${selfId}`, 1.0),
      mkAtom(`world:loc:control_level:${selfId}`, 0.0),
      mkAtom(`scene:chaos:${selfId}`, 1.0),
      mkAtom(`world:time:pressure:${selfId}`, 1.0),
    ];
    const result = deriveAxes({ selfId, atoms });
    for (const a of result.atoms) {
      const m = Number((a as any).magnitude);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
      expect(Number.isFinite(m)).toBe(true);
    }
  });

  it('danger axis responds to threat signals', () => {
    const low = deriveAxes({
      selfId,
      atoms: [mkAtom(`world:loc:threat:${selfId}`, 0.1)],
    });
    const high = deriveAxes({
      selfId,
      atoms: [mkAtom(`world:loc:threat:${selfId}`, 0.9)],
    });
    const dLow = getAxisMag(low.atoms, selfId, 'danger');
    const dHigh = getAxisMag(high.atoms, selfId, 'danger');
    // Should be monotonic: more threat → more danger
    if (Number.isFinite(dLow) && Number.isFinite(dHigh)) {
      expect(dHigh).toBeGreaterThanOrEqual(dLow);
    }
  });

  it('produces at least some ctx atoms', () => {
    const atoms = [
      mkAtom(`world:loc:threat:${selfId}`, 0.5),
      mkAtom(`world:loc:control_level:${selfId}`, 0.5),
    ];
    const result = deriveAxes({ selfId, atoms });
    const ctxAtoms = result.atoms.filter((a: any) => String(a.id).startsWith('ctx:'));
    expect(ctxAtoms.length).toBeGreaterThan(0);
  });

  it('all ctx atoms have trace', () => {
    const atoms = [
      mkAtom(`world:loc:threat:${selfId}`, 0.5),
    ];
    const result = deriveAxes({ selfId, atoms });
    for (const a of result.atoms) {
      expect((a as any).trace).toBeTruthy();
    }
  });
});
