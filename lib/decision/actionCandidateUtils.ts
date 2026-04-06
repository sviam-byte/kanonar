import type { ContextAtom } from '../context/v2/types';
import type { Possibility } from '../possibilities/catalog';
import { arr } from '../utils/arr';
import { actionEffectForKind, FEATURE_GOAL_PROJECTION_KEYS } from './actionProjection';
import { ActionCandidate, ActionWhyModifier, ActionWhyTrace } from './actionCandidate';
import { getAtom } from '../util/atoms';
import { clamp01, clamp11 } from '../util/math';
import { FC } from '../config/formulaConfig';
import { getCtx } from '../context/layers';
import { familyOfActionKind } from '../behavior/actionPattern';

function keyFromPossibilityId(id: string): string {
  const parts = String(id || '').split(':');
  return parts[1] || parts[0] || '';
}

type WhyDraft = {
  usedAtomIds: Set<string>;
  notes: string[];
  parts: Record<string, any>;
  modifiers: ActionWhyModifier[];
  blockedBy: string[];
};

function makeWhyDraft(seedParts?: Record<string, any>): WhyDraft {
  return {
    usedAtomIds: new Set<string>(),
    notes: [],
    parts: { ...(seedParts || {}) },
    modifiers: [],
    blockedBy: [],
  };
}

function pushUsed(draft: WhyDraft, ...ids: Array<string | null | undefined>) {
  for (const id of ids) {
    if (typeof id !== 'string' || !id) continue;
    draft.usedAtomIds.add(id);
  }
}

function pushNotes(draft: WhyDraft, ...notes: Array<string | null | undefined>) {
  for (const note of notes) {
    if (typeof note !== 'string' || !note) continue;
    draft.notes.push(note);
  }
}

function pushModifier(draft: WhyDraft, modifier: ActionWhyModifier | null | undefined) {
  if (!modifier || typeof modifier !== 'object') return;
  draft.modifiers.push(modifier);
  for (const id of arr<string>(modifier.usedAtomIds)) pushUsed(draft, id);
}

function mergeWhyDraft(draft: WhyDraft, why?: ActionWhyTrace | null) {
  if (!why || typeof why !== 'object') return;
  pushUsed(draft, ...arr<string>(why.usedAtomIds));
  pushNotes(draft, ...arr<string>(why.notes));
  Object.assign(draft.parts, why.parts || {});
  for (const modifier of arr<ActionWhyModifier>(why.modifiers)) pushModifier(draft, modifier);
  for (const blocked of arr<string>(why.blockedBy)) {
    if (blocked) draft.blockedBy.push(blocked);
  }
}

function finalizeWhy(draft: WhyDraft): ActionWhyTrace {
  return {
    usedAtomIds: Array.from(draft.usedAtomIds),
    notes: draft.notes.slice(),
    parts: { ...(draft.parts || {}) },
    modifiers: draft.modifiers.slice(),
    blockedBy: draft.blockedBy.slice(),
  };
}

function readCtxSignal(atoms: ContextAtom[], selfId: string, axis: string, fallback = 0) {
  const picked = getCtx(atoms, selfId, axis, fallback);
  const value = clamp01(Number(picked?.magnitude ?? fallback));
  const usedAtomIds = picked?.id ? [picked.id] : [];
  return { value, usedAtomIds, picked };
}

function readFirstFinite(atoms: ContextAtom[], ids: string[], fallback = 0) {
  for (const id of ids) {
    const atom = getAtom(atoms, id);
    const value = Number((atom as any)?.magnitude ?? Number.NaN);
    if (Number.isFinite(value)) {
      return { value, usedAtomIds: [id], atomId: id };
    }
  }
  return { value: fallback, usedAtomIds: [], atomId: null as string | null };
}

