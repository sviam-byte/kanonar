// lib/simkit/plugins/orchestratorPlugin.ts
// Plugin bridge: SimKit snapshot -> GoalLab snapshot -> orchestrator.

import type { SimPlugin } from '../core/simulator';
import type { SimAction, ActionOffer } from '../core/types';
import type { DecisionExplanationV1, ProducerSpec, TickDebugFrameV1, TickDebugStageV1 } from '../../orchestrator/types';
import { atomsFromSpeechEvent } from '../../context/v2/ingestSpeech';
import { runTick } from '../../orchestrator/runTick';
import { buildRegistry } from '../../orchestrator/registry';
import type { ContextAtom } from '../../context/v2/types';
import { derivePossibilitiesRegistry } from '../../possibilities/derive';
import { decideAction } from '../../decision/decide';
import { buildActionCandidates } from '../../decision/actionCandidateUtils';
import { keyFromPossibilityId } from '../actions/fromPossibility';
import { toSimAction } from '../actions/fromActionCandidate';

// -----------------------------
// small utils
// -----------------------------

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

// Read actor filter from world.facts['sim:actors'] (array or comma-separated string).
function readActorFilter(world: any): string[] | null {
  const raw = world?.facts?.['sim:actors'];
  if (!raw) return null;

  if (Array.isArray(raw)) {
    return raw.map((x) => String(x || '').trim()).filter(Boolean);
  }

  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((x) => String(x || '').trim())
      .filter(Boolean);
  }

  return null;
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

function isExecutableKey(k: string) {
  return (
    k === 'wait' ||
    // NOTE: rest/talk/question_about are now INTENTS (start_intent), not direct actions
    k === 'rest' ||
    k === 'talk' ||
    k === 'move' ||
    k === 'observe' ||
    k === 'question_about' ||
    k === 'negotiate' ||
    k === 'inspect_feature' ||
    k === 'repair_feature' ||
    k === 'scavenge_feature' ||
    k === 'ask_info' // legacy alias -> question_about
  );
}

function isTrivialKey(k: string) {
  // Keys that represent "doing nothing" or extremely low-commitment sensing.
  return k === 'wait' || k === 'observe';
}

function hasNonTrivialOffer(offers: ActionOffer[]) {
  // If SimKit has ANY meaningful non-blocked action besides wait/rest,
  // we prefer it over "wait" from possibilities (which exists unconditionally).
  return (offers || []).some((o) => !o.blocked && o.kind !== 'wait' && o.kind !== 'rest');
}

// Count atoms by subject for UI summaries.
function countAtomsBySubject(atomsAll: any[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of atomsAll || []) {
    const subj = String((a as any)?.subject || 'global');
    out[subj] = (out[subj] || 0) + 1;
  }
  return out;
}

// Helper to build a debug stage with consistent shape.
function makeStage(id: TickDebugStageV1['id'], title: string, data: Record<string, any>): TickDebugStageV1 {
  return { id, title, data };
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
    // важно для WorldState-пайплайна: Stage0/relations ожидают world.agents[] с entityId/locationId
    if ((base as any).entityId == null && c?.id) (base as any).entityId = c.id;
    if ((base as any).id == null && c?.id) (base as any).id = c.id;
    return base;
  });

  const locations = locsIn.map((l: any) => {
    // ВАЖНО: не теряем GoalLab place.map / image / nav / features
    const base = (l && typeof l === 'object') ? { ...l } : { id: String(l) };
    const id = base.id ?? l?.locationId ?? l?.entityId;
    return {
      ...base,
      id,
      title: base.title ?? base.name ?? id,
      // normalize: иногда картинка лежит в base.image, иногда в base.map.image
      map: base.map ?? (base.image ? { image: base.image } : null),
      simkit: {
        hazards: base.hazards ?? l?.hazards ?? null,
        norms: base.norms ?? l?.norms ?? null,
        tickIndex: simSnapshot?.tickIndex ?? null,
      },
    };
  });

  const tickIndex = simSnapshot?.tickIndex ?? 0;
  const base = {
    id: simSnapshot?.id,
    time: simSnapshot?.time,
    tickIndex: simSnapshot?.tickIndex,
    // WorldState-совместимость (Stage0/relations/world.locations.ts)
    tick: simSnapshot?.tickIndex ?? 0,
    agents: characters,
    characters,
    locations,
    // на некоторых местах код ожидает "entities" как алиас
    entities: characters,
    events: simSnapshot?.events || [],
    atoms: [], // orchestrator will fill; speech ingestion below adds initial atoms
    debug: simSnapshot?.debug || {},
  };

  // PROTO: ingest speech events into ContextAtoms for targets.
  const evs = Array.isArray(base.events) ? base.events : [];
  for (const e of evs) {
    if (e?.type !== 'speech:v1') continue;
    const payload = e?.payload;
    const atoms = atomsFromSpeechEvent(payload, tickIndex);
    for (const a of atoms) base.atoms.push(a);
  }

  return base;
}

