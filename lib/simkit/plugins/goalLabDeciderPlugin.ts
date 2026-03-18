// lib/simkit/plugins/goalLabDeciderPlugin.ts
// SimKit plugin: use GoalLab pipeline S8 decision.best to decide SimActions.

import type { SimPlugin } from '../core/simulator';
import type { SimSnapshot, SimWorld } from '../core/types';
import type { SimAction } from '../core/types';
import { runGoalLabPipelineV1 } from '../../goal-lab/pipeline/runPipelineV1';
import { arr } from '../../utils/arr';
import { toSimAction } from '../actions/fromActionCandidate';
import { buildWorldStateFromSim } from './goalLabPipelinePlugin';
import { selectDecisionMode, type DecisionMode } from '../core/decisionGate';
import { reactiveDecision } from '../core/reactiveDecision';
import { FCS } from '../../config/formulaConfigSim';

function buildSnapshot(world: SimWorld, tickIndex: number): SimSnapshot {
  return {
    schema: 'SimKitSnapshotV1',
    id: `sim:gl:decider:t${String(tickIndex).padStart(5, '0')}`,
    time: new Date().toISOString(),
    tickIndex,
    characters: Object.values(world.characters || {}).sort((a: any, b: any) => a.id.localeCompare(b.id)),
    locations: Object.values(world.locations || {}).sort((a: any, b: any) => a.id.localeCompare(b.id)),
    events: (world.events || []).slice(),
    debug: {},
  } as any;
}

function readActorFilter(world: SimWorld): string[] {
  const raw = (world as any)?.facts?.['sim:actors'];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') return raw.split(',').map((x) => x.trim()).filter(Boolean);
  return [];
}

function extractDecisionBest(pipeline: any): any | null {
  const s8 = pipeline?.stages?.find((s: any) => s?.stage === 'S8');
  return (s8 as any)?.artifacts?.best ?? null;
}

function decorateAction(action: SimAction, best: any): SimAction {
  const score = Number((best as any)?.q ?? 0);
  const cost = Number(best?.cost ?? 0);
  const decisionId = String(best?.p?.id ?? best?.id ?? '');
  return {
    ...action,
    meta: {
      ...(action as any).meta,
      source: 'goalLab',
      decisionId,
      score,
      cost,
    },
  };
}

export function makeGoalLabDeciderPlugin(opts?: { storePipeline?: boolean; enableDualProcess?: boolean }): SimPlugin {
  return {
    id: 'plugin:goalLabDecider',
    decideActions: ({ world, tickIndex, offers }) => {
      // v32: GoalLab decider is default when plugin is present.
      // Set world.facts['sim:decider'] = 'heuristic' to explicitly disable it.
      if (String((world as any)?.facts?.['sim:decider'] ?? '') === 'heuristic') return null;

      const snapshot = buildSnapshot(world, tickIndex);
      const worldState = buildWorldStateFromSim(world, snapshot);
      const participantIds = Object.keys(world.characters || {}).sort();
      const actorFilter = readActorFilter(world);
      const actorIds = (actorFilter.length ? actorFilter : participantIds)
        .filter((id) => Boolean((world.characters || {})[id]))
        .sort();

      const actions: SimAction[] = [];

      for (const actorId of actorIds) {
        const dualProcessEnabled = opts?.enableDualProcess !== false;
        let mode: DecisionMode = 'deliberative';
        let gateResult: any = null;
        if (dualProcessEnabled) {
          const dr = selectDecisionMode(world, actorId);
          mode = dr.mode;
          gateResult = dr.gate;
        }

        // System 1: reactive shortcut.
        if (mode === 'reactive') {
          const rr = reactiveDecision(world, actorId, offers, tickIndex);
          if (rr.action) {
            rr.action.meta = {
              ...(rr.action.meta || {}),
              decisionMode: 'reactive',
              gate: gateResult,
              reactiveReason: rr.reason,
            };
            actions.push(rr.action);
          }
          continue;
        }

        // System 1.5: degraded params.
        const sceneControl: any = {};
        if (mode === 'degraded') {
          const dm = FCS.dualProcess.degradedModifiers;
          sceneControl.enableToM = dm.tomEnabled;
          sceneControl.enablePredict = dm.lookaheadEnabled;
          sceneControl._degradedTopK = dm.topK;
          sceneControl._degradedTempMult = dm.temperatureMultiplier;
        }

        const pipeline = runGoalLabPipelineV1({
          world: worldState as any,
          agentId: actorId,
          participantIds,
          tickOverride: tickIndex,
          ...(mode === 'degraded' ? { sceneControl } : {}),
        });
        if (!pipeline) continue;

        // v32 adapter fix: persist pipeline belief updates into world memory for next tick.
        // Required for repetition penalty, surprise feedback and pressure accumulation loops.
        const bpAtoms = arr((pipeline as any)?.beliefPersist?.beliefAtoms);
        if (bpAtoms.length) {
          const memKey = `mem:beliefAtoms:${actorId}`;
          const prev = arr((world.facts as any)?.[memKey]);
          const byId = new Map<string, any>();
          for (const a of prev) {
            const id = String((a as any)?.id || '');
            if (id) byId.set(id, a);
          }
          for (const a of bpAtoms) {
            const id = String((a as any)?.id || '');
            if (id) byId.set(id, a);
          }
          (world.facts as any)[memKey] = Array.from(byId.values());
        }

        if (opts?.storePipeline) {
          (world as any).facts = {
            ...(world as any).facts,
            'sim:goalLab:lastPipeline': pipeline,
          };
        }

        const best = extractDecisionBest(pipeline);
        if (!best) continue;

        const action = toSimAction(best, tickIndex);
        if (action) {
          const decorated = decorateAction(action, best);
          decorated.meta = { ...(decorated.meta || {}), decisionMode: mode, gate: gateResult };
          actions.push(decorated);
        }
      }

      return actions;
    },
  };
}
