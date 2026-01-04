// lib/social/acquaintance.ts

import type {
  AgentState,
  WorldState,
  AcquaintanceEdge,
  AcquaintanceTier,
  Relationship,
} from '../../types';
import { clamp, safeNum } from '../util/safe';
import { getRelationshipFromTom } from '../tom/rel';

const tierOrder: AcquaintanceTier[] = ['unknown', 'seen', 'acquaintance', 'known', 'intimate'];

export function tierToMag(tier: AcquaintanceTier): number {
  switch (tier) {
    case 'unknown':
      return 0;
    case 'seen':
      return 0.25;
    case 'acquaintance':
      return 0.5;
    case 'known':
      return 0.75;
    case 'intimate':
      return 1;
    default:
      return 0;
  }
}

function bumpTier(cur: AcquaintanceTier, target: AcquaintanceTier): AcquaintanceTier {
  const ci = tierOrder.indexOf(cur);
  const ti = tierOrder.indexOf(target);
  return tierOrder[Math.max(ci, ti)] ?? cur;
}

export function ensureAcquaintance(agent: AgentState, otherId: string): AcquaintanceEdge {
  if (!agent.acquaintances) agent.acquaintances = {};
  const cur = agent.acquaintances[otherId];
  if (cur) return cur;

  const fresh: AcquaintanceEdge = {
    tier: 'unknown',
    kind: 'stranger',
    familiarity: 0,
    idConfidence: 0,
    notes: [],
  };
  agent.acquaintances[otherId] = fresh;
  return fresh;
}

export function touchSeen(
  world: WorldState | null | undefined,
  edge: AcquaintanceEdge,
  opts?: { idBoost?: number; famBoost?: number }
) {
  const t = (world as any)?.tick ?? (world as any)?.time ?? Date.now();
  edge.lastSeenAt = t;

  const idBoost = safeNum(opts?.idBoost, 0.08);
  const famBoost = safeNum(opts?.famBoost, 0.05);

  edge.idConfidence = clamp(safeNum(edge.idConfidence, 0) + idBoost, 0, 1);
  edge.familiarity = clamp(safeNum(edge.familiarity, 0) + famBoost, 0, 1);

  if (edge.tier === 'unknown') edge.tier = 'seen';
  else if (edge.tier === 'seen' && edge.idConfidence > 0.45) edge.tier = 'acquaintance';
  else if (edge.tier === 'acquaintance' && edge.familiarity > 0.6) edge.tier = 'known';
}

function kindFromRelationship(rel: Relationship | undefined): string {
  if (!rel) return 'stranger';
  const bond = safeNum((rel as any).bond, 0);
  const trust = safeNum((rel as any).trust, 0.5);
  const conflict = safeNum((rel as any).conflict, 0);

  // Rough heuristic; refine later with explicit flags.
  if (bond > 0.75 && trust > 0.65 && conflict < 0.35) return 'romance';
  if (bond > 0.55 && trust > 0.6) return 'friend';
  if (conflict > 0.65) return 'enemy';
  return 'colleague';
}

export function seedAcquaintanceFromSignals(args: {
  world: WorldState | null | undefined;
  agent: AgentState;
  otherId: string;
}) {
  const { world, agent, otherId } = args;
  const edge = ensureAcquaintance(agent, otherId);

  const rel =
    agent.relationships?.[otherId] ??
    (world ? getRelationshipFromTom({ world, agent, selfId: agent.entityId, otherId }) : undefined);

  const inferredKind = kindFromRelationship(rel);
  if (edge.kind === 'stranger' || edge.kind === 'none') edge.kind = inferredKind as any;

  // Strong signals should upgrade recognition quickly.
  const bond = safeNum((rel as any)?.bond, 0);
  const trust = safeNum((rel as any)?.trust, 0.5);

  if (bond > 0.85 && trust > 0.7) edge.tier = bumpTier(edge.tier, 'intimate');
  else if (bond > 0.65) edge.tier = bumpTier(edge.tier, 'known');
  else if (bond > 0.35) edge.tier = bumpTier(edge.tier, 'acquaintance');

  // Light confidence boost to avoid "no recognition" for strong pairs.
  edge.idConfidence = clamp(Math.max(safeNum(edge.idConfidence, 0), Math.min(0.9, 0.35 + bond)), 0, 1);
  edge.familiarity = clamp(Math.max(safeNum(edge.familiarity, 0), Math.min(0.9, 0.2 + bond)), 0, 1);

  return edge;
}

export function gateRelationshipByAcquaintance(
  edge: AcquaintanceEdge,
  rel: Relationship | undefined
): Relationship | undefined {
  if (!rel) return rel;

  const tier = edge?.tier ?? 'unknown';
  const idc = safeNum(edge?.idConfidence, 0);
  const fam = safeNum(edge?.familiarity, 0);

  // Recognition multiplier: unknown/seen => minimal, known/intimate => full strength.
  let k = 1;
  if (tier === 'unknown') k = 0.15;
  else if (tier === 'seen') k = 0.25;
  else if (tier === 'acquaintance') k = 0.55;
  else if (tier === 'known') k = 0.8;
  else if (tier === 'intimate') k = 1;

  k *= clamp(0.35 + 0.45 * idc + 0.2 * fam, 0.15, 1);

  const out: any = { ...rel };

  for (const key of ['trust', 'bond', 'respect', 'align', 'support', 'attachment', 'closeness']) {
    if (typeof out[key] === 'number') out[key] = clamp(out[key] * k, 0, 1);
  }

  // Fear/threat should not vanish with low recognition; keep some uncertainty.
  for (const key of ['fear', 'threat', 'conflict']) {
    if (typeof out[key] === 'number') {
      out[key] = clamp(out[key] * (0.7 + 0.3 * k) + (1 - k) * 0.1, 0, 1);
    }
  }

  return out as Relationship;
}

export function gateMetricsByAcquaintance<T extends Record<string, number>>(
  edge: AcquaintanceEdge,
  metrics: T
): T {
  const tier = edge?.tier ?? 'unknown';
  const idc = safeNum(edge?.idConfidence, 0);
  const fam = safeNum(edge?.familiarity, 0);

  let k = 1;
  if (tier === 'unknown') k = 0.15;
  else if (tier === 'seen') k = 0.25;
  else if (tier === 'acquaintance') k = 0.55;
  else if (tier === 'known') k = 0.8;
  else if (tier === 'intimate') k = 1;

  k *= clamp(0.35 + 0.45 * idc + 0.2 * fam, 0.15, 1);

  const out: any = { ...metrics };
  for (const key of Object.keys(out)) {
    const v = safeNum(out[key], 0);
    if (['trust', 'bond', 'respect', 'align', 'support', 'intimacy', 'closeness', 'attachment'].includes(key)) {
      out[key] = clamp(v * k, 0, 1);
    } else if (['threat', 'fear', 'conflict'].includes(key)) {
      out[key] = clamp(v * (0.7 + 0.3 * k) + (1 - k) * 0.1, 0, 1);
    } else {
      out[key] = v;
    }
  }
  return out as T;
}
