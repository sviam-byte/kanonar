export type ActionPatternFamily =
  | 'social'
  | 'aggressive'
  | 'support'
  | 'avoidant'
  | 'observe'
  | 'move'
  | 'rest'
  | 'work'
  | 'intent'
  | 'other';

export function familyOfActionKind(kind: string | null | undefined): ActionPatternFamily {
  const k = String(kind || '').toLowerCase();
  if (!k) return 'other';
  if (/^(start_intent|continue_intent|abort_intent)$/.test(k)) return 'intent';
  if (/^(talk|question_about|negotiate|npc|persuade|confide|encourage|warn|plead|challenge|signal|share|trade|praise|apologize|command|call_backup)$/.test(k)) return 'social';
  if (/^(help|cooperate|protect|comfort|guard|escort|treat)$/.test(k)) return 'support';
  if (/^(confront|attack|threaten|harm|accuse|suppress|cover_fire|rally)$/.test(k)) return 'aggressive';
  if (/^(avoid|hide|escape|flee|retreat|take_cover|submit)$/.test(k)) return 'avoidant';
  if (/^(observe|observe_target|verify|investigate)$/.test(k)) return 'observe';
  if (/^(move|move_xy|move_cell|patrol)$/.test(k)) return 'move';
  if (/^(wait|rest|sleep|mourn|celebrate)$/.test(k)) return 'rest';
  if (/^(inspect_feature|repair_feature|scavenge_feature|loot)$/.test(k)) return 'work';
  return 'other';
}

export function normalizeTargetId(targetId: string | null | undefined): string | null {
  const s = String(targetId ?? '').trim();
  return s ? s : null;
}

export function exactActionKey(kind: string | null | undefined, targetId: string | null | undefined): string {
  return `${String(kind || '')}:${normalizeTargetId(targetId) || ''}`;
}

export function familyActionKey(kind: string | null | undefined, targetId: string | null | undefined): string {
  return `${familyOfActionKind(kind)}:${normalizeTargetId(targetId) || ''}`;
}

export function sameTransactionalIntentKind(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = String(a || '').trim().toLowerCase();
  const right = String(b || '').trim().toLowerCase();
  if (!left || !right) return false;
  return left === right;
}
