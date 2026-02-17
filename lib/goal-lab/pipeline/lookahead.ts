import type { Provenance } from './contracts';
import { arr } from '../../utils/arr';
import { FEATURE_GOAL_PROJECTION_KEYS } from '../../decision/actionProjection';

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hash32(s: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type FeatureKey =
  | 'threat'
  | 'escape'
  | 'cover'
  | 'visibility'
  | 'socialTrust'
  | 'emotionValence'
  | 'resourceAccess'
  | 'scarcity'
  | 'fatigue'
  | 'stress';

export type FeatureVectorSnapshot = {
  z: Record<FeatureKey, number>;
  provenanceByKey: Record<FeatureKey, Provenance[]>;
  missing: Partial<Record<FeatureKey, string>>;
  note?: string;
};

export type LookaheadActionEval = {
  actionId: string;
  kind: string;
  qNow: number;
  v0: number;
  v1: number;
  qLookahead: number;
  delta: number;
  z1: Record<FeatureKey, number>;
  deltas: Partial<Record<FeatureKey, number>>;
  /** Per-goal V* breakdown at z1 (weighted contributions). */
  v1PerGoal?: Record<string, number>;
  /** Per-goal V* breakdown at z0 (weighted contributions). */
  v0PerGoal?: Record<string, number>;
  provenance?: Provenance[];
};

export type TransitionSnapshotLite = {
  enabled: boolean;
  gamma: number;
  riskAversion: number;
  seed: number;
  z0: FeatureVectorSnapshot;
  valueFn: { v0: number; note: string };
  perAction: LookaheadActionEval[];
  warnings: string[];
  /** Sensitivity at z1 (predicted): d(V*)/dz_k for the top action. */
  sensitivity?: Record<FeatureKey, number>;
  /** Sensitivity at z0 (current): how z0 perturbations change the Q_lookahead ranking. */
  sensitivityZ0?: Record<FeatureKey, number>;
  /** Which feature shift of ±0.1 would most affect the top-vs-2nd gap. */
  flipCandidates?: Array<{ feature: FeatureKey; deltaQ: number; wouldFlip: boolean }>;
};

function atomMag(atomsById: Map<string, any>, id: string): number | null {
  const a = atomsById.get(id);
  if (!a) return null;
  const m = Number((a as any)?.magnitude ?? (a as any)?.value ?? 0);
  return Number.isFinite(m) ? m : null;
}

export function buildFeatureVectorFromAtoms(args: {
  selfId: string;
  atoms: any[];
  stageId: string;
}): FeatureVectorSnapshot {
  const atoms = arr<any>(args.atoms);
  const byId = new Map<string, any>();
  for (const a of atoms) {
    const id = String((a as any)?.id || '');
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, a);
  }

  const spec: Record<FeatureKey, { ids: string[]; note: string; defaultVal: number }> = {
    threat: {
      ids: [`threat:final:${args.selfId}`, `mind:threat:${args.selfId}`, `ctx:danger:${args.selfId}`],
      note: '0..1: perceived/derived threat',
      defaultVal: 0,
    },
    escape: {
      ids: [`world:map:escape:${args.selfId}`, `ctx:escape:${args.selfId}`],
      note: '0..1: escape availability / exit proximity',
      defaultVal: 0,
    },
    cover: {
      ids: [`world:map:cover:${args.selfId}`, `ctx:cover:${args.selfId}`],
      note: '0..1: cover / concealment',
      defaultVal: 0,
    },
    visibility: {
      ids: [`world:loc:visibility:${args.selfId}`, `ctx:visibility:${args.selfId}`],
      note: '0..1: how visible the agent is in location',
      defaultVal: 0,
    },
    // NOTE: these atoms may not exist yet in this repo; we default to neutral 0.5.
    socialTrust: {
      ids: [`tom:trust:avg:${args.selfId}`, `ctx:final:socialTrust:${args.selfId}`, `ctx:socialTrust:${args.selfId}`],
      note: '0..1: average trust from visible agents',
      defaultVal: 0.5,
    },
    emotionValence: {
      ids: [`emo:valence:${args.selfId}`, `ctx:final:emotionValence:${args.selfId}`, `ctx:emotionValence:${args.selfId}`],
      note: '0..1: emotional valence (0=negative, 1=positive)',
      defaultVal: 0.5,
    },
    resourceAccess: {
      ids: [`ctx:src:scene:resourceAccess:${args.selfId}`, `ctx:resourceAccess:${args.selfId}`],
      note: '0..1: access to resources',
      defaultVal: 0,
    },
    scarcity: {
      ids: [`ctx:src:scene:scarcity:${args.selfId}`, `ctx:scarcity:${args.selfId}`],
      note: '0..1: scarcity level (higher = worse)',
      defaultVal: 0,
    },
    fatigue: {
      ids: [`body:fatigue:${args.selfId}`],
      note: '0..1: acute fatigue',
      defaultVal: 0,
    },
    stress: {
      ids: [`body:stress:${args.selfId}`],
      note: '0..1: acute stress',
      defaultVal: 0,
    },
  };

  const z = {} as Record<FeatureKey, number>;
  const provenanceByKey = {} as Record<FeatureKey, Provenance[]>;
  const missing: Partial<Record<FeatureKey, string>> = {};

  for (const k of Object.keys(spec) as FeatureKey[]) {
    const ids = spec[k].ids;
    let picked: string | null = null;
    let val: number | null = null;
    for (const id of ids) {
      const m = atomMag(byId, id);
      if (m == null) continue;
      picked = id;
      val = m;
      break;
    }

    if (val == null) {
      z[k] = clamp01(spec[k].defaultVal);
      missing[k] = `missing atoms: ${ids.join(' | ')}`;
      provenanceByKey[k] = [
        {
          group: 'E',
          path: `E.z.${k}`,
          stageId: args.stageId,
          producer: 'lookahead.buildFeatureVectorFromAtoms',
          note: `defaulted to ${z[k]} (missing)`,
        },
      ];
      continue;
    }

    z[k] = clamp01(val);
    provenanceByKey[k] = [
      {
        group: 'E',
        path: `E.z.${k}`,
        stageId: args.stageId,
        producer: 'lookahead.buildFeatureVectorFromAtoms',
        note: spec[k].note,
      },
      {
        group: 'H',
        path: `H.atom.${picked}`,
        stageId: args.stageId,
        producer: 'lookahead.atom_lookup',
        note: 'source atom',
      },
    ];
  }

  return { z, provenanceByKey, missing };
}

