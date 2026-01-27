
import { EntityParams, CharacterState } from '../types';

// --- SHARED UTILITIES ---
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const normalize = (val: number | undefined): number => (val || 0) / 100;
const clip = (val: number, min: number, max: number): number => Math.max(min, Math.min(val, max));
// Deterministic pseudo-random in [0,1) from inputs (no state, no Math.random)
const pseudo01 = (a: number, b: number): number => {
  const x = Math.sin(a * 12.9898 + b * 78.233 + 0.1) * 43758.5453;
  return x - Math.floor(x);
};

// --- OBJECT-SPECIFIC FORMULAS (DETERMINISTIC) ---

export const calculateObjectPv = (params: Record<string, number>): number => {
  const { witness_count = 0, topo = 0 } = params;
  const kappa = 0.4;
  const deltaLL = Math.log1p(witness_count) / Math.log1p(1000);
  const deltaLogDetF = topo / 10;
  return Math.min(100, (deltaLL + kappa * deltaLogDetF) * 100);
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
  return Math.min(100, (lambda[0] * X + lambda[1] * CVaR + lambda[2] * H_infra + lambda[3] * C_causal + lambda[4] * Pi_dose));
};

export const calculateObjectDrift = (dose: number, prevDrift: number = 0): number => {
  const theta = 0.1;
  const D_bar = 15;
  const sigma_D = 0.5;
  const eta = 0.25;
  const u = pseudo01(dose, prevDrift);
  const noise = (u - 0.5) * 2 * sigma_D;
  const pullToCenter = theta * (D_bar - prevDrift);
  const doseEffect = eta * Math.abs(dose - 1) * 100;
  let newDrift = prevDrift + pullToCenter + noise + doseEffect;
  return Math.max(0, Math.min(100, newDrift));
};

export const calculateObjectS = (Pv: number, Vsigma: number, D: number, topo: number): number => {
  const raw_s = 1.6 * (Pv / 100) 
              - 1.4 * (Vsigma / 100) 
              - 1.0 * (D / 100) 
              + 0.8 * (topo / 100)
              - 0.3;
  return clip(sigmoid(raw_s) * 100, 0, 100);
};


// --- GENERAL FORMULAS (USED BY BOTH NEW & OLD) ---
export function calculateInfluence(p: EntityParams, stress: number): number {
  const will = normalize(p['state.will']);
  const loyalty = normalize(p['state.loyalty']);
  const competence = normalize(p['competencies.competence_core']);
  const L = Math.sqrt((will * will + loyalty * loyalty) / 2);
  const γ = { '0': -1, '1': 1.2, '2': 1.0 };
  
  // Add inverted-U multiplier for stress (Yerkes-Dodson Law)
  const stress_norm = stress / 100;
  const s_opt = 0.35; // optimal stress at 35%
  const sigma = 0.25;
  const stress_multiplier = Math.exp(-Math.pow((stress_norm - s_opt), 2) / (2 * sigma * sigma));

  const raw_influence = sigmoid(γ[0] + γ[1] * L + γ[2] * competence);
  return raw_influence * stress_multiplier * 100;
}

export const calculateOpt = (Pv: number, Vsigma: number): number => {
  const normalizedPv = normalize(Pv);
  const normalizedVsigma = normalize(Vsigma);
  const vsigmaFactor = Math.exp(-0.5 * Math.pow((normalizedVsigma - 0.35) / 0.15, 2));
  return normalizedPv * vsigmaFactor * 100;
};

export const getMonsterVeto = (Vsigma: number, params: Record<string, number>): boolean => {
    const causal_sensitivity = normalize(params['competencies.causal_sensitivity']);
    return normalize(Vsigma) > 85 && (1 - causal_sensitivity) > 0.7;
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

export function calculatePrMonstroDay(p: EntityParams, s: { stress: number; fatigue: number; darkness: number }, latents: Record<string, number>, quickStates: Record<string, number>): number {
    const { stress, fatigue, darkness } = s;
    const { 'body.acute.moral_injury': moral_injury = 0 } = p;
    const { 'state.loyalty': loyalty = 50 } = p;
    const { social_support_proxy = 0.5 } = quickStates;
    const { SD = 0.5, EW = 0.5 } = latents;

    const prMonstro_raw = 2.2 * normalize(stress)
                      + 1.6 * normalize(fatigue)
                      + 1.4 * normalize(darkness)
                      + 1.2 * normalize(moral_injury)
                      - 1.5 * normalize(loyalty)
                      - 0.8 * social_support_proxy
                      - 0.3 * SD
                      - 0.3 * EW
                      - 3.0;
    return clip(sigmoid(prMonstro_raw), 0, 1);
}

export function calculateLambdaMon(prMonstroDay: number): number {
    if (prMonstroDay >= 1) return 100; // Use a large number instead of Infinity
    if (prMonstroDay <= 0) return 0;
    return -Math.log(1 - prMonstroDay);
}

export function calculatePrMonstro(lambda_mon: number, horizonDays: number): number {
    return 1 - Math.exp(-lambda_mon * horizonDays);
}
