// lib/metrics/tension.ts
//
// Held contradiction / tension mass C(t) — read-only metric over the goal-lab
// pipeline trace (I-0.5 / spine WP-B). FROZEN v1 2026-07-07: formulas, weights,
// and thresholds are the observable's definition (docs/TENSION_FUNCTIONAL.md)
// — deliberately NOT in formulaConfig, same discipline as probe/game.ts. Do
// not tune a constant to make a prediction pass; a change is a new version.
//
// Read-only guarantee: this module only READS the pipeline result. It emits no
// atoms, writes no facts, and must never influence a decision (gate coupling
// is Phase II, WP-E, own freeze). tests/goals/tension_contract.test.ts proves
// the pipeline result is byte-identical when the metric is computed.
//
// Everything is read defensively: a missing stage/atom/field contributes 0 —
// a dead channel is a result to triage, not a crash (runProbe convention).

import type { GoalLabPipelineV1 } from '../goal-lab/pipeline/runPipelineV1';

export type TensionChannelKey = 'dec' | 'goal' | 'mot' | 'refl' | 'epi';

export const TENSION_CHANNEL_KEYS: TensionChannelKey[] = ['dec', 'goal', 'mot', 'refl', 'epi'];

/** The exported C(t) vector: five source channels + provisional raw total. */
export interface TensionChannels {
  dec: number;
  goal: number;
  mot: number;
  refl: number;
  epi: number;
  /** Σ of the five RAW channels — provisional until the z-score baseline
   *  ensemble exists (TENSION_FUNCTIONAL §4); label reports accordingly. */
  total: number;
}

export type TensionPairType = 'AA' | 'VV' | 'AV';

/** One antagonistic candidate pair contributing to C_dec (typology §5). */
export interface TensionPair {
  aId: string;
  bId: string;
  type: TensionPairType;
  cos: number;
  /** min(s_a, s_b) · exp(−|Q_a−Q_b|/T̂) — this pair's mass in C_dec. */
  mass: number;
}

/** Declared-absent-in-trace reflexive inputs (TENSION_FUNCTIONAL §2.4).
 *  Weights are frozen; a caller that has the psych/archetype layer passes
 *  them here, otherwise they contribute 0. */
export interface ReflexiveExtras {
  valueBehaviorGapTotal?: number;
  guilt?: number;
  archetypeTension?: number;
  /** Dominant archetype mixture weight λ ∈ [0,1]. */
  lambda?: number;
  /** Mixture entropy in bits (4 poles ⇒ max 2). */
  mixtureEntropyBits?: number;
}

/** Caller-held retention state, threaded through the pure function. */
export interface TensionState {
  ema: Record<TensionChannelKey, number>;
  /** Consecutive ticks with C_k > θ_hold, per channel. */
  holdRun: Record<TensionChannelKey, number>;
}

export interface TensionReadout {
  channels: TensionChannels;
  /** C̄_k(t) — EMA per source channel (heldness substrate). */
  ema: Record<TensionChannelKey, number>;
  /** held_k(t) ⇔ C_k > θ_hold for m consecutive ticks. */
  held: Record<TensionChannelKey, boolean>;
  pairs: TensionPair[];
  /** Always true in v1: channels are raw, not z-scored (§4). */
  raw: true;
}

/** Frozen constants v1 — mirror of docs/TENSION_FUNCTIONAL.md §7. */
export const TENSION_V1 = {
  version: 'tension.v1',
  emaAlpha: 0.2,
  thetaHold: 0.3,
  holdTicks: 3,
  temperatureFloor: 0.05,
  reflexiveWeights: {
    valueBehaviorGapTotal: 0.25,
    guilt: 0.15,
    shame: 0.2,
    archetypeTension: 0.15,
    mixtureMargin: 0.1, // applied to 4λ(1−λ)
    mixtureEntropy: 0.15, // applied to H/log2(4)
  },
} as const;

const fin = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function findStage(pipeline: GoalLabPipelineV1 | null | undefined, stage: string): any {
  const stages = Array.isArray((pipeline as any)?.stages) ? (pipeline as any).stages : [];
  return stages.find((s: any) => String(s?.stage) === stage) ?? null;
}

/** All atoms across stages, deduped by id — last stage occurrence wins. */
function collectAtomsById(pipeline: GoalLabPipelineV1 | null | undefined): Map<string, any> {
  const out = new Map<string, any>();
  const stages = Array.isArray((pipeline as any)?.stages) ? (pipeline as any).stages : [];
  for (const s of stages) {
    for (const a of Array.isArray(s?.atoms) ? s.atoms : []) {
      const id = String(a?.id ?? '');
      if (id) out.set(id, a);
    }
  }
  return out;
}

/** Cosine over the union of keys; zero-norm on either side ⇒ 0. */
function cosineRecords(a: Record<string, number>, b: Record<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const v of Object.values(a)) na += fin(v) * fin(v);
  for (const v of Object.values(b)) nb += fin(v) * fin(v);
  if (na <= 0 || nb <= 0) return 0;
  for (const [k, v] of Object.entries(a)) dot += fin(v) * fin((b as any)[k]);
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