/** Legacy hardcoded V(z), kept as fallback. */
function valueFnDefault(z: Record<FeatureKey, number>): { v: number; note: string } {
  // MVP V(z): interpretable mixture.
  const safety = clamp01(1 - z.threat);
  const resource = clamp01(0.6 * z.resourceAccess + 0.4 * (1 - z.scarcity));
  const progress = clamp01(z.escape);
  const stealth = clamp01(0.6 * z.cover + 0.4 * (1 - z.visibility));
  const wellbeing = clamp01(1 - 0.55 * z.fatigue - 0.45 * z.stress);

  const v = 0.33 * safety + 0.20 * resource + 0.22 * progress + 0.12 * stealth + 0.13 * wellbeing;

  return {
    v: clamp01(v),
    note: 'V = 0.33*safety + 0.20*resource + 0.22*progress + 0.12*stealth + 0.13*wellbeing; all terms are 0..1',
  };
}

/**
 * Feature-to-goal projection matrix.
 * Maps each goal domain to a linear projection over features.
 * Coeff sign: + means high feature is good for that goal; - means bad.
 */
const FEATURE_GOAL_PROJECTION: Record<string, Partial<Record<FeatureKey, number>>> =
  FEATURE_GOAL_PROJECTION_KEYS as Record<string, Partial<Record<FeatureKey, number>>>;

/**
 * Subjective value function: V*(z, goalEnergy).
 * Uses goalEnergy as weights over goal-domain projections of z.
 * Falls back to legacy V(z) when goalEnergy is empty.
 */
