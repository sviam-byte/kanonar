// lib/simkit/plugins/fullOrchestratorPlugin.ts
// Full atomic-tick orchestrator (PRE -> APPLY via decideActions, plus trace in afterSnapshot).
//
// Incremental bridge:
// - Action enumeration uses SimKit proposeActions() offers.
// - GoalLab pipeline provides atomistic context for scoring.
// - Choice is sampled with temperature T using the simulator RNG.
// - POST step stores observed action events as belief atoms (minimal v0).

import type { SimPlugin } from '../core/simulator';
import type { SimWorld, SimSnapshot, ActionOffer, SimAction } from '../core/types';
import { EntityType, type WorldState } from '../../../types';
import { runGoalLabPipelineV1 } from '../../goal-lab/pipeline/runPipelineV1';
import type { ContextAtom } from '../../context/v2/types';
import type { Possibility } from '../../possibilities/catalog';
import { decideAction } from '../../decision/decide';
import { buildActionCandidates } from '../../decision/actionCandidateUtils';

function arr<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function toDomainEvents(snapshot: SimSnapshot): any[] {
  return arr<any>((snapshot as any)?.events).map((e: any) => {
    const p = (e && typeof e === 'object') ? (e.payload || {}) : {};
    const actorId = String(p.actorId ?? p.actor ?? 'system');
    const targetId = p.targetId != null ? String(p.targetId) : undefined;
    const locationId = (p.locationId != null)
      ? String(p.locationId)
      : (p.locId != null ? String(p.locId) : undefined);
    const magnitude = clamp01(Number(p.magnitude ?? p.severity ?? 0.5));
    return {
      kind: String(e?.type ?? 'event'),
      actorId,
      targetId,
      magnitude,
      context: { locationId },
      meta: { simEventId: e?.id, payload: p },
    };
  });
}

function buildWorldStateFromSim(
  world: SimWorld,
  snapshot: SimSnapshot,
  opts?: { beliefAtomsByAgentId?: Record<string, any[]> }
): WorldState {
  const chars = arr<any>((snapshot as any)?.characters);
  const locs = arr<any>((snapshot as any)?.locations);

  const agents = chars.map((c: any) => {
    const entityId = String(c?.id);
    const locId = String(c?.locId ?? 'loc:unknown');
    return {
      entityId,
      type: EntityType.Character,
      title: String(c?.name ?? entityId),
      locationId: locId,
      memory: { beliefAtoms: arr(opts?.beliefAtomsByAgentId?.[entityId]) },
      params: {
        stress: clamp01(Number(c?.stress ?? 0)),
        health: clamp01(Number(c?.health ?? 1)),
        energy: clamp01(Number(c?.energy ?? 1)),
      },
    } as any;
  });

  const locations = locs.map((l: any) => {
    const entityId = String(l?.id);
    return {
      entityId,
      type: EntityType.Location,
      title: String(l?.name ?? entityId),
      tags: arr<string>(l?.tags),
      hazards: l?.hazards || {},
      norms: l?.norms || {},
      neighbors: arr<string>(l?.neighbors),
    } as any;
  });

  return {
    tick: Number((world as any)?.tickIndex ?? (snapshot as any)?.tickIndex ?? 0),
    agents,
    locations,
    leadership: {} as any,
    initialRelations: {},
    eventLog: {
      schemaVersion: 1,
      events: toDomainEvents(snapshot),
    },
    sceneSnapshot: {
      simkit: {
        tickIndex: Number((snapshot as any)?.tickIndex ?? 0),
        facts: (world as any)?.facts || {},
      },
    },
  } as any;
}

function atomsFromPipelineBeforeActions(pipeline: any): ContextAtom[] {
  const stages = arr<any>(pipeline?.stages);
  const s7 = stages.find((s: any) => s?.stage === 'S7');
  if (s7 && Array.isArray(s7.atoms)) return s7.atoms as ContextAtom[];
  const last = stages[stages.length - 1];
  return Array.isArray(last?.atoms) ? (last.atoms as ContextAtom[]) : [];
}

function offerToPossibility(o: ActionOffer): Possibility {
  const tgt = o.targetId != null ? String(o.targetId) : undefined;
  const id = `sim:${o.kind}:${o.actorId}${tgt ? `:${tgt}` : ''}`;
  const blockedBy = o.blocked ? [`sim:block:${String(o.reason || 'blocked')}`] : [];
  return {
    id,
    kind: 'con',
    label: `${o.kind}${tgt ? `→${tgt}` : ''}`,
    magnitude: clamp01(Number(o.score ?? 0)),
    confidence: 1,
    subjectId: String(o.actorId),
    targetId: tgt,
    blockedBy,
    requires: [],
    meta: { sim: { kind: o.kind, actorId: o.actorId, targetId: tgt } },
  };
}

