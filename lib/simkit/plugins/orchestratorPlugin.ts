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

// -----------------------------
// small utils
// -----------------------------

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

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

function softmaxProbs(xs: Array<{ key: string; score: number }>, T: number) {
  const t = Math.max(1e-6, Number.isFinite(T) ? T : 0);

  if (!xs.length) return [] as Array<{ key: string; score: number; prob: number }>;

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

  // NOTE: keep mapping conservative; extend as you add more executable keys.
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

// -----------------------------
// Bridge: SimSnapshot -> GoalLabSnapshotV1Like
// Ensures we don't lose Kanonar entities and location map.
// -----------------------------
function toGoalLabSnapshot(simSnapshot: any): any {
  const charsIn = Array.isArray(simSnapshot?.characters) ? simSnapshot.characters : [];
  const locsIn = Array.isArray(simSnapshot?.locations) ? simSnapshot.locations : [];

  const characters = charsIn.map((c: any) => {
    const base = c?.entity ? { ...(c.entity as any) } : { id: c?.id, entityId: c?.id, title: c?.name };
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

// -----------------------------
// Plugin
// -----------------------------
export function makeOrchestratorPlugin(registry: ProducerSpec[]): SimPlugin {
  // Built-in producers for sim-phase + chosen-action atoms (helps GoalLab pipeline & debugging).
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
          patch: existing ? { add: [], update: [{ before: existing, after: atom }], remove: [] } : { add: [atom], update: [], remove: [] },
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
        const chosen = Array.isArray(ctx.snapshot?.debug?.simkit?.chosenActions) ? ctx.snapshot?.debug?.simkit?.chosenActions : [];
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
          if (existing) updates.push({ before: existing, after: atom });
          else adds.push(atom);
        }

        return {
          patch: { add: adds, update: updates, remove: [] },
          trace: {
            name: 'sim:action_chosen_atoms',
            version: '1',
            inputRefs: [],
            outputs: { atomsAdded: adds, atomsUpdated: updates, atomsRemoved: [] },
            why: [],
          },
        };
      },
    },
  ];

  const reg = buildRegistry([...registry, ...simkitProducers]);

  // Persist orchestrator output across sim ticks.
  let prevDecisionSnapshot: any = null;
  let prevPostSnapshot: any = null;

  // Carry atom state between pre/post passes and ticks to keep memory consistent.
  let lastAtoms: any[] = [];

  // Last decision trace per tick for UI.
  let lastDecisionTrace: any = null;

  return {
    id: 'plugin:orchestrator',

    decideActions: ({ world, offers, rng, tickIndex }) => {
      // 1) Pre-decision runTick: update atoms/context from current sim state (phase=pre)
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

      const preOut = runTick({
        tickIndex,
        snapshot: preSnap,
        prevSnapshot: prevDecisionSnapshot,
        overrides: null,
        registry: reg,
        seed: world.seed ?? null,
      });

      prevDecisionSnapshot = preOut.nextSnapshot;
      lastAtoms = (preOut.nextSnapshot?.atoms || []).slice();

      // 2) Decide per-actor using GoalLab possibilities (preferred), fallback to SimKit offers if none executable.
      const T = Number(world.facts?.['sim:T'] ?? 0.2);
      const atomsAll = (preOut.nextSnapshot?.atoms || []) as ContextAtom[];

      const actions: SimAction[] = [];
      const perActor: Record<string, any> = {};

      // Pre-index offers by actor once.
      const offersByActor: Record<string, ActionOffer[]> = {};
      for (const o of offers || []) {
        const k = String(o.actorId ?? '');
        (offersByActor[k] = offersByActor[k] || []).push(o);
      }

      for (const actorId of Object.keys(world.characters || {}).sort()) {
        // Actor-scoped atoms (if your atoms encode subject; otherwise this is harmless).
        const atoms = atomsAll.filter((a: any) => {
          const subj = (a as any)?.subject;
          return !subj || String(subj) === String(actorId);
        });

        // Possibility route.
        const possAll = derivePossibilitiesRegistry({ selfId: actorId, atoms });
        const possExec = possAll.filter((p) => isExecutableKey(keyFromPossibilityId(p.id)));

        if (possExec.length) {
          const decision = decideAction({ selfId: actorId, atoms, possibilities: possExec, topK: 20 });
          const ranked = decision.ranked || [];
          const allowed = ranked.filter((x) => Boolean(x?.allowed));

          const pool = (allowed.length ? allowed : ranked) as any[];
          const picked = sampleSoftmax(pool, T, () => rng.next());
          const chosen = picked?.p || null;

          const act = chosen ? toSimActionFromPossibility(chosen, tickIndex, actorId) : null;
          if (act) actions.push(act);

          // topK probs computed over same pool prefix (stable + explainable)
          const topForProb = pool.slice(0, 25).map((x) => ({
            key: String(x?.p?.id || x?.id || ''),
            score: Number(x?.score ?? 0),
          }));
          const probs = softmaxProbs(topForProb, T);
          const chosenProb = chosen ? probs.find((p) => p.key === chosen.id)?.prob ?? null : null;

          perActor[actorId] = {
            actorId,
            mode: 'possibility',
            T,
            chosen: chosen
              ? {
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
                  reason: (picked as any)?.why?.reason || null,
                }
              : null,
            topK: pool.slice(0, 25).map((x) => ({
              possibilityId: x.p?.id ?? x.id,
              key: keyFromPossibilityId(x.p?.id ?? x.id),
              targetId: (x.p as any)?.targetId ?? (x as any)?.targetId ?? null,
              score: Number(x.score ?? 0),
              cost: Number(x.cost ?? 0),
              allowed: Boolean(x.allowed),
              prob: probs.find((p) => p.key === (x.p?.id ?? x.id))?.prob ?? null,
              blockedBy: (x as any)?.why?.blockedBy || [],
              reason: (x as any)?.why?.reason || null,
            })),
          };

          continue;
        }

        // Fallback: SimKit offers route.
        const actorOffers = offersByActor[actorId] || [];
        const bestOffer = pickSoftmax(actorOffers, T, () => rng.next());
        if (!bestOffer) continue;

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
            simKind: bestOffer.kind,
            key: bestOffer.kind,
            targetId: bestOffer.targetId ?? null,
            score: Number(bestOffer.score ?? 0),
            cost: Number((bestOffer as any)?.cost ?? 0),
            allowed: !bestOffer.blocked,
            prob: null,
            blockedBy: [],
            reason: bestOffer.reason ?? null,
          },
          topK: actorOffers
            .filter((o) => Number.isFinite(o.score))
            .slice()
            .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
            .slice(0, 25)
            .map((o) => ({
              key: `${String(o.kind)}:${String(o.targetId ?? '')}`,
              kind: o.kind,
              targetId: o.targetId ?? null,
              score: Number(o.score ?? 0),
              cost: Number((o as any)?.cost ?? 0),
              allowed: !o.blocked,
              prob: null,
              blockedBy: o.blocked ? ['offer_blocked'] : [],
              reason: o.reason ?? null,
            })),
        };
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
      // chosenActions for post-pass atoms
      const chosenActions = lastDecisionTrace?.perActor
        ? Object.values(lastDecisionTrace.perActor || {})
            .map((d: any) => {
              const ch = d?.chosen;
              return {
                actorId: ch?.actorId ?? d?.actorId ?? null,
                kind: ch?.simKind ?? ch?.kind ?? null,
                targetId: ch?.targetId ?? null,
              };
            })
            .filter((x: any) => x.actorId && x.kind)
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

      const postOut = runTick({
        tickIndex: snapshot.tickIndex,
        snapshot: goalSnapIn,
        prevSnapshot: prevPostSnapshot,
        overrides: null,
        registry: reg,
        seed: snapshot?.debug?.simkit?.seed ?? null,
      });

      prevPostSnapshot = postOut.nextSnapshot;
      lastAtoms = (postOut.nextSnapshot?.atoms || []).slice();

      // Save orchestrator output into record.plugins
      record.plugins = record.plugins || {};
      record.plugins.orchestrator = { snapshot: postOut.nextSnapshot, trace: postOut.trace };

      if (lastDecisionTrace && lastDecisionTrace.tickIndex === snapshot.tickIndex) {
        record.plugins.orchestratorDecision = lastDecisionTrace;
      }

      // Quick visibility
      record.snapshot.debug = record.snapshot.debug || {};
      record.snapshot.debug.orchestratorHumanLog = postOut.trace?.humanLog || [];
    },
  };
}
