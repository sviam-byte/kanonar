// lib/simkit/plugins/perceptionMemoryPlugin.ts
// POST phase plugin: stores per-agent beliefAtoms into world.facts for next tick GoalLab.

import type { SimPlugin } from '../core/simulator';
import type { SimEvent } from '../core/types';
import { buildBeliefAtomsForTick, persistBeliefAtomsToFacts, persistDecayingMemoryToFacts, updateEpisodicMemory } from '../post/perceiveActions';
import { arr } from '../../utils/arr';

export function makePerceptionMemoryPlugin(): SimPlugin {
  // Snapshot for trust-delta-based episodic updates.
  let prevRelationsSnapshot: Record<string, Record<string, any>> | null = null;

  return {
    id: 'plugin:perceptionMemory',
    afterSnapshot: ({ world, record }) => {
      try {
        const eventsApplied = arr<SimEvent>((record as any)?.trace?.eventsApplied);
        const beliefAtomsByAgentId = buildBeliefAtomsForTick(world, eventsApplied);
        persistBeliefAtomsToFacts(world, beliefAtomsByAgentId);
        persistDecayingMemoryToFacts(world, beliefAtomsByAgentId, {
          decayPerTick: 0.97,
          forgetBelow: 0.12,
          maxFacts: 600,
        });
        updateEpisodicMemory(world, eventsApplied, prevRelationsSnapshot);

        const curRels = (world.facts as any)?.relations;
        if (curRels && typeof curRels === 'object') {
          prevRelationsSnapshot = {};
          for (const [a, targets] of Object.entries(curRels)) {
            prevRelationsSnapshot[a] = {};
            for (const [b, entry] of Object.entries(targets as any)) {
              prevRelationsSnapshot[a][b] = { ...(entry as any) };
            }
          }
        }

        record.plugins ||= {};
        record.plugins.perceptionMemory = {
          stored: Object.fromEntries(
            Object.keys(beliefAtomsByAgentId)
              .sort()
              .map((id) => [id, beliefAtomsByAgentId[id].length])
          ),
        };
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        const stack = e instanceof Error ? String(e.stack || '') : '';
        console.warn('[plugin:perceptionMemory] afterSnapshot failed', message);
        record.plugins ||= {};
        record.plugins.perceptionMemory = { error: message, stack };
      }
    },
  };
}
