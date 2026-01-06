// lib/orchestrator/defaultProducers.ts
// Stub registry; replace with real producers as they come online.

import type { ProducerSpec } from './types';

// ВАЖНО: это только каркас.
// Ты подставишь реальные продюсеры, которые у тебя уже есть:
// - world snapshot -> atoms
// - context infer
// - tom infer
// - goal/decision
// - relations(global)
export const defaultProducers: ProducerSpec[] = [
  {
    stageId: 'stage:world',
    name: 'world:events_to_atoms',
    version: '1',
    priority: 10,
    run: () => ({
      patch: { add: [], update: [], remove: [] },
      trace: {
        name: 'world:events_to_atoms',
        version: '1',
        inputRefs: [],
        outputs: { atomsAdded: [], atomsUpdated: [], atomsRemoved: [] },
        why: [],
      },
    }),
  },
];
