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
