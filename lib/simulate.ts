import seedrandom from 'seedrandom';
import { CharacterState, EntityParams, SimConfig, SimulationOutput, SimulationRun } from '../types';
import { stepCharacter } from './sde';
import { calculateVsigma, calculatePv, calculateInfluence, calculateLambdaMon, calculateS } from './formulas';

// This function now just calls the main `calculateS` formula
// FIX: Renamed from getStabilityScore and exported to be used in UI components.
export function stabilityScore(st: CharacterState, p: EntityParams): number {
  return calculateS(st.pv, st.vsigma, p);
}

function percentile(sorted: number[], p: number): number {
  const i = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (i - lo) * (sorted[hi] - sorted[lo]);
}

export function simulateCharacter(
    p: EntityParams, 
    cfg: SimConfig,
    trustFactor: number,
    init?: Partial<CharacterState>
): SimulationOutput {
  
  const initialStress = p.stress ?? 40;
  const initialDarkness = p.dark_exposure ?? 10;
  
  const initialVsigma = calculateVsigma(p, { stress: initialStress, darkness: initialDarkness });
  const initialPv = calculatePv(p, trustFactor);
  const initialInfluence = calculateInfluence(p);
  const initialLambdaMon = calculateLambdaMon(p, initialVsigma, initialDarkness);

  const base: CharacterState = {
    stress: initialStress,
    reputation: p.reputation ?? 50,
    fatigue: p.fatigue ?? 20,
    darkness: initialDarkness,
    E: 100,
    Debt: 0,
    vsigma: initialVsigma,
    pv: initialPv,
    influence: initialInfluence,
    prMonstro: 1 - Math.exp(-initialLambdaMon),
    ...init,
  };

  const runs: SimulationRun[] = [];
  const finalStates: CharacterState[] = [];
  const stepsPerDay = Math.max(1, Math.round(1 / cfg.dt));
  const T = cfg.horizonDays;
  let totalDaysInCrisis = 0;

  for (let r = 0; r < cfg.ensemble; r++) {
    const rng = seedrandom(String((cfg.rngSeed ?? 1) + r));
    let st = { ...base };
    const series = [];
    let runDaysInCrisis = 0;
    for (let day = 0; day < T; day++) {
      for (let k = 0; k < stepsPerDay; k++) {
        st = stepCharacter(p, st, cfg.dt, rng, trustFactor);
      }
      const S = stabilityScore(st, p);
      if (S < 40) {
        runDaysInCrisis++;
      }
      series.push({ day, S });
    }
    runs.push({ seed: (cfg.rngSeed ?? 1) + r, series });
    finalStates.push(st);
    totalDaysInCrisis += runDaysInCrisis;
  }

  // Calculate mean and percentiles for confidence bands
  const mean = [];
  for (let t = 0; t < T; t++) {
    const vals = runs.map(run => run.series[t].S).sort((a, b) => a - b);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const p10 = percentile(vals, 10);
    const p90 = percentile(vals, 90);
    mean.push({ day: t, S: avg, bands: { p10, p90 } });
  }

  const finalSValues = finalStates.map(s => stabilityScore(s, p)).sort((a, b) => a - b);
  let cvarS: number | undefined = undefined;
  if (finalSValues.length > 0) {
    const tailSize = Math.ceil(0.1 * finalSValues.length);
    if (tailSize > 0) {
        const tail = finalSValues.slice(0, tailSize);
        cvarS = tail.reduce((sum, val) => sum + val, 0) / tail.length;
    }
  }

  const analytics = {
      timeInCrisis: T > 0 ? (totalDaysInCrisis / (cfg.ensemble * T)) * 100 : 0,
      cvarS,
  };

  return { mean, runs, initialState: base, finalStates, analytics };
}