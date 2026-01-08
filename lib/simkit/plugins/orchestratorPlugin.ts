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

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function computeSoftmaxTopK(offers: ActionOffer[], T: number, topK: number) {
  const xs = offers
    .filter((o) => !o.blocked && Number.isFinite(o.score))
    .slice()
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(a.kind).localeCompare(String(b.kind)) ||
        String(a.targetId ?? '').localeCompare(String(b.targetId ?? ''))
    );

  const head = xs.slice(0, Math.max(1, topK));
  if (!head.length) return { items: [] as any[] };

  const t = Math.max(1e-6, Number.isFinite(T) ? T : 0);
  if (t < 1e-4) {
    // Greedy-ish: probability mass on best.
    const bestKey = `${head[0].kind}:${head[0].actorId}:${String(head[0].targetId ?? '')}`;
    return {
      items: head.map((o, i) => {
        const key = `${o.kind}:${o.actorId}:${String(o.targetId ?? '')}`;
        return {
          i,
          key,
          kind: o.kind,
          actorId: o.actorId,
          targetId: o.targetId ?? null,
          score: Number(o.score ?? 0),
          blocked: Boolean(o.blocked),
          reason: o.reason ?? null,
          prob: key === bestKey ? 1 : 0,
        };
      }),
    };
  }

  const max = Math.max(...head.map((o) => Number(o.score ?? 0)));
  const ws = head.map((o) => Math.exp((Number(o.score ?? 0) - max) / t));
  const sum = ws.reduce((a, b) => a + b, 0) || 1;
  return {
    items: head.map((o, i) => ({
      i,
      key: `${o.kind}:${o.actorId}:${String(o.targetId ?? '')}`,
      kind: o.kind,
      actorId: o.actorId,
      targetId: o.targetId ?? null,
      score: Number(o.score ?? 0),
      blocked: Boolean(o.blocked),
      reason: o.reason ?? null,
      prob: clamp01(ws[i] / sum),
    })),
  };
}

// Bridge: SimSnapshot -> GoalLabSnapshotV1Like (minimal, tolerant).
function toGoalLabSnapshot(simSnapshot: any): any {
  const charsIn = Array.isArray(simSnapshot?.characters) ? simSnapshot.characters : [];
  const locsIn = Array.isArray(simSnapshot?.locations) ? simSnapshot.locations : [];

  const characters = charsIn.map((c: any) => {
    const base = c?.entity ? { ...(c.entity as any) } : { id: c?.id, entityId: c?.id, title: c?.name };
    // Не перетираем канонические поля — simkit-срез кладём отдельно.
    (base as any).simkit = {
      locId: c?.locId ?? null,
      stress: c?.stress ?? null,
      health: c?.health ?? null,
      energy: c?.energy ?? null,
      tickIndex: simSnapshot?.tickIndex ?? null,
    };
    if ((base as any).locationId == null && c?.locId) (base as any).locationId = c.locId;
    return base;
  });

  const locations = locsIn.map((l: any) => {
    const base = l?.entity ? { ...(l.entity as any) } : { id: l?.id, entityId: l?.id, title: l?.name };
    if ((base as any).map == null && l?.map != null) (base as any).map = l.map;
    (base as any).simkit = {
      hazards: l?.hazards ?? null,
      norms: l?.norms ?? null,
      tickIndex: simSnapshot?.tickIndex ?? null,
    };
    return base;
  });

  return {
    id: simSnapshot?.id,
    time: simSnapshot?.time,
    tickIndex: simSnapshot?.tickIndex,
    characters,
    locations,
    events: simSnapshot?.events || [],
    atoms: [], // orchestrator will fill
    debug: simSnapshot?.debug || {},
  };
}

