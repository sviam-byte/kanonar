import { describe, expect, it } from 'vitest';

import { ACTION_SPECS } from '@/lib/simkit/actions/specs';
import type { SimAction, SimWorld } from '@/lib/simkit/core/types';

function makeWorld(): SimWorld {
  return {
    tickIndex: 13,
    seed: 1,
    characters: {
      A: { id: 'A', name: 'A', locId: 'L1', stress: 0.2, health: 1, energy: 0.8, pos: { nodeId: 'n1', x: 0, y: 0 } } as any,
      B: { id: 'B', name: 'B', locId: 'L1', stress: 0.2, health: 1, energy: 0.8, pos: { nodeId: 'n2', x: 5, y: 0 } } as any,
    },
    locations: {
      L1: {
        id: 'L1',
        name: 'L1',
        neighbors: [],
        nav: { nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 5, y: 0 }], edges: [] },
      } as any,
    },
    facts: {
      'intent:A': {
        id: 'intent:A:old',
        startedAtTick: 10,
        stageStartedAtTick: 10,
        lastProgressTick: 10,
        stageIndex: 0,
        stageEnteredIndex: 0,
        stageTicksLeft: 'until_condition',
        intentScript: { id: 'dialog:test', stages: [{ kind: 'approach', ticksRequired: 'until_condition', perTick: [] }] },
        intent: { originalAction: { kind: 'negotiate', targetId: 'B' } },
        dest: { x: 999, y: 999 },
      },
    } as any,
    events: [],
  };
}

describe('continue_intent stale cleanup', () => {
  it('aborts stale non-critical intents instead of looping forever', () => {
    const world = makeWorld();
    const action: SimAction = { id: 'a1', kind: 'continue_intent', actorId: 'A' } as any;
    const out = ACTION_SPECS.continue_intent.apply({ world, action } as any);

    expect((out.world.facts as any)['intent:A']).toBeUndefined();
    expect(out.events.some((e: any) => e.type === 'action:abort_intent')).toBe(true);
    expect(out.notes.join(' ')).toContain('stale intent');
  });
});
