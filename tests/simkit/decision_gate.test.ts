// tests/simkit/decision_gate.test.ts
import { describe, it, expect } from 'vitest';
import { selectDecisionMode } from '../../lib/simkit/core/decisionGate';
import type { SimWorld } from '../../lib/simkit/core/types';

function makeWorld(overrides?: {
  arousal?: number;
  selfControl?: number;
  surprise?: number;
  fatigue?: number;
}): SimWorld {
  const agentId = 'test-agent';
  return {
    tickIndex: 5,
    seed: 42,
    characters: {
      [agentId]: {
        id: agentId,
        name: 'Test',
        locId: 'loc1',
        stress: 0.3,
        health: 0.8,
        energy: 0.7,
        fatigue: overrides?.fatigue ?? 0,
        entity: {
          traits: { selfControl: overrides?.selfControl ?? 0.5 },
        },
      } as any,
    },
    locations: { loc1: { id: 'loc1', name: 'Test Loc', neighbors: [] } },
    facts: {
      [`emo:arousal:${agentId}`]: overrides?.arousal ?? 0,
      [`mem:beliefAtoms:${agentId}`]: overrides?.surprise != null
        ? [{ id: `belief:surprise:threat:${agentId}`, magnitude: overrides.surprise }]
        : [],
    } as any,
    events: [],
  };
}

describe('selectDecisionMode', () => {
  it('calm agent → deliberative', () => {
    const w = makeWorld({ arousal: 0.2, selfControl: 0.6 });
    const r = selectDecisionMode(w, 'test-agent');
    expect(r.mode).toBe('deliberative');
    expect(r.gate.reactiveScore).toBeLessThan(0.45);
  });

  it('high arousal + low selfControl → reactive', () => {
    const w = makeWorld({ arousal: 0.9, selfControl: 0.1 });
    const r = selectDecisionMode(w, 'test-agent');
    expect(r.mode).toBe('reactive');
    expect(r.gate.reactiveScore).toBeGreaterThan(0.75);
  });

  it('medium arousal → degraded', () => {
    const w = makeWorld({ arousal: 0.65, selfControl: 0.3 });
    const r = selectDecisionMode(w, 'test-agent');
    expect(r.mode).toBe('degraded');
  });

  it('high fatigue → degraded even with low arousal', () => {
    const w = makeWorld({ arousal: 0.1, selfControl: 0.8, fatigue: 0.85 });
    const r = selectDecisionMode(w, 'test-agent');
    expect(r.mode).toBe('degraded');
  });

  it('high surprise pushes toward reactive', () => {
    const w = makeWorld({ arousal: 0.5, selfControl: 0.3, surprise: 0.8 });
    const r = selectDecisionMode(w, 'test-agent');
    expect(r.mode).toBe('reactive');
  });

  it('high selfControl blocks reactive even under arousal', () => {
    const w = makeWorld({ arousal: 0.8, selfControl: 0.9 });
    const r = selectDecisionMode(w, 'test-agent');
    expect(r.mode).toBe('deliberative');
  });

  it('missing agent → deliberative fallback', () => {
    const w = makeWorld();
    const r = selectDecisionMode(w, 'nonexistent');
    expect(r.mode).toBe('deliberative');
  });
});
