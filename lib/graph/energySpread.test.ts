import { describe, expect, test } from 'vitest';

import { spreadEnergy } from './energySpread';

describe('spreadEnergy', () => {
  test('handles empty graph defensively', () => {
    const out = spreadEnergy({ nodeIds: [], edges: [], startNodeIds: [] } as any);
    expect(out).toEqual({ nodeEnergy: {}, edgeFlow: {} });
  });

  test('is deterministic for fixed inputs', () => {
    const params = {
      nodeIds: ['A', 'B', 'C'],
      edges: [
        { source: 'A', target: 'B', weight: 1 },
        { source: 'B', target: 'C', weight: 1 },
      ],
      startNodeIds: ['A'],
      steps: 3,
      decay: 0.8,
      temperature: 1,
      curvePreset: 'smoothstep' as const,
      direction: 'forward' as const,
      signedFlow: true,
      nodeBase: { A: 1, B: 1, C: 1 },
    };

    const out1 = spreadEnergy(params as any);
    const out2 = spreadEnergy(params as any);

    expect(out1.nodeEnergy).toEqual(out2.nodeEnergy);
    expect(out1.edgeFlow).toEqual(out2.edgeFlow);
  });

  test('produces finite energies and flows', () => {
    const out = spreadEnergy({
      nodeIds: ['A', 'B'],
      edges: [{ source: 'A', target: 'B', weight: 0.5 }],
      startNodeIds: ['A'],
      steps: 5,
      decay: 0.5,
      temperature: 0.8,
      curvePreset: 'smoothstep',
      direction: 'forward',
      signedFlow: true,
      nodeBase: { A: 1, B: 1 },
    } as any);

    for (const v of Object.values(out.nodeEnergy)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    for (const v of Object.values(out.edgeFlow)) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});
