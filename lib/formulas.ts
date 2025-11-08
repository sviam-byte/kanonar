import { EntityParams, CharacterState } from '../types';

// --- SHARED UTILITIES ---
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const normalize = (val: number | undefined): number => (val || 0) / 100;

// --- OBJECT-SPECIFIC FORMULAS (DETERMINISTIC - UNCHANGED) ---

export const calculateObjectPv = (params: Record<string, number>): number => {
  const { witness_count = 0, topo = 0 } = params;
  const kappa = 0.4;
  const deltaLL = Math.log1p(witness_count) / Math.log1p(1000);
  const deltaLogDetF = topo / 10;
  return (deltaLL + kappa * deltaLogDetF) * 100;
};

export const calculateObjectVsigma = (params: Record<string, number>, penalties: { risk_dry: number; risk_decay: number }): number => {
  const {
    exergy_cost = 0,
    hazard_rate = 0,
    cvar_alpha = 0.05,
    infra_footprint = 0,
    causal_penalty = 0
  } = params;
  const lambda = [0.15, 0.2, 0.15, 0.3, 0.2];
  const X = exergy_cost;
  const CVaR = hazard_rate * cvar_alpha;
  const H_infra = infra_footprint;
  const C_causal = causal_penalty;
  const Pi_dose = penalties.risk_dry + 0.5 * penalties.risk_decay;
  return (lambda[0] * X + lambda[1] * CVaR + lambda[2] * H_infra + lambda[3] * C_causal + lambda[4] * Pi_dose);
};

export const calculateObjectDrift = (dose: number, prevDrift: number = 0): number => {
  const theta = 0.1;
  const D_bar = 15;
  const sigma_D = 0.5;
  const eta = 0.25;
  const noise = (Math.random() - 0.5) * 2 * sigma_D;
  const pullToCenter = theta * (D_bar - prevDrift);
  const doseEffect = eta * Math.abs(dose - 1) * 100;
  let newDrift = prevDrift + pullToCenter + noise + doseEffect;
  return Math.max(0, Math.min(100, newDrift));
};


// --- CHARACTER-SPECIFIC FORMULAS (NEW MODEL) ---

// Intermediate variable calculations
const calculate_M = (p: EntityParams) => {
    const mandateSum = (p.mandate_ops ?? 0) + (p.mandate_reg ?? 0) + (p.mandate_res ?? 0) + (p.mandate_hr ?? 0) + (p.mandate_dip ?? 0) + (p.mandate_emg ?? 0);
    const κ_app = 0.6;
    return (mandateSum / 3) - κ_app * (p.approval_level ?? 0) / 3;
};

const calculate_A = (p: EntityParams) => {
    const w_rep = 0.7, w_int = 0.5;
    return w_rep * normalize(p.reputation) + w_int * normalize(p.intel_access);
};

const calculate_Cap = (p: EntityParams) => {
    const w_comp = 0.7, λ_res = 8, w_res = 0.4;
    return w_comp * normalize(p.competence_op) + w_res * Math.log1p(λ_res * normalize(p.resources));
};

const calculate_L = (p: EntityParams) => {
    const will = normalize(p.will);
    const loyalty = normalize(p.loyalty);
    return Math.sqrt((will * will + loyalty * loyalty) / 2);
};

const calculate_Risk = (p: EntityParams, s: Pick<CharacterState, 'stress' | 'darkness'>) => {
    const b = { s: 0.9, d: 0.9, c: 0.7, acc: 0.5, ir: 0.4, sr: 0.5, pc: 0.3, pub: 0.4 };
    return b.s * normalize(s.stress) + b.d * normalize(s.darkness) +
           b.c * normalize(p.causal_penalty) + b.acc * normalize(p.accountability) +
           b.ir * normalize(p.ideology_rigidity) + b.sr * normalize(p.sanction_risk) +
           b.pc * normalize(p.privacy_cost_epsilon) + b.pub * (p.public_scrutiny ?? 0);
};

export function calculateInfluence(p: EntityParams): number {
  const L = calculate_L(p);
  const Cap = calculate_Cap(p);
  const γ = { '0': -1, '1': 1.2, '2': 1.0 };
  return sigmoid(γ[0] + γ[1] * L + γ[2] * Cap) * 100;
}

export function calculatePv(p: EntityParams, trustFactor: number): number {
  const M = calculate_M(p);
  const A = calculate_A(p);
  const a = { '0': -0.8, '1': 1.3, '2': 1.0 };
  const pv_raw = sigmoid(a[0] + a[1] * M + a[2] * A);
  return pv_raw * trustFactor * 100;
}

export function calculateVsigma(p: EntityParams, s: Pick<CharacterState, 'stress' | 'darkness'>): number {
  const Risk = calculate_Risk(p, s);
  const L = calculate_L(p);
  const topo = normalize(p.topo);
  const v = { '0': -0.5, topo: 0.8, L: 0.4 };
  return sigmoid(v[0] + Risk - v.topo * topo - v.L * L) * 100;
}

export function calculateLambdaMon(p: EntityParams, Vsigma: number, darkness: number): number {
    const λ = { '0': 0.01, '1': 0.015, '2': 0.01, '3': 0.08 };
    const τ_c = 0.6;
    const causalPenalty = normalize(p.causal_penalty);
    const vsigmaNorm = Vsigma / 100;
    const darknessNorm = darkness / 100;

    return λ[0] + λ[1] * vsigmaNorm + λ[2] * darknessNorm + λ[3] * Math.max(0, causalPenalty - τ_c);
}

export function calculatePrMonstro(lambda_mon: number, horizonDays: number): number {
    return 1 - Math.exp(-lambda_mon * horizonDays);
}


// --- GENERIC FORMULAS ---
export const calculateS = (Pv: number, Vsigma: number, params: Record<string, number>, deltaS_action: number = 0): number => {
  const s = { '1': 1.2, '2': 1.3, '3': 0.6, '4': 1.0 };
  const topo = normalize(params.topo);
  const stability_score = s[1] * normalize(Pv) - s[2] * normalize(Vsigma) + s[3] * topo + s[4] * deltaS_action;
  return sigmoid(stability_score) * 100;
};

export const getMonsterVeto = (Vsigma: number, params: Record<string, number>): boolean => {
    const causal_penalty = normalize(params.causal_penalty);
    return normalize(Vsigma) > 0.85 && causal_penalty > 0.7;
};

export const calculateDose = (E: number, A_star: number): number => {
  if (A_star === 0) return E > 0 ? 10 : 1;
  return E / A_star;
};

export const calculateDosePenalties = (E: number, A_star: number) => {
  const diff = E - A_star;
  const lambda_d = 0.001;
  const lambda_c = 0.05;
  const risk_dry = lambda_d * Math.max(0, diff) ** 2;
  const risk_decay = lambda_c * Math.max(0, -diff);
  return { risk_dry, risk_decay };
};