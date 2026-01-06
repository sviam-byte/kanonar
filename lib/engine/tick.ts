
// lib/engine/tick.ts
import { TickConfig, TickResult, TickResultCast } from './tickTypes';
import { shallowAtomDiff } from './snapshotDiff';
import { buildGoalLabContext } from '../goals/goalLabContext';
import { integrateAgentState } from './integrators';
import { getEventsAtTick } from '../events/log';
import { extractEvidenceFromEvents } from '../evidence/extract';
import { applyEvidenceToTomBase } from '../tom/memory/update';
import { updateRelationshipGraphFromEvents } from '../relations/updateFromEvents';
import { WorldEvent } from '../events/types';
import { arr } from '../utils/arr';
import { applyChosenActionToWorld } from './applyChosenAction';
import { applyAcquaintanceFromEvents } from '../social/acquaintanceFromEvents';
import { runTick } from '../orchestrator/runTick';
import { buildRegistry } from '../orchestrator/registry';
import { defaultProducers } from '../orchestrator/defaultProducers';

// Build the orchestrator registry once; producers are sorted deterministically.
const orchestratorRegistry = buildRegistry(defaultProducers);

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
             if (ev.tags.includes('help')) kind = 'helped';
             else if (ev.tags.includes('attack')) kind = 'attacked';
             else if (ev.tags.includes('betrayal')) kind = 'betrayed';
             else if (ev.tags.includes('lie')) kind = 'lied';
             else if (ev.tags.includes('shared_secret')) kind = 'shared_secret';
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

    // Grow recognition from recent interaction events.
    applyAcquaintanceFromEvents(world, eventsNow);

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

    // 3) Update ToM Base from Evidence (everyone observes the same event log for now)
    if (agent) {
      const evAll = extractEvidenceFromEvents({ events: eventsNow });
      if (evAll.length > 0) {
        applyEvidenceToTomBase({
          agent,
          evidence: evAll,
          tuning: baseInput?.tuning?.tomUpdate,
        });
      }
    }

    // 4) Build Context Snapshot (AFTER state updates)
    const ctxResult = buildGoalLabContext(world, agentId, {
      snapshotOptions: baseInput.snapshotOptions,
      timeOverride: tickNow,
    });
    
    if (!ctxResult) break; // Agent not found or error
    
    let snap = ctxResult.snapshot;
    const prevSnapshot = snapshots.length ? snapshots[snapshots.length - 1] : null;

    // Orchestrator step: merges producer patches and attaches trace to snapshot.debug.orchestrator.
    try {
      const orchestrated = runTick({
        tickIndex: tickNow,
        snapshot: snap,
        prevSnapshot,
        overrides: null,
        registry: orchestratorRegistry,
        seed: (baseInput as any)?.seed ?? null,
      });
      snap = orchestrated.nextSnapshot;
    } catch (e) {
      console.error('[orchestrator] runTick failed', e);
    }

    snapshots.push(snap);

    // 5) Integrate Slow State (Affect/Stress/Traces)
    if (agent) {
       integrateAgentState({
           agent,
           atomsAfterAffect: snap.atoms,
           tuning: baseInput?.integratorTuning 
       });
    }

    // 5.5) CLOSE THE LOOP: decision -> scheduled world event (next tick)
    try {
      applyChosenActionToWorld({
        world,
        selfId: agentId,
        decision: (snap as any)?.decision,
        tickNow,
        dt,
      });
    } catch {}

    // 6. Compute Diffs if requested
    if (withDiffs && snapshots.length >= 2) {
      const prev = snapshots[snapshots.length - 2];
      const next = snap;
      diffs.push({
        tick: world.tick,
        atoms: shallowAtomDiff(
          Array.isArray(prev?.atoms) ? prev.atoms : [],
          Array.isArray(next?.atoms) ? next.atoms : []
        )
      });
    }
  }

  return { tick: world.tick, snapshots, diffs: withDiffs ? diffs : undefined, agentId };
}

