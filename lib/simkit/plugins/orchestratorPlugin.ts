// lib/simkit/plugins/orchestratorPlugin.ts
// Plugin bridge: SimKit snapshot -> GoalLab snapshot -> orchestrator.

import type { SimPlugin } from '../core/simulator';
import type { SimAction, ActionOffer } from '../core/types';
import type { ProducerSpec } from '../../orchestrator/types';
import { runTick } from '../../orchestrator/runTick';
import { buildRegistry } from '../../orchestrator/registry';
import type { ContextAtom } from '../../context/v2/types';
import { derivePossibilitiesRegistry } from '../../possibilities/derive';
import type { Possibility } from '../../possibilities/catalog';
import { decideAction } from '../../decision/decide';

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

function softmaxProbs(xs: Array<{ key: string; score: number }>, T: number) {
  const t = Math.max(1e-6, Number.isFinite(T) ? T : 0);
  if (t < 1e-4) {
    const best = xs.slice().sort((a, b) => b.score - a.score)[0];
    return xs.map((x) => ({ ...x, prob: x.key === best.key ? 1 : 0 }));
  }
  const max = Math.max(...xs.map((x) => x.score));
  const ws = xs.map((x) => Math.exp((x.score - max) / t));
  const sum = ws.reduce((a, b) => a + b, 0) || 1;
  return xs.map((x, i) => ({ ...x, prob: clamp01(ws[i] / sum) }));
}

function sampleSoftmax<T extends { score: number }>(xs: T[], Tval: number, rngNext: () => number): T | null {
  if (!xs.length) return null;
  const t = Math.max(1e-6, Number.isFinite(Tval) ? Tval : 0);
  if (t < 1e-4) return xs.slice().sort((a, b) => b.score - a.score)[0];
  const max = Math.max(...xs.map((x) => x.score));
  const ws = xs.map((x) => Math.exp((x.score - max) / t));
  const sum = ws.reduce((a, b) => a + b, 0) || 1;
  let r = rngNext() * sum;
  for (let i = 0; i < xs.length; i += 1) {
    r -= ws[i];
    if (r <= 0) return xs[i];
  }
  return xs[xs.length - 1];
}

function keyFromPossibilityId(id: string): string {
  const parts = String(id || '').split(':');
  return parts[1] || parts[0] || '';
}

function isExecutableKey(k: string) {
  return k === 'wait' || k === 'rest' || k === 'talk' || k === 'observe' || k === 'ask_info' || k === 'negotiate';
}

function toSimActionFromPossibility(p: Possibility, tickIndex: number, actorId: string): SimAction | null {
  const k = keyFromPossibilityId(p.id);
  const targetId = (p as any)?.targetId ?? null;
  const kindMap: Record<string, string> = {
    wait: 'wait',
    rest: 'rest',
    talk: 'talk',
    observe: 'wait',
    ask_info: 'talk',
    negotiate: 'talk',
  };
  const kind = kindMap[k];
  if (!kind) return null;
  return {
    id: `act:${kind}:${tickIndex}:${actorId}:poss:${k}`,
    kind,
    actorId,
    targetId: targetId || null,
  };
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
  let lastDecisionTrace: any = null;

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
      const atomsAll = (nextSnapshot?.atoms || []) as ContextAtom[];

      const actions: SimAction[] = [];
      const perActor: Record<string, any> = {};
      for (const actorId of Object.keys(world.characters || {}).sort()) {
        const atoms = atomsAll.filter((a: any) => {
          const subj = (a as any)?.subject;
          return !subj || String(subj) === String(actorId);
        });

        const possAll = derivePossibilitiesRegistry({ selfId: actorId, atoms });
        const possExec = possAll.filter((p) => isExecutableKey(keyFromPossibilityId(p.id)));

        if (!possExec.length) {
          const byActor: Record<string, ActionOffer[]> = {};
          for (const o of offers) {
            const k = String(o.actorId);
            (byActor[k] = byActor[k] || []).push(o);
          }
          const bestOffer = pickSoftmax(byActor[actorId] || [], T, () => rng.next());
          if (bestOffer) {
            actions.push({
              id: `act:${bestOffer.kind}:${tickIndex}:${actorId}:orc:offer`,
              kind: bestOffer.kind,
              actorId,
              targetId: bestOffer.targetId ?? null,
            });
            perActor[actorId] = {
              actorId,
              mode: 'offer_fallback',
              T,
              chosen: {
                kind: bestOffer.kind,
                targetId: bestOffer.targetId ?? null,
                score: Number(bestOffer.score ?? 0),
                allowed: !bestOffer.blocked,
                reason: bestOffer.reason ?? null,
              },
            };
          }
          continue;
        }

        const decision = decideAction({ selfId: actorId, atoms, possibilities: possExec, topK: 20 });
        const ranked = decision.ranked || [];
        const allowed = ranked.filter((x) => Boolean(x?.allowed));

        const picked = sampleSoftmax(allowed.length ? allowed : ranked, T, () => rng.next());
        const chosen = picked?.p || null;
        const act = chosen ? toSimActionFromPossibility(chosen, tickIndex, actorId) : null;
        if (act) actions.push(act);

        const topForProb = (allowed.length ? allowed : ranked).slice(0, 25).map((x) => ({
          key: String(x?.p?.id || x?.id || ''),
          score: Number(x?.score ?? 0),
        }));
        const probs = softmaxProbs(topForProb, T);
        const chosenProb = chosen ? (probs.find((p) => p.key === chosen.id)?.prob ?? null) : null;

        perActor[actorId] = {
          actorId,
          mode: 'possibility',
          T,
          chosen: chosen ? {
            possibilityId: chosen.id,
            key: keyFromPossibilityId(chosen.id),
            simKind: act?.kind ?? null,
            targetId: (chosen as any)?.targetId ?? null,
            score: Number(picked?.score ?? decision.best?.score ?? 0),
            cost: Number(picked?.cost ?? decision.best?.cost ?? 0),
            allowed: Boolean(picked?.allowed ?? decision.best?.allowed ?? false),
            prob: chosenProb,
            blockedBy: (picked as any)?.why?.blockedBy || [],
            usedAtomIds: (picked as any)?.why?.usedAtomIds || [],
          } : null,
          topK: ranked.slice(0, 25).map((x) => ({
            possibilityId: x.p.id,
            key: keyFromPossibilityId(x.p.id),
            targetId: (x.p as any)?.targetId ?? null,
            score: Number(x.score ?? 0),
            cost: Number(x.cost ?? 0),
            allowed: Boolean(x.allowed),
            prob: probs.find((p) => p.key === x.p.id)?.prob ?? null,
            blockedBy: (x as any)?.why?.blockedBy || [],
          })),
        };
      }

      lastDecisionTrace = {
        tickIndex,
        tickId: `simkit:decide:${tickIndex}`,
        T,
        perActor,
      };

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
      if (lastDecisionTrace && lastDecisionTrace.tickIndex === snapshot.tickIndex) {
        record.plugins.orchestratorDecision = lastDecisionTrace;
      }

      // Optionally mirror short human log into snapshot.debug for quick visibility.
      record.snapshot.debug = record.snapshot.debug || {};
      record.snapshot.debug.orchestratorHumanLog = trace?.humanLog || [];
    },
  };
}