function valueFnSubjective(
  z: Record<FeatureKey, number>,
  goalEnergy: Record<string, number>,
): { v: number; note: string; perGoal: Record<string, number> } {
  const perGoal: Record<string, number> = {};
  const weights = Object.values(goalEnergy).map((x) => Math.abs(Number(x) || 0));
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  if (totalWeight < 1e-6) {
    const legacy = valueFnDefault(z);
    return { v: legacy.v, note: `${legacy.note} (fallback: empty goalEnergy)`, perGoal: {} };
  }

  let v = 0;
  for (const [goalId, wRaw] of Object.entries(goalEnergy)) {
    const weight = Math.abs(Number(wRaw) || 0);
    if (weight <= 0) continue;

    const proj = FEATURE_GOAL_PROJECTION[goalId];
    let dot = 0;

    if (proj) {
      for (const [fk, coeffRaw] of Object.entries(proj)) {
        const coeff = Number(coeffRaw ?? 0);
        const feat = Number((z as any)[fk] ?? 0);
        dot += coeff * feat;
      }
    } else {
      // Unknown goal domain: generic “be OK” heuristic.
      dot = (1 - z.threat) * 0.6 + (1 - z.stress) * 0.2 + (1 - z.fatigue) * 0.2 - z.scarcity * 0.2;
      dot = dot - 0.5; // center
    }

    // Squash to [0,1].
    const goalV = clamp01(0.5 + 0.5 * Math.tanh(dot));
    const contribution = (weight / totalWeight) * goalV;
    perGoal[goalId] = contribution;
    v += contribution;
  }

  return {
    v: clamp01(v),
    note: `V*(z,goals) = Σ_g (|E_g|/Σ|E|) · σ(Σ_k proj[g][k]·z[k]); totalWeight=${totalWeight.toFixed(3)}`,
    perGoal,
  };
}

function passiveDelta(z: Record<FeatureKey, number>): Partial<Record<FeatureKey, number>> {
  // Minimal drift: fatigue/stress creep when threat/scarcity are high.
  return {
    fatigue: 0.01 + 0.02 * z.threat,
    stress: 0.01 + 0.02 * z.scarcity + 0.01 * z.threat,
    socialTrust: -0.005,
    emotionValence: -0.01 * z.stress - 0.005 * z.threat,
  };
}

function actionEffect(kindRaw: string, z?: Record<FeatureKey, number>): Partial<Record<FeatureKey, number>> {
  const kind = String(kindRaw || '').toLowerCase();

  const byKind: Record<string, Partial<Record<FeatureKey, number>>> = {
    hide: { threat: -0.08, visibility: -0.12, cover: +0.05, fatigue: +0.02 },
    escape: { escape: +0.18, threat: +0.03, fatigue: +0.06, stress: +0.03 },
    wait: { fatigue: -0.02, stress: -0.02, threat: +0.02 },
    rest: { fatigue: -0.05, stress: -0.03 },
    approach: { threat: +0.05, escape: -0.06, stress: +0.03 },
    negotiate: { threat: -0.03, stress: -0.02, socialTrust: +0.06, emotionValence: +0.03 },
    help: { stress: -0.03, fatigue: +0.03, socialTrust: +0.08, emotionValence: +0.05 },
    attack: { threat: -0.02, stress: +0.05, fatigue: +0.06, visibility: +0.08 },
    loot: { resourceAccess: +0.08, scarcity: -0.04, threat: +0.03, fatigue: +0.04, socialTrust: -0.05 },
    betray: { socialTrust: -0.15, emotionValence: -0.08, stress: +0.04, threat: +0.06 },
    persuade: { socialTrust: +0.04, emotionValence: +0.02, stress: +0.01 },
    cooperate: { socialTrust: +0.10, emotionValence: +0.06, stress: -0.02, fatigue: +0.01 },
  };

  let base: Partial<Record<FeatureKey, number>> | undefined = byKind[kind];

  if (!base) {
    // Pattern fallbacks.
    if (kind.includes('hide')) base = byKind.hide;
    else if (kind.includes('escape') || kind.includes('run') || kind.includes('flee')) base = byKind.escape;
    else if (kind.includes('wait') || kind.includes('idle')) base = byKind.wait;
    else if (kind.includes('rest') || kind.includes('sleep')) base = byKind.rest;
    else if (kind.includes('approach') || kind.includes('move')) base = byKind.approach;
    else if (kind.includes('talk') || kind.includes('negot') || kind.includes('ask') || kind.includes('persuade')) base = byKind.negotiate;
    else if (kind.includes('help') || kind.includes('assist') || kind.includes('save') || kind.includes('cooperate')) base = byKind.help;
    else if (kind.includes('attack') || kind.includes('fight') || kind.includes('shoot')) base = byKind.attack;
    else if (kind.includes('loot') || kind.includes('take') || kind.includes('steal')) base = byKind.loot;
    else if (kind.includes('betray')) base = byKind.betray;
  }

  if (!base) return {};
  if (!z) return base;

  // Context modulation: scale base effect by relevant environmental features.
  const out = { ...base };
  const k = kind.includes('hide') ? 'hide'
    : kind.includes('escape') ? 'escape'
    : kind.includes('attack') ? 'attack'
    : kind.includes('negot') || kind.includes('talk') ? 'negotiate'
    : kind.includes('help') || kind.includes('cooperate') ? 'help'
    : null;

  if (k === 'hide') {
    // Better cover → hiding is more effective; higher threat → more threat reduction.
    out.cover = (out.cover ?? 0) * (0.6 + 0.8 * z.cover);
    out.threat = (out.threat ?? 0) * (0.6 + 0.6 * z.threat);
    out.visibility = (out.visibility ?? 0) * (0.6 + 0.6 * z.visibility);
  } else if (k === 'escape') {
    // Available escape routes → more effective; fatigue reduces effectiveness.
    out.escape = (out.escape ?? 0) * (0.5 + 0.8 * z.escape) * (1.1 - 0.3 * z.fatigue);
  } else if (k === 'attack') {
    // Higher fatigue → more costly attack; higher threat → more payoff.
    out.fatigue = (out.fatigue ?? 0) * (0.7 + 0.6 * z.fatigue);
    out.threat = (out.threat ?? 0) * (0.5 + 0.8 * z.threat);
  } else if (k === 'negotiate') {
    // Low trust → negotiation less effective on trust gain.
    out.socialTrust = (out.socialTrust ?? 0) * (0.4 + 0.8 * z.socialTrust);
  } else if (k === 'help') {
    // Already high trust → diminishing returns on trust gain.
    out.socialTrust = (out.socialTrust ?? 0) * (1.2 - 0.4 * z.socialTrust);
  }

  return out;
}

