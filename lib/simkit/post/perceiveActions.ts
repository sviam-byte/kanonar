// lib/simkit/post/perceiveActions.ts
// POST phase v0: build observed action atoms from tick events and persist per-agent memory.

import type { SimEvent, SimWorld } from '../core/types';

function arr<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export type BeliefAtom = {
  id: string;
  ns?: string;
  kind?: string;
  origin?: string;
  source?: string;
  subject?: string;
  magnitude: number;
  confidence: number;
  tags?: string[];
  label?: string;
  trace?: any;
};

export type PersistedMentalAtom = {
  key: string;
  atom: BeliefAtom;
  lastObservedTick: number;
  confidence: number;
  source: 'vision' | 'hearing' | 'inference' | 'hallucination';
};

function isActionEvent(e: SimEvent): boolean {
  const t = String((e as any)?.type || '');
  return t.startsWith('action:');
}

export function buildBeliefAtomsForTick(world: SimWorld, eventsApplied: SimEvent[]) {
  const out: Record<string, BeliefAtom[]> = {};
  const chars = Object.keys(world.characters || {}).sort();
  for (const id of chars) out[id] = [];

  const evs = arr<SimEvent>(eventsApplied).filter(isActionEvent);
  for (const observerId of chars) {
    const observer = (world.characters as any)[observerId];
    const obsLoc = String(observer?.locId || '');

    const atoms: BeliefAtom[] = [];
    for (const e of evs) {
      const p = (e && typeof e === 'object') ? ((e as any).payload || {}) : {};
      const locationId = String(p.locationId ?? p.locId ?? '');
      if (!obsLoc || !locationId || locationId !== obsLoc) continue;

      const actorId = String(p.actorId ?? 'system');
      const targetId = p.targetId != null ? String(p.targetId) : '';
      const kind = String((e as any).type || 'event');
      const atomKey = `obs:${observerId}:${actorId}:${kind}${targetId ? `:${targetId}` : ''}`;

      const mag = clamp01(Number(p.magnitude ?? 1));
      atoms.push({
        id: `mem:obs:${observerId}:${actorId}:${kind}${targetId ? `:${targetId}` : ''}:${String((e as any).id || '')}`,
        ns: 'memory',
        kind: 'beliefAtom',
        origin: 'derived',
        source: 'simkit:post.perceiveActions',
        subject: observerId,
        magnitude: mag,
        confidence: 1,
        tags: ['memory', 'event', 'observed', kind],
        label: `observed ${kind}${targetId ? `→${targetId}` : ''}`,
        trace: { usedAtomIds: [], notes: [], parts: { simEventId: (e as any).id, payload: p, atomKey } },
      });
    }
    out[observerId] = atoms;
  }
  return out;
}

export function persistBeliefAtomsToFacts(world: SimWorld, beliefAtomsByAgentId: Record<string, BeliefAtom[]>) {
  world.facts ||= {};
  const ids = Object.keys(world.characters || {}).sort();
  for (const id of ids) {
    world.facts[`mem:beliefAtoms:${id}`] = arr(beliefAtomsByAgentId[id]);
  }
}

type PersistMemoryOptions = {
  decayPerTick?: number;
  forgetBelow?: number;
  maxFacts?: number;
};

export function persistDecayingMemoryToFacts(
  world: SimWorld,
  beliefAtomsByAgentId: Record<string, BeliefAtom[]>,
  opts: PersistMemoryOptions = {}
) {
  const decayPerTick = Number.isFinite(opts.decayPerTick) ? Number(opts.decayPerTick) : 0.97;
  const forgetBelow = Number.isFinite(opts.forgetBelow) ? Number(opts.forgetBelow) : 0.12;
  const maxFacts = Number.isFinite(opts.maxFacts) ? Number(opts.maxFacts) : 600;

  world.facts ||= {};
  const ids = Object.keys(world.characters || {}).sort();
  for (const id of ids) {
    const key = `mem:memory:${id}`;
    const prev = (world.facts as any)[key] as Record<string, PersistedMentalAtom> | undefined;
    const next: Record<string, PersistedMentalAtom> = { ...(prev ?? {}) };
    const now = Number(world.tickIndex ?? 0);

    // Decay existing facts based on age.
    for (const [factKey, fact] of Object.entries(next)) {
      const age = Math.max(0, now - Number(fact.lastObservedTick ?? 0));
      if (age > 0) {
        fact.confidence = clamp01(fact.confidence * Math.pow(decayPerTick, age));
      }
      if (fact.confidence < forgetBelow) {
        delete next[factKey];
      }
    }

    // Merge new observations.
    for (const atom of arr(beliefAtomsByAgentId[id])) {
      const atomKey = String(atom?.trace?.parts?.atomKey || atom?.id || `obs:${id}:${String(atom?.kind ?? 'event')}`);
      next[atomKey] = {
        key: atomKey,
        atom,
        lastObservedTick: now,
        confidence: 1,
        source: 'vision',
      };
    }

    // Cap memory size (drop weakest).
    const keys = Object.keys(next);
    if (keys.length > maxFacts) {
      keys
        .sort((a, b) => (next[a]?.confidence ?? 0) - (next[b]?.confidence ?? 0))
        .slice(0, Math.max(0, keys.length - maxFacts))
        .forEach((k) => delete next[k]);
    }

    (world.facts as any)[key] = next;
  }
}
