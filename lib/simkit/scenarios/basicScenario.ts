// lib/simkit/scenarios/basicScenario.ts
// Basic test scenario for SimKit.

import type { SimWorld } from '../core/types';

export const basicScenarioId = 'scenario:basic:v1';

export function makeBasicWorld(): SimWorld {
  return {
    tickIndex: 0,
    seed: 1,
    facts: {},
    events: [],
    locations: {
      'loc:a': { id: 'loc:a', name: 'Hub A', neighbors: ['loc:b'], hazards: { radiation: 0.1 }, norms: { curfew: 0.2 } },
      'loc:b': { id: 'loc:b', name: 'Hall B', neighbors: ['loc:a'], hazards: { radiation: 0.02 }, norms: { curfew: 0.1 } },
    },
    characters: {
      'ch:kr': { id: 'ch:kr', name: 'Kristar', locId: 'loc:a', stress: 0.4, health: 1.0, energy: 0.6, tags: ['proud'] },
      'ch:tg': { id: 'ch:tg', name: 'Tegan', locId: 'loc:a', stress: 0.2, health: 1.0, energy: 0.7, tags: ['authority'] },
    },
  };
}