function computeSensitivity(
  z: Record<FeatureKey, number>,
  goalEnergy: Record<string, number>,
  gamma: number,
): Record<FeatureKey, number> {
  const eps = 0.01;
  const v0 = valueFnSubjective(z, goalEnergy).v;
  const out = {} as Record<FeatureKey, number>;
  for (const k of Object.keys(z) as FeatureKey[]) {
    const zPlus = { ...z, [k]: clamp01(z[k] + eps) };
    const vPlus = valueFnSubjective(zPlus, goalEnergy).v;
    out[k] = Math.max(0, Number(gamma) || 0) * (vPlus - v0) / eps;
  }
  return out;
}

/**
 * Sensitivity at z0: ∂Q_lookahead(best)/∂z0_k.
 * Perturb z0 by ±eps for each feature, rerun the full transition for the top action,
 * measure how Q_lookahead changes. This answers "what change in the CURRENT world
 * would flip the decision?"
 */
function computeSensitivityZ0(
  z0: Record<FeatureKey, number>,
  topKind: string,
  topQNow: number,
  goalEnergy: Record<string, number>,
  gamma: number,
  riskAversion: number,
): Record<FeatureKey, number> {
  const eps = 0.02;
  const out = {} as Record<FeatureKey, number>;

  const baseQ = evalActionQLookahead(z0, topKind, topQNow, goalEnergy, gamma, riskAversion);

  for (const k of Object.keys(z0) as FeatureKey[]) {
    const z0Plus = { ...z0, [k]: clamp01(z0[k] + eps) };
    const qPlus = evalActionQLookahead(z0Plus, topKind, topQNow, goalEnergy, gamma, riskAversion);
    out[k] = (qPlus - baseQ) / eps;
  }
  return out;
}

/** Helper: compute Q_lookahead for a single action given z0. */
function evalActionQLookahead(
  z0: Record<FeatureKey, number>,
  kind: string,
  qNow: number,
  goalEnergy: Record<string, number>,
  gamma: number,
  riskAversion: number,
): number {
  const dzPassive = passiveDelta(z0);
  const dzAct = actionEffect(kind, z0);
  const z1 = { ...z0 };
  let totalAbs = 0;
  for (const key of Object.keys(z0) as FeatureKey[]) {
    const d = Number((dzPassive as any)[key] ?? 0) + Number((dzAct as any)[key] ?? 0);
    z1[key] = clamp01(z1[key] + d);
    totalAbs += Math.abs(d);
  }
  const v1 = valueFnSubjective(z1, goalEnergy);
  const v1Risk = clamp01(v1.v - Math.max(0, riskAversion) * 0.6 * totalAbs);
  return qNow + Math.max(0, gamma) * v1Risk;
}

