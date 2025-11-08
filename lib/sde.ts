import { CharacterState, EntityParams } from '../types';
import { calculateVsigma, calculatePv, calculateInfluence, calculateLambdaMon, getMonsterVeto } from './formulas';

const normalize = (val: number | undefined): number => (val || 0) / 100;

// Draw random noise for SDE steps
function drawNoise(dt: number, rng: () => number, jumpRate: number, darkJumpRate: number): { dW_s: number; stressJump: boolean; darkJump: boolean } {
  // Box-Muller transform for normally distributed noise
  const n = () => {
    const u = Math.max(1e-12, rng());
    const v = Math.max(1e-12, rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return {
    dW_s: Math.sqrt(dt) * n(),
    stressJump: rng() < jumpRate * dt,
    darkJump: rng() < darkJumpRate * dt,
  };
}

export function stepCharacter(
  p: EntityParams,
  st: CharacterState,
  dt: number,
  rng: () => number,
  trustFactor: number
): CharacterState {

  // 1. Check for hard "monster veto" absorbing state
  if (getMonsterVeto(st.vsigma, p)) {
    return { ...st, stress: 100, darkness: 100, vsigma: 100, pv: 0, influence: 0 };
  }
  
  // 2. Check for probabilistic "monster" event
  const lambda_mon = calculateLambdaMon(p, st.vsigma, st.darkness);
  if (rng() < (1 - Math.exp(-lambda_mon * dt))) {
    // A "monstro" event occurred: apply a shock
    const nextStress = Math.min(100, st.stress + (40 + 20 * rng()));
    const nextDarkness = Math.min(100, st.darkness + (25 + 15 * rng()));
    const nextVsigma = calculateVsigma(p, { stress: nextStress, darkness: nextDarkness });
    const nextPv = calculatePv(p, trustFactor);
    const nextInfluence = calculateInfluence(p);
    
    return { 
        ...st, 
        stress: nextStress, 
        darkness: nextDarkness, 
        vsigma: nextVsigma, 
        pv: nextPv, 
        influence: nextInfluence,
        prMonstro: 1, // Occurred
    };
  }

  // 3. Evolve latent states via SDE if no event occurred

  // Evolve Stress (Ornstein-Uhlenbeck process with jumps)
  const θ = 2 / 90;
  const L = Math.sqrt((normalize(p.will)**2 + normalize(p.loyalty)**2) / 2);
  const μ0=0.5, η1=0.15, η2=0.1, η3=0.1;
  const μ = μ0 - η1*L - η2*normalize(p.topo) + η3*(p.public_scrutiny ?? 0);
  const μ_unnormalized = μ * 100;
  const σ_b = 15;
  const ν0=0.01, ν_dark=0.05, ν_san=0.03;
  const stressJumpRate = ν0 + ν_dark * normalize(st.darkness) + ν_san * normalize(p.sanction_risk);
  const J_stress = (10 + rng() * 10);
  
  const noise = drawNoise(dt, rng, stressJumpRate, 0.01);
  
  const dStress = θ * (μ_unnormalized - st.stress) * dt + σ_b * noise.dW_s + (noise.stressJump ? J_stress : 0);
  let nextStress = Math.max(0, Math.min(100, st.stress + dStress));
  
  // Evolve Darkness (Decay with jumps)
  const δ = 0.02; // decay rate per day
  const J_dark = (5 + rng() * 10);
  let nextDarkness = st.darkness * Math.exp(-δ * dt) + (noise.darkJump ? J_dark : 0);
  nextDarkness = Math.max(0, Math.min(100, nextDarkness));

  // 4. Recalculate observable metrics based on the new latent state
  const nextVsigma = calculateVsigma(p, { stress: nextStress, darkness: nextDarkness });
  const nextPv = calculatePv(p, trustFactor); // Pv is static w.r.t. state, but good to have it here
  const nextInfluence = calculateInfluence(p); // Same for influence
  const nextLambdaMon = calculateLambdaMon(p, nextVsigma, nextDarkness);
  const nextPrMonstro = 1 - Math.exp(-nextLambdaMon);

  // 5. Return the full new state
  return { 
      ...st,
      stress: nextStress,
      darkness: nextDarkness,
      vsigma: nextVsigma,
      pv: nextPv,
      influence: nextInfluence,
      prMonstro: nextPrMonstro,
  };
}