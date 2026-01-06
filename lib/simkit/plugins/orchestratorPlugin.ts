// lib/simkit/plugins/orchestratorPlugin.ts
// Plugin bridge: SimKit snapshot -> GoalLab snapshot -> orchestrator.

import type { SimPlugin } from '../core/simulator';
import type { ProducerSpec } from '../../orchestrator/types';
import type { SimAction, ActionOffer } from '../core/types';
import { runTick } from '../../orchestrator/runTick';
import { buildRegistry } from '../../orchestrator/registry';

// Helper: softmax sampling (deterministic via rng) with temperature control.
function pickSoftmax(offers: ActionOffer[], T: number, rngNext: () => number): ActionOffer | null {
  const xs = offers.filter((o) => !o.blocked && Number.isFinite(o.score) && o.score > 0);
  if (!xs.length) return null;

  const t = Math.max(1e-6, Number.isFinite(T) ? T : 0);
  if (t < 1e-4) return xs.slice().sort((a, b) => b.score - a.score)[0];

  const max = Math.max(...xs.map((o) => o.score));
  const ws = xs.map((o) => Math.exp((o.score - max) / t));
  const sum = ws.reduce((a, b) => a + b, 0) || 1;
  let r = rngNext() * sum;
  for (let i = 0; i < xs.length; i++) {
    r -= ws[i];
    if (r <= 0) return xs[i];
  }
  return xs[xs.length - 1];
}

// Bridge: SimSnapshot -> GoalLabSnapshotV1Like (minimal, tolerant).
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
  let prevDecisionSnapshot: any = null;
  let prevPostSnapshot: any = null;

  return {
    id: 'orchestrator',
    decideActions: ({ world, offers, rng, tickIndex }) => {
      // 1) pre-snapshot for orchestrator (minimal; we mainly need atom updates + context)
      const pre = {
        id: `simkit:pre:${tickIndex}`,
        time: new Date().toISOString(),
        tickIndex,
        characters: Object.values(world.characters),
        locations: Object.values(world.locations),
        events: (world.events || []).slice(),
        atoms: [],
        debug: {
          simkit: {
            offers,
            T: world.facts?.['sim:T'] ?? 0.2,
          },
        },
      };

      // 2) run orchestrator before decision to update atoms/context for decision loop
      const { nextSnapshot } = runTick({
        tickIndex,
        snapshot: pre,
        prevSnapshot: prevDecisionSnapshot,
        overrides: null,
        registry: reg,
        seed: null,
      });
      prevDecisionSnapshot = nextSnapshot;

      // 3) choose actions via simple softmax on offers using temperature T
      const T = Number(pre.debug?.simkit?.T ?? 0.2);
      const actions: SimAction[] = [];

      const byActor: Record<string, ActionOffer[]> = {};
      for (const o of offers) {
        if (!byActor[o.actorId]) byActor[o.actorId] = [];
        byActor[o.actorId].push(o);
      }

      const actorIds = Object.keys(world.characters).sort();
      for (const actorId of actorIds) {
        const best = pickSoftmax(byActor[actorId] || [], T, () => rng.next());
        if (!best) continue;
        actions.push({
          id: `act:${best.kind}:${tickIndex}:${actorId}:orc`,
          kind: best.kind,
          actorId,
          targetId: best.targetId ?? null,
        });
      }

      return actions;
    },
    afterSnapshot: ({ snapshot, record }) => {
      const goalSnapIn = toGoalLabSnapshot(snapshot);

      const { nextSnapshot, trace } = runTick({
        tickIndex: snapshot.tickIndex,
        snapshot: goalSnapIn,
        prevSnapshot: prevPostSnapshot,
        overrides: null,
        registry: reg,
        seed: null,
      });

      prevPostSnapshot = nextSnapshot;

      // Save orchestrator output into record.plugins (simulator core does not depend on this)
      record.plugins = record.plugins || {};
      record.plugins.orchestrator = {
        snapshot: nextSnapshot, // with atoms
        trace,
      };

      // Mirror trace into snapshot.debug for UI convenience.
      record.snapshot.debug = record.snapshot.debug || {};
      record.snapshot.debug.orchestrator = trace;
      record.snapshot.debug.orchestratorHumanLog = trace?.humanLog || [];
    },
  };
}