export function makeOrchestratorPlugin(registry: ProducerSpec[]): SimPlugin {
  const simkitProducers: ProducerSpec[] = [
    {
      stageId: 'stage:sim',
      name: 'sim:phase_atom',
      version: '1',
      priority: 100,
      run: (ctx) => {
        const phase = ctx.snapshot?.debug?.simkit?.phase;
        if (!phase) {
          return {
            patch: { add: [], update: [], remove: [] },
            trace: {
              name: 'sim:phase_atom',
              version: '1',
              inputRefs: [],
              outputs: { atomsAdded: [], atomsUpdated: [], atomsRemoved: [] },
              why: [],
            },
          };
        }

        const atom = {
          id: 'sim:phase',
          magnitude: 1,
          origin: 'derived' as const,
          ns: 'sim',
          kind: 'phase',
          label: `phase:${String(phase)}`,
          meta: { phase: String(phase) },
        };
        const existing = ctx.atomsIn.find((a) => a.id === atom.id);
        return {
          patch: existing
            ? { add: [], update: [{ before: existing, after: atom }], remove: [] }
            : { add: [atom], update: [], remove: [] },
          trace: {
            name: 'sim:phase_atom',
            version: '1',
            inputRefs: [],
            outputs: {
              atomsAdded: existing ? [] : [atom],
              atomsUpdated: existing ? [{ before: existing, after: atom }] : [],
              atomsRemoved: [],
            },
            why: [],
          },
        };
      },
    },
    {
      stageId: 'stage:decision',
      name: 'sim:action_chosen_atoms',
      version: '1',
      priority: 100,
      run: (ctx) => {
        const chosen = Array.isArray(ctx.snapshot?.debug?.simkit?.chosenActions)
          ? ctx.snapshot?.debug?.simkit?.chosenActions
          : [];
        if (!chosen.length) {
          return {
            patch: { add: [], update: [], remove: [] },
            trace: {
              name: 'sim:action_chosen_atoms',
              version: '1',
              inputRefs: [],
              outputs: { atomsAdded: [], atomsUpdated: [], atomsRemoved: [] },
              why: [],
            },
          };
        }

        const updates: { before: any; after: any }[] = [];
        const adds: any[] = [];
        for (const action of chosen) {
          const actorId = String(action?.actorId ?? '');
          if (!actorId) continue;
          const atom = {
            id: `action:chosen:${actorId}`,
            magnitude: 1,
            origin: 'derived' as const,
            ns: 'sim',
            kind: 'action',
            label: `chosen:${String(action?.kind ?? '')}`,
            meta: {
              kind: action?.kind ?? null,
              targetId: action?.targetId ?? null,
              actorId,
              tickId: ctx.tickId,
            },
          };
          const existing = ctx.atomsIn.find((a) => a.id === atom.id);
          if (existing) {
            updates.push({ before: existing, after: atom });
          } else {
            adds.push(atom);
          }
        }

        return {
          patch: { add: adds, update: updates, remove: [] },
          trace: {
            name: 'sim:action_chosen_atoms',
            version: '1',
            inputRefs: [],
            outputs: {
              atomsAdded: adds,
              atomsUpdated: updates,
              atomsRemoved: [],
            },
            why: [],
          },
        };
      },
    },
  ];
  const reg = buildRegistry([...registry, ...simkitProducers]);

  // Persist previous orchestrator output across sim ticks.
  // Without this, temporal diffs inside the orchestrator are always relative to null.
  let prevDecisionSnapshot: any = null;
  let prevPostSnapshot: any = null;
  let lastDecisionTrace: any = null;
  // Carry atom state between pre/post passes and ticks to keep memory consistent.
  let lastAtoms: any[] = [];

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
        atoms: lastAtoms,
        debug: {
          simkit: {
            phase: 'pre',
            T: world.facts?.['sim:T'] ?? 0.2,
            offers,
            seed: world.seed ?? null,
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
      lastAtoms = (nextSnapshot?.atoms || []).slice();

      // Softmax policy: T -> 0 ~ greedy; larger T -> more stochastic.
      const T = Number(world.facts?.['sim:T'] ?? 0.2);

      const byActor: Record<string, ActionOffer[]> = {};
      for (const o of offers) {
        const k = String(o.actorId);
        (byActor[k] = byActor[k] || []).push(o);
      }

      const actions: SimAction[] = [];
      const perActor: Record<string, any> = {};
      for (const actorId of Object.keys(world.characters || {}).sort()) {
        const actorOffers = byActor[actorId] || [];
        const top = computeSoftmaxTopK(actorOffers, T, 25);
        const best = pickSoftmax(actorOffers, T, () => rng.next());
        if (!best) continue;

        const chosenKey = `${best.kind}:${best.actorId}:${String(best.targetId ?? '')}`;
        const chosenProb = (top.items || []).find((x: any) => x.key === chosenKey)?.prob ?? null;
        perActor[actorId] = {
          actorId,
          T,
          chosen: {
            kind: best.kind,
            actorId: best.actorId,
            targetId: best.targetId ?? null,
            score: Number(best.score ?? 0),
            prob: chosenProb,
            reason: best.reason ?? null,
            blocked: Boolean(best.blocked),
          },
          topK: top.items || [],
        };

        actions.push({
          id: `act:${best.kind}:${tickIndex}:${actorId}:orc`,
          kind: best.kind,
          actorId,
          targetId: best.targetId ?? null,
        });
      }

      lastDecisionTrace = {
        tickIndex,
        tickId: `simkit:decide:${tickIndex}`,
        T,
        actorCount: Object.keys(perActor).length,
        perActor,
      };

      return actions;
    },

    afterSnapshot: ({ snapshot, record }) => {
      const chosenActions = lastDecisionTrace?.perActor
        ? Object.values(lastDecisionTrace.perActor || {}).map((d: any) => ({
          actorId: d?.chosen?.actorId ?? d?.actorId ?? null,
          kind: d?.chosen?.kind ?? null,
          targetId: d?.chosen?.targetId ?? null,
        }))
        : (record?.trace?.actionsApplied || []).map((a: any) => ({
          actorId: a?.actorId ?? null,
          kind: a?.kind ?? null,
          targetId: a?.targetId ?? null,
        }));
      const goalSnapIn = {
        ...toGoalLabSnapshot(snapshot),
        atoms: lastAtoms,
        debug: {
          ...(snapshot?.debug || {}),
          simkit: {
            ...(snapshot?.debug?.simkit || {}),
            phase: 'post',
            chosenActions,
          },
        },
      };

      const { nextSnapshot, trace } = runTick({
        tickIndex: snapshot.tickIndex,
        snapshot: goalSnapIn,
        prevSnapshot: prevPostSnapshot,
        overrides: null,
        registry: reg,
        seed: snapshot?.debug?.simkit?.seed ?? null,
      });

      prevPostSnapshot = nextSnapshot;
      lastAtoms = (nextSnapshot?.atoms || []).slice();

      // Save orchestrator output into record.plugins (simulator core does not depend on this)
      record.plugins = record.plugins || {};
      record.plugins.orchestrator = { snapshot: nextSnapshot, trace };
      if (lastDecisionTrace && lastDecisionTrace.tickIndex === snapshot.tickIndex) {
        record.plugins.orchestratorDecision = lastDecisionTrace;
      }

      // Optionally mirror short human log into snapshot.debug for quick visibility.
      record.snapshot.debug = record.snapshot.debug || {};
      record.snapshot.debug.orchestratorHumanLog = trace?.humanLog || [];
    },
  };
}
