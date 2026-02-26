import type { ContextAtom } from '../context/v2/types';
import type { Possibility } from '../possibilities/catalog';
import { arr } from '../utils/arr';
import { actionEffectForKind, FEATURE_GOAL_PROJECTION_KEYS } from './actionProjection';
import { ActionCandidate } from './actionCandidate';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function clamp11(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(-1, Math.min(1, x));
}

function keyFromPossibilityId(id: string): string {
  const parts = String(id || '').split(':');
  return parts[1] || parts[0] || '';
}

function buildGoalEnergyMap(atoms: ContextAtom[], selfId: string): Record<string, number> {
  const out: Record<string, number> = {};
  const activePrefix = `util:activeGoal:${selfId}:`;
  for (const a of atoms) {
    if (!a?.id?.startsWith(activePrefix)) continue;
    const goalId = a.id.slice(activePrefix.length);
    // Goal energy is a [0..1] activation of each goal.
    out[goalId] = clamp01(Number((a as any)?.magnitude ?? 0));
  }

  if (Object.keys(out).length) return out;

  // Fallback: use domain goal atoms if util:* is missing.
  const domainPrefix = `goal:domain:`;
  for (const a of atoms) {
    if (!a?.id?.startsWith(domainPrefix)) continue;
    const parts = a.id.split(':');
    const domain = parts[2];
    const owner = parts[3];
    if (!domain || owner !== selfId) continue;
    out[domain] = clamp01(Number((a as any)?.magnitude ?? 0));
  }

  return out;
}

function buildDeltaGoals(
  atoms: ContextAtom[],
  selfId: string,
  actionKey: string,
  fallbackDelta: number,
  goalEnergy: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  // Backward-compatible hint reader: accept both util:* and goal:* sources.
  const allowPrefixA = `util:hint:allow:`;
  const allowPrefixB = `goal:hint:allow:`;

  for (const a of atoms) {
    if (!a?.id) continue;
    if (!a.id.startsWith(allowPrefixA) && !a.id.startsWith(allowPrefixB)) continue;
    const parts = a.id.split(':');
    const goalId = parts[3];
    const key = parts[4];
    if (!goalId || !key || key !== actionKey) continue;
    // IMPORTANT: deltaGoals can be negative (penalize a goal), so keep sign.
    out[goalId] = clamp11(Number((a as any)?.magnitude ?? 0));
  }

  if (Object.keys(out).length) return out;

  // Fallback #1: infer multi-goal deltas from action's feature-level effect.
  // This keeps multi-goal behavior even when explicit goal hints are absent.
  const effect = actionEffectForKind(actionKey);
  const effectKeys = Object.keys(effect);

  if (effectKeys.length > 0) {
    for (const [goalId, energy] of Object.entries(goalEnergy)) {
      if (Math.abs(energy) < 1e-6) continue;
      const proj = FEATURE_GOAL_PROJECTION_KEYS[goalId];
      if (!proj) continue;

      let dot = 0;
      for (const [fk, coeff] of Object.entries(proj)) {
        dot += Number(coeff ?? 0) * Number((effect as any)[fk] ?? 0);
      }

      // Scale projection to typical Δg range and clamp to stable bounds.
      if (Math.abs(dot) > 1e-6) out[goalId] = clamp11(dot * 4);
    }
  }

  // Fallback #2: preserve legacy top-goal behavior when projection is unavailable.
  if (!Object.keys(out).length) {
    const topGoal = Object.entries(goalEnergy)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topGoal) out[topGoal] = clamp11(fallbackDelta);
  }

  return out;
}

function buildSupportAtoms(atoms: ContextAtom[], p: Possibility): ContextAtom[] {
  const usedIds = arr<string>((p as any)?.trace?.usedAtomIds);
  if (!usedIds.length) return [];
  const byId = new Map(atoms.map((a) => [a.id, a]));
  return usedIds.map((id) => byId.get(id)).filter(Boolean) as ContextAtom[];
}

