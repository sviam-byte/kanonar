// lib/simkit/plugins/goalLabDeciderPlugin.ts
// SimKit plugin: use GoalLab pipeline S8 decision.best to decide SimActions.

import type { SimPlugin } from '../core/simulator';
import type { SimSnapshot, SimWorld } from '../core/types';
import type { SimAction } from '../core/types';
import { runGoalLabPipelineV1 } from '../../goal-lab/pipeline/runPipelineV1';
import { toSimAction } from '../actions/fromActionCandidate';
import { buildWorldStateFromSim } from './goalLabPipelinePlugin';

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

export function makeGoalLabDeciderPlugin(opts?: { storePipeline?: boolean }): SimPlugin {
  return {
    id: 'plugin:goalLabDecider',
    decideActions: ({ world, tickIndex }) => {
      // Opt-in switch: by default SimKit uses orchestratorPlugin or heuristic offers.
      // Enable GoalLab decisions by setting world.facts['sim:decider'] = 'goallab'.
      if (String((world as any)?.facts?.['sim:decider'] ?? '') !== 'goallab') return null;

      const snapshot = buildSnapshot(world, tickIndex);
      const worldState = buildWorldStateFromSim(world, snapshot);
      const participantIds = Object.keys(world.characters || {}).sort();
      const actorFilter = readActorFilter(world);
      const actorIds = (actorFilter.length ? actorFilter : participantIds)
        .filter((id) => Boolean((world.characters || {})[id]))
        .sort();

      const actions: SimAction[] = [];

      for (const actorId of actorIds) {
        const pipeline = runGoalLabPipelineV1({
          world: worldState as any,
          agentId: actorId,
          participantIds,
          tickOverride: tickIndex,
        });
        if (!pipeline) continue;

        if (opts?.storePipeline) {
          (world as any).facts = {
            ...(world as any).facts,
            'sim:goalLab:lastPipeline': pipeline,
          };
        }

        const best = extractDecisionBest(pipeline);
        if (!best) continue;

        const action = toSimAction(best, tickIndex);
        if (action) actions.push(decorateAction(action, best));
      }

      return actions;
    },
  };
}
