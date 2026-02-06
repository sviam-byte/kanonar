
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { Possibility } from '../possibilities/catalog';
import { scorePossibility, ScoredAction } from './score';
import { arr } from '../utils/arr';
import { RNG, sampleGumbel } from '../core/noise';

export type DecisionResult = {
  best: ScoredAction | null;
  ranked: ScoredAction[];
  atoms: ContextAtom[];
};

function tieBreak(a: ScoredAction, b: ScoredAction) {
  // 1) allowed first
  if (Boolean(a.allowed) !== Boolean(b.allowed)) return a.allowed ? -1 : 1;
  // 2) higher score
  const ds = (b.score ?? 0) - (a.score ?? 0);
  if (ds !== 0) return ds;
  // 3) lower cost
  const dc = (a.cost ?? 0) - (b.cost ?? 0);
  if (dc !== 0) return dc;
  // 4) stable by id
  return String(a?.p?.id || a?.id || '').localeCompare(String(b?.p?.id || b?.id || ''));
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function mkDecisionAtom(
  id: string,
  selfId: string,
  magnitude: number,
  usedAtomIds: string[],
  label: string,
  parts: any,
  tags: string[]
): ContextAtom {
  return normalizeAtom({
    id,
    ns: 'action',
    kind: 'decision',
    origin: 'derived',
    source: 'decide',
    subject: selfId,
    magnitude,
    confidence: 1,
    tags,
    label,
    trace: { usedAtomIds: Array.from(new Set(usedAtomIds.filter(Boolean))), notes: [], parts }
  } as any);
}

export function decideAction(args: {
  selfId: string;
  atoms: ContextAtom[];
  // Defensive: during iterative refactors a non-array may appear here.
  possibilities: Possibility[] | any;
  topK?: number;
  /** Optional deterministic RNG (recommended: agent.rngChannels.decide). */
  rng?: RNG;
  /** Gumbel-max temperature. T≈0.1 => almost deterministic, T≈1 => human-ish, T≈5 => chaotic. */
  temperature?: number;
}): DecisionResult {
  const poss = arr<Possibility>(args.possibilities);
  // Isolate goal atoms so action traces stay focused on non-goal context.
  const atoms = args.atoms.filter((a) => !a.id.startsWith('goal:'));
  const ranked = poss
    .map(p => scorePossibility({ selfId: args.selfId, atoms, p }))
    .sort(tieBreak);

  const topK = args.topK ?? 10;
  const topRanked = ranked.slice(0, topK);
  const decisionAtoms: ContextAtom[] = [];

  for (const item of topRanked) {
    const actionId = item.p.id;
    const used = item.why?.usedAtomIds || [];
    decisionAtoms.push(
      mkDecisionAtom(
        `action:gate:${args.selfId}:${actionId}`,
        args.selfId,
        item.allowed ? 1 : 0,
        used,
        item.allowed ? `gate:${actionId}=OK` : `gate:${actionId}=BLOCK`,
        { gateOk: item.allowed, blockedBy: item.why?.blockedBy || [] },
        ['action', 'gate', actionId]
      ),
      mkDecisionAtom(
        `action:prior:${args.selfId}:${actionId}`,
        args.selfId,
        clamp01(item.score),
        used,
        `prior:${actionId}=${Math.round(clamp01(item.score) * 100)}%`,
        { prior: item.score ?? 0 },
        ['action', 'prior', actionId]
      )
    );
  }

  // Stochastic but deterministic selection: Gumbel-max over (score / T + gumbel(T)).
  // If no rng is provided, fall back to deterministic (first allowed).
  const T = Math.max(0.05, Number(args.temperature ?? 1.0));
  const pool = topRanked.filter(x => x?.allowed);
  const candidates = (pool.length ? pool : topRanked).filter(Boolean);

  let chosen: ScoredAction | null = null;
  let noAllowed = false;

  if (candidates.length === 0) {
    chosen = null;
  } else if (!args.rng) {
    chosen = candidates[0] || null;
    noAllowed = Boolean(chosen && !chosen.allowed);
  } else {
    let best = candidates[0];
    let bestFinal = -Infinity;
    for (const item of candidates) {
      const base = (item.score ?? 0) / T;
      const noise = sampleGumbel(T, args.rng);
      const finalScore = base + noise;

      decisionAtoms.push(
        mkDecisionAtom(
          `action:stoch:${args.selfId}:${item.p.id}`,
          args.selfId,
          clamp01(finalScore / 10),
          item.why?.usedAtomIds || [],
          `stoch:${item.p.id}=base(${(item.score ?? 0).toFixed(3)})/T(${T.toFixed(2)})+g(${noise.toFixed(3)})`,
          { baseScore: item.score ?? 0, T, noise, finalScore },
          ['action', 'stochastic', item.p.id]
        )
      );

      if (finalScore > bestFinal) {
        bestFinal = finalScore;
        best = item;
      }
    }
    chosen = best || null;
    noAllowed = Boolean(chosen && !chosen.allowed);
  }

  if (chosen) {
    const targetId = (chosen.p as any)?.targetId ?? null;
    decisionAtoms.push(
      mkDecisionAtom(
        `action:choice:${args.selfId}`,
        args.selfId,
        1,
        [
          ...topRanked.map(p => `action:prior:${args.selfId}:${p.p.id}`),
          ...topRanked.map(p => `action:gate:${args.selfId}:${p.p.id}`),
          ...topRanked.map(p => `action:utility:${args.selfId}:${p.p.id}`),
        ],
        `choice:${chosen.p.id}${targetId ? `→${targetId}` : ''}`,
        {
          chosen: chosen.p.id,
          targetId,
          noAllowed,
          top: topRanked.slice(0, 7).map(p => ({
            a: p.p.id,
            targetId: (p.p as any)?.targetId ?? null,
            score: p.score,
            cost: p.cost,
            allowed: p.allowed,
          })),
        },
        ['action', 'choice']
      )
    );
  }

  const atoms = [...topRanked.flatMap(item => item.atoms || []), ...decisionAtoms];
  return { best: chosen, ranked: topRanked, atoms };
}
