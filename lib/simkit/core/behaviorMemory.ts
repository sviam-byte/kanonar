import { exactActionKey, familyActionKey, familyOfActionKind, normalizeTargetId } from '../../behavior/actionPattern';
import { FCS } from '../../config/formulaConfigSim';

export type BehaviorMemoryItem = {
  kind: string;
  family: string;
  targetId: string | null;
  tick: number;
};

function memKey(agentId: string): string {
  return `behaviorMemory:${agentId}`;
}

export function getBehaviorMemory(facts: any, agentId: string): BehaviorMemoryItem[] {
  const raw = facts?.[memKey(agentId)];
  return Array.isArray(raw) ? raw : [];
}

export function recordBehaviorMemory(
  facts: any,
  agentId: string,
  kind: string,
  targetId: string | null | undefined,
  tick: number,
): BehaviorMemoryItem[] {
  const history = getBehaviorMemory(facts, agentId).slice();
  const normalized: BehaviorMemoryItem = {
    kind: String(kind || ''),
    family: familyOfActionKind(kind),
    targetId: normalizeTargetId(targetId),
    tick: Number.isFinite(tick) ? tick : -1,
  };
  const last = history[history.length - 1];
  const duplicateTail = Boolean(last)
    && String(last.kind || '') === normalized.kind
    && String(last.family || '') === normalized.family
    && normalizeTargetId(last.targetId) === normalized.targetId
    && Number(last.tick ?? -1) === normalized.tick;
  if (!duplicateTail) history.push(normalized);
  const keep = Number(FCS.behaviorVariety.historyWindow ?? 12);
  if (history.length > keep) history.splice(0, history.length - keep);
  facts[memKey(agentId)] = history;
  return history;
}

export function summarizeBehaviorPattern(
  facts: any,
  agentId: string,
  kind: string,
  targetId: string | null | undefined,
): {
  family: string;
  exactStreak: number;
  familyStreak: number;
  seenTargetInFamily: boolean;
  recentExactKey: string;
  recentFamilyKey: string;
} {
  const history = getBehaviorMemory(facts, agentId);
  const family = familyOfActionKind(kind);
  const normalizedTarget = normalizeTargetId(targetId);
  const exactKey = exactActionKey(kind, normalizedTarget);
  const famKey = familyActionKey(kind, normalizedTarget);

  let exactStreak = 0;
  let familyStreak = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const h = history[i];
    if (exactActionKey(h.kind, h.targetId) === exactKey) exactStreak += 1;
    else break;
  }
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const h = history[i];
    if (h.family === family) familyStreak += 1;
    else break;
  }

  const noveltyWindow = Number(FCS.behaviorVariety.noveltyWindow ?? 6);
  const recent = history.slice(-noveltyWindow);
  const seenTargetInFamily = recent.some((h) => h.family === family && h.targetId === normalizedTarget);

  return {
    family,
    exactStreak,
    familyStreak,
    seenTargetInFamily,
    recentExactKey: exactKey,
    recentFamilyKey: famKey,
  };
}

function cooldownKey(agentId: string): string {
  return `intentCooldown:${agentId}`;
}

export function markIntentCooldown(
  facts: any,
  agentId: string,
  kind: string,
  targetId: string | null | undefined,
  tick: number,
): void {
  const key = cooldownKey(agentId);
  const store: any = facts?.[key] && typeof facts[key] === 'object' ? facts[key] : {};
  const target = normalizeTargetId(targetId);
  const exact = exactActionKey(kind, target);
  const family = familyActionKey(kind, target);
  store[exact] = tick;
  store[`family:${family}`] = tick;
  facts[key] = store;
}

export function readIntentCooldown(
  facts: any,
  agentId: string,
  kind: string,
  targetId: string | null | undefined,
  tick: number,
): {
  exactGap: number | null;
  familyGap: number | null;
} {
  const key = cooldownKey(agentId);
  const store: any = facts?.[key] && typeof facts[key] === 'object' ? facts[key] : null;
  if (!store) return { exactGap: null, familyGap: null };
  const target = normalizeTargetId(targetId);
  const exactTick = Number(store[exactActionKey(kind, target)]);
  const familyTick = Number(store[`family:${familyActionKey(kind, target)}`]);
  return {
    exactGap: Number.isFinite(exactTick) ? tick - exactTick : null,
    familyGap: Number.isFinite(familyTick) ? tick - familyTick : null,
  };
}
