import { describe, expect, it } from 'vitest';

import { deriveDriversAtoms } from '@/lib/drivers/deriveDrivers';
import type { ContextAtom } from '@/lib/goal-lab/types';

function mkCtx(selfId: string, code: string, magnitude: number): ContextAtom {
  return {
    id: `ctx:final:${code}:${selfId}`,
    ns: 'ctx' as any,
    kind: 'ctx' as any,
    source: 'test',
    confidence: 1,
    magnitude,
  } as any;
}

function mkEmo(selfId: string, emo: string, magnitude: number): ContextAtom {
  return {
    id: `emo:${emo}:${selfId}`,
    ns: 'emo' as any,
    kind: 'emotion' as any,
    source: 'test',
    confidence: 1,
    magnitude,
  } as any;
}

describe('S6 driver physics', () => {
  it('keeps default linear curves as identity and writes trace layers', () => {
    const selfId = 'A';
    const atoms: ContextAtom[] = [
      mkCtx(selfId, 'danger', 0.5),
      mkCtx(selfId, 'control', 0.5),
      mkCtx(selfId, 'publicness', 0.2),
      mkCtx(selfId, 'normPressure', 0.2),
      mkCtx(selfId, 'uncertainty', 0.3),
      mkEmo(selfId, 'fear', 0.25),
      mkEmo(selfId, 'shame', 0.1),
      mkEmo(selfId, 'care', 0.4),
      mkEmo(selfId, 'anger', 0.15),
    ];

    const result = deriveDriversAtoms({ selfId, atoms });
    const safety = result.atoms.find((a) => a.id === `drv:safetyNeed:${selfId}`)!;
    const parts = (safety as any).trace?.parts ?? {};

    expect(result.atoms.length).toBe(7);
    expect(parts.rawLinear).toBeCloseTo(0.4, 4);
    expect(parts.shaped).toBeCloseTo(parts.rawLinear, 4);
    expect(parts.inhibition).toBeDefined();
    expect(parts.accumulation).toBeDefined();
  });

  it('applies cross-inhibition from safetyNeed to affiliationNeed', () => {
    const selfId = 'B';
    const atoms: ContextAtom[] = [
      mkCtx(selfId, 'danger', 0.9),
      mkCtx(selfId, 'control', 0.5),
      mkCtx(selfId, 'publicness', 0),
      mkCtx(selfId, 'normPressure', 0),
      mkCtx(selfId, 'uncertainty', 0.1),
      mkEmo(selfId, 'fear', 0.8),
      mkEmo(selfId, 'shame', 0),
      mkEmo(selfId, 'care', 0.2),
      mkEmo(selfId, 'anger', 0.1),
    ];

    const result = deriveDriversAtoms({ selfId, atoms });
    const aff = result.atoms.find((a) => a.id === `drv:affiliationNeed:${selfId}`)!;
    const parts = (aff as any).trace?.parts ?? {};

    expect(parts.shaped).toBeGreaterThan(parts.postInhibition);
    expect(parts.inhibition.suppression).toBeGreaterThan(0);
    expect(parts.inhibition.sources.safetyNeed ?? 0).toBeGreaterThan(0);
  });

  it('uses persisted pressure for accumulation when available', () => {
    const selfId = 'C';
    const atoms: ContextAtom[] = [
      mkCtx(selfId, 'danger', 0.2),
      mkCtx(selfId, 'control', 0.9),
      mkCtx(selfId, 'publicness', 0),
      mkCtx(selfId, 'normPressure', 0),
      mkCtx(selfId, 'uncertainty', 0.1),
      mkEmo(selfId, 'fear', 0.1),
      mkEmo(selfId, 'shame', 0),
      mkEmo(selfId, 'care', 0.2),
      mkEmo(selfId, 'anger', 0.1),
      {
        id: `belief:pressure:safetyNeed:${selfId}`,
        ns: 'belief' as any,
        kind: 'belief_driver_pressure' as any,
        source: 'test',
        confidence: 1,
        magnitude: 1,
      } as any,
    ];

    const result = deriveDriversAtoms({ selfId, atoms });
    const safety = result.atoms.find((a) => a.id === `drv:safetyNeed:${selfId}`)!;
    const parts = (safety as any).trace?.parts ?? {};

    expect(parts.accumulation.prevPressure).toBeCloseTo(1, 4);
    expect(parts.accumulation.blended).toBeGreaterThan(parts.postInhibition);
  });
});
