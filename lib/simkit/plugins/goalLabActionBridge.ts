// lib/simkit/plugins/goalLabActionBridge.ts
// Thin bridge: GoalLab S8 decision -> SimAction -> SimKit.

import type { GoalLabPipelineV1 } from '../../goal-lab/pipeline/runPipelineV1';
import type { SimPlugin } from '../core/simulator';
import type { SimSnapshot, SimWorld } from '../core/types';
import type { ActionKind, SimAction } from '../core/types';
import { toSimAction } from '../actions/fromActionCandidate';
import { runGoalLabPipelineV1 } from '../../goal-lab/pipeline/runPipelineV1';
import { buildWorldStateFromSim } from './goalLabWorldState';

const ACTION_KINDS: ActionKind[] = [
  'move',
  'move_xy',
  'wait',
  'rest',
  'talk',
  'attack',
  'observe',
  'question_about',
  'negotiate',
  'inspect_feature',
  'repair_feature',
  'scavenge_feature',
  'start_intent',
  'continue_intent',
  'abort_intent',
];

function resolveActionKind(best: any): ActionKind {
  const fromMeta = String(best?.meta?.sim?.kind || best?.meta?.kind || '').trim();
  if ((ACTION_KINDS as string[]).includes(fromMeta)) return fromMeta as ActionKind;

  const rawId = String(best?.id || '');
  const parts = rawId.split(':');
  const key = parts.length >= 2 ? parts[1] : rawId;
  if ((ACTION_KINDS as string[]).includes(key)) return key as ActionKind;

  // Fallback: stay conservative and produce a safe no-op.
  return 'wait';
}

function extractDecisionBest(result: GoalLabPipelineV1): any | null {
  const s8 = result.stages.find((s) => s.stage === 'S8');
  const best = (s8 as any)?.artifacts?.best ?? null;
  return best || null;
}

/**
 * Convert GoalLab S8 decision into a SimAction.
 * This is intentionally conservative: if decision is missing or disallowed,
 * no action is emitted.
 */
export function extractSimAction(result: GoalLabPipelineV1): SimAction | null {
  const best = extractDecisionBest(result);
  if (!best || best.allowed === false) return null;

  const kind = resolveActionKind(best);
  const decisionId = String(best?.id ?? '');
  const action = toSimAction(
    {
      ...best,
      kind,
      actorId: result.selfId,
    },
    result.tick
  );

  return {
    ...action,
    id: `act:${kind}:${result.tick}:${result.selfId}:gl:${decisionId || 'unknown'}`,
    meta: {
      ...(action as any).meta,
      source: 'goalLab',
      decisionId,
      score: Number((best as any)?.q ?? 0),
      cost: Number(best?.cost ?? 0),
    },
  };
}

function buildSnapshot(world: SimWorld, tickIndex: number): SimSnapshot {
  return {
    schema: 'SimKitSnapshotV1',
    id: `sim:gl:t${String(tickIndex).padStart(5, '0')}`,
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

export function makeGoalLabActionBridgePlugin(opts?: {
  participantIds?: string[];
}): SimPlugin {
  return {
    id: 'plugin:goalLabActionBridge',
    decideActions: ({ world, tickIndex }) => {
      const snapshot = buildSnapshot(world, tickIndex);
      const participantIds = (opts?.participantIds && opts.participantIds.length)
        ? opts.participantIds.map(String)
        : Object.keys(world.characters || {}).sort();
      const worldState = buildWorldStateFromSim(world, snapshot);
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

        const action = extractSimAction(pipeline);
        if (action) actions.push(action);
      }

      return actions;
    },
  };
}
