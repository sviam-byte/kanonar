// tests/simkit/beat_detector.test.ts
import { describe, it, expect } from 'vitest';
import { detectBeats, computeTension } from '../../lib/simkit/narrative/beatDetector';
import type { SimTickRecord, SimWorld } from '../../lib/simkit/core/types';

function makeRecord(overrides?: {
  trustDelta?: { key: string; before: number; after: number };
  actions?: Array<{ kind: string; actorId: string; targetId?: string }>;
  healthDelta?: { id: string; before: number; after: number };
}): SimTickRecord {
  const factsDeltas: Record<string, { before: any; after: any }> = {};
  if (overrides?.trustDelta) {
    factsDeltas[overrides.trustDelta.key] = {
      before: overrides.trustDelta.before,
      after: overrides.trustDelta.after,
    };
  }

  const charDeltas = overrides?.healthDelta
    ? [{ id: overrides.healthDelta.id, before: { health: overrides.healthDelta.before }, after: { health: overrides.healthDelta.after } }]
    : [];

  return {
    snapshot: {
      schema: 'SimKitSnapshotV1', id: 'snap', time: '', tickIndex: 10,
      characters: [], locations: [], events: [],
    },
    trace: {
      tickIndex: 10, time: '',
      actionsProposed: [],
      actionsApplied: (overrides?.actions || []).map((a, i) => ({
        id: `act:${i}`, kind: a.kind, actorId: a.actorId, targetId: a.targetId ?? null,
      })),
      eventsApplied: [],
      deltas: { chars: charDeltas as any, facts: factsDeltas },
      notes: [],
    },
    plugins: {},
  };
}

describe('detectBeats', () => {
  const dummyWorld: SimWorld = {
    tickIndex: 10, seed: 0,
    characters: { a: { id: 'a', name: 'A', locId: 'l', stress: 0.3, health: 0.8, energy: 0.7 } },
    locations: { l: { id: 'l', name: 'L', neighbors: [] } },
    facts: {} as any, events: [],
  };

  it('detects trust shift above threshold', () => {
    const rec = makeRecord({ trustDelta: { key: 'rel:trust:a:b', before: 0.7, after: 0.4 } });
    const beats = detectBeats(rec, null, dummyWorld);
    const trustBeats = beats.filter(b => b.type === 'trust_shift');
    expect(trustBeats.length).toBe(1);
    expect(trustBeats[0].agents).toContain('a');
    expect(trustBeats[0].agents).toContain('b');
  });

  it('ignores small trust delta', () => {
    const rec = makeRecord({ trustDelta: { key: 'rel:trust:a:b', before: 0.5, after: 0.55 } });
    const beats = detectBeats(rec, null, dummyWorld);
    expect(beats.filter(b => b.type === 'trust_shift').length).toBe(0);
  });

  it('detects conflict (mutual hostile targeting)', () => {
    const rec = makeRecord({
      actions: [
        { kind: 'attack', actorId: 'a', targetId: 'b' },
        { kind: 'confront', actorId: 'b', targetId: 'a' },
      ],
    });
    const beats = detectBeats(rec, null, dummyWorld);
    expect(beats.some(b => b.type === 'conflict')).toBe(true);
  });

  it('detects convergence (3+ same action)', () => {
    const rec = makeRecord({
      actions: [
        { kind: 'wait', actorId: 'a' },
        { kind: 'wait', actorId: 'b' },
        { kind: 'wait', actorId: 'c' },
      ],
    });
    const beats = detectBeats(rec, null, dummyWorld);
    expect(beats.some(b => b.type === 'convergence')).toBe(true);
  });

  it('detects serious injury', () => {
    const rec = makeRecord({ healthDelta: { id: 'a', before: 0.7, after: 0.3 } });
    const beats = detectBeats(rec, null, dummyWorld);
    expect(beats.some(b => b.type === 'injury')).toBe(true);
  });
});

describe('computeTension', () => {
  it('zero stress → low tension', () => {
    const w: SimWorld = {
      tickIndex: 0, seed: 0,
      characters: { a: { id: 'a', name: 'A', locId: 'l', stress: 0, health: 1, energy: 1 } },
      locations: {}, facts: {} as any, events: [],
    };
    expect(computeTension(w)).toBeLessThan(0.15);
  });

  it('high stress + danger → high tension', () => {
    const w: SimWorld = {
      tickIndex: 0, seed: 0,
      characters: { a: { id: 'a', name: 'A', locId: 'l', stress: 0.9, health: 0.5, energy: 0.3 } },
      locations: {},
      facts: { 'ctx:danger:a': 0.8 } as any,
      events: [],
    };
    expect(computeTension(w)).toBeGreaterThan(0.4);
  });
});
