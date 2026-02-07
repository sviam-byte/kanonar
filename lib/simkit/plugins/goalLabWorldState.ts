// lib/simkit/plugins/goalLabWorldState.ts
// Shared SimKit -> GoalLab world-state adapter used by multiple plugins.

import type { SimWorld, SimSnapshot } from '../core/types';
import { EntityType, type WorldState } from '../../../types';
import { makeAgentRNG, setGlobalRunSeed } from '../../core/noise';

function arr<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function toDomainEvents(snapshot: SimSnapshot): any[] {
  // Map SimEvent -> DomainEvent (minimal, tolerant).
  const nowTick = Number((snapshot as any)?.tickIndex ?? 0);
  return arr<any>((snapshot as any)?.events).map((e: any) => {
    const p = (e && typeof e === 'object') ? (e.payload || {}) : {};
    const tick = Number(p.tick ?? p.tickIndex ?? nowTick);
    const actorId = String(p.actorId ?? p.actor ?? 'system');
    const targetId = p.targetId != null ? String(p.targetId) : undefined;
    // tolerate both locationId and legacy locId
    const locationId = (p.locationId != null)
      ? String(p.locationId)
      : (p.locId != null ? String(p.locId) : undefined);
    const magnitude = clamp01(Number(p.magnitude ?? p.severity ?? 0.5));
    return {
      kind: String(e?.type ?? 'event'),
      tick,
      actorId,
      targetId,
      magnitude,
      context: { locationId },
      meta: { simEventId: e?.id, payload: p },
    };
  });
}

export function buildWorldStateFromSim(world: SimWorld, snapshot: SimSnapshot): WorldState {
  // Ensure GoalLab's seeded RNG channels are wired in SimKit mode.
  // SimKit exposes a per-run seed; map it into the global seed factory.
  setGlobalRunSeed(Number((world as any)?.seed ?? 12345));

  const chars = arr<any>((snapshot as any)?.characters);
  const locs = arr<any>((snapshot as any)?.locations);

  // Agents: minimal fields needed by pipeline, rest as "any".
  const agents = chars.map((c: any) => {
    const entityId = String(c?.id);
    const locId = String(c?.locId ?? 'loc:unknown');
    return {
      entityId,
      type: EntityType.Character,
      title: String(c?.name ?? entityId),
      locationId: locId,
      // pipeline reads agent.memory.beliefAtoms
      // persisted by perceptionMemoryPlugin into world.facts[mem:beliefAtoms:<id>]
      memory: { beliefAtoms: arr<any>((world as any)?.facts?.[`mem:beliefAtoms:${entityId}`]) },
      // keep room for extensions
      params: {
        stress: clamp01(Number(c?.stress ?? 0)),
        health: clamp01(Number(c?.health ?? 1)),
        energy: clamp01(Number(c?.energy ?? 1)),
      },
      // Seeded RNG channels for decision stochasticity (matches main world initializer).
      rngChannels: {
        decide: makeAgentRNG(entityId, 1),
        physio: makeAgentRNG(entityId, 2),
        perceive: makeAgentRNG(entityId, 3),
        goals: makeAgentRNG(entityId, 4),
      },
      // Optional per-agent temperature knobs (GoalLab pipeline reads these).
      temperature: (world as any)?.facts?.decisionTemperature ?? 1.0,
      behavioralParams: { T0: (world as any)?.facts?.decisionTemperature ?? 1.0 },
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
      // pipeline expects LocationEntity-ish, tolerate extra fields
    } as any;
  });

  const w: WorldState = {
    tick: Number((world as any)?.tickIndex ?? (snapshot as any)?.tickIndex ?? 0),
    rngSeed: Number((world as any)?.seed ?? 0),
    decisionTemperature: (world as any)?.facts?.decisionTemperature ?? 1.0,
    decisionCurvePreset: (world as any)?.facts?.decisionCurvePreset ?? 'smoothstep',
    agents,
    locations,
    leadership: {} as any,
    initialRelations: {},
    eventLog: {
      schemaVersion: 1,
      events: toDomainEvents(snapshot),
    },
    // lightweight sceneSnapshot hook (optional)
    sceneSnapshot: {
      simkit: {
        tickIndex: Number((snapshot as any)?.tickIndex ?? 0),
        facts: (world as any)?.facts || {},
      },
    },
  } as any;

  return w;
}
