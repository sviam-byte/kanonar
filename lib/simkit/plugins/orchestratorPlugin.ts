// lib/simkit/plugins/orchestratorPlugin.ts
// Plugin bridge: SimKit snapshot -> GoalLab snapshot -> orchestrator.

import type { SimPlugin } from '../core/simulator';
import type { SimAction, ActionOffer } from '../core/types';
import type { ProducerSpec } from '../../orchestrator/types';
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
    id: 'plugin:orchestrator',

    decideActions: ({ world, offers, rng, tickIndex }) => {
      // Pre-decision snapshot: we reuse orchestrator to update atoms/context before choosing actions.
      const preSnap: any = {
        id: `simkit:pre:${tickIndex}`,
        time: new Date().toISOString(),
        tickIndex,
        characters: Object.values(world.characters || {}),
        locations: Object.values(world.locations || {}),
        events: (world.events || []).slice(),
        atoms: [],
        debug: {
          simkit: {
            phase: 'pre',
            T: world.facts?.['sim:T'] ?? 0.2,
            offers,
          },
        },
      };

      const { nextSnapshot } = runTick({
        tickIndex,
        snapshot: preSnap,
        prevSnapshot: prevDecisionSnapshot,
        overrides: null,
        registry: reg,
        seed: world.seed ?? null,
      });

      prevDecisionSnapshot = nextSnapshot;

      // Softmax policy: T -> 0 ~ greedy; larger T -> more stochastic.
      const T = Number(world.facts?.['sim:T'] ?? 0.2);

      const byActor: Record<string, ActionOffer[]> = {};
      for (const o of offers) {
        const k = String(o.actorId);
        (byActor[k] = byActor[k] || []).push(o);
      }

      const actions: SimAction[] = [];
      for (const actorId of Object.keys(world.characters || {}).sort()) {
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
      record.plugins.orchestrator = { snapshot: nextSnapshot, trace };

      // Optionally mirror short human log into snapshot.debug for quick visibility.
      record.snapshot.debug = record.snapshot.debug || {};
      record.snapshot.debug.orchestratorHumanLog = trace?.humanLog || [];
    },
  };
}
