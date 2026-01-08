// lib/simkit/plugins/perceptionMemoryPlugin.ts
// POST phase plugin: stores per-agent beliefAtoms into world.facts for next tick GoalLab.

import type { SimPlugin } from '../core/simulator';
import type { SimEvent } from '../core/types';
import { buildBeliefAtomsForTick, persistBeliefAtomsToFacts } from '../post/perceiveActions';

function arr<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

export function makePerceptionMemoryPlugin(): SimPlugin {
  return {
    id: 'plugin:perceptionMemory',
    afterSnapshot: ({ world, record }) => {
      try {
        const eventsApplied = arr<SimEvent>((record as any)?.trace?.eventsApplied);
        const beliefAtomsByAgentId = buildBeliefAtomsForTick(world, eventsApplied);
        persistBeliefAtomsToFacts(world, beliefAtomsByAgentId);

        record.plugins ||= {};
        record.plugins.perceptionMemory = {
          stored: Object.fromEntries(
            Object.keys(beliefAtomsByAgentId)
              .sort()
              .map((id) => [id, beliefAtomsByAgentId[id].length])
          ),
        };
      } catch (e: any) {
        record.plugins ||= {};
        record.plugins.perceptionMemory = { error: String(e?.message || e), stack: String(e?.stack || '') };
      }
    },
  };
}