function buildGoalEnergyMap(atoms: ContextAtom[], selfId: string): Record<string, number> {
  const out: Record<string, number> = {};
  const activePrefix = `util:activeGoal:${selfId}:`;
  for (const a of atoms) {
    if (!a?.id?.startsWith(activePrefix)) continue;
    const goalId = a.id.slice(activePrefix.length);
    out[goalId] = clamp01(Number((a as any)?.magnitude ?? 0));
  }

  if (Object.keys(out).length) return out;

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
): { deltaGoals: Record<string, number>; why: ActionWhyTrace } {
  const out: Record<string, number> = {};
  const why = makeWhyDraft({
    stage: 'buildDeltaGoals',
    actionKey,
    fallbackDelta: Number(fallbackDelta ?? 0),
    goalEnergy: { ...goalEnergy },
  });

  const allowPrefixA = `util:hint:allow:`;
  const allowPrefixB = `goal:hint:allow:`;
  const hintIds: string[] = [];

  for (const a of atoms) {
    if (!a?.id) continue;
    if (!a.id.startsWith(allowPrefixA) && !a.id.startsWith(allowPrefixB)) continue;
    const parts = a.id.split(':');
    const goalId = parts[3];
    const key = parts[4];
    if (!goalId || !key || key !== actionKey) continue;
    out[goalId] = clamp11(Number((a as any)?.magnitude ?? 0));
    hintIds.push(String(a.id));
  }

  if (Object.keys(out).length) {
    pushUsed(why, ...hintIds);
    pushNotes(why, 'deltaGoals:explicit-hints');
    why.parts.deltaGoalSource = 'explicitHints';
    why.parts.hintIds = hintIds.slice();
    why.parts.deltaGoalsBeforeContext = { ...out };
    return { deltaGoals: out, why: finalizeWhy(why) };
  }

  const effect = actionEffectForKind(actionKey);
  const effectKeys = Object.keys(effect);

  if (effectKeys.length > 0) {
    why.parts.deltaGoalSource = 'featureProjection';
    why.parts.effect = { ...effect };
    for (const [goalId, energy] of Object.entries(goalEnergy)) {
      if (Math.abs(energy) < 1e-6) continue;
      const proj = FEATURE_GOAL_PROJECTION_KEYS[goalId];
      if (!proj) continue;

      let dot = 0;
      for (const [fk, coeff] of Object.entries(proj)) {
        dot += Number(coeff ?? 0) * Number((effect as any)[fk] ?? 0);
      }

      if (Math.abs(dot) > 1e-6) out[goalId] = clamp11(dot * 4);
    }
    why.parts.deltaGoalsBeforeContext = { ...out };
  }

  if (Object.keys(out).length > 0) {
    const danger = readCtxSignal(atoms, selfId, 'danger', 0);
    const fatigue = readFirstFinite(atoms, [`body:fatigue:${selfId}`, `cap:fatigue:${selfId}`], 0);

    pushUsed(why, ...danger.usedAtomIds, ...fatigue.usedAtomIds);
    why.parts.contextSignals = {
      danger: {
        value: danger.value,
        atomId: danger.picked?.id ?? null,
        layer: danger.picked?.layer ?? 'missing',
      },
      fatigue: {
        value: Number(fatigue.value ?? 0),
        atomId: fatigue.atomId,
      },
    };

    const CM = FC.tomMod.contextual;
    for (const [goalId, delta] of Object.entries(out)) {
      const d = Number(delta);
      if (!Number.isFinite(d) || Math.abs(d) < 1e-6) continue;

      let mod = 1.0;
      const modifierUsedIds = [...danger.usedAtomIds, ...fatigue.usedAtomIds];

      if ((goalId === 'safety' || goalId === 'survival') && d > 0) {
        mod = CM.dangerBaseScale + CM.dangerSlopeScale * danger.value;
        pushModifier(why, {
          stage: 'context',
          label: 'danger-boost',
          goalId,
          multiplier: Number(mod.toFixed(6)),
          usedAtomIds: modifierUsedIds,
          note: `danger=${danger.value.toFixed(3)} via ${danger.picked?.layer ?? 'missing'}`,
        });
      }
      if ((goalId === 'affiliation' || goalId === 'status') && danger.value > CM.affStatusDampenThreshold) {
        const damp = clamp01(CM.affStatusDampenBase - CM.affStatusDampenSlope * danger.value);
        mod *= damp;
        pushModifier(why, {
          stage: 'context',
          label: 'danger-social-dampen',
          goalId,
          multiplier: Number(damp.toFixed(6)),
          usedAtomIds: modifierUsedIds,
          note: `danger=${danger.value.toFixed(3)} above threshold`,
        });
      }
      if (d > 0 && fatigue.value > CM.fatigueThreshold) {
        const fatMod = clamp01(CM.fatigueBase - CM.fatigueSlope * fatigue.value);
        mod *= fatMod;
        pushModifier(why, {
          stage: 'context',
          label: 'fatigue-dampen',
          goalId,
          multiplier: Number(fatMod.toFixed(6)),
          usedAtomIds: modifierUsedIds,
          note: `fatigue=${Number(fatigue.value ?? 0).toFixed(3)}`,
        });
      }

      out[goalId] = clamp11(d * mod);
    }
    why.parts.deltaGoalsAfterContext = { ...out };
  }

  if (!Object.keys(out).length) {
    const topGoal = Object.entries(goalEnergy)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topGoal) {
      out[topGoal] = clamp11(fallbackDelta);
      why.parts.deltaGoalSource = 'topGoalFallback';
      why.parts.topGoalFallback = topGoal;
      pushNotes(why, `deltaGoals:top-goal-fallback:${topGoal}`);
    }
  }

  return { deltaGoals: out, why: finalizeWhy(why) };
}