// -----------------------------
// Plugin
// -----------------------------
export function makeOrchestratorPlugin(opts: { registry?: any; onPushToGoalLab?: any }): SimPlugin {
  const registry = Array.isArray(opts?.registry) ? opts.registry : [];
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
  // High-level per-tick debug frame (S0..S6).
  let lastDebugFrame: TickDebugFrameV1 | null = null;

  // Ring buffer of high-level tick debug frames.
  const debugFrames: TickDebugFrameV1[] = [];
  const DEBUG_FRAMES_MAX = 80;

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
      const baseTRaw = Number(world.facts?.['sim:T']);
      const baseT = Number.isFinite(baseTRaw) ? baseTRaw : 0.2;
      const atomsAll = (preOut.nextSnapshot?.atoms || []) as ContextAtom[];
      const atomsBySubject = countAtomsBySubject(atomsAll as any);

      const actions: SimAction[] = [];
      const perActor: Record<string, any> = {};
      const explanations: Record<string, DecisionExplanationV1> = {};

      // Pre-index offers by actor once.
      const offersByActor: Record<string, ActionOffer[]> = {};
      for (const o of offers || []) {
        const k = String(o.actorId ?? '');
        (offersByActor[k] = offersByActor[k] || []).push(o);
      }

      // Respect the "active cast" from world.facts['sim:actors'], falling back to all characters.
      const actorFilter = readActorFilter(world);
      const actorIds = (actorFilter && actorFilter.length ? actorFilter : Object.keys(world.characters || {}))
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .filter((id) => Boolean((world.characters || {})[id]))
        .sort();

      for (const actorId of actorIds) {
        // Actor-scoped atoms (if your atoms encode subject; otherwise this is harmless).
        const atoms = atomsAll.filter((a: any) => {
          const subj = (a as any)?.subject;
          return !subj || String(subj) === String(actorId);
        });

        const actorOffers = offersByActor[actorId] || [];

        // Per-actor temperature: makes characters diverge even under same world settings.
        // Uses trait.decisionTemperature (0..1) as variability knob.
        const tAtom = atoms.find((a: any) => a?.id === `feat:char:${actorId}:trait.decisionTemperature`);
        const traitT = clamp01(Number((tAtom as any)?.magnitude ?? 0.35));
        const T = Math.max(0.02, Math.min(1.5, Math.max(0, baseT) * (0.55 + 0.90 * traitT)));

        // Possibility route.
        const possAll = derivePossibilitiesRegistry({ selfId: actorId, atoms });
        const possExec = possAll.filter((p) => isExecutableKey(keyFromPossibilityId(p.id)));

        if (possExec.length) {
          const { actions, goalEnergy } = buildActionCandidates({ selfId: actorId, atoms, possibilities: possExec });
          const decision = decideAction({
            actions,
            goalEnergy,
            topK: 20,
            rng: () => rng.next(),
            prevActionId: (world as any)?.facts?.[`lastAction:${actorId}`]?.id ?? null,
            minConfidence: (world as any)?.decisionMinConfidence,
            momentumBonus: (world as any)?.decisionMomentumBonus,
            temperature: T,
          });
          const ranked = decision.ranked || [];
          const pool = ranked.map((x) => ({ ...x, score: x.q }));
          const picked = sampleSoftmax(pool, T, () => rng.next());
          const chosen = decision.best || picked?.action || null;
          const chosenKey = chosen ? keyFromPossibilityId(chosen.id) : '';

          // If the possibility layer only yields "do nothing" (wait/observe) but SimKit offers
          // contain a meaningful non-trivial action, prefer offers. This prevents the common
          // failure mode where wait exists unconditionally and blocks offer-based motion/work.
          const shouldOverrideWithOffer = Boolean(chosen && isTrivialKey(chosenKey) && hasNonTrivialOffer(actorOffers));

          let act: SimAction | null = null;
          let overriddenOffer: ActionOffer | null = null;
          if (shouldOverrideWithOffer) {
            overriddenOffer = pickSoftmax(actorOffers, T, () => rng.next());
            if (overriddenOffer) {
              act = {
                id: `act:${overriddenOffer.kind}:${tickIndex}:${actorId}:orc:offer_override:${chosenKey}`,
                kind: overriddenOffer.kind,
                actorId,
                targetId: overriddenOffer.targetId ?? null,
                targetNodeId: (overriddenOffer as any).targetNodeId ?? null,
                meta: (overriddenOffer as any).meta ?? null,
              };
            }
          }

          if (!act && chosen) act = toSimAction(chosen, tickIndex);
          if (act) actions.push(act);

          // topK probs computed over same pool prefix (stable + explainable)
          const topForProb = pool.slice(0, 25).map((x) => ({
            key: String(x?.action?.id || ''),
            score: Number(x?.score ?? 0),
          }));
          const probs = softmaxProbs(topForProb, T);
          const chosenProb = chosen ? probs.find((p) => p.key === chosen.id)?.prob ?? null : null;

          const chosenScore = chosen
            ? (ranked.find((x) => x.action.id === chosen.id)?.q ?? 0)
            : 0;
          const chosenSupportIds = chosen
            ? chosen.supportAtoms.map((a) => a?.id).filter(Boolean)
            : [];

          perActor[actorId] = {
            actorId,
            mode: overriddenOffer ? 'offer_override' : 'possibility',
            T,
            chosen: chosen
              ? {
                  possibilityId: chosen.id,
                  key: keyFromPossibilityId(chosen.id),
                  simKind: act?.kind ?? null,
                  targetId: chosen.targetId ?? null,
                  score: Number(chosenScore ?? 0),
                  cost: Number(chosen.cost ?? 0),
                  allowed: true,
                  prob: chosenProb,
                  blockedBy: [],
                  usedAtomIds: chosenSupportIds,
                  reason: overriddenOffer
                    ? `override: ${chosenKey} -> offer:${String(overriddenOffer.kind)} (${String(overriddenOffer.reason || '')})`
                    : null,
                }
              : null,
            offerOverride: overriddenOffer
              ? {
                  kind: overriddenOffer.kind,
                  targetId: overriddenOffer.targetId ?? null,
                  score: Number(overriddenOffer.score ?? 0),
                  blocked: Boolean(overriddenOffer.blocked),
                  reason: overriddenOffer.reason ?? null,
                }
              : null,
            topK: pool.slice(0, 25).map((x) => ({
              possibilityId: x.action?.id ?? '',
              key: keyFromPossibilityId(x.action?.id ?? ''),
              targetId: x.action?.targetId ?? null,
              score: Number(x.q ?? 0),
              cost: Number(x.action?.cost ?? 0),
              allowed: true,
              prob: probs.find((p) => p.key === (x.action?.id ?? ''))?.prob ?? null,
              blockedBy: [],
              reason: null,
            })),
            rejected: [],
            rejectedCount: 0,
          };

          const chosenId = overriddenOffer
            ? `offer:${String(overriddenOffer.kind)}:${String(overriddenOffer.targetId ?? '')}`
            : (chosen?.id ?? '');
          const explanationNotes = overriddenOffer
            ? [`override:${chosenKey} -> offer:${String(overriddenOffer.kind)}`]
            : [];
          if (chosenId) {
            explanations[actorId] = {
              schema: 'DecisionExplanationV1',
              tickIndex,
              selfId: actorId,
              chosen: {
                id: chosenId,
                key: overriddenOffer ? String(overriddenOffer.kind) : String(chosenKey),
                score: Number(overriddenOffer?.score ?? chosenScore ?? 0),
                blocked: overriddenOffer ? Boolean(overriddenOffer.blocked) : false,
                targetId: overriddenOffer?.targetId ?? chosen?.targetId ?? null,
                meta: overriddenOffer ? { mode: 'offer_override', reason: overriddenOffer.reason ?? null } : { mode: 'possibility' },
              },
              topOffers: ranked.slice(0, 8).map((x: any) => ({
                id: x.action?.id ?? '',
                key: keyFromPossibilityId(x.action?.id ?? ''),
                score: Number(x.q ?? 0),
                blocked: false,
                targetId: x.action?.targetId ?? null,
                why: null,
              })),
              inputs: { temperature: T, rngSeed: world.seed ?? null },
              notes: explanationNotes.length ? explanationNotes : undefined,
            };
          }

          continue;
        }

        // Fallback: SimKit offers route.
        const bestOffer = pickSoftmax(actorOffers, T, () => rng.next());
        if (!bestOffer) continue;

        actions.push({
          id: `act:${bestOffer.kind}:${tickIndex}:${actorId}:orc:offer`,
          kind: bestOffer.kind,
          actorId,
          targetId: bestOffer.targetId ?? null,
          targetNodeId: (bestOffer as any).targetNodeId ?? null,
          meta: (bestOffer as any).meta ?? null,
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
          rejected: actorOffers
            .filter((o) => Boolean(o.blocked))
            .slice(0, 50)
            .map((o) => ({
              key: `${String(o.kind)}:${String(o.targetId ?? '')}`,
              kind: o.kind,
              targetId: o.targetId ?? null,
              score: Number(o.score ?? 0),
              cost: Number((o as any)?.cost ?? 0),
              allowed: false,
              blockedBy: ['offer_blocked'],
              reason: o.reason ?? null,
            })),
          rejectedCount: actorOffers.filter((o) => Boolean(o.blocked)).length,
        };

        explanations[actorId] = {
          schema: 'DecisionExplanationV1',
          tickIndex,
          selfId: actorId,
          chosen: {
            id: `offer:${String(bestOffer.kind)}:${String(bestOffer.targetId ?? '')}`,
            key: String(bestOffer.kind),
            score: Number(bestOffer.score ?? 0),
            blocked: Boolean(bestOffer.blocked),
            targetId: bestOffer.targetId ?? null,
            meta: { mode: 'offer_fallback', reason: bestOffer.reason ?? null },
          },
          topOffers: actorOffers
            .filter((o) => Number.isFinite(o.score))
            .slice()
            .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
            .slice(0, 8)
            .map((o) => ({
              id: `offer:${String(o.kind)}:${String(o.targetId ?? '')}`,
              key: String(o.kind),
              score: Number(o.score ?? 0),
              blocked: Boolean(o.blocked),
              targetId: o.targetId ?? null,
              why: null,
            })),
          inputs: { temperature: T, rngSeed: world.seed ?? null },
        };
      }

      lastDecisionTrace = {
        tickIndex,
        tickId: `simkit:decide:${tickIndex}`,
        T,
        actorCount: Object.keys(perActor).length,
        perActor,
        explanations,
        preTrace: preOut.trace,
        atomsDigest: {
          atomsTotal: atomsAll.length,
          atomsBySubject,
        },
      };

      // High-level debug frame (S0..S6). S5/S6 will be completed in afterSnapshot().
      const df: TickDebugFrameV1 = {
        schema: 'KanonarTickDebugFrameV1',
        tickIndex,
        tickId: `simkit:tick:${tickIndex}`,
        time: preSnap.time,
        preTraceTickId: preOut.trace?.tickId ?? null,
        stages: [
          makeStage('S0', 'Input', {
            seed: world.seed ?? null,
            T,
            actors: actorIds,
            locations: Object.keys(world.locations || {}).sort(),
            eventsCount: Array.isArray(world.events) ? world.events.length : 0,
            pluginMode: 'possibilities',
          }),
          makeStage('S1', 'Atoms', {
            atomsTotal: atomsAll.length,
            atomsBySubject,
            humanLog: preOut.trace?.humanLog || [],
          }),
          makeStage('S2', 'Goals', { note: 'pending (Goal atoms not split yet)' }),
          makeStage('S3', 'Offers', {
            perActor: Object.fromEntries(
              Object.entries(perActor).map(([aid, d]: any) => [
                aid,
                {
                  mode: d?.mode,
                  topK: d?.topK || [],
                  rejectedCount: d?.rejectedCount ?? 0,
                  rejected: d?.rejected || [],
                },
              ]),
            ),
          }),
          makeStage('S4', 'Decision', {
            perActor: Object.fromEntries(Object.entries(perActor).map(([aid, d]: any) => [aid, { chosen: d?.chosen || null }])),
          }),
          makeStage('S5', 'Consequences', { pending: true }),
          makeStage('S6', 'Output', { pending: true }),
        ],
      };

      (lastDecisionTrace as any).debugFrame = df;

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

        // Finalize high-level debug frame.
        const df: TickDebugFrameV1 | null = (lastDecisionTrace as any).debugFrame || null;
        if (df) {
          df.postTraceTickId = postOut.trace?.tickId ?? null;

          // Best-effort: simulator record traces (may be absent).
          const applied = Array.isArray((record as any)?.trace?.actionsApplied) ? (record as any).trace.actionsApplied : [];
          const emitted = Array.isArray((record as any)?.trace?.eventsEmitted) ? (record as any).trace.eventsEmitted : [];

          const s5 = df.stages.find((s) => s.id === 'S5');
          if (s5) {
            s5.data = {
              pending: false,
              actionsApplied: applied,
              eventsEmitted: emitted,
              chosenActions,
            };
          }

          const s6 = df.stages.find((s) => s.id === 'S6');
          if (s6) {
            s6.data = {
              pending: false,
              postHumanLog: postOut.trace?.humanLog || [],
              atomsOutCount: postOut.trace?.atomsOutCount ?? null,
            };
          }

          lastDebugFrame = df;
          debugFrames.push(df);
          while (debugFrames.length > DEBUG_FRAMES_MAX) debugFrames.shift();

          // удобные поля для UI
          record.plugins.orchestratorDebugFrame = df;
          record.plugins.orchestratorDebug = { current: df, history: debugFrames.slice() };
        }
      }

      // Quick visibility
      record.snapshot.debug = record.snapshot.debug || {};
      record.snapshot.debug.orchestratorHumanLog = postOut.trace?.humanLog || [];
      if (lastDecisionTrace?.explanations && lastDecisionTrace.tickIndex === snapshot.tickIndex) {
        record.snapshot.debug.explanations = lastDecisionTrace.explanations;
      }
    },
  };
}
