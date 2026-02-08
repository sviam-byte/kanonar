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

function toDecisionAtom(
  action: ActionCandidate,
  q: number,
  opts?: {
    minConfidence: number;
    momentumBonus: number;
    prevActionId: string | null;
    bonusApplied: boolean;
    wasFeasible: boolean;
  }
): ContextAtom {
  const usedAtomIds = Array.from(
    new Set(
      action.supportAtoms
        .map((a) => a?.id)
        .filter((id): id is string => Boolean(id))
        .filter((id) => !id.startsWith('goal:'))
    )
  );
  const magnitude = clamp01(0.5 + 0.5 * Math.tanh(q));

  const noteParts = [
    `Q=${q.toFixed(3)}`,
    `confidence=${action.confidence.toFixed(3)}`,
    `minConfidence=${opts?.minConfidence.toFixed(3) ?? 'n/a'}`,
    `momentumBonus=${opts?.momentumBonus.toFixed(3) ?? 'n/a'}`,
  ];
  if (opts?.bonusApplied) noteParts.push('momentum=applied');
  if (!opts?.wasFeasible) noteParts.push('feasible=fallback');

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
      notes: noteParts,
      parts: {
        actionId: action.id,
        kind: action.kind,
        targetId: action.targetId ?? null,
        q,
        confidence: action.confidence,
        prevActionId: opts?.prevActionId ?? null,
        minConfidence: opts?.minConfidence ?? null,
        momentumBonus: opts?.momentumBonus ?? null,
        momentumApplied: opts?.bonusApplied ?? false,
        feasible: opts?.wasFeasible ?? true,
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
  /** Optional hysteresis: prefer repeating the previous action a bit (reduces jitter). */
  prevActionId?: string | null;
  /** Feasibility gating: drop actions with confidence below this threshold. Default = 0.15. */
  minConfidence?: number;
  /** Hysteresis strength (added to q if action.id === prevActionId). Default = 0.25. */
  momentumBonus?: number;
}): DecisionResult {
  const actions = arr<ActionCandidate>(args.actions);

  // 1) Feasibility / precondition gate (cheap, robust):
  // If an action has low confidence (e.g., no ammo, blocked path), it should not be eligible to win.
  const minConf = clamp01(Number.isFinite(args.minConfidence as any) ? Number(args.minConfidence) : 0.15);
  const feasible = actions.filter((a) => clamp01(a.confidence) >= minConf);

  // If everything is infeasible, fall back to raw list to avoid returning null in degenerate scenarios.
  const candidates = feasible.length ? feasible : actions;

  const ranked = candidates
    .map((action) => {
      let q = scoreAction(action, args.goalEnergy);

      // 2) Hysteresis (anti-jitter): small bonus to repeat previous choice.
      const prevId = args.prevActionId ?? null;
      const mom = Number.isFinite(args.momentumBonus as any) ? Number(args.momentumBonus) : 0.25;
      const bonusApplied = Boolean(prevId && action.id === prevId);
      if (bonusApplied) q += mom;

      return { action, q, bonusApplied };
    })
    .sort((a, b) => b.q - a.q);

  const topK = Math.max(1, Number.isFinite(args.topK as any) ? Number(args.topK) : ranked.length);
  const topRanked = ranked.slice(0, topK);

  const rngNext = typeof args.rng === 'function'
    ? args.rng
    : (args.rng && typeof (args.rng as any).next === 'function')
      ? () => (args.rng as any).next()
      : () => 0.5;

  const T = Math.max(0.05, Number(args.temperature ?? 1.0));
  let chosen: ActionCandidate | null = null;
  let bestScore = -Infinity;

  for (const s of topRanked) {
    const raw = rngNext();
    const safe = Math.max(1e-9, Math.min(1 - 1e-9, raw));
    const noise = -Math.log(-Math.log(safe));
    const v = s.q / T + noise;
    if (v > bestScore) {
      bestScore = v;
      chosen = s.action;
    }
  }

  const decisionAtoms = topRanked.map((s) => toDecisionAtom(s.action, s.q, {
    minConfidence: minConf,
    momentumBonus: Number.isFinite(args.momentumBonus as any) ? Number(args.momentumBonus) : 0.25,
    prevActionId: args.prevActionId ?? null,
    bonusApplied: s.bonusApplied,
    wasFeasible: feasible.length > 0,
  }));
  return { best: chosen, ranked: topRanked, atoms: decisionAtoms };
}
