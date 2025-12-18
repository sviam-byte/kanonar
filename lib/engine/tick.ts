
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
    
    // Find the agent in the world (mutable ref)
    const agent = world.agents?.find((a: any) => a.entityId === agentId) || world.entities?.find((e: any) => e.entityId === agentId) || null;

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

    // 2) Update Relations (if graph exists on agent)
    if (agent && typeof updateRelationshipGraphFromEvents === 'function') {
      try {
        agent.relations = agent.relations || {};
        agent.relations.graph = agent.relations.graph || agent.rel_graph || { schemaVersion: 1, edges: [] };
        
        const updated = updateRelationshipGraphFromEvents({
          graph: agent.relations.graph,
          selfId: agentId,
          events: worldEvents, 
          nowTick: tickNow
        });
        
        agent.relations.graph = updated.graph;
      } catch (e) {
        console.error("Relation update failed", e);
      }
    }

    // 3) Update ToM Base from Evidence
    if (agent && eventsNow.length > 0) {
      const evAll = extractEvidenceFromEvents({ events: eventsNow });
      const evForSelf = evAll.filter(e => e.subjectId === agentId);
      
      // Update how agent is seen (public rep/tom base) OR how agent sees others?
      // applyEvidenceToTomBase updates the agent's ToM about OTHERS usually if passed as observer.
      // Assuming 'agent' is observer here.
      applyEvidenceToTomBase({
        agent,
        evidence: evAll, // pass all relevant evidence
        tuning: baseInput?.tuning?.tomUpdate
      });
    }

    // 4) Build Context Snapshot (AFTER state updates)
    const ctxResult = buildGoalLabContext(world, agentId, {
      snapshotOptions: baseInput.snapshotOptions,
      timeOverride: tickNow,
    });
    
    if (!ctxResult) break; // Agent not found or error
    
    const snap = ctxResult.snapshot;
    snapshots.push(snap);

    // 5) Integrate Slow State (Affect/Stress/Traces)
    if (agent) {
       integrateAgentState({
           agent,
           atomsAfterAffect: snap.atoms,
           tuning: baseInput?.integratorTuning 
       });
    }

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
