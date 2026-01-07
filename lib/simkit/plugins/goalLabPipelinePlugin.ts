// lib/simkit/plugins/goalLabPipelinePlugin.ts
// SimKit -> GoalLab Pipeline bridge. Runs GoalLab pipeline per tick and stores frames for UI/debug.

import type { SimPlugin } from '../core/simulator';
import type { SimWorld, SimSnapshot } from '../core/types';
import { EntityType, type WorldState } from '../../../types';
import { runGoalLabPipelineV1 } from '../../goal-lab/pipeline/runPipelineV1';

function arr<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function pickAgentId(world: SimWorld): string | null {
  const ids = Object.keys(world.characters || {}).sort();
  return ids.length ? ids[0] : null;
}

function toDomainEvents(snapshot: SimSnapshot): any[] {
  // Map SimEvent -> DomainEvent (minimal, tolerant)
  return arr<any>((snapshot as any)?.events).map((e: any) => {
    const p = (e && typeof e === 'object') ? (e.payload || {}) : {};
    const actorId = String(p.actorId ?? p.actor ?? 'system');
    const targetId = p.targetId != null ? String(p.targetId) : undefined;
    // tolerate both locationId and legacy locId
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

function buildWorldStateFromSim(world: SimWorld, snapshot: SimSnapshot): WorldState {
  const chars = arr<any>((snapshot as any)?.characters);
  const locs = arr<any>((snapshot as any)?.locations);

  // Agents: minimal fields needed by pipeline, rest as "any"
  const agents = chars.map((c: any) => {
    const entityId = String(c?.id);
    const locId = String(c?.locId ?? 'loc:unknown');
    return {
      entityId,
      type: EntityType.Character,
      title: String(c?.name ?? entityId),
      locationId: locId,
      // pipeline reads agent.memory.beliefAtoms
      memory: { beliefAtoms: [] },
      // keep room for extensions
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
      // pipeline expects LocationEntity-ish, tolerate extra fields
    } as any;
  });

  const w: WorldState = {
    tick: Number((world as any)?.tickIndex ?? (snapshot as any)?.tickIndex ?? 0),
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

export function makeGoalLabPipelinePlugin(opts?: {
  agentId?: string;
  participantIds?: string[];
}): SimPlugin {
  return {
    id: 'plugin:goalLabPipeline',
    afterSnapshot: ({ world, snapshot, record }) => {
      try {
        const agentId = String(opts?.agentId ?? pickAgentId(world) ?? '');
        const participantIds = (opts?.participantIds && opts.participantIds.length)
          ? opts.participantIds.map(String)
          : Object.keys(world.characters || {}).sort();
        if (!agentId) {
          record.plugins ||= {};
          record.plugins.goalLabPipeline = { error: 'No agentId (no characters in world)' };
          return;
        }

        const worldState = buildWorldStateFromSim(world, snapshot as any);
        const pipeline = runGoalLabPipelineV1({
          world: worldState as any,
          agentId,
          participantIds,
          tickOverride: Number((snapshot as any)?.tickIndex ?? (world as any)?.tickIndex ?? 0),
        });

        record.plugins ||= {};
        if (!pipeline) {
          record.plugins.goalLabPipeline = { error: 'Pipeline returned null (agent not found?)', agentId, participantIds };
          return;
        }

        const stages = arr<any>((pipeline as any)?.stages);
        const lastAtoms = arr<any>((stages[stages.length - 1] as any)?.atoms);

        record.plugins.goalLabPipeline = {
          agentId,
          participantIds,
          stageCount: stages.length,
          atomsOut: lastAtoms.length,
          pipeline,
          human: [
            `GoalLabPipelineV1: tick=${worldState.tick} agent=${agentId}`,
            `stages=${stages.length} atomsOut=${lastAtoms.length}`,
          ],
        };
      } catch (e: any) {
        record.plugins ||= {};
        record.plugins.goalLabPipeline = { error: String(e?.message || e), stack: String(e?.stack || '') };
      }
    },
  };
}
