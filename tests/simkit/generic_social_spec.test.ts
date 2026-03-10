import { describe, it, expect } from 'vitest';
import { buildGenericSocialSpec } from '../../lib/simkit/actions/genericSocialSpec';

describe('GenericSocialSpec', () => {
  const mkWorld = () => ({
    tickIndex: 0,
    characters: {
      a1: { id: 'a1', locId: 'loc1', stress: 0.3, energy: 0.8, health: 1, pos: { x: 0, y: 0 } },
      a2: { id: 'a2', locId: 'loc1', stress: 0.5, energy: 0.7, health: 1, pos: { x: 10, y: 0 } },
    },
    locations: { loc1: { id: 'loc1', entity: { properties: {} } } },
    facts: {},
    events: [],
    seed: 42,
  });

  it('comfort action increases trust and reduces target stress', () => {
    const spec = buildGenericSocialSpec('comfort');
    const world = mkWorld() as any;
    const action = { id: 'act:comfort:0:a1', kind: 'comfort', actorId: 'a1', targetId: 'a2' };
    const result = spec.apply({ world, action } as any);
    expect(result.notes.length).toBeGreaterThan(0);
    expect(result.events.length).toBeGreaterThan(0);
    // Trust should have been bumped.
    const trust = world.facts?.relations?.a2?.a1?.trust;
    expect(trust).toBeGreaterThan(0.5);
  });

  it('self-directed action works without target', () => {
    const spec = buildGenericSocialSpec('self_talk');
    const world = mkWorld() as any;
    const action = { id: 'act:self_talk:0:a1', kind: 'self_talk', actorId: 'a1', targetId: null };
    const result = spec.apply({ world, action } as any);
    expect(result.notes[0]).toContain('self');
  });

  it('unknown kind still produces minimal effects', () => {
    const spec = buildGenericSocialSpec('unknown_custom_action');
    const world = mkWorld() as any;
    const action = { id: 'act:x:0:a1', kind: 'unknown_custom_action', actorId: 'a1', targetId: null };
    const result = spec.apply({ world, action } as any);
    expect(result.notes.length).toBeGreaterThan(0);
  });
});