export function buildTransitionSnapshot(args: {
  selfId: string;
  tick: number;
  seed: number;
  gamma: number;
  riskAversion: number;
  atoms: any[];
  actions: Array<{ id: string; kind: string; qNow: number }>;
  goalEnergy?: Record<string, number>;
}): TransitionSnapshotLite {
  const warnings: string[] = [];

  const stageId = 'S9';
  const z0 = buildFeatureVectorFromAtoms({ selfId: args.selfId, atoms: args.atoms, stageId });

  const ge = (args.goalEnergy && Object.keys(args.goalEnergy).length) ? args.goalEnergy : {};
  const v0 = valueFnSubjective(z0.z, ge);

  // Deterministic noise per action.
  const baseSeed = (Number.isFinite(args.seed) ? Math.floor(args.seed) : 0) ^ (args.tick * 2654435761);

  const perAction: LookaheadActionEval[] = [];

  for (const a of arr(args.actions)) {
    const actionId = String((a as any)?.id || '');
    const kind = String((a as any)?.kind || '');
    const qNow = Number((a as any)?.qNow ?? 0);

    const rng = mulberry32((baseSeed ^ hash32(actionId)) >>> 0);

    const dzPassive = passiveDelta(z0.z);
    const dzAct = actionEffect(kind, z0.z);

    // Small gaussian-ish noise via sum of uniforms.
    const noiseScale = 0.02;
    const noise = () => {
      const u = rng() + rng() + rng() + rng();
      const n = (u - 2) * 0.5; // approx N(0,1)
      return noiseScale * n;
    };

    const deltas: Partial<Record<FeatureKey, number>> = {};
    const z1 = { ...(z0.z as any) } as Record<FeatureKey, number>;

    for (const key of Object.keys(z0.z) as FeatureKey[]) {
      const dp = Number((dzPassive as any)[key] ?? 0);
      const da = Number((dzAct as any)[key] ?? 0);
      const dn = noise();
      const d = dp + da + dn;
      (deltas as any)[key] = d;
      z1[key] = clamp01(z1[key] + d);
    }

    const v1 = valueFnSubjective(z1, ge);

    // Risk adjustment: penalize downside uncertainty only.
    // Compute sensitivity-weighted downside: only features whose delta worsens V* contribute.
    let downsideRisk = 0;
    for (const key of Object.keys(z0.z) as FeatureKey[]) {
      const d = Number((deltas as any)[key] ?? 0);
      if (Math.abs(d) < 1e-6) continue;
      // Finite-difference: does this delta direction lower V*?
      const zCheck = { ...z1, [key]: clamp01(z1[key] - d) };
      const vCheck = valueFnSubjective(zCheck, ge).v;
      const isDownside = v1.v < vCheck; // removing this delta would improve V*
      if (isDownside) downsideRisk += Math.abs(d);
    }
    const v1Risk = clamp01(v1.v - Math.max(0, args.riskAversion) * 0.6 * downsideRisk);

    const qLookahead = qNow + Math.max(0, Number(args.gamma)) * v1Risk;
    const delta = qLookahead - qNow;

    perAction.push({
      actionId,
      kind,
      qNow,
      v0: v0.v,
      v1: v1Risk,
      qLookahead,
      delta,
      z1,
      deltas,
      v0PerGoal: v0.perGoal,
      v1PerGoal: v1.perGoal,
      provenance: [
        { group: 'K', path: 'K.transition.linear', stageId, producer: 'lookahead.buildTransitionSnapshot' },
        { group: 'E', path: 'E.z', stageId, producer: 'lookahead.buildFeatureVectorFromAtoms' },
        { group: 'J', path: `J.q_now.${actionId}`, stageId, producer: 'decision.scoreAction', note: 'qNow from current decision layer' },
      ],
    });
  }

  // Sort by qLookahead (descending) for display.
  perAction.sort((a, b) => (b.qLookahead ?? 0) - (a.qLookahead ?? 0));

  const missingKeys = Object.keys(z0.missing || {});
  if (missingKeys.length) warnings.push(`Feature vector missing keys: ${missingKeys.join(', ')}`);

  // Sensitivity analysis for the top action.
  let sensitivity: Record<FeatureKey, number> | undefined;
  let sensitivityZ0: Record<FeatureKey, number> | undefined;
  let flipCandidates: Array<{ feature: FeatureKey; deltaQ: number; wouldFlip: boolean }> | undefined;

  const topAction = perAction[0];
  if (topAction) {
    sensitivity = computeSensitivity(topAction.z1, ge, Number(args.gamma));
    sensitivityZ0 = computeSensitivityZ0(
      z0.z, topAction.kind, topAction.qNow, ge,
      Number(args.gamma), Number(args.riskAversion),
    );

    if (perAction.length >= 2) {
      const gap = (perAction[0]?.qLookahead ?? 0) - (perAction[1]?.qLookahead ?? 0);
      const out: Array<{ feature: FeatureKey; deltaQ: number; wouldFlip: boolean }> = [];
      for (const k of Object.keys(z0.z) as FeatureKey[]) {
        // Use z0 sensitivity for flip analysis — "what would I change NOW to flip?"
        const dq = Math.abs(Number((sensitivityZ0 as any)[k] ?? 0)) * 0.1;
        out.push({ feature: k, deltaQ: dq, wouldFlip: dq > gap });
      }
      out.sort((a, b) => b.deltaQ - a.deltaQ);
      flipCandidates = out;
    }
  }

  return {
    enabled: true,
    gamma: Number.isFinite(args.gamma) ? Number(args.gamma) : 0,
    riskAversion: Number.isFinite(args.riskAversion) ? Number(args.riskAversion) : 0,
    seed: Number.isFinite(args.seed) ? Math.floor(args.seed) : 0,
    z0,
    valueFn: { v0: v0.v, note: v0.note },
    perAction,
    warnings,
    sensitivity,
    sensitivityZ0,
    flipCandidates,
  };
}

