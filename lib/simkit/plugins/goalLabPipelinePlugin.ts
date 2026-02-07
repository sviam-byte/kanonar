// lib/simkit/plugins/goalLabPipelinePlugin.ts
// SimKit -> GoalLab Pipeline bridge. Runs GoalLab pipeline per tick and stores frames for UI/debug.

import type { SimPlugin } from '../core/simulator';
import type { SimWorld, SimSnapshot } from '../core/types';
import { runGoalLabPipelineV1 } from '../../goal-lab/pipeline/runPipelineV1';
import { buildWorldStateFromSim } from './goalLabWorldState';

export { buildWorldStateFromSim } from './goalLabWorldState';

function arr<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

export function pickAgentId(world: SimWorld): string | null {
  const ids = Object.keys(world.characters || {}).sort();
  return ids.length ? ids[0] : null;
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
