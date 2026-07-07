// lib/simkit/mvp0/runTwins.ts
//
// MVP-0 twin API (I-1.5): base run vs twin run, same seed, exactly ONE
// intervention, expressed as a pure world-transform. Interventions:
//   removeObject     — ablate the object token (A4 proto)
//   wipeMemory       — clear an agent's accumulated memory at a tick (A3 proto)
//   injectSpeechAtom — inject a threaten speech event A→B (Communication v0, C1)
//
// Divergence contract (A2 min-PASS): the diff reports the FIRST DIVERGENCE
// TICK (first tick where any agent's applied action differs) and the diverged
// ATOMS (symmetric usedAtomIds diff of the diverging agent at that tick).
//
// Forbidden here (MVP-0 freeze): sweeps, parameter-grid batches, Lyapunov
// conclusions (Phase II-3).

import type { SimWorld, SpeechEventV1 } from '../core/types';
import { cloneWorld } from '../core/world';
import { objectFactKey } from '../actions/objectSpec';
import { MVP0_LOCATION_ID, MVP0_OBJECT_ID } from '../scenarios/mvp0Scene';
import { makeMvp0Simulator, stepToRows, type Mvp0Row } from './runMvpRollout';
import { canonicalStringify, sha256Hex } from './hash';

export type Mvp0Intervention =
  | { kind: 'removeObject'; objectId?: string }
  | { kind: 'wipeMemory'; agentId: string; atTick?: number }
  | {
      kind: 'injectSpeechAtom';
      from: string;
      to: string;
      act?: SpeechEventV1['act'];
      magnitude?: number;
      atTick?: number;
    };

export type Mvp0Setup = Omit<Extract<Mvp0Intervention, { kind: 'injectSpeechAtom' }>, 'atTick'>;

export interface TwinDiff {
  seed: number;
  ticks: number;
  intervention: Mvp0Intervention;
  /** Common initial condition applied to both twins before tick 0. */
  setup?: Mvp0Setup;
  interventionTick: number;
  baseRows: Mvp0Row[];
  twinRows: Mvp0Row[];
  baseGoldenHash: string;
  twinGoldenHash: string;
  /** First tick where any agent's APPLIED ACTION differs; null = twins identical. */
  firstDivergenceTick: number | null;
  divergedAgentId: string | null;
  /** usedAtomIds present only on one side at the divergence tick — the atom(s)
   *  that carried the intervention into the choice. */
  divergedAtoms: { onlyBase: string[]; onlyTwin: string[] };
}

// --- interventions as pure world transforms ---------------------------------

export function removeObjectTransform(objectId: string = MVP0_OBJECT_ID) {
  return (world: SimWorld): SimWorld => {
    const w = cloneWorld(world);
    delete (w.facts as any)[objectFactKey(objectId)];
    return w;
  };
}

export function wipeMemoryTransform(agentId: string) {
  return (world: SimWorld): SimWorld => {
    const w = cloneWorld(world);
    const facts: any = w.facts;
    // The three mem:* stores written by perceptionMemoryPlugin + the accepted
    // speech/observation atoms awaiting S0 delivery.
    delete facts[`mem:beliefAtoms:${agentId}`];
    delete facts[`mem:memory:${agentId}`];
    delete facts[`mem:episodic:${agentId}`];
    delete facts[`agentAtoms:${agentId}`];
    delete facts[`quarantineAtoms:${agentId}`];
    const entity: any = w.characters[agentId]?.entity;
    if (entity?.memory) entity.memory.beliefAtoms = [];
    return w;
  };
}

/** Communication v0 injection: one threaten speech event from→to, carrying a
 *  single danger atom for the addressee. Pre-registered C1 signs (frozen with
 *  this file, BEFORE the 32-seed observation): у Б danger↑ (safetyNeed/fear),
 *  confront↓, retreat/give↑; twin без атома — Б не отступает. */
export function injectSpeechAtomTransform(args: {
  from: string;
  to: string;
  act?: SpeechEventV1['act'];
  magnitude?: number;
}) {
  const act = args.act ?? 'threaten';
  const magnitude = Number(args.magnitude ?? 0.7);
  return (world: SimWorld): SimWorld => {
    const w = cloneWorld(world);
    const payload: SpeechEventV1 = {
      schema: 'SpeechEventV1',
      actorId: args.from,
      targetId: args.to,
      act,
      volume: 'normal',
      atoms: [
        {
          id: `ctx:danger:${args.to}`,
          magnitude,
          confidence: 0.9,
          meta: { from: args.from, act, injected: 'mvp0:twin' },
        },
      ],
      topic: act,
      intent: 'truthful',
    };
    w.events = [
      ...(w.events || []),
      { id: `evt:speech:inject:${w.tickIndex}:${args.from}:${args.to}`, type: 'speech:v1', payload },
    ];
    return w;
  };
}

