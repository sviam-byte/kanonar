import type { SimAction } from './types';
import { normalizeTargetId } from '../../behavior/actionPattern';
import { FCS } from '../../config/formulaConfigSim';

type IntentLike = any;

const DIALOGUE_TRANSACTION_KINDS = new Set(['talk', 'question_about', 'negotiate']);

export function originalActionOfIntent(activeIntent: IntentLike): { kind: string; targetId: string | null; meta?: any } | null {
  const original = activeIntent?.intent?.originalAction;
  if (!original || typeof original !== 'object') return null;
  const kind = String((original as any).kind || '');
  if (!kind) return null;
  return {
    kind,
    targetId: normalizeTargetId((original as any).targetId),
    meta: (original as any).meta ?? null,
  };
}

export function intentStageKind(activeIntent: IntentLike): string {
  const stageIndex = Math.max(0, Number(activeIntent?.stageIndex ?? 0));
  return String(activeIntent?.intentScript?.stages?.[stageIndex]?.kind || '');
}

export function isCriticalIntentStage(activeIntent: IntentLike): boolean {
  const stage = intentStageKind(activeIntent);
  const critical = new Set<string>(Array.isArray(FCS.behaviorVariety.intentLifecycle?.criticalStages)
    ? [...FCS.behaviorVariety.intentLifecycle.criticalStages]
    : ['attach', 'execute']);
  return critical.has(stage);
}

export function transactionalIntentClass(kind: string | null | undefined, _meta?: any): string {
  const k = String(kind || '').toLowerCase();
  if (!k) return 'other';
  if (DIALOGUE_TRANSACTION_KINDS.has(k)) return 'dialogue';
  return `exact:${k}`;
}

export function isTransactionallyEquivalentAction(
  activeIntent: IntentLike,
  desiredAction: Pick<SimAction, 'kind' | 'targetId'> & { meta?: any } | null | undefined,
): boolean {
  const original = originalActionOfIntent(activeIntent);
  if (!original || !desiredAction) return false;
  const desiredKind = String((desiredAction as any).kind || '');
  if (!desiredKind) return false;
  if (normalizeTargetId((desiredAction as any).targetId) !== normalizeTargetId(original.targetId)) return false;
  if (desiredKind === original.kind) return true;
  const a = transactionalIntentClass(original.kind, original.meta);
  const b = transactionalIntentClass(desiredKind, (desiredAction as any).meta);
  return a === b && !a.startsWith('exact:');
}

export type IntentTraceSummary = {
  intentId: string | null;
  lifecycleState: string | null;
  originalKind: string | null;
  originalTargetId: string | null;
  stageKind: string;
  criticalStage: boolean;
  transactionalClass: string | null;
  startedAtTick: number | null;
  stageStartedAtTick: number | null;
  lastProgressTick: number | null;
  ticksSinceProgress: number;
  ticksInStage: number;
  stale: boolean;
};

export function summarizeIntentForTrace(activeIntent: IntentLike, currentTick: number): IntentTraceSummary | null {
  if (!activeIntent || typeof activeIntent !== 'object') return null;
  const original = originalActionOfIntent(activeIntent);
  const stageKind = intentStageKind(activeIntent);
  const staleness = getIntentStaleness(activeIntent, currentTick);
  return {
    intentId: activeIntent?.id != null ? String(activeIntent.id) : null,
    lifecycleState: activeIntent?.lifecycleState != null ? String(activeIntent.lifecycleState) : null,
    originalKind: original?.kind ?? null,
    originalTargetId: normalizeTargetId(original?.targetId ?? null),
    stageKind,
    criticalStage: isCriticalIntentStage(activeIntent),
    transactionalClass: original?.kind ? transactionalIntentClass(original.kind, original.meta) : null,
    startedAtTick: Number.isFinite(Number(activeIntent?.startedAtTick)) ? Number(activeIntent.startedAtTick) : null,
    stageStartedAtTick: Number.isFinite(Number(activeIntent?.stageStartedAtTick)) ? Number(activeIntent.stageStartedAtTick) : null,
    lastProgressTick: Number.isFinite(Number(activeIntent?.lastProgressTick)) ? Number(activeIntent.lastProgressTick) : null,
    ticksSinceProgress: staleness.ticksSinceProgress,
    ticksInStage: staleness.ticksInStage,
    stale: staleness.stale,
  };
}

export function buildIntentLifecycleTrace(args: {
  activeIntent: IntentLike;
  currentTick: number;
  status: 'start' | 'cooldown_fallback' | 'continued' | 'forced_continue' | 'dropped' | 'no_active_intent';
  reason: string;
  desiredAction?: { kind?: string | null; targetId?: string | null } | null;
  suppressedAction?: { kind?: string | null; targetId?: string | null } | null;
  fallbackAction?: { kind?: string | null; targetId?: string | null } | null;
  details?: Record<string, any> | null;
}) {
  const active = summarizeIntentForTrace(args.activeIntent, args.currentTick);
  return {
    status: args.status,
    reason: String(args.reason || ''),
    tick: Number(args.currentTick ?? 0),
    activeIntent: active,
    desiredAction: args.desiredAction
      ? {
          kind: args.desiredAction.kind != null ? String(args.desiredAction.kind) : null,
          targetId: normalizeTargetId(args.desiredAction.targetId ?? null),
        }
      : null,
    suppressedAction: args.suppressedAction
      ? {
          kind: args.suppressedAction.kind != null ? String(args.suppressedAction.kind) : null,
          targetId: normalizeTargetId(args.suppressedAction.targetId ?? null),
        }
      : null,
    fallbackAction: args.fallbackAction
      ? {
          kind: args.fallbackAction.kind != null ? String(args.fallbackAction.kind) : null,
          targetId: normalizeTargetId(args.fallbackAction.targetId ?? null),
        }
      : null,
    details: args.details ?? null,
  };
}

export function getIntentStaleness(activeIntent: IntentLike, currentTick: number): {
  stale: boolean;
  ticksSinceProgress: number;
  ticksInStage: number;
  stageKind: string;
} {
  const cfg = FCS.behaviorVariety.intentLifecycle;
  const stageKind = intentStageKind(activeIntent);
  const stageStartedAt = Number(activeIntent?.stageStartedAtTick ?? activeIntent?.startedAtTick ?? currentTick);
  const lastProgressTick = Number(activeIntent?.lastProgressTick ?? activeIntent?.startedAtTick ?? stageStartedAt);
  const ticksInStage = Math.max(0, currentTick - stageStartedAt);
  const ticksSinceProgress = Math.max(0, currentTick - lastProgressTick);
  const noProgressLimit = stageKind === 'approach'
    ? Number(cfg?.approachNoProgressTicks ?? 2)
    : Number(cfg?.staleIntentTicks ?? 4);
  const maxStageTicks = Number(cfg?.maxStageTicks ?? 6);
  return {
    stale: ticksSinceProgress >= noProgressLimit || ticksInStage >= maxStageTicks,
    ticksSinceProgress,
    ticksInStage,
    stageKind,
  };
}