interface RankedLite {
  id: string;
  q: number;
  deltaGoals: Record<string, number>;
  contribByGoal: Record<string, number>;
}

function rankedOf(snapshot: any): RankedLite[] {
  const ranked = Array.isArray(snapshot?.ranked) ? snapshot.ranked : [];
  const out: RankedLite[] = [];
  for (const r of ranked) {
    const deltaGoals: Record<string, number> = {};
    for (const [g, d] of Object.entries((r?.deltaGoals && typeof r.deltaGoals === 'object' ? r.deltaGoals : {}) as Record<string, unknown>)) {
      deltaGoals[g] = fin(d);
    }
    const contribByGoal: Record<string, number> = {};
    for (const [g, c] of Object.entries((r?.contribByGoal && typeof r.contribByGoal === 'object' ? r.contribByGoal : {}) as Record<string, unknown>)) {
      contribByGoal[g] = fin(c);
    }
    out.push({ id: String(r?.id ?? ''), q: fin(r?.q), deltaGoals, contribByGoal });
  }
  return out;
}

/** Polarity = sign of the dominant contribByGoal entry (max |·|; tie ⇒ +). */
function dominantSign(contribByGoal: Record<string, number>): 1 | -1 {
  let bestAbs = -1;
  let sign: 1 | -1 = 1;
  for (const v of Object.values(contribByGoal)) {
    const a = Math.abs(v);
    if (a > bestAbs) {
      bestAbs = a;
      sign = v < 0 ? -1 : 1;
    }
  }
  return sign;
}

function pairType(a: RankedLite, b: RankedLite): TensionPairType {
  const sa = dominantSign(a.contribByGoal);
  const sb = dominantSign(b.contribByGoal);
  if (sa > 0 && sb > 0) return 'AA';
  if (sa < 0 && sb < 0) return 'VV';
  return 'AV';
}

/** C_dec = Σ_{(a,b)∈P} min(s_a,s_b)·exp(−|Q_a−Q_b|/T̂)  (§2.1). */
function computeDecisional(ranked: RankedLite[], temperature: number): { value: number; pairs: TensionPair[] } {
  const tHat = Math.max(TENSION_V1.temperatureFloor, fin(temperature));
  const stakes = ranked.map((r) => Object.values(r.contribByGoal).reduce((s, v) => s + Math.abs(v), 0));
  const pairs: TensionPair[] = [];
  let value = 0;
  for (let i = 0; i < ranked.length; i++) {
    for (let j = i + 1; j < ranked.length; j++) {
      const cos = cosineRecords(ranked[i].deltaGoals, ranked[j].deltaGoals);
      if (!(cos < 0)) continue; // strict antagonism; zero-norm candidates join no pair
      const mass = Math.min(stakes[i], stakes[j]) * Math.exp(-Math.abs(ranked[i].q - ranked[j].q) / tHat);
      value += mass;
      pairs.push({ aId: ranked[i].id, bId: ranked[j].id, type: pairType(ranked[i], ranked[j]), cos, mass });
    }
  }
  return { value, pairs };
}

/** C_goal = Σ_{g<g'} E_g E_g' max(0, −ρ_{gg'}), ρ = cos of delta columns (§2.2). */
function computeGoalLevel(ranked: RankedLite[], goalEnergy: Record<string, number>): number {
  const goals = new Set<string>();
  for (const r of ranked) for (const g of Object.keys(r.deltaGoals)) goals.add(g);
  const ids = Array.from(goals).sort();
  const columns = new Map<string, Record<string, number>>();
  ids.forEach((g) => {
    const col: Record<string, number> = {};
    ranked.forEach((r, idx) => {
      col[String(idx)] = fin(r.deltaGoals[g]);
    });
    columns.set(g, col);
  });
  let value = 0;
  for (let i = 0; i < ids.length; i++) {
    const ei = fin((goalEnergy as any)?.[ids[i]]);
    if (ei === 0) continue;
    for (let j = i + 1; j < ids.length; j++) {
      const ej = fin((goalEnergy as any)?.[ids[j]]);
      if (ej === 0) continue;
      const rho = cosineRecords(columns.get(ids[i])!, columns.get(ids[j])!);
      value += ei * ej * Math.max(0, -rho);
    }
  }
  return value;
}

/** C_mot = Σ_i max(0, shaped_i − postInhibition_i) over drv:* atoms (§2.3). */
function computeMotivational(atoms: Map<string, any>, selfId: string): number {
  let value = 0;
  for (const [id, atom] of atoms) {
    if (!id.startsWith('drv:') || !id.endsWith(`:${selfId}`)) continue;
    const parts = (atom as any)?.trace?.parts;
    value += Math.max(0, fin(parts?.shaped) - fin(parts?.postInhibition));
  }
  return value;
}