function buildSupportAtoms(atoms: ContextAtom[], usedIds: string[]): ContextAtom[] {
  const uniqIds = Array.from(new Set(arr<string>(usedIds).filter(Boolean)));
  if (!uniqIds.length) return [];
  const byId = new Map(atoms.map((a) => [a.id, a]));
  return uniqIds.map((id) => byId.get(id)).filter(Boolean) as ContextAtom[];
}

export function buildActionCandidates(args: {
  selfId: string;
  atoms: ContextAtom[];
  possibilities: Possibility[];
  currentTick?: number;
}): { actions: ActionCandidate[]; goalEnergy: Record<string, number> } {
  const actions: ActionCandidate[] = [];
  const goalEnergy = buildGoalEnergyMap(args.atoms, args.selfId);

  for (const p of arr<Possibility>(args.possibilities)) {
    const key = keyFromPossibilityId(p.id);
    const targetId = (p as any)?.targetId ?? null;
    const deltaInfo = buildDeltaGoals(
      args.atoms,
      args.selfId,
      key,
      Number((p as any)?.magnitude ?? 0),
      goalEnergy
    );
    const deltaGoals = deltaInfo.deltaGoals;
    const why = makeWhyDraft({
      possibilityId: String(p.id),
      kind: key,
      targetId,
      possibilityMagnitude: Number((p as any)?.magnitude ?? 0),
      possibilityConfidence: Number((p as any)?.confidence ?? 1),
    });
    mergeWhyDraft(why, deltaInfo.why);
    pushUsed(why, ...arr<string>((p as any)?.trace?.usedAtomIds));
    if ((p as any)?.trace?.parts) why.parts.possibilityTrace = (p as any).trace.parts;
    if (Array.isArray((p as any)?.trace?.notes) && (p as any).trace.notes.length) {
      pushNotes(why, ...arr<string>((p as any)?.trace?.notes).map((n) => `poss:${n}`));
    }

    const offerDeltas: Record<string, number> | undefined = (p as any)?.meta?.sim?.deltaGoals;
    if (offerDeltas && typeof offerDeltas === 'object') {
      const OFFER_W = 0.6;
      const PROJ_W = 1 - OFFER_W;
      const allKeys = new Set([...Object.keys(deltaGoals), ...Object.keys(offerDeltas)]);
      for (const g of allKeys) {
        const proj = Number(deltaGoals[g] ?? 0);
        const offer = Number(offerDeltas[g] ?? 0);
        deltaGoals[g] = clamp11(PROJ_W * proj + OFFER_W * offer);
      }
      why.parts.offerBlend = {
        offerWeight: OFFER_W,
        projectionWeight: PROJ_W,
        offerDeltas: { ...offerDeltas },
      };
      pushModifier(why, {
        stage: 'simkit-offer-blend',
        label: 'offer-delta-blend',
        targetId,
        value: OFFER_W,
        usedAtomIds: arr<string>((p as any)?.trace?.usedAtomIds),
        note: 'Blended projection deltas with SimKit tactical deltas',
      });
    }

    if (targetId && typeof targetId === 'string') {
      const readTargetSignal = (ids: string[], fallback = 0.5) => {
        const found = readFirstFinite(args.atoms, ids, fallback);
        return {
          value: clamp01(Number(found.value ?? fallback)),
          usedAtomIds: found.usedAtomIds,
          atomId: found.atomId,
        };
      };

      const tomRead = (metric: string) => readTargetSignal([
        `tom:dyad:final:${metric}:${args.selfId}:${targetId}`,
        `tom:effective:dyad:${metric}:${args.selfId}:${targetId}`,
        `tom:ctx:dyad:${metric}:${args.selfId}:${targetId}`,
        `tom:dyad:${metric}:${args.selfId}:${targetId}`,
        `rel:state:${metric}:${args.selfId}:${targetId}`,
        `tom:dyad:${args.selfId}:${targetId}:${metric}`,
        `tom:effective:dyad:${args.selfId}:${targetId}:${metric}`,
        `tom:ctx:dyad:${args.selfId}:${targetId}:${metric}`,
      ]);

      const trust = tomRead('trust');
      const threat = tomRead('threat');
      const intimacy = tomRead('intimacy');
      const support = tomRead('support');
      const alignment = tomRead('alignment');
      const physThreat = readTargetSignal([`phys:threat:${args.selfId}:${targetId}`]);
      const socialStandingRaw = readFirstFinite(args.atoms, [`social:rank:diff:${args.selfId}:${targetId}`], 0);
      const socialStanding = Number(socialStandingRaw.value ?? 0);

      pushUsed(
        why,
        ...trust.usedAtomIds,
        ...threat.usedAtomIds,
        ...intimacy.usedAtomIds,
        ...support.usedAtomIds,
        ...alignment.usedAtomIds,
        ...physThreat.usedAtomIds,
        ...socialStandingRaw.usedAtomIds,
      );
      why.parts.targetSignals = {
        trust: { value: trust.value, atomId: trust.atomId },
        threat: { value: threat.value, atomId: threat.atomId },
        intimacy: { value: intimacy.value, atomId: intimacy.atomId },
        support: { value: support.value, atomId: support.atomId },
        alignment: { value: alignment.value, atomId: alignment.atomId },
        physThreat: { value: physThreat.value, atomId: physThreat.atomId },
        socialStanding: { value: socialStanding, atomId: socialStandingRaw.atomId },
      };

      const AGG = FC.tomMod.aggressive;
      const COOP = FC.tomMod.cooperative;
      const AVO = FC.tomMod.avoidant;

      const isAggressive = /confront|attack|threaten|harm/.test(key);
      const isCooperative = /help|cooperate|negotiate|npc|persuade|protect|comfort|guard|escort|treat/.test(key);
      const isAvoidant = /avoid|hide|escape|flee|retreat|take_cover|submit/.test(key);

      for (const [goalId, baseDelta] of Object.entries(deltaGoals)) {
        let mod = 1.0;
        const modUsedIds = [
          ...trust.usedAtomIds,
          ...threat.usedAtomIds,
          ...intimacy.usedAtomIds,
          ...support.usedAtomIds,
          ...alignment.usedAtomIds,
          ...physThreat.usedAtomIds,
          ...socialStandingRaw.usedAtomIds,
        ];

        if (isAggressive) {
          mod *= (1 - AGG.trustPenalty * trust.value) * (1 - AGG.intimacyPenalty * intimacy.value);
          mod *= (1 + AGG.threatBonus * threat.value);
          mod *= Number((AGG.goalWeights as any)?.[goalId] ?? 1);
          if (goalId === 'safety' || goalId === 'survival') {
            mod *= (1 - AGG.physThreatSafetyPenalty * physThreat.value);
          }
          if (goalId === 'status' || goalId === 'affiliation') {
            mod *= (1 - AGG.socialStandingStatusPenalty * Math.max(0, socialStanding));
          }
          if (goalId === 'status' || goalId === 'control') {
            mod *= (1 + AGG.dominanceBonus * clamp01(0.5 - socialStanding));
          }
        } else if (isCooperative) {
          mod *= (1 + COOP.trustBonus * trust.value) * (1 + COOP.alignmentBonus * alignment.value);
          mod *= (1 - COOP.threatPenalty * threat.value);
          mod *= (1 + COOP.supportBonus * support.value);
          mod *= Number((COOP.goalWeights as any)?.[goalId] ?? 1);
          if (goalId === 'affiliation') {
            mod *= (1 + COOP.intimacyBonus * intimacy.value);
          }
        } else if (isAvoidant) {
          mod *= (1 + AVO.threatBonus * threat.value + AVO.physThreatBonus * physThreat.value);
          mod *= (1 - AVO.trustPenalty * trust.value - AVO.intimacyPenalty * intimacy.value);
          mod *= Number((AVO.goalWeights as any)?.[goalId] ?? 1);
          if (goalId === 'safety' || goalId === 'survival') {
            mod *= (1 + AVO.safetyGoalBonus * clamp01((threat.value + physThreat.value) / 2));
          }
        }

        deltaGoals[goalId] = clamp11(baseDelta * mod);
        if (Math.abs(mod - 1) > 1e-6) {
          pushModifier(why, {
            stage: 'target-modulation',
            label: isAggressive ? 'aggressive-target-mod' : isCooperative ? 'cooperative-target-mod' : isAvoidant ? 'avoidant-target-mod' : 'target-mod',
            goalId,
            targetId,
            multiplier: Number(mod.toFixed(6)),
            usedAtomIds: modUsedIds,
            note: `baseDelta=${Number(baseDelta ?? 0).toFixed(3)}`,
          });
        }
      }
      why.parts.deltaGoalsAfterTarget = { ...deltaGoals };
    }

    const actionWhy = finalizeWhy(why);
    actions.push({
      id: String(p.id),
      kind: key,
      actorId: args.selfId,
      targetId: (p as any)?.targetId ?? null,
      targetNodeId: (p as any)?.targetNodeId ?? null,
      deltaGoals,
      cost: Number((p as any)?.meta?.cost ?? 0),
      confidence: clamp01(Number((p as any)?.confidence ?? 1)),
      supportAtoms: buildSupportAtoms(args.atoms, actionWhy.usedAtomIds),
      why: actionWhy,
      payload: (p as any)?.meta?.payload ?? undefined,
    });
  }

  const REP = FC.decision.repetition;
  const currentTick = Number.isFinite(args.currentTick as any) ? Number(args.currentTick) : null;
  if (REP) {
    let prevKind = '';
    let prevTargetId = '';
    let prevTick = -1;
    let prevBeliefId = '';
    let prevFamily = '';

    for (const a of args.atoms) {
      const id = String((a as any)?.id || '');
      if (!id.startsWith('belief:chosen:') || !id.endsWith(`:${args.selfId}`)) continue;
      const meta = (a as any)?.meta;
      if (meta && typeof meta === 'object') {
        prevBeliefId = id;
        prevKind = String(meta.kind || '');
        prevTargetId = String(meta.targetId || '');
        prevTick = Number(meta.tick ?? -1);
        prevFamily = String(meta.family || familyOfActionKind(meta.kind || ''));
      }
    }

    if (prevKind) {
      const tickGap = prevTick >= 0
        ? Math.max(1, currentTick != null ? currentTick - prevTick : 1)
        : 1;
      const decayFactor = Math.pow(1 - REP.decayPerTick, tickGap);

      for (const action of actions) {
        const kindMatch = keyFromPossibilityId(action.id) === prevKind || action.kind === prevKind;
        const actionFamily = familyOfActionKind(action.kind);
        const familyMatch = actionFamily === prevFamily;
        const targetMatch = action.targetId === prevTargetId && Boolean(prevTargetId);
        const sameFamilyNovelTarget = familyMatch
          && Boolean(action.targetId)
          && Boolean(prevTargetId)
          && action.targetId !== prevTargetId;
        const sameKindNovelTarget = kindMatch && sameFamilyNovelTarget && !targetMatch;

        if (!kindMatch && !familyMatch) continue;

        const penalty = (
          (kindMatch ? Number(REP.sameKindPenalty ?? 0) : 0) +
          (targetMatch ? Number(REP.sameTargetPenalty ?? 0) : 0) +
          (!kindMatch && familyMatch ? Number(REP.sameFamilyPenalty ?? 0) : 0) -
          (sameFamilyNovelTarget ? Number(REP.novelTargetRelief ?? 0) : 0)
        ) * decayFactor;
        const activeGoals = Object.keys(action.deltaGoals);
        if (activeGoals.length > 0 && Math.abs(penalty) > 1e-9) {
          const perGoal = penalty / activeGoals.length;
          for (const g of activeGoals) {
            action.deltaGoals[g] = clamp11(action.deltaGoals[g] - perGoal);
          }
        }

        const whyObj = action.why || { usedAtomIds: [], notes: [], parts: {} };
        whyObj.usedAtomIds = Array.from(new Set([...(whyObj.usedAtomIds || []), prevBeliefId].filter(Boolean)));
        whyObj.notes = [...arr<string>(whyObj.notes), `repetitionPenalty:${penalty.toFixed(3)}`];
        whyObj.parts = {
          ...(whyObj.parts || {}),
          repetition: {
            prevKind,
            prevTargetId: prevTargetId || null,
            prevFamily,
            actionFamily,
            tickGap,
            decayFactor,
            penalty,
            targetMatch,
            familyMatch,
            sameFamilyNovelTarget,
            sameKindNovelTarget,
          },
          deltaGoalsAfterRepetition: { ...action.deltaGoals },
        };
        whyObj.modifiers = [
          ...arr<ActionWhyModifier>(whyObj.modifiers),
          {
            stage: 'repetition',
            label: targetMatch
              ? 'same-kind-and-target'
              : sameKindNovelTarget
                ? 'same-kind-novel-target'
                : kindMatch
                  ? 'same-kind'
                  : sameFamilyNovelTarget
                    ? 'same-family-novel-target'
                    : 'same-family',
            targetId: action.targetId ?? null,
            delta: -Number(penalty.toFixed(6)),
            usedAtomIds: prevBeliefId ? [prevBeliefId] : [],
            note: activeGoals.length ? `spread across ${activeGoals.length} goals` : 'no active goals',
          },
        ];
        action.why = whyObj;
      }
    }
  }

  return { actions, goalEnergy };
}
