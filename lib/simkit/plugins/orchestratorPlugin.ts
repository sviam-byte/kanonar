// lib/simkit/plugins/orchestratorPlugin.ts
// Plugin bridge: SimKit snapshot -> GoalLab snapshot -> orchestrator.

import type { SimPlugin } from '../core/simulator';
import type { ProducerSpec } from '../../orchestrator/types';
import { runTick } from '../../orchestrator/runTick';
import { buildRegistry } from '../../orchestrator/registry';

// Мост: SimSnapshot -> GoalLabSnapshotV1Like
function toGoalLabSnapshot(simSnapshot: any): any {
  // минимально: совпадающие поля + atoms/debug
  return {
    id: simSnapshot.id,
    time: simSnapshot.time,
    tickIndex: simSnapshot.tickIndex,
    characters: simSnapshot.characters,
    locations: simSnapshot.locations,
    events: simSnapshot.events,
    atoms: [],     // оркестратор заполнит
    debug: {},
  };
}

export function makeOrchestratorPlugin(registry: ProducerSpec[]): SimPlugin {
  const reg = buildRegistry(registry);
  // Persist previous orchestrator output across sim ticks.
  // Without this, temporal diffs inside the orchestrator are always relative to null.
  let prevSnapshot: any = null;

  return {
    id: 'plugin:orchestrator',
    afterSnapshot: ({ snapshot, record }) => {
      const goalSnapIn = toGoalLabSnapshot(snapshot);

      const { nextSnapshot, trace } = runTick({
        tickIndex: snapshot.tickIndex,
        snapshot: goalSnapIn,
        prevSnapshot,
        overrides: null,
        registry: reg,
        seed: null,
      });

      prevSnapshot = nextSnapshot;

      // сохраняем результат в record.plugins (симулятор сам по себе не зависит от этого)
      record.plugins = record.plugins || {};
      record.plugins['orchestrator'] = {
        snapshot: nextSnapshot,     // уже с atoms
        trace,
      };

      // при желании можно положить короткий лог и в simSnapshot.debug:
      record.snapshot.debug = record.snapshot.debug || {};
      record.snapshot.debug['orchestratorHumanLog'] = trace?.humanLog || [];
    },
  };
}