/** C_refl = Σ_j w_j x_j with frozen weights (§2.4). */
function computeReflexive(atoms: Map<string, any>, selfId: string, extras?: ReflexiveExtras): number {
  const W = TENSION_V1.reflexiveWeights;
  const shame = clamp01(fin(atoms.get(`emo:shame:${selfId}`)?.magnitude));
  const gap = clamp01(fin(extras?.valueBehaviorGapTotal));
  const guilt = clamp01(fin(extras?.guilt));
  const archetypeTension = clamp01(fin(extras?.archetypeTension));
  const lambda = clamp01(fin(extras?.lambda));
  const mixtureMargin = clamp01(4 * lambda * (1 - lambda));
  const mixtureEntropy = clamp01(fin(extras?.mixtureEntropyBits) / 2); // 4 poles ⇒ max 2 bits
  return (
    W.valueBehaviorGapTotal * gap +
    W.guilt * guilt +
    W.shame * shame +
    W.archetypeTension * archetypeTension +
    W.mixtureMargin * mixtureMargin +
    W.mixtureEntropy * mixtureEntropy
  );
}

/** C_epi = max_f belief:surprise magnitude; 0 if none (§2.5). */
function computeEpistemic(atoms: Map<string, any>, selfId: string): number {
  let value = 0;
  for (const [id, atom] of atoms) {
    if (!id.startsWith('belief:surprise:') || !id.endsWith(`:${selfId}`)) continue;
    const m = clamp01(fin((atom as any)?.magnitude));
    if (m > value) value = m;
  }
  return value;
}

function emptyState(): TensionState {
  return {
    ema: { dec: 0, goal: 0, mot: 0, refl: 0, epi: 0 },
    holdRun: { dec: 0, goal: 0, mot: 0, refl: 0, epi: 0 },
  };
}

export interface ComputeTensionOptions {
  /** Defaults to decisionSnapshot.selfId. */
  selfId?: string;
  /** Psych/archetype inputs the trace does not carry (§2.4). */
  reflexiveExtras?: ReflexiveExtras;
  /** Previous tick's retention state; omit/null on the first tick. */
  prev?: TensionState | null;
}

/**
 * Compute the C(t) vector from a finished pipeline result. Pure and
 * read-only: same input ⇒ same output, input untouched.
 */
export function computeTensionVector(
  pipeline: GoalLabPipelineV1 | null | undefined,
  opts?: ComputeTensionOptions,
): { readout: TensionReadout; state: TensionState } {
  const snapshot = findStage(pipeline, 'S8')?.artifacts?.decisionSnapshot ?? null;
  const selfId = String(opts?.selfId ?? snapshot?.selfId ?? '');
  const atoms = collectAtomsById(pipeline);
  const ranked = rankedOf(snapshot);
  const goalEnergy = (snapshot?.goalEnergy && typeof snapshot.goalEnergy === 'object'
    ? snapshot.goalEnergy
    : {}) as Record<string, number>;

  const { value: dec, pairs } = computeDecisional(ranked, fin(snapshot?.temperature));
  const channelsBase: Record<TensionChannelKey, number> = {
    dec,
    goal: computeGoalLevel(ranked, goalEnergy),
    mot: computeMotivational(atoms, selfId),
    refl: computeReflexive(atoms, selfId, opts?.reflexiveExtras),
    epi: computeEpistemic(atoms, selfId),
  };

  const prev = opts?.prev ?? null;
  const a = TENSION_V1.emaAlpha;
  const ema = {} as Record<TensionChannelKey, number>;
  const holdRun = {} as Record<TensionChannelKey, number>;
  const held = {} as Record<TensionChannelKey, boolean>;
  for (const k of TENSION_CHANNEL_KEYS) {
    const c = channelsBase[k];
    ema[k] = prev ? (1 - a) * fin(prev.ema[k]) + a * c : c;
    holdRun[k] = c > TENSION_V1.thetaHold ? (prev ? fin(prev.holdRun[k]) : 0) + 1 : 0;
    held[k] = holdRun[k] >= TENSION_V1.holdTicks;
  }

  const channels: TensionChannels = {
    ...channelsBase,
    total: TENSION_CHANNEL_KEYS.reduce((s, k) => s + channelsBase[k], 0),
  };

  return {
    readout: { channels, ema, held, pairs, raw: true },
    state: { ema, holdRun },
  };
}

/** Fresh retention state (explicit alternative to prev: null). */
export function initialTensionState(): TensionState {
  return emptyState();
}

/**
 * z-score channels against a frozen baseline ensemble (§4). The convention is
 * frozen now; the S_neutral baseline itself is deferred to MVP-0 (2026-07-07).
 */
export function normalizeTensionChannels(
  channels: TensionChannels,
  baseline: Record<TensionChannelKey, { mean: number; std: number }>,
): Record<TensionChannelKey, number> {
  const out = {} as Record<TensionChannelKey, number>;
  for (const k of TENSION_CHANNEL_KEYS) {
    const b = baseline?.[k];
    const std = fin(b?.std);
    out[k] = std > 0 ? (channels[k] - fin(b?.mean)) / std : 0;
  }
  return out;
}
