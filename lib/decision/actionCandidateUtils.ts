import type { ContextAtom } from '../context/v2/types';
import type { Possibility } from '../possibilities/catalog';
import { arr } from '../utils/arr';
import { actionEffectForKind, FEATURE_GOAL_PROJECTION_KEYS } from './actionProjection';
import { ActionCandidate } from './actionCandidate';
import { getMagById } from '../util/atoms';
import { clamp01, clamp11 } from '../util/math';
import { FC } from '../config/formulaConfig';


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

  // Context modulation: scale fallback deltas by situational relevance.
  // This only fires for fallback paths (hint atoms take precedence above).
  if (Object.keys(out).length > 0) {
    const danger = getMagById(atoms, `ctx:danger:${selfId}`, 0);
    const fatigue = getMagById(atoms, `body:fatigue:${selfId}`, getMagById(atoms, `cap:fatigue:${selfId}`, 0));

    const CM = FC.tomMod.contextual;
    for (const [goalId, delta] of Object.entries(out)) {
      const d = Number(delta);
      if (!Number.isFinite(d) || Math.abs(d) < 1e-6) continue;

      let mod = 1.0;
      // Safety/survival actions more effective when danger is present
      if ((goalId === 'safety' || goalId === 'survival') && d > 0) {
        mod = CM.dangerBaseScale + CM.dangerSlopeScale * danger;
      }
      // Social goals suppressed under high danger (triage behavior)
      if ((goalId === 'affiliation' || goalId === 'status') && danger > CM.affStatusDampenThreshold) {
        mod = clamp01(CM.affStatusDampenBase - CM.affStatusDampenSlope * danger);
      }
      // Physical actions penalized by fatigue
      if (d > 0 && fatigue > CM.fatigueThreshold) {
        const fatMod = clamp01(CM.fatigueBase - CM.fatigueSlope * fatigue);
        mod *= fatMod;
      }

      out[goalId] = clamp11(d * mod);
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

    // ── SimKit offer deltaGoals passthrough ──
    // When a SimKit spec (e.g. moveCellSpec) computes per-offer deltaGoals
    // from spatial/tactical analysis, those deltas ride along in
    // possibility.meta.sim.deltaGoals. Blend them into the projection-based
    // deltas so the GoalLab scorer sees the tactical signal.
    const offerDeltas: Record<string, number> | undefined =
      (p as any)?.meta?.sim?.deltaGoals;
    if (offerDeltas && typeof offerDeltas === 'object') {
      // Weight: offer deltas are additive on top of projection, with a
      // mixing weight. Pure offer deltas are ~0.1-0.3 range, projection
      // deltas are similar, so 0.6 offer / 0.4 projection keeps projection
      // as tiebreaker while letting spatial detail dominate.
      const OFFER_W = 0.6;
      const PROJ_W = 1 - OFFER_W;
      const allKeys = new Set([...Object.keys(deltaGoals), ...Object.keys(offerDeltas)]);
      for (const g of allKeys) {
        const proj = Number(deltaGoals[g] ?? 0);
        const offer = Number(offerDeltas[g] ?? 0);
        deltaGoals[g] = clamp11(PROJ_W * proj + OFFER_W * offer);
      }
    }

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

      const AGG = FC.tomMod.aggressive;
      const COOP = FC.tomMod.cooperative;
      const AVO = FC.tomMod.avoidant;

      const isAggressive = /confront|attack|threaten|harm/.test(key);
      const isCooperative = /help|cooperate|negotiate|npc|persuade|protect/.test(key);
      const isAvoidant = /avoid|hide|escape|flee/.test(key);

      for (const [goalId, baseDelta] of Object.entries(deltaGoals)) {
        let mod = 1.0;

        if (isAggressive) {
          mod *= (1 - AGG.trustPenalty * trust) * (1 - AGG.intimacyPenalty * intimacy);
          mod *= (1 + AGG.threatBonus * threat);
          if (goalId === 'safety' || goalId === 'survival') {
            mod *= (1 - AGG.physThreatSafetyPenalty * physThreat);
          }
          if (goalId === 'status' || goalId === 'affiliation') {
            mod *= (1 - AGG.socialStandingStatusPenalty * Math.max(0, socialStanding));
          }
        } else if (isCooperative) {
          mod *= (1 + COOP.trustBonus * trust) * (1 + COOP.alignmentBonus * alignment);
          mod *= (1 - COOP.threatPenalty * threat);
          mod *= (1 + COOP.supportBonus * support);
        } else if (isAvoidant) {
          mod *= (1 + AVO.threatBonus * threat + AVO.physThreatBonus * physThreat);
          mod *= (1 - AVO.trustPenalty * trust - AVO.intimacyPenalty * intimacy);
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


  // ── Repetition penalty: read belief:chosen:* from previous tick ──
  const REP = FC.decision.repetition;
  if (REP) {
    // Find previous chosen action from persisted belief atoms.
    let prevKind = '';
    let prevTargetId = '';
    let prevTick = -1;

    for (const a of args.atoms) {
      const id = String((a as any)?.id || '');
      if (!id.startsWith('belief:chosen:') || !id.endsWith(`:${args.selfId}`)) continue;
      const meta = (a as any)?.meta;
      if (meta && typeof meta === 'object') {
        prevKind = String(meta.kind || '');
        prevTargetId = String(meta.targetId || '');
        prevTick = Number(meta.tick ?? -1);
      }
    }

    if (prevKind) {
      // Estimate tick gap (conservative: if unknown, assume 1).
      // Current tick is not available here, so we use a heuristic:
      // if belief:chosen atom exists, it's from the immediately previous tick.
      const tickGap = prevTick >= 0 ? 1 : 1;
      const decayFactor = Math.pow(1 - REP.decayPerTick, tickGap);

      for (const action of actions) {
        const kindMatch = keyFromPossibilityId(action.id) === prevKind || action.kind === prevKind;
        const targetMatch = kindMatch && action.targetId === prevTargetId && Boolean(prevTargetId);

        if (kindMatch) {
          // Apply penalty as a negative delta to ALL goals (reduces Q uniformly).
          const penalty = (REP.sameKindPenalty + (targetMatch ? REP.sameTargetPenalty : 0)) * decayFactor;
          // Spread penalty across active goals.
          const activeGoals = Object.keys(action.deltaGoals);
          if (activeGoals.length > 0) {
            const perGoal = penalty / activeGoals.length;
            for (const g of activeGoals) {
              action.deltaGoals[g] = clamp11(action.deltaGoals[g] - perGoal);
            }
          }
        }
      }
    }
  }

  return { actions, goalEnergy };
}