/**
 * Convert Possibilities into ActionCandidates using util:* hints when available.
 * This keeps the Action layer traceable without reading goal:* atoms directly.
 */
export function buildActionCandidates(args: {
  selfId: string;
  atoms: ContextAtom[];
  possibilities: Possibility[];
}): { actions: ActionCandidate[]; goalEnergy: Record<string, number> } {
  const actions: ActionCandidate[] = [];
  const goalEnergy = buildGoalEnergyMap(args.atoms, args.selfId);

  for (const p of arr<Possibility>(args.possibilities)) {
    const key = keyFromPossibilityId(p.id);
    const targetId = (p as any)?.targetId ?? null;
    const deltaGoals = buildDeltaGoals(
      args.atoms,
      args.selfId,
      key,
      Number((p as any)?.magnitude ?? 0),
      goalEnergy
    );

    // Target-specific ToM modulation:
    // keeps action kind identical but differentiates expected value by target.
    if (targetId && typeof targetId === 'string') {
      const tomRead = (metric: string): number => {
        const patterns = [
          `tom:dyad:${args.selfId}:${targetId}:${metric}`,
          `tom:effective:dyad:${args.selfId}:${targetId}:${metric}`,
          `tom:ctx:dyad:${args.selfId}:${targetId}:${metric}`,
        ];
        for (const pat of patterns) {
          const found = args.atoms.find(a => a?.id === pat);
          if (found) return clamp01(Number((found as any)?.magnitude ?? 0));
        }
        return 0.5;
      };

      const trust = tomRead('trust');
      const threat = tomRead('threat');
      const intimacy = tomRead('intimacy');
      const support = tomRead('support');
      const alignment = tomRead('alignment');

      // Physical threat estimate from derived dyad atoms.
      const physThreat = (() => {
        const a = args.atoms.find(a => a?.id === `phys:threat:${args.selfId}:${targetId}`);
        return a ? clamp01(Number((a as any)?.magnitude ?? 0)) : 0.5;
      })();

      // Signed social-rank differential: positive means target is higher rank.
      const socialStanding = (() => {
        const a = args.atoms.find(a => a?.id === `social:rank:diff:${args.selfId}:${targetId}`);
        return a ? Number((a as any)?.magnitude ?? 0) : 0;
      })();

      const isAggressive = /confront|attack|threaten|harm/.test(key);
      const isCooperative = /help|cooperate|negotiate|npc|persuade|protect/.test(key);
      const isAvoidant = /avoid|hide|escape|flee/.test(key);

      for (const [goalId, baseDelta] of Object.entries(deltaGoals)) {
        let mod = 1.0;

        if (isAggressive) {
          mod *= (1 - 0.4 * trust) * (1 - 0.3 * intimacy);
          mod *= (1 + 0.5 * threat);
          if (goalId === 'safety' || goalId === 'survival') {
            mod *= (1 - 0.6 * physThreat);
          }
          if (goalId === 'status' || goalId === 'affiliation') {
            mod *= (1 - 0.3 * Math.max(0, socialStanding));
          }
        } else if (isCooperative) {
          mod *= (1 + 0.4 * trust) * (1 + 0.2 * alignment);
          mod *= (1 - 0.3 * threat);
          mod *= (1 + 0.2 * support);
        } else if (isAvoidant) {
          mod *= (1 + 0.5 * threat + 0.3 * physThreat);
          mod *= (1 - 0.3 * trust - 0.2 * intimacy);
        }

        deltaGoals[goalId] = clamp11(baseDelta * mod);
      }
    }

    actions.push({
      id: String(p.id),
      kind: key,
      actorId: args.selfId,
      targetId: (p as any)?.targetId ?? null,
      targetNodeId: (p as any)?.targetNodeId ?? null,
      deltaGoals,
      cost: Number((p as any)?.meta?.cost ?? 0),
      confidence: clamp01(Number((p as any)?.confidence ?? 1)),
      supportAtoms: buildSupportAtoms(args.atoms, p),
      payload: (p as any)?.meta?.payload ?? undefined,
    });
  }

  return { actions, goalEnergy };
}
