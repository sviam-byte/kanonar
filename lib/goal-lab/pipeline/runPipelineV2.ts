import { runGoalLabPipelineV1 } from './runPipelineV1';
import type {
  GoalLabArtifactV2,
  GoalLabSnapshotV1,
  GoalLabSnapshotV2,
  GoalLabStageFrameV2,
} from '../snapshotTypes';

/**
 * Wraps the existing V1 pipeline snapshot into a UI-friendly V2 snapshot.
 *
 * Conservative adapter: keeps simulation math untouched and only repackages
 * already-produced stage artifacts for a new inspector surface.
 */
export function runPipelineV2(ctx: any): GoalLabSnapshotV2 {
  const legacy = runGoalLabPipelineV1(ctx as any) as GoalLabSnapshotV1 | null;

  if (!legacy) {
    return {
      schemaVersion: 2,
      tick: Number((ctx as any)?.tickOverride ?? (ctx as any)?.world?.tick ?? 0),
      selfId: String((ctx as any)?.agentId ?? ''),
      actorIds: Array.isArray((ctx as any)?.participantIds) ? (ctx as any).participantIds : undefined,
      stages: [],
    };
  }

  const stages: GoalLabStageFrameV2[] = (legacy.stages ?? []).map((s: any) => {
    const artifacts: GoalLabArtifactV2[] = [];

    if (s.atomsProduced?.length) {
      artifacts.push({
        kind: 'atoms',
        label: `Atoms produced (${s.atomsProduced.length})`,
        layer: 'derived',
        payload: s.atomsProduced,
      });
    }
    if (s.atomsConsumed?.length) {
      artifacts.push({
        kind: 'atoms',
        label: `Atoms consumed (${s.atomsConsumed.length})`,
        layer: 'derived',
        payload: s.atomsConsumed,
      });
    }

    const a = s.artifacts || {};
    const pushIf = (kind: GoalLabArtifactV2['kind'], label: string, payload: unknown, layer?: GoalLabArtifactV2['layer']) => {
      if (payload === undefined) return;
      artifacts.push({ kind, label, payload, layer });
    };

    pushIf('belief', 'Belief / contextMind', a.contextMind ?? a.belief, 'belief');
    pushIf('goal.logits', 'Goal logits', a.goalLogits ?? a.logits, 'derived');
    pushIf('goals', 'Concrete goals', a.concreteGoals ?? a.goals, 'derived');
    pushIf('tom', 'ToM (dyadic)', a.tom ?? a.tomResult, 'belief');
    pushIf('decision', 'Decision snapshot', a.decision, 'derived');
    pushIf('world.truth', 'World truth / scene', a.worldTruth ?? a.sceneDump ?? a.world, 'truth');
    pushIf('world.actors', 'Actors (truth)', a.worldActors ?? a.actors, 'truth');
    pushIf('observation', 'Observation', a.observation ?? a.obs, 'observation');
    pushIf('intrinsics', 'Intrinsics', a.intrinsics ?? a.traits ?? a.bio, 'config');
    pushIf('dynamics', 'Dynamics / tick model', a.dynamics ?? a.transition, 'derived');
    pushIf('validators', 'Validators / stabilizers', a.validators ?? a.stabilizers, 'config');
    pushIf('modes', 'Pipeline modes', a.pipelineModes ?? a.modes ?? a.toggles, 'config');

    return {
      stageId: s.stage,
      stageName: s.title,
      summary: s.summary,
      artifacts,
    };
  });

  const pickFirst = (kind: GoalLabArtifactV2['kind']): unknown => {
    for (const st of stages) {
      const hit = st.artifacts.find((x) => x.kind === kind);
      if (hit) return hit.payload;
    }
    return undefined;
  };

  return {
    schemaVersion: 2,
    tick: legacy.tick,
    selfId: legacy.selfId,
    actorIds: (legacy as any).participantIds,
    worldTruth: pickFirst('world.truth'),
    worldActors: pickFirst('world.actors'),
    observation: pickFirst('observation'),
    belief: pickFirst('belief'),
    intrinsics: pickFirst('intrinsics'),
    tom: pickFirst('tom'),
    goals: pickFirst('goals'),
    decision: pickFirst('decision'),
    stages,
    legacy,
  };
}
