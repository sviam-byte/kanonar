// lib/simkit/plugins/orchestratorPlugin.ts
// Plugin bridge: SimKit snapshot -> GoalLab snapshot -> orchestrator.

import type { SimPlugin } from '../core/simulator';
import type { ProducerSpec } from '../../orchestrator/types';
import { runTick } from '../../orchestrator/runTick';
import { buildRegistry } from '../../orchestrator/registry';

// Bridge: SimSnapshot -> GoalLabSnapshotV1Like (minimal, tolerant)
function toGoalLabSnapshot(simSnapshot: any): any {
  return {
    id: simSnapshot?.id,
    time: simSnapshot?.time,
    tickIndex: simSnapshot?.tickIndex,
    characters: simSnapshot?.characters || [],
    locations: simSnapshot?.locations || [],
    events: simSnapshot?.events || [],
    atoms: [], // orchestrator will fill
    debug: simSnapshot?.debug || {},
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

      // Save orchestrator output into record.plugins (simulator core does not depend on this)
      record.plugins = record.plugins || {};
      record.plugins.orchestrator = {
        snapshot: nextSnapshot, // with atoms
        trace,
      };

      // Optionally mirror short human log into snapshot.debug for quick visibility
      record.snapshot.debug = record.snapshot.debug || {};
      record.snapshot.debug.orchestratorHumanLog = trace?.humanLog || [];
    },
  };
}
