// lib/simkit/post/perceiveActions.ts
// POST phase v0: build observed action atoms from tick events and persist per-agent memory.

import type { SimEvent, SimWorld } from '../core/types';
import { clamp01 } from '../../util/math';
import { arr } from '../../utils/arr';

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
    // IMPORTANT: merge by atom id, not replace.
    // goalLabDeciderPlugin writes belief:chosen/surprise/pressure atoms earlier in the tick.
    // A full replace here would destroy the POMDP feedback loop.
    const key = `mem:beliefAtoms:${id}`;
    const prev = Array.isArray((world.facts as any)[key]) ? (world.facts as any)[key] as any[] : [];
    const byId = new Map<string, any>();
    for (const a of prev) { const aid = String((a as any)?.id || ''); if (aid) byId.set(aid, a); }
    for (const a of arr(beliefAtomsByAgentId[id])) { const aid = String((a as any)?.id || ''); if (aid) byId.set(aid, a); }
    (world.facts as any)[key] = Array.from(byId.values());
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

export type EpisodicEntry = {
  tick: number;
  kind: string;
  actorId: string;
  targetId: string;
  magnitude: number;
  details?: any;
};

const EPISODIC_MAX = 30;
const EPISODIC_SIGNIFICANCE_THRESHOLD = 0.12;

/**
 * Tracks high-salience social/combat events and trust shifts in per-agent
 * episodic stores under `mem:episodic:<agentId>`.
 */
export function updateEpisodicMemory(
  world: SimWorld,
  eventsApplied: SimEvent[],
  prevRelations?: Record<string, Record<string, any>> | null
) {
  const facts: any = world.facts || {};
  const tick = world.tickIndex;

  for (const observerId of Object.keys(world.characters || {}).sort()) {
    const observer = world.characters[observerId];
    const obsLoc = String((observer as any)?.locId || '');
    const key = `mem:episodic:${observerId}`;
    const store: EpisodicEntry[] = Array.isArray(facts[key]) ? [...facts[key]] : [];

    const curRels = facts.relations?.[observerId] ?? {};
    const prevRels = prevRelations?.[observerId] ?? {};
    for (const otherId of Object.keys(world.characters || {})) {
      if (otherId === observerId) continue;
      const other = world.characters[otherId];
      if (String((other as any)?.locId || '') !== obsLoc) continue;

      const curTrust = Number(curRels[otherId]?.trust ?? 0.5);
      const prevTrust = Number(prevRels[otherId]?.trust ?? curTrust);
      const trustDelta = curTrust - prevTrust;

      if (trustDelta < -EPISODIC_SIGNIFICANCE_THRESHOLD) {
        store.push({
          tick,
          kind: 'trust_drop',
          actorId: otherId,
          targetId: observerId,
          magnitude: clamp01(Math.abs(trustDelta) * 3),
          details: { prevTrust, curTrust, delta: trustDelta },
        });
      }
      if (trustDelta > EPISODIC_SIGNIFICANCE_THRESHOLD * 1.5) {
        store.push({
          tick,
          kind: 'trust_gain',
          actorId: otherId,
          targetId: observerId,
          magnitude: clamp01(trustDelta * 2),
          details: { prevTrust, curTrust, delta: trustDelta },
        });
      }
    }

    for (const e of arr<SimEvent>(eventsApplied)) {
      const p = (e as any)?.payload || {};
      const locId = String(p.locationId ?? p.locId ?? '');
      if (locId !== obsLoc) continue;

      const actorId = String(p.actorId ?? '');
      const targetId = String(p.targetId ?? '');
      const type = String((e as any)?.type || '');
      const isTarget = targetId === observerId;
      const isWitness = actorId !== observerId && targetId !== observerId;

      if (type === 'action:attack' && (isTarget || isWitness)) {
        store.push({
          tick,
          kind: 'attack',
          actorId,
          targetId,
          magnitude: clamp01(Number(p.damage ?? 0.08) * 5),
        });
      }
      if ((type === 'action:betray' || type === 'action:deceive') && (isTarget || isWitness)) {
        store.push({ tick, kind: 'betrayal', actorId, targetId, magnitude: 0.8 });
      }
      if ((type === 'action:help' || type === 'action:treat' || type === 'action:comfort') && isTarget) {
        store.push({ tick, kind: 'help', actorId, targetId, magnitude: 0.4 });
      }
    }

    if (store.length > EPISODIC_MAX) {
      store.sort((a, b) => b.magnitude - a.magnitude || b.tick - a.tick);
      store.length = EPISODIC_MAX;
    }

    facts[key] = store;
  }
}

/**
 * Emits memory atoms derived from episodic entries relevant to co-present
 * agents so GoalLab can reuse salient history in current decisions.
 */
export function buildEpisodicAtomsForAgent(world: SimWorld, selfId: string): BeliefAtom[] {
  const facts: any = world.facts || {};
  const store: EpisodicEntry[] = Array.isArray(facts[`mem:episodic:${selfId}`]) ? facts[`mem:episodic:${selfId}`] : [];
  if (!store.length) return [];

  const selfLoc = String((world.characters[selfId] as any)?.locId ?? '');
  const tick = world.tickIndex;
  const out: BeliefAtom[] = [];

  const coPresent = new Set<string>();
  for (const c of Object.values(world.characters || {})) {
    if (c.id !== selfId && String((c as any)?.locId ?? '') === selfLoc) coPresent.add(c.id);
  }

  for (const otherId of coPresent) {
    const relevant = store.filter((e) => e.actorId === otherId || e.targetId === otherId);
    for (const entry of relevant) {
      const age = Math.max(1, tick - entry.tick);
      const decayedMag = clamp01(entry.magnitude * Math.pow(0.97, age));
      if (decayedMag < 0.05) continue;

      out.push({
        id: `mem:episodic:${selfId}:${otherId}:${entry.kind}:${entry.tick}`,
        ns: 'memory',
        kind: 'episodic',
        origin: 'derived',
        source: 'episodicMemory',
        subject: selfId,
        magnitude: decayedMag,
        confidence: clamp01(0.9 * Math.pow(0.99, age)),
        tags: ['memory', 'episodic', entry.kind, otherId],
        label: `episodic:${entry.kind}:${otherId}(t-${age})`,
        trace: {
          usedAtomIds: [],
          notes: [`episodic ${entry.kind} by/to ${otherId} at tick ${entry.tick}, age=${age}`],
          parts: { ...entry, age, decayedMag },
        },
      });
    }
  }

  return out;
}
