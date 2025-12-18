
import { CharacterEntity } from '../../types';

// Convenient alias for the vector base map
export type Vec = Record<string, number>;

export interface AxisWeights {
  [axis: string]: number;
}

export interface DyadOverride {
  targetId: string;
  liking_delta?: number;
  trust_delta?: number;
  fear_delta?: number;
  respect_delta?: number;
  closeness_delta?: number;
  dominance_delta?: number;
}

// Config "How A perceives others"
export interface DyadConfigForA {
  like_sim_axes: AxisWeights;        // likes similarity on these axes
  like_opposite_axes: AxisWeights;   // likes complementarity on these axes

  trust_sim_axes: AxisWeights;       // trusts if similar on these axes
  trust_partner_axes: AxisWeights;   // trusts if partner has high values on these axes

  fear_threat_axes: AxisWeights;     // perceived as threat if partner is high
  fear_dom_axes: AxisWeights;        // perceived as dominant/scary if partner is high

  respect_partner_axes: AxisWeights; // respects high values on these axes

  closeness_sim_axes: AxisWeights;   // closeness driven by similarity here

  dominance_axes: AxisWeights;       // dominance driven by self vs partner diff

  bias_liking: number;    // -1..+1
  bias_trust: number;
  bias_fear: number;
  bias_respect: number;
  bias_closeness: number;
  bias_dominance: number;
}

export interface DyadMetrics {
  liking: number;    // -1..1
  trust: number;     // 0..1
  fear: number;      // 0..1
  respect: number;   // 0..1
  closeness: number; // 0..1
  dominance: number; // -1..1 (A<0 subordinate, >0 dominant)
}

// ----------------- Low-level helpers -----------------

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const squash = (x: number) => Math.tanh(x); // -1..1

const simAxis = (a: number, b: number) => 1 - Math.abs(a - b); // 0..1
const domAxis = (a: number, b: number) => b - a;               // -1..1
const threatAxis = (_a: number, b: number) => b;               // 0..1 (higher b = higher threat)

function weightedSim(axes: AxisWeights, a: Vec, b: Vec): number {
  let num = 0;
  let den = 0;
  for (const [axis, w] of Object.entries(axes)) {
    const va = a[axis] ?? 0.5;
    const vb = b[axis] ?? 0.5;
    num += w * simAxis(va, vb);
    den += Math.abs(w);
  }
  if (den === 0) return 0;
  return num / den; // 0..1
}

function weightedPartnerLevel(axes: AxisWeights, b: Vec): number {
  let num = 0;
  let den = 0;
  for (const [axis, w] of Object.entries(axes)) {
    const vb = b[axis] ?? 0.5;
    num += w * vb;
    den += Math.abs(w);
  }
  if (den === 0) return 0;
  return num / den; // ~0..1
}

function weightedDom(axes: AxisWeights, a: Vec, b: Vec): number {
  let num = 0;
  let den = 0;
  for (const [axis, w] of Object.entries(axes)) {
    const va = a[axis] ?? 0.5;
    const vb = b[axis] ?? 0.5;
    num += w * domAxis(va, vb);
    den += Math.abs(w);
  }
  if (den === 0) return 0;
  return num / den; // -1..1
}

function weightedThreat(axes: AxisWeights, b: Vec): number {
  let num = 0;
  let den = 0;
  for (const [axis, w] of Object.entries(axes)) {
    const vb = b[axis] ?? 0.5;
    num += w * threatAxis(0, vb);
    den += Math.abs(w);
  }
  if (den === 0) return 0;
  return num / den; // 0..1
}

// ----------------- Resulting metrics A -> B -----------------

export function computeDyadMetrics_A_about_B(
  a: CharacterEntity,
  b: CharacterEntity,
  cfg: DyadConfigForA,
  override?: DyadOverride
): DyadMetrics {
  const aVec = (a.vector_base || {}) as Vec;
  const bVec = (b.vector_base || {}) as Vec;

  // 1) Features
  const like_sim = weightedSim(cfg.like_sim_axes, aVec, bVec);
  const like_opp_raw = weightedSim(cfg.like_opposite_axes, aVec, bVec);
  const like_opp = 1 - like_opp_raw;

  const trust_sim = weightedSim(cfg.trust_sim_axes, aVec, bVec);
  const trust_partner = weightedPartnerLevel(cfg.trust_partner_axes, bVec);

  const fear_threat = weightedThreat(cfg.fear_threat_axes, bVec);
  const fear_dom = Math.max(0, weightedDom(cfg.fear_dom_axes, aVec, bVec));

  const respect_partner = weightedPartnerLevel(cfg.respect_partner_axes, bVec);
  const closeness_sim = weightedSim(cfg.closeness_sim_axes, aVec, bVec);

  const dom = weightedDom(cfg.dominance_axes, aVec, bVec);

  // 2) Metrics

  // Liking: likes similar + likes complementary - fear of threat
  let liking_raw =
    cfg.bias_liking +
    1.5 * like_sim +
    1.0 * like_opp -
    1.0 * fear_threat;

  if (override?.liking_delta) liking_raw += override.liking_delta;
  const liking = squash(liking_raw); // -1..1

  // Trust: similarity in values + partner reliability - fear - domination
  let trust_raw =
    cfg.bias_trust +
    1.5 * trust_sim +
    1.0 * trust_partner -
    1.0 * fear_threat -
    0.5 * fear_dom;
  
  if (override?.trust_delta) trust_raw += override.trust_delta;
  const trust = clamp01(0.5 * (squash(trust_raw) + 1));

  // Fear: threat + domination
  let fear_raw =
    cfg.bias_fear +
    1.5 * fear_threat +
    1.0 * fear_dom;
    
  if (override?.fear_delta) fear_raw += override.fear_delta;
  const fear = clamp01(0.5 * (squash(fear_raw) + 1));

  // Respect: partner capabilities + some fear/domination (respect through power)
  let respect_raw =
    cfg.bias_respect +
    1.5 * respect_partner +
    0.3 * fear_threat +
    0.3 * fear_dom;

  if (override?.respect_delta) respect_raw += override.respect_delta;
  const respect = clamp01(0.5 * (squash(respect_raw) + 1));

  // Closeness: similarity in bonding axes + liking - fear
  let closeness_raw =
    cfg.bias_closeness +
    1.5 * closeness_sim +
    0.5 * liking -
    1.0 * fear;
  
  if (override?.closeness_delta) closeness_raw += override.closeness_delta;
  const closeness = clamp01(0.5 * (squash(closeness_raw) + 1));

  // Dominance: power difference - fear (if I fear, I am less dominant subjectively)
  let dominance_raw =
    cfg.bias_dominance +
    1.0 * dom -
    0.5 * fear_threat;
    
  if (override?.dominance_delta) dominance_raw += override.dominance_delta;
  const dominance = squash(dominance_raw); // -1..1

  return { liking, trust, fear, respect, closeness, dominance };
}