export type PredictedWorldSummary = {
  actionId: string;
  statements: Array<{
    feature: FeatureKey;
    current: number;
    predicted: number;
    delta: number;
    interpretation: string;
  }>;
  goalOutlook: Array<{
    goalId: string;
    currentContribution: number;
    predictedContribution: number;
    delta: number;
  }>;
  overallDelta: number;
};

const FEATURE_LABELS: Record<FeatureKey, string> = {
  threat: 'Угроза',
  escape: 'Возможность бегства',
  cover: 'Укрытие',
  visibility: 'Видимость',
  socialTrust: 'Социальное доверие',
  emotionValence: 'Эмоц. валентность',
  resourceAccess: 'Доступ к ресурсам',
  scarcity: 'Дефицит',
  fatigue: 'Усталость',
  stress: 'Стресс',
};

export function buildPredictedWorldSummary(
  actionEval: LookaheadActionEval,
  z0: Record<FeatureKey, number>,
): PredictedWorldSummary {
  const statements: PredictedWorldSummary['statements'] = [];

  for (const k of Object.keys(z0) as FeatureKey[]) {
    const cur = Number(z0[k] ?? 0);
    const pred = Number(actionEval.z1?.[k] ?? cur);
    const d = pred - cur;
    const label = FEATURE_LABELS[k] || k;
    const dir = d > 0.02 ? '↑' : d < -0.02 ? '↓' : '≈';

    statements.push({
      feature: k,
      current: cur,
      predicted: pred,
      delta: d,
      interpretation: `${label} ${dir} (${cur.toFixed(2)} → ${pred.toFixed(2)})`,
    });
  }

  statements.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const v0Per = actionEval.v0PerGoal || {};
  const v1Per = actionEval.v1PerGoal || {};
  const goalIds = Array.from(new Set([...Object.keys(v0Per), ...Object.keys(v1Per)]));

  const goalOutlook = goalIds
    .map((goalId) => {
      const c0 = Number(v0Per[goalId] ?? 0);
      const c1 = Number(v1Per[goalId] ?? 0);
      return {
        goalId,
        currentContribution: c0,
        predictedContribution: c1,
        delta: c1 - c0,
      };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    actionId: actionEval.actionId,
    statements,
    goalOutlook,
    overallDelta: Number(actionEval.v1 ?? 0) - Number(actionEval.v0 ?? 0),
  };
}