/** Location v1 (I-2.4): flip the scene location's `privacy` property — the
 *  single manipulated knob of the A4-LOC cell (private ↔ public over the SAME
 *  scene). Only meaningful with FC.location.propsV1 ON; with the flag OFF the
 *  adapter drops properties and both arms are identical by construction.
 *  cloneWorld is a JSON deep clone, so the shared data/locations entity is
 *  never mutated. */
export function setLocationPrivacyTransform(
  privacy: 'private' | 'semi' | 'public',
  locationId: string = MVP0_LOCATION_ID,
) {
  return (world: SimWorld): SimWorld => {
    const w = cloneWorld(world);
    const loc = w.locations[locationId];
    if (loc?.entity) {
      const entity = loc.entity as Record<string, unknown> & { properties?: Record<string, unknown> };
      entity.properties = { ...(entity.properties ?? {}), privacy };
    }
    return w;
  };
}

export function transformOf(intervention: Mvp0Intervention) {
  switch (intervention.kind) {
    case 'removeObject':
      return removeObjectTransform(intervention.objectId);
    case 'wipeMemory':
      return wipeMemoryTransform(intervention.agentId);
    case 'injectSpeechAtom':
      return injectSpeechAtomTransform(intervention);
  }
}

function interventionTickOf(intervention: Mvp0Intervention): number {
  const at = (intervention as any).atTick;
  return Math.max(0, Number.isFinite(Number(at)) ? Number(at) : 0);
}

// --- twin runner -------------------------------------------------------------

/**
 * Run base and twin tick-locked on the same seed. The intervention transform
 * is applied to the twin's world just BEFORE stepping interventionTick (t=0 ⇒
 * before the first step, i.e. the classic initial-world transform). Both sims
 * are stepped identically up to that point, so their RNG states match and any
 * divergence is attributable to the single intervention.
 */
export function runTwins(args: {
  seed: number;
  ticks?: number;
  intervention: Mvp0Intervention;
  setup?: Mvp0Setup;
}): TwinDiff {
  const seed = Number(args.seed);
  const ticks = Math.max(1, Math.min(64, Number(args.ticks ?? 20)));
  const intervention = args.intervention;
  const atTick = Math.min(interventionTickOf(intervention), ticks - 1);
  const transform = transformOf(intervention);
  const setupTransform = args.setup ? transformOf(args.setup) : undefined;

  const baseSim = makeMvp0Simulator(seed, setupTransform);
  const twinSim = makeMvp0Simulator(seed, setupTransform);

  const baseRows: Mvp0Row[] = [];
  const twinRows: Mvp0Row[] = [];

  for (let t = 0; t < ticks; t++) {
    if (t === atTick) twinSim.world = transform(twinSim.world);
    baseRows.push(...stepToRows(baseSim));
    twinRows.push(...stepToRows(twinSim));
  }

  // First divergence = first tick where any agent's applied action differs.
  let firstDivergenceTick: number | null = null;
  let divergedAgentId: string | null = null;
  const byTickAgent = (rows: Mvp0Row[]) => {
    const m = new Map<string, Mvp0Row>();
    for (const r of rows) m.set(`${r.tick}:${r.agentId}`, r);
    return m;
  };
  const baseMap = byTickAgent(baseRows);
  const twinMap = byTickAgent(twinRows);
  const agentIds = Array.from(new Set(baseRows.map((r) => r.agentId))).sort();

  outer: for (let t = 0; t < ticks; t++) {
    for (const id of agentIds) {
      const a = baseMap.get(`${t}:${id}`)?.action ?? null;
      const b = twinMap.get(`${t}:${id}`)?.action ?? null;
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        firstDivergenceTick = t;
        divergedAgentId = id;
        break outer;
      }
    }
  }

  let onlyBase: string[] = [];
  let onlyTwin: string[] = [];
  if (firstDivergenceTick !== null && divergedAgentId) {
    const key = `${firstDivergenceTick}:${divergedAgentId}`;
    const baseAtoms = new Set(baseMap.get(key)?.usedAtomIds ?? []);
    const twinAtoms = new Set(twinMap.get(key)?.usedAtomIds ?? []);
    onlyBase = [...baseAtoms].filter((x) => !twinAtoms.has(x)).sort();
    onlyTwin = [...twinAtoms].filter((x) => !baseAtoms.has(x)).sort();
  }

  return {
    seed,
    ticks,
    intervention,
    ...(args.setup ? { setup: args.setup } : {}),
    interventionTick: atTick,
    baseRows,
    twinRows,
    baseGoldenHash: sha256Hex(canonicalStringify(baseRows)),
    twinGoldenHash: sha256Hex(canonicalStringify(twinRows)),
    firstDivergenceTick,
    divergedAgentId,
    divergedAtoms: { onlyBase, onlyTwin },
  };
}