function softmaxSample(args: {
  rngNext: () => number;
  items: Array<{ id: string; score: number; allowed: boolean }>;
  T: number;
}): { chosenId: string | null; top: Array<{ id: string; p: number; score: number; allowed: boolean }> } {
  const items = args.items.slice();
  if (!items.length) return { chosenId: null, top: [] };

  if (!(args.T > 0)) {
    const sorted = items.sort((a, b) => {
      if (Boolean(a.allowed) !== Boolean(b.allowed)) return a.allowed ? -1 : 1;
      const ds = (b.score ?? 0) - (a.score ?? 0);
      if (ds !== 0) return ds;
      return a.id.localeCompare(b.id);
    });
    const chosen = sorted.find((x) => x.allowed) || sorted[0];
    return {
      chosenId: chosen?.id || null,
      top: sorted.slice(0, 10).map((x) => ({ ...x, p: x.id === chosen.id ? 1 : 0 })),
    };
  }

  const allowed = items.filter((x) => x.allowed);
  const pool = allowed.length ? allowed : items;

  const T = args.T;
  const maxS = Math.max(...pool.map((x) => Number(x.score ?? 0)));
  const exps = pool.map((x) => Math.exp((Number(x.score ?? 0) - maxS) / T));
  const Z = exps.reduce((a, b) => a + b, 0) || 1;
  const ps = exps.map((x) => x / Z);

  const u = args.rngNext();
  let acc = 0;
  let chosenIdx = ps.length - 1;
  for (let i = 0; i < ps.length; i += 1) {
    acc += ps[i];
    if (u <= acc) {
      chosenIdx = i;
      break;
    }
  }
  const chosen = pool[chosenIdx];
  const top = pool
    .map((x, i) => ({ id: x.id, score: x.score, allowed: x.allowed, p: ps[i] }))
    .sort((a, b) => (b.p - a.p) || b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 10);
  return { chosenId: chosen?.id || null, top };
}

