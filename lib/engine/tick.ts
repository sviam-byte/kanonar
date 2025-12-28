
// lib/engine/tick.ts
import { TickConfig, TickResult } from './tickTypes';
import { shallowAtomDiff } from './snapshotDiff';
import { buildGoalLabContext } from '../goals/goalLabContext';
import { integrateAgentState } from './integrators';
import { getEventsAtTick } from '../events/log';
import { extractEvidenceFromEvents } from '../evidence/extract';
import { applyEvidenceToTomBase } from '../tom/memory/update';
import { updateRelationshipGraphFromEvents } from '../relations/updateFromEvents';
import { WorldEvent } from '../events/types';
import { ensureTomMatrix } from '../tom/ensureMatrix';
import { integrateTomFromAtoms } from '../tom/integrateFromAtoms';

export function ensureWorldTick(world: any) {
  if (typeof world.tick !== 'number') world.tick = 0;
  return world.tick;
}

export function advanceWorldTick(world: any, dt: number) {
  ensureWorldTick(world);
  world.tick += dt;
  return world.tick;
}

export function runTicks(args: {
  world: any;
  agentId: string;
  baseInput: any; // overrides/tuning/sceneControl etc
  cfg: TickConfig;
  withDiffs?: boolean;
}): TickResult {
  const { world, agentId, baseInput, cfg, withDiffs } = args;
  const dt = cfg.dt ?? 1;
  const steps = cfg.steps ?? 1;

  const snapshots: any[] = [];
  const diffs: any[] = [];

  for (let i = 0; i < steps; i++) {
    advanceWorldTick(world, dt);
    const tickNow = world.tick;

    const allIds: string[] = (world.agents || []).map((a: any) => a.entityId).filter(Boolean);
    const procIds: string[] =
      (cfg.agentIds && cfg.agentIds.length ? cfg.agentIds.slice() :
      cfg.allAgents ? allIds :
      [agentId]).filter(Boolean);

    // Ensure full ToM matrix exists: for N agents => N*(N-1) dyads
    if (procIds.length >= 2) {
      try { ensureTomMatrix(world, procIds); } catch {}
    }

    // 1) Events at Tick
    const eventsNow = getEventsAtTick(world, tickNow);
    
    // Map DomainEvent -> WorldEvent for relation/tom updates
    const worldEvents: WorldEvent[] = eventsNow.map(ev => {
        let kind = ev.domain;
        if (ev.tags && ev.tags.length > 0) {
             if (ev.tags.includes('help') || ev.tags.includes('aid')) kind = 'helped';
             else if (ev.tags.includes('attack') || ev.tags.includes('harm')) kind = 'attacked';
             else if (ev.tags.includes('betrayal')) kind = 'betrayed';
             else if (ev.tags.includes('lie') || ev.tags.includes('deceive')) kind = 'lied';
             else if (ev.tags.includes('promise') && ev.tags.includes('kept')) kind = 'kept_oath';
             else if (ev.tags.includes('promise') && ev.tags.includes('broken')) kind = 'broke_oath';
             else kind = ev.tags[0]; 
        }
        
        return {
            id: ev.id,
            tick: ev.t,
            kind: kind,
            actorId: ev.actorId,
            targetId: ev.targetId,
            magnitude: ev.intensity,
            context: { locationId: ev.locationId }
        };
    });

    // 2) Update Relations for each processed agent
    for (const sid of procIds) {
      const agent = world.agents?.find((a: any) => a.entityId === sid) || null;
      if (!agent || typeof updateRelationshipGraphFromEvents !== 'function') continue;
      try {
        agent.relations = agent.relations || {};
        agent.relations.graph = agent.relations.graph || agent.rel_graph || { schemaVersion: 1, edges: [] };

        const updated = updateRelationshipGraphFromEvents({
          graph: agent.relations.graph,
          selfId: sid,
          events: worldEvents,
          nowTick: tickNow
        });

        agent.relations.graph = updated.graph;
      } catch (e) {
        console.error("Relation update failed", e);
      }
    }

    // 3) Update ToM Base from Evidence for each processed agent
    if (eventsNow.length > 0) {
      const evAll = extractEvidenceFromEvents({ events: eventsNow });
      for (const sid of procIds) {
        const agent = world.agents?.find((a: any) => a.entityId === sid) || null;
        if (!agent) continue;
        applyEvidenceToTomBase({
          agent,
          evidence: evAll,
          tuning: baseInput?.tuning?.tomUpdate
        });
      }
    }

    // 4) Build snapshot for each agent, integrate affect + tom into world
    const snapById: Record<string, any> = {};
    for (const sid of procIds) {
      const ctxResult = buildGoalLabContext(world, sid, {
        snapshotOptions: baseInput.snapshotOptions,
        timeOverride: tickNow,
      });
      if (!ctxResult) continue;
      snapById[sid] = ctxResult.snapshot;
    }

    // integrate per-agent slow state + ToM updates from atoms
    for (const sid of procIds) {
      const agent = world.agents?.find((a: any) => a.entityId === sid) || null;
      const snap = snapById[sid];
      if (!agent || !snap) continue;

      integrateAgentState({
        agent,
        atomsAfterAffect: snap.atoms,
        tuning: baseInput?.integratorTuning
      });

      try {
        integrateTomFromAtoms({
          world,
          selfId: sid,
          atoms: snap.atoms,
          tick: tickNow
        });
      } catch {}
    }

    // keep existing return shape: snapshots are for the requested focus agentId
    if (snapById[agentId]) snapshots.push(snapById[agentId]);

    // 6. Compute Diffs if requested
    if (withDiffs && snapshots.length >= 2) {
      const prev = snapshots[snapshots.length - 2];
      const next = snap;
      diffs.push({
        tick: world.tick,
        atoms: shallowAtomDiff(prev?.atoms || [], next?.atoms || [])
      });
    }
  }

  return { tick: world.tick, snapshots, diffs: withDiffs ? diffs : undefined, agentId };
}
