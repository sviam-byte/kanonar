import type { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { arr } from '../utils/arr';
import { ActionCandidate } from './actionCandidate';
import { scoreAction } from './scoreAction';
import { clamp01 } from '../util/math';
import { FC } from '../config/formulaConfig';

export type RankedDecision = {
  action: ActionCandidate;
  q: number;
  qUsed: number;
  sampleNoise: number;
  sampleScore: number;
  chosen: boolean;
  marginFromBest: number;
  inTieBand: boolean;
};

export type DecisionResult = {
  best: ActionCandidate | null;
  ranked: RankedDecision[];
  atoms: ContextAtom[];
};

function samplingQForAction(
  actionId: string,
  baseQ: number,
  overrides?: Record<string, number>
): number {
  if (!overrides) return baseQ;
  if (!Object.prototype.hasOwnProperty.call(overrides, actionId)) return baseQ;
  const v = Number((overrides as any)[actionId]);
  return Number.isFinite(v) ? v : baseQ;
}

function computeGoalContribs(action: ActionCandidate, goalEnergy: Record<string, number>) {
  const goalContribs: Record<string, number> = {};
  let rawGoalSum = 0;
  for (const [g, delta] of Object.entries(action.deltaGoals || {})) {
    const contrib = Number(goalEnergy[g] ?? 0) * Number(delta ?? 0);
    goalContribs[g] = contrib;
    rawGoalSum += contrib;
  }
  return { goalContribs, rawGoalSum };
}

function computeRiskPenalty(action: ActionCandidate, rawBeforeRisk: number) {
  const conf = clamp01(Number(action.confidence ?? 1));
  return FC.actionScoring.riskCoeff * Math.abs(rawBeforeRisk) * (1 - conf);
}

function toDecisionAtom(
  action: ActionCandidate,
  qBase: number,
  goalEnergy: Record<string, number>,
  samplingMeta?: { qUsed: number; noise: number; sampleScore: number; effectiveTemperature?: number; inTieBand?: boolean; marginFromBest?: number; nearTieActionIds?: string[] },
  chosen = false,
): ContextAtom {
  const extraUsedIds = arr<string>((action as any)?.why?.usedAtomIds);
  const usedAtomIds = Array.from(
    new Set(
      [
        ...action.supportAtoms.map((a) => a?.id).filter((id): id is string => Boolean(id)),
        ...extraUsedIds,
      ].filter((id) => id && !id.startsWith('goal:'))
    )
  );

  const { goalContribs, rawGoalSum } = computeGoalContribs(action, goalEnergy);
  const rawBeforeRisk = rawGoalSum - Number(action.cost ?? 0);
  const riskPenalty = computeRiskPenalty(action, rawBeforeRisk);
  const magnitude = clamp01(0.5 + 0.5 * Math.tanh(qBase));
  const qUsed = Number(samplingMeta?.qUsed ?? qBase);

  const whyParts = (action as any)?.why?.parts ?? null;
  const whyNotes = arr<string>((action as any)?.why?.notes).slice(0, 8);
  const modifiers = arr<any>((action as any)?.why?.modifiers).slice(0, 12);

  return normalizeAtom({
    id: `action:score:${action.actorId}:${action.id}`,
    ns: 'action',
    kind: 'decision',
    source: 'decision:score',
    origin: 'derived',
    subject: action.actorId,
    magnitude,
    confidence: clamp01(action.confidence),
    tags: ['action', 'score', action.kind, chosen ? 'chosen' : 'candidate'],
    label: `score:${action.kind}=${magnitude.toFixed(3)}`,
    trace: {
      usedAtomIds,
      notes: [
        `Q=${qBase.toFixed(3)}`,
        `confidence=${Number(action.confidence ?? 0).toFixed(3)}`,
        ...(chosen ? ['chosen'] : []),
        ...whyNotes,
      ],
      parts: {
        actionId: action.id,
        kind: action.kind,
        targetId: action.targetId ?? null,
        qBase,
        qUsed,
        sampledNoise: Number(samplingMeta?.noise ?? 0),
        sampledScore: Number(samplingMeta?.sampleScore ?? qUsed),
        chosen,
        effectiveTemperature: Number(samplingMeta?.effectiveTemperature ?? 0),
        inTieBand: Boolean(samplingMeta?.inTieBand),
        marginFromBest: Number(samplingMeta?.marginFromBest ?? 0),
        nearTieActionIds: arr<string>(samplingMeta?.nearTieActionIds).map(String),
        cost: Number(action.cost ?? 0),
        costBreakdown: (whyParts && typeof whyParts === 'object') ? (whyParts as any).costBreakdown ?? null : null,
        confidence: clamp01(action.confidence),
        goalContribs,
        rawGoalSum,
        rawBeforeRisk,
        riskPenalty,
        why: whyParts,
        modifiers,
      },
    },
  });
}

export function decideAction(args: {
  actions: ActionCandidate[];
  goalEnergy: Record<string, number>;
  temperature: number;
  rng: (() => number) | { next: () => number };
  topK?: number;
  qSamplingOverrides?: Record<string, number>;
}): DecisionResult {
  const actions = arr<ActionCandidate>(args.actions);

  const rankedBase = actions
    .map((action) => ({ action, q: scoreAction(action, args.goalEnergy) }))
    .sort((a, b) => b.q - a.q);

  const topK = Math.max(1, Number.isFinite(args.topK as any) ? Number(args.topK) : rankedBase.length);
  const topRanked = rankedBase.slice(0, topK);

  const rngNext = typeof args.rng === 'function'
    ? args.rng
    : (typeof (args.rng as any)?.next === 'function'
      ? () => Number((args.rng as any).next())
      : (() => 0.5));

  const overrides = args.qSamplingOverrides;

  const T = Math.max(0.05, Number(args.temperature ?? 1.0));
  const EXP = FC.actionScoring.exploration;
  const bestQ = Number(topRanked[0]?.q ?? 0);
  const nearTie = topRanked
    .filter((s) => bestQ - Number(s.q ?? 0) <= Number(EXP.tieBand ?? 0.08))
    .slice(0, Math.max(1, Number(EXP.tieTopK ?? 3)));
  const useTiePool = nearTie.length >= Math.max(2, Number(EXP.minTieCandidates ?? 2));
  const samplingPool = useTiePool ? nearTie : topRanked;
  const effectiveT = useTiePool ? T * Math.max(1, Number(EXP.tieTemperatureMultiplier ?? 1.4)) : T;
  const nearTieActionIds = nearTie.map((s) => String(s.action?.id || '')).filter(Boolean);

  let chosen: ActionCandidate | null = null;
  let bestScore = -Infinity;
  const sampleMeta = new Map<string, { qUsed: number; noise: number; sampleScore: number; effectiveTemperature: number; inTieBand: boolean; marginFromBest: number; nearTieActionIds: string[] }>();

  for (const s of topRanked) {
    const raw = rngNext();
    const u = Math.min(1 - 1e-12, Math.max(1e-12, Number(raw)));
    const noise = -Math.log(-Math.log(u));

    const id = String(s.action?.id || '');
    const qUsed = samplingQForAction(id, s.q, overrides);
    const inTieBand = nearTieActionIds.includes(id);
    const sampleScore = qUsed / effectiveT + noise;
    sampleMeta.set(id, {
      qUsed,
      noise,
      sampleScore,
      effectiveTemperature: effectiveT,
      inTieBand,
      marginFromBest: bestQ - Number(s.q ?? 0),
      nearTieActionIds,
    });

    if (!samplingPool.some((x) => String(x.action?.id || '') === id)) continue;
    if (sampleScore > bestScore) {
      bestScore = sampleScore;
      chosen = s.action;
    }
  }

  const ranked: RankedDecision[] = topRanked.map((s) => {
    const id = String(s.action?.id || '');
    const meta = sampleMeta.get(id) || { qUsed: s.q, noise: 0, sampleScore: s.q / effectiveT, effectiveTemperature: effectiveT, inTieBand: false, marginFromBest: bestQ - Number(s.q ?? 0), nearTieActionIds };
    return {
      action: s.action,
      q: s.q,
      qUsed: meta.qUsed,
      sampleNoise: meta.noise,
      sampleScore: meta.sampleScore,
      chosen: Boolean(chosen && chosen.id === id),
      marginFromBest: meta.marginFromBest,
      inTieBand: meta.inTieBand,
    };
  });

  const decisionAtoms = ranked.map((s) =>
    toDecisionAtom(s.action, s.q, args.goalEnergy, {
      qUsed: s.qUsed,
      noise: s.sampleNoise,
      sampleScore: s.sampleScore,
      effectiveTemperature: effectiveT,
      inTieBand: s.inTieBand,
      marginFromBest: s.marginFromBest,
      nearTieActionIds,
    }, s.chosen)
  );

  return { best: chosen, ranked, atoms: decisionAtoms };
}
