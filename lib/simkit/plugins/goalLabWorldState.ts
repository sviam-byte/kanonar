// lib/simkit/plugins/goalLabWorldState.ts
// Shared SimKit -> GoalLab world-state adapter used by multiple plugins.

import type { SimWorld, SimSnapshot } from '../core/types';
import { EntityType, type WorldState } from '../../../types';
import { makeAgentRNG, setGlobalRunSeed } from '../../core/noise';
import { clamp01 } from '../../util/math';
import { arr } from '../../utils/arr';

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
      // v32 adapter fix: preserve original CharacterEntity slices for feature extraction.
      // Without passthrough, extractCharacterFeatures falls back to neutral defaults.
      body: (c as any)?.entity?.body ?? {},
      vector_base: (c as any)?.entity?.vector_base ?? {},
      identity: (c as any)?.entity?.identity ?? {},
      context: (c as any)?.entity?.context ?? {},
      lifeGoals: (c as any)?.entity?.lifeGoals ?? {},
      goalTuning: (c as any)?.entity?.goalTuning ?? null,
      driverCurves: (c as any)?.entity?.driverCurves ?? null,
      inhibitionOverrides: (c as any)?.entity?.inhibitionOverrides ?? null,
      driverInertia: (c as any)?.entity?.driverInertia ?? null,
    } as any;
  });

  // v32 adapter fix: map SimKit dyadic relations -> GoalLab rel:state atoms.
  // We inject only atoms linked to current agent (from or to), so memory stays scoped.
  const rels = (world.facts as any)?.relations;
  if (rels && typeof rels === 'object') {
    for (const agent of agents) {
      const selfId = String((agent as any)?.entityId ?? '');
      if (!selfId) continue;
      const selfRels: any[] = [];

      for (const [fromId, targets] of Object.entries(rels)) {
        if (!targets || typeof targets !== 'object') continue;
        for (const [toId, metrics] of Object.entries(targets as any)) {
          if (!metrics || typeof metrics !== 'object') continue;
          if (fromId !== selfId && toId !== selfId) continue;
          for (const [metric, value] of Object.entries(metrics as any)) {
            const v = Number(value);
            if (!Number.isFinite(v)) continue;
            selfRels.push({
              id: `rel:state:${fromId}:${toId}:${metric}`,
              ns: 'rel',
              kind: 'rel_state',
              origin: 'world',
              source: 'simkit:facts.relations',
              magnitude: clamp01(v),
              confidence: 1,
              tags: ['rel', 'state', metric],
              label: `rel:${fromId}→${toId}:${metric}=${v.toFixed(2)}`,
            });
          }
        }
      }

      if (selfRels.length) {
        (agent as any).memory = (agent as any).memory || {};
        (agent as any).memory.beliefAtoms = [...arr((agent as any)?.memory?.beliefAtoms), ...selfRels];
      }
    }
  }

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
