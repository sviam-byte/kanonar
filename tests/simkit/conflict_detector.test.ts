// tests/simkit/conflict_detector.test.ts
import { describe, it, expect } from 'vitest';
import { detectConflicts, resolveConflicts } from '../../lib/simkit/resolution/conflictDetector';
import type { SimWorld, SimAction } from '../../lib/simkit/core/types';

function makeWorld(): SimWorld {
  return {
    tickIndex: 5,
    seed: 42,
    characters: {
      a: { id: 'a', name: 'A', locId: 'l1', stress: 0.3, health: 0.8, energy: 0.7 },
      b: { id: 'b', name: 'B', locId: 'l1', stress: 0.5, health: 0.5, energy: 0.4 },
      c: { id: 'c', name: 'C', locId: 'l1', stress: 0.2, health: 0.9, energy: 0.9 },
    },
    locations: { l1: { id: 'l1', name: 'L1', neighbors: [] } },
    facts: {} as any,
    events: [],
  };
}

describe('detectConflicts', () => {
  it('detects mutual hostile targeting', () => {
    const actions: SimAction[] = [
      { id: 'a1', kind: 'attack', actorId: 'a', targetId: 'b' },
      { id: 'a2', kind: 'confront', actorId: 'b', targetId: 'a' },
    ];
    const pairs = detectConflicts(actions);
    expect(pairs.length).toBe(1);
    expect(pairs[0].type).toBe('mutual_hostile');
  });

  it('detects social collision (talk vs avoid)', () => {
    const actions: SimAction[] = [
      { id: 'a1', kind: 'talk', actorId: 'a', targetId: 'b' },
      { id: 'a2', kind: 'avoid', actorId: 'b', targetId: 'a' },
    ];
    const pairs = detectConflicts(actions);
    expect(pairs.length).toBe(1);
    expect(pairs[0].type).toBe('social_collision');
  });

  it('detects resource contention', () => {
    const actions: SimAction[] = [
      { id: 'a1', kind: 'loot', actorId: 'a', targetId: 'resource1' },
      { id: 'a2', kind: 'loot', actorId: 'b', targetId: 'resource1' },
    ];
    const pairs = detectConflicts(actions);
    expect(pairs.length).toBe(1);
    expect(pairs[0].type).toBe('resource_contention');
  });

  it('no conflict for non-overlapping actions', () => {
    const actions: SimAction[] = [
      { id: 'a1', kind: 'talk', actorId: 'a', targetId: 'b' },
      { id: 'a2', kind: 'observe', actorId: 'c' },
    ];
    expect(detectConflicts(actions).length).toBe(0);
  });
});

describe('resolveConflicts', () => {
  it('higher strength wins mutual hostile', () => {
    const w = makeWorld();
    const actions: SimAction[] = [
      { id: 'a1', kind: 'attack', actorId: 'a', targetId: 'b' },
      { id: 'a2', kind: 'attack', actorId: 'b', targetId: 'a' },
    ];
    const { resolved, filteredActions } = resolveConflicts(w, actions, 42);
    expect(resolved.length).toBe(1);
    expect(resolved[0].winnerId).toBe('a');
    const loserAction = filteredActions.find((a) => a.actorId === 'b');
    expect(loserAction?.kind).toBe('wait');
  });

  it('avoider wins social collision', () => {
    const w = makeWorld();
    const actions: SimAction[] = [
      { id: 'a1', kind: 'talk', actorId: 'a', targetId: 'b' },
      { id: 'a2', kind: 'avoid', actorId: 'b', targetId: 'a' },
    ];
    const { resolved } = resolveConflicts(w, actions, 42);
    expect(resolved.length).toBe(1);
    expect(resolved[0].winnerId).toBe('b');
    expect(resolved[0].loserId).toBe('a');
  });

  it('generates conflict events', () => {
    const w = makeWorld();
    const actions: SimAction[] = [
      { id: 'a1', kind: 'attack', actorId: 'a', targetId: 'b' },
      { id: 'a2', kind: 'attack', actorId: 'b', targetId: 'a' },
    ];
    const { events } = resolveConflicts(w, actions, 42);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('conflict');
  });
});