export function runTicksForCast(args: {
  world: any;
  participantIds: string[];
  baseInput: any;
  cfg: TickConfig;
  withDiffs?: boolean;
}): TickResultCast {
  const { world, participantIds, baseInput, cfg, withDiffs } = args;
  const dt = cfg.dt ?? 1;
  const steps = cfg.steps ?? 1;

  const ids: string[] =
    arr(participantIds).length
      ? arr(participantIds)
      : arr(world?.agents || world?.entities).map((a: any) => a?.entityId).filter(Boolean);

  const snapshotsByAgentId: Record<string, any[]> = {};
  const diffsByAgentId: Record<string, any[]> = {};
  ids.forEach(id => {
    snapshotsByAgentId[id] = [];
    diffsByAgentId[id] = [];
  });

  for (let i = 0; i < steps; i++) {
    advanceWorldTick(world, dt);
    const tickNow = world.tick;

    const eventsNow = getEventsAtTick(world, tickNow);
    const worldEvents: WorldEvent[] = eventsNow.map(ev => {
      let kind = ev.domain;
      if (ev.tags && ev.tags.length > 0) {
        if (ev.tags.includes('help')) kind = 'helped';
        else if (ev.tags.includes('attack')) kind = 'attacked';
        else if (ev.tags.includes('betrayal')) kind = 'betrayed';
        else if (ev.tags.includes('lie')) kind = 'lied';
        else if (ev.tags.includes('shared_secret')) kind = 'shared_secret';
        else kind = ev.tags[0];
      }
      return {
        id: ev.id,
        tick: ev.t,
        kind,
        actorId: ev.actorId,
        targetId: ev.targetId,
        magnitude: ev.intensity,
        context: { locationId: ev.locationId },
      };
    });

    // Grow recognition from recent interaction events.
    applyAcquaintanceFromEvents(world, eventsNow);

    const evAll = extractEvidenceFromEvents({ events: eventsNow });

    // Relations + ToM for every agent
    for (const selfId of ids) {
      const agent =
        world.agents?.find((a: any) => a.entityId === selfId) ||
        world.entities?.find((e: any) => e.entityId === selfId) || null;
      if (!agent) continue;

      try {
        agent.relations = agent.relations || {};
        agent.relations.graph = agent.relations.graph || agent.rel_graph || { schemaVersion: 1, edges: [] };
        const updated = updateRelationshipGraphFromEvents({ graph: agent.relations.graph, selfId, events: worldEvents, nowTick: tickNow });
        agent.relations.graph = updated.graph;
      } catch {}

      try {
        if (evAll.length > 0) applyEvidenceToTomBase({ agent, evidence: evAll, tuning: baseInput?.tuning?.tomUpdate });
      } catch {}
    }

    // Snapshot + Affect integration for every agent
    for (const selfId of ids) {
      const agent =
        world.agents?.find((a: any) => a.entityId === selfId) ||
        world.entities?.find((e: any) => e.entityId === selfId) || null;
      if (!agent) continue;

      const ctxResult = buildGoalLabContext(world, selfId, { snapshotOptions: baseInput.snapshotOptions, timeOverride: tickNow });
      if (!ctxResult) continue;

      let snap = ctxResult.snapshot;
      const arr = snapshotsByAgentId[selfId] || (snapshotsByAgentId[selfId] = []);
      const prevSnapshot = arr.length ? arr[arr.length - 1] : null;

      // Orchestrator step: per-agent trace attached to snapshot.debug.orchestrator.
      try {
        const orchestrated = runTick({
          tickIndex: tickNow,
          snapshot: snap,
          prevSnapshot,
          overrides: null,
          registry: orchestratorRegistry,
          seed: (baseInput as any)?.seed ?? null,
        });
        snap = orchestrated.nextSnapshot;
      } catch (e) {
        console.error('[orchestrator] runTick failed', e);
      }

      arr.push(snap);

      try {
        integrateAgentState({ agent, atomsAfterAffect: snap.atoms, tuning: baseInput?.integratorTuning });
      } catch {}

      // CLOSE THE LOOP: decision -> scheduled world event (next tick)
      try {
        applyChosenActionToWorld({
          world,
          selfId,
          decision: (snap as any)?.decision,
          tickNow,
          dt,
        });
      } catch {}

      if (withDiffs && arr.length >= 2) {
        const prev = arr[arr.length - 2];
        (diffsByAgentId[selfId] || (diffsByAgentId[selfId] = [])).push({
          tick: world.tick,
          atoms: shallowAtomDiff(
            Array.isArray(prev?.atoms) ? prev.atoms : [],
            Array.isArray(snap?.atoms) ? snap.atoms : []
          )
        });
      }
    }
  }

  return { tick: world.tick, participantIds: ids, snapshotsByAgentId, diffsByAgentId: withDiffs ? diffsByAgentId : undefined };
}
