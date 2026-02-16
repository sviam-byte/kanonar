import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { arr } from '../utils/arr';
import { ActionCandidate } from './actionCandidate';
import { scoreAction } from './scoreAction';

export type DecisionResult = {
  best: ActionCandidate | null;
  ranked: Array<{ action: ActionCandidate; q: number }>;
  atoms: ContextAtom[];
};

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function toDecisionAtom(action: ActionCandidate, q: number): ContextAtom {
  const usedAtomIds = Array.from(
    new Set(
      action.supportAtoms
        .map((a) => a?.id)
        .filter((id): id is string => Boolean(id))
        .filter((id) => !id.startsWith('goal:'))
    )
  );
  const magnitude = clamp01(0.5 + 0.5 * Math.tanh(q));

  return normalizeAtom({
    id: `action:score:${action.actorId}:${action.id}`,
    ns: 'action',
    kind: 'decision',
    origin: 'derived',
    source: 'decide',
    subject: action.actorId,
    magnitude,
    confidence: clamp01(action.confidence),
    tags: ['action', 'score', action.kind],
    label: `score:${action.kind}=${magnitude.toFixed(3)}`,
    trace: {
      usedAtomIds,
      notes: [`Q=${q.toFixed(3)}`, `confidence=${action.confidence.toFixed(3)}`],
      parts: {
        actionId: action.id,
        kind: action.kind,
        targetId: action.targetId ?? null,
        q,
        confidence: action.confidence,
      },
    },
  } as any);
}

export function decideAction(args: {
  actions: ActionCandidate[];
  goalEnergy: Record<string, number>;
  temperature: number;
  rng: (() => number) | { next: () => number };
  topK?: number;
  /** Optional override used only during stochastic sampling; ranked q values remain unchanged. */
  qSamplingOverrides?: Record<string, number>;
}): DecisionResult {
  const actions = arr<ActionCandidate>(args.actions);

  // Base scores are used for ranking, reporting and decision traceability.
  const ranked = actions
    .map((action) => ({ action, q: scoreAction(action, args.goalEnergy) }))
    .sort((a, b) => b.q - a.q);

  const topK = Math.max(1, Number.isFinite(args.topK as any) ? Number(args.topK) : ranked.length);
  const topRanked = ranked.slice(0, topK);

  const rngNext = typeof args.rng === 'function'
    ? args.rng
    : (args.rng && typeof (args.rng as any).next === 'function')
      ? () => (args.rng as any).next()
      : () => 0.5;

  const overrides = (args.qSamplingOverrides && typeof args.qSamplingOverrides === 'object')
    ? args.qSamplingOverrides
    : {};

  const T = Math.max(0.05, Number(args.temperature ?? 1.0));
  let chosen: ActionCandidate | null = null;
  let bestScore = -Infinity;

  for (const s of topRanked) {
    const raw = rngNext();
    const safe = Math.max(1e-9, Math.min(1 - 1e-9, raw));
    const noise = -Math.log(-Math.log(safe));

    const id = String(s.action?.id || '');
    const qUsed = Number.isFinite(Number((overrides as any)[id]))
      ? Number((overrides as any)[id])
      : s.q;

    const v = qUsed / T + noise;
    if (v > bestScore) {
      bestScore = v;
      chosen = s.action;
    }
  }

  const decisionAtoms = topRanked.map((s) => toDecisionAtom(s.action, s.q));
  return { best: chosen, ranked: topRanked, atoms: decisionAtoms };
}