export function makeFullOrchestratorPlugin(opts?: { T?: number }): SimPlugin {
  const T = Number.isFinite(opts?.T as any) ? Number(opts!.T) : 0;

  // Persistent belief atoms by agent for POST memory.
  const beliefAtomsByAgentId: Record<string, any[]> = {};

  return {
    id: 'plugin:fullOrchestrator',

    decideActions: ({ world, offers, rng, tickIndex }) => {
      const snapshot: SimSnapshot = {
        schema: 'SimKitSnapshotV1',
        id: `sim:preSnap:t${String(tickIndex).padStart(5, '0')}`,
        time: new Date().toISOString(),
        tickIndex,
        characters: Object.values(world.characters || {}).sort((a, b) => a.id.localeCompare(b.id)),
        locations: Object.values(world.locations || {}).sort((a, b) => a.id.localeCompare(b.id)),
        events: [],
        debug: {},
      };

      const participantIds = Object.keys(world.characters || {}).sort();
      const actions: SimAction[] = [];

      for (const actorId of participantIds) {
        const worldState = buildWorldStateFromSim(world, snapshot, { beliefAtomsByAgentId });
        const pipeline = runGoalLabPipelineV1({
          world: worldState as any,
          agentId: actorId,
          participantIds,
          tickOverride: tickIndex,
        });

        const atoms = atomsFromPipelineBeforeActions(pipeline);
        const poss = offers
          .filter((o) => o.actorId === actorId)
          .map(offerToPossibility);

        const { actions, goalEnergy } = buildActionCandidates({ selfId: actorId, atoms, possibilities: poss });
        const decision = decideAction({
          actions,
          goalEnergy,
          topK: 10,
          rng: () => rng.next(),
          temperature: T,
        });
        const ranked = arr<any>((decision as any)?.ranked);
        const items = ranked
          .map((x: any) => ({
            id: String(x?.action?.id || ''),
            score: Number(x?.q ?? 0),
            allowed: true,
          }))
          .filter((x) => x.id);

        const sampled = softmaxSample({ rngNext: () => rng.next(), items, T });
        const chosenId = sampled.chosenId;
        const chosen = ranked.find((x: any) => String(x?.action?.id || '') === chosenId)?.action || decision.best;
        const chosenPoss = poss.find((p: any) => String(p.id) === String(chosen?.id || '')) || null;
        const chosenMeta = (chosenPoss as any)?.meta?.sim;
        const kind = String(chosenMeta?.kind || chosen?.kind || '').trim();
        const targetId = chosenMeta?.targetId != null ? String(chosenMeta.targetId) : (chosen?.targetId ?? null);

        // GoalLab can produce abstract intent kinds that are not directly executable by SimKit.
        // Keep this table explicit so new GoalLab kinds do not silently degrade into wait.
        const GOALLAB_TO_SIMKIT: Record<string, string> = {
          // Direct SimKit-compatible kinds.
          move: 'move',
          move_xy: 'move_xy',
          wait: 'wait',
          talk: 'talk',
          rest: 'rest',
          observe: 'observe',
          attack: 'attack',
          question_about: 'question_about',
          negotiate: 'negotiate',
          inspect_feature: 'inspect_feature',
          repair_feature: 'repair_feature',
          scavenge_feature: 'scavenge_feature',
          start_intent: 'start_intent',
          continue_intent: 'continue_intent',
          abort_intent: 'abort_intent',

          // GoalLab abstract kinds bridged to concrete SimKit actions.
          help: 'talk',
          cooperate: 'talk',
          protect: 'talk',
          npc: 'talk',
          confront: 'talk',
          threaten: 'talk',
          submit: 'talk',
          harm: 'attack',
          avoid: 'move',
          flee: 'move',
          escape: 'move',
          hide: 'wait',
          ask_info: 'question_about',
          persuade: 'negotiate',
        };

        const mappedKind = GOALLAB_TO_SIMKIT[kind] || GOALLAB_TO_SIMKIT[kind.toLowerCase()] || null;
        const SIMKIT_KINDS = new Set([
          'move', 'move_xy', 'wait', 'talk', 'rest', 'observe', 'attack',
          'question_about', 'negotiate', 'inspect_feature', 'repair_feature',
          'scavenge_feature', 'start_intent', 'continue_intent', 'abort_intent',
        ]);
        const finalKind = mappedKind && SIMKIT_KINDS.has(mappedKind)
          ? (mappedKind as any)
          : 'wait';

        // Preserve semantic provenance for traceability across GoalLab → SimKit boundary.
        const goalLabKind = kind;

        actions.push({
          id: `act:${finalKind}:${tickIndex}:${actorId}`,
          kind: finalKind,
          actorId,
          targetId: targetId != null ? String(targetId) : null,
          targetNodeId: chosenMeta?.targetNodeId ?? chosen?.targetNodeId ?? null,
          meta: {
            ...(chosenMeta?.meta ?? null),
            goalLabKind,
            mappedFrom: kind,
            aggressive: /confront|threaten|harm|attack/.test(kind),
            cooperative: /help|cooperate|npc|protect/.test(kind),
            // TalkSpec consumes action.meta.social, so bridge abstract GoalLab social kinds.
            social: /confront|help|cooperate|protect|submit|threaten|intimidate|insult/.test(kind)
              ? kind
              : (chosenMeta?.meta?.social ?? 'inform'),
          },
          payload: {
            policy: {
              T,
              sampledTop: sampled.top,
              chosenId,
            },
          },
        });
      }

      return actions;
    },

    afterSnapshot: ({ world, snapshot, record }) => {
      // POST v0: store action events as belief atoms for next tick.
      try {
        const events = arr<any>((snapshot as any)?.events);
        const chars = Object.keys(world.characters || {}).sort();

        for (const selfId of chars) {
          const self = (world.characters as any)[selfId];
          const locId = String(self?.locId || '');

          const mem: any[] = [];
          for (const e of events) {
            const p = (e && typeof e === 'object') ? (e.payload || {}) : {};
            const eLoc = String(p.locationId ?? p.locId ?? '');
            if (!locId || !eLoc || eLoc !== locId) continue;

            const actorId = String(p.actorId ?? '');
            const targetId = p.targetId != null ? String(p.targetId) : '';
            const kind = String(e?.type || 'event');

            mem.push({
              id: `event:observed:${selfId}:${actorId}:${kind}${targetId ? `:${targetId}` : ''}`,
              ns: 'event',
              kind: 'memory',
              origin: 'derived',
              source: 'fullOrchestrator:post.memory',
              subject: selfId,
              magnitude: 1,
              confidence: 1,
              tags: ['event', 'memory'],
              label: `observed ${kind}${targetId ? `→${targetId}` : ''}`,
              trace: { usedAtomIds: [], notes: [], parts: { simEventId: e?.id } },
            });
          }
          beliefAtomsByAgentId[selfId] = mem;
        }

        record.plugins ||= {};
        record.plugins.fullOrchestrator = {
          T,
          note: 'Decision is GoalLab-scored over SimKit offers; memory keeps observed action events (same location) for next tick.',
          memorySizes: Object.fromEntries(chars.map((id) => [id, arr(beliefAtomsByAgentId[id]).length])),
        };
      } catch (e: any) {
        record.plugins ||= {};
        record.plugins.fullOrchestrator = { error: String(e?.message || e), stack: String(e?.stack || '') };
      }
    },
  };
}
