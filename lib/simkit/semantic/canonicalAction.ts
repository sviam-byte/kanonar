import type { SimAction, SimWorld } from '../core/types';
import { familyOfActionKind } from '../../behavior/actionPattern';

export type CanonicalActionLifecycle =
  | 'single'
  | 'intent_start'
  | 'intent_continue'
  | 'intent_execute'
  | 'intent_complete'
  | 'intent_abort';

export type CanonicalAction = {
  transportKind: string;
  semanticKind: string;
  semanticFamily: string;
  semanticTargetId: string | null;
  lifecycle: CanonicalActionLifecycle;
  stageKind: string | null;
  social: string | null;
  topic: string | null;
};

function norm(v: any): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

function intentKey(actorId: string): string {
  return `intent:${actorId}`;
}

function originalFromAction(a: any, world?: SimWorld | null): any {
  if (a?.payload?.intent?.originalAction) return a.payload.intent.originalAction;
  if (a?.meta?.semanticOriginalAction) return a.meta.semanticOriginalAction;
  const fromFacts = world?.facts?.[intentKey(String(a?.actorId || ''))] as any;
  return fromFacts?.intent?.originalAction || null;
}

export function canonicalActionFromSimAction(a: SimAction | null | undefined, world?: SimWorld | null): CanonicalAction {
  const action: any = a || {};
  const cached = action?.meta?.canonicalAction;
  if (cached && typeof cached === 'object') {
    return {
      transportKind: String(cached.transportKind || action.kind || ''),
      semanticKind: String(cached.semanticKind || action.kind || ''),
      semanticFamily: String(cached.semanticFamily || familyOfActionKind(String(cached.semanticKind || action.kind || ''))),
      semanticTargetId: norm(cached.semanticTargetId ?? action.targetId),
      lifecycle: (cached.lifecycle || 'single') as CanonicalActionLifecycle,
      stageKind: norm(cached.stageKind),
      social: norm(cached.social),
      topic: norm(cached.topic),
    };
  }

  const transportKind = String(action.kind || '');
  const original = originalFromAction(action, world);
  const semanticKind = String(original?.kind || transportKind || '');
  const semanticTargetId = norm(original?.targetId ?? action.targetId);
  const factIntent = world?.facts?.[intentKey(String(action?.actorId || ''))] as any;
  const stageKind = norm(action?.meta?.stageKind ?? factIntent?.intentScript?.stages?.[factIntent?.stageIndex ?? 0]?.kind);

  let lifecycle: CanonicalActionLifecycle = 'single';
  if (transportKind === 'start_intent') lifecycle = 'intent_start';
  else if (transportKind === 'abort_intent') lifecycle = 'intent_abort';
  else if (transportKind === 'continue_intent') lifecycle = stageKind === 'execute' ? 'intent_execute' : 'intent_continue';

  return {
    transportKind,
    semanticKind,
    semanticFamily: familyOfActionKind(semanticKind),
    semanticTargetId,
    lifecycle,
    stageKind,
    social: norm(original?.meta?.social ?? action?.meta?.social),
    topic: norm(original?.meta?.topic ?? action?.meta?.topic),
  };
}

export function canonicalActionKey(a: SimAction | null | undefined, world?: SimWorld | null): string {
  const c = canonicalActionFromSimAction(a, world);
  return `${c.semanticKind}:${c.semanticTargetId || ''}`;
}

export function canonicalActionLabel(a: SimAction | null | undefined, world?: SimWorld | null): string {
  const c = canonicalActionFromSimAction(a, world);
  return c.semanticTargetId ? `${c.semanticKind}->${c.semanticTargetId}` : c.semanticKind;
}

export function isCanonicalDialogueAction(a: SimAction | null | undefined, world?: SimWorld | null): boolean {
  const c = canonicalActionFromSimAction(a, world);
  return c.semanticFamily === 'social' || c.semanticFamily === 'support';
}
