
// lib/simulate.ts
/* ... existing imports ... */
import seedrandom from 'seedrandom';
import { CharacterState, EntityParams, SimConfig, SimulationOutput, SimulationRun, SimulationPoint, CharacterEntity, Branch, AnyEntity, BlackSwanEvent, AgentState } from '../types';
import { stepCharacter } from './sde';
import { calculateInfluence, getMonsterVeto, calculatePrMonstroDay } from './formulas';
import { calculateLatentsAndQuickStates } from './metrics';
import { calculateSdeDiagnostics } from './sde-helpers';
import { mapCharacterToBehaviorParams } from './core/character_mapper';
import { makeAgentRNG } from './core/noise';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (i - lo) * (sorted[hi] - sorted[lo]);
}

export function simulateCharacter(
    p: CharacterEntity, 
    flatParams: EntityParams,
    cfg: SimConfig,
    trustFactor: number,
    init?: Partial<CharacterState>
): SimulationOutput {
  
  const simParams = p; // The character object is already aged/modified by the hook
  const { latents, quickStates } = calculateLatentsAndQuickStates(flatParams);
  
  // "Proper Start" Protocol
  const sdeDiags_t0 = calculateSdeDiagnostics(simParams, latents, quickStates, 0, p.body?.acute);
  const S_star_0 = sdeDiags_t0.S_star;
  
  const UI_S_PRIOR = 65;
  const ALPHA = 0.7;
  const S_0 = ALPHA * S_star_0 + (1 - ALPHA) * UI_S_PRIOR;

  const bp = mapCharacterToBehaviorParams(simParams);

  const base: AgentState = {
    ...p,
    // FIX: Added id and pos to comply with AgentState interface.
    id: p.entityId,
    pos: { x: 0, y: 0 },
    S: S_0,
    v: 0,
    hp: p.body?.acute?.hp ?? 100,
    stress: p.body?.acute?.stress ?? 40,
    reputation: p.social?.audience_reputation?.[0]?.score ?? 50,
    fatigue: p.body?.acute?.fatigue ?? 30,
    darkness: p.state?.dark_exposure ?? 10,
    E: p.memory?.attention?.E ?? 100,
    Debt: 0,
    vsigma: 0,
    pv: 0,
    influence: calculateInfluence(flatParams, p.body?.acute?.stress ?? 40),
    prMonstro: quickStates.prMonstro ?? 0,
    D: p.state?.drift_state ?? 15,
    // Initialize EMA states with instantaneous values
    N_ema: sdeDiags_t0.N_inst, H_ema: sdeDiags_t0.H_inst, C_ema: sdeDiags_t0.C_inst,
    xi: 0,
    sigma_xi_sq: 0.000009,
    stress_ema_delta: 0,
    arousal_ema_delta: 0,
    J_ema: 0,
    post_shock_timer: 0,
    assimilation_timer: 0,
    J_positive_ema: 0,
    mode: 'normal',
    burnout_condition_days: 0,
    dark_condition_days: 0,
    apophenia_condition_days: 0,
    corruption_condition_days: 0,
    moral_injury_ema: p.body?.acute?.moral_injury ?? 0,
    allostatic_load: 0,
    resilience_growth: 0,
    
    // AgentState specific
    goalEcology: null,
    tomMetrics: null,
    v42metrics: null,
    tomV2Metrics: null,
    latents,
    quickStates,
    
    // Initialize social fields required by AgentState
    w_eff: [],
    goalIds: [],
    relationships: {},
    perceivedStates: new Map(),
    pendingProposals: [],
    
    temperature: bp.T0,
    gumbelScale: bp.gumbel_beta,
    processNoiseSigma: bp.sigma0,
    behavioralParams: bp,
    
    // Initialize dummy RNG channels for AgentState type compliance in initial state
    // Real RNGs for simulation steps are created in the loop below
    rngChannels: {
        decide: makeAgentRNG(p.entityId, 1),
        physio: makeAgentRNG(p.entityId, 2),
        perceive: makeAgentRNG(p.entityId, 3)
    },
    
    ...init,
    
    // Ensure actionHistory is present even if init is passed
    actionHistory: init?.actionHistory || [],
  } as AgentState;
  
  // For interactive mode (horizon=0), return the initial calculated state
  if (cfg.horizonDays === 0) {
    const initialPoint: SimulationPoint = {
        day: 0, S: base.S, Pv: base.pv, Vsigma: base.vsigma,
        mu: sdeDiags_t0.mu * 100, kappa: sdeDiags_t0.kappa, h: sdeDiags_t0.h, S_star: sdeDiags_t0.S_star,
        N: sdeDiags_t0.N_inst * 100, H_p: sdeDiags_t0.H_inst * 100, C: sdeDiags_t0.C_inst * 100,
        mode: base.mode,
    };
    return {
        mean: [initialPoint], runs: [], initialState: base, finalStates: [base], analytics: { timeInCrisis: 0 }
    };
  }

  const runs: SimulationRun[] = [];
  const finalStates: AgentState[] = [];
  const T = cfg.horizonDays;
  let totalDaysInCrisis = 0;
  const ensembleSize = cfg.ensemble || 16;
  const blackSwans = cfg.blackSwans || [];
  const RISK_RAMP_DAYS = 4;
  const CRISIS_GUARD_DAYS = 2;

  for (let r = 0; r < ensembleSize; r++) {
    const rng = seedrandom(String((cfg.rngSeed ?? 1) + r));
    let st: AgentState = { ...base };
    const series: SimulationPoint[] = [];
    let runDaysInCrisis = 0;

    for (let day = 0; day < T; day++) {
      const eventToday = blackSwans.find(bs => bs.day === day);
      
      const rampFactor = Math.min(1, (day + 1) / RISK_RAMP_DAYS);
      const isCrisisGuard = day < CRISIS_GUARD_DAYS;

      const { nextState, diagnostics } = stepCharacter(simParams, latents, st, cfg.dt, rng, day, eventToday, quickStates, rampFactor, isCrisisGuard);
      st = nextState;
      
      if (st.S < 40) {
        runDaysInCrisis++;
      }

      series.push({
        day,
        ...diagnostics,
      });
    }
    
    runs.push({ seed: (cfg.rngSeed ?? 1) + r, series });
    finalStates.push(st);
    totalDaysInCrisis += runDaysInCrisis;
  }

  const mean: SimulationPoint[] = [];
  for (let t = 0; t < T; t++) {
    const pointsAtT = runs.map(run => run.series[t]);
    const s_vals = pointsAtT.map(p => p.S).sort((a, b) => a - b);
    
    const meanPoint: SimulationPoint = { day: t, S: 0 };
    const keysToAverage: (keyof SimulationPoint)[] = [
        'S', 'Pv', 'Vsigma', 'N', 'H_p', 'C',
        'mu', 'kappa', 'h', 'shock', // Removed 'zeta'
        'deltaS_restoring', 'deltaS_destroyer', 'deltaS_inertia', 'deltaS_shock',
        'v', 'S_star', 'allostatic_load', 'resilience_growth'
    ];
    
    const stringKeys: (keyof SimulationPoint)[] = ['mode', 'weakest_link'];

    keysToAverage.forEach(key => {
        const values = pointsAtT.map(p => p[key] as number).filter(v => v !== undefined && !isNaN(v));
        if (values.length > 0) {
            (meanPoint as any)[key] = values.reduce((a, b) => a + b, 0) / values.length;
        }
    });

    stringKeys.forEach(key => {
        const values = pointsAtT.map(p => p[key] as string).filter(Boolean);
        if(values.length > 0) {
            const counts = values.reduce((acc, val) => {
                acc[val] = (acc[val] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            (meanPoint as any)[key] = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
        }
    });

    const p05 = percentile(s_vals, 5);
    const p50 = percentile(s_vals, 50);
    const p95 = percentile(s_vals, 95);
    
    const tailSize = Math.ceil(0.1 * s_vals.length);
    const tail = tailSize > 0 ? s_vals.slice(0, tailSize) : [];
    const cvar10 = tail.length > 0 ? tail.reduce((sum, val) => sum + val, 0) / tail.length : s_vals[0] || 0;
    
    meanPoint.S_mean = meanPoint.S;
    meanPoint.S_cvar10 = cvar10;
    meanPoint.bands = { p05, p50, p95 };

    // Calculate Variance of S as an early warning indicator
    if (s_vals.length > 1) {
        const meanS = meanPoint.S;
        const varianceS = s_vals.map(s => (s - meanS) ** 2).reduce((a, b) => a + b, 0) / s_vals.length;
        meanPoint.varianceS = varianceS;
    }


    mean.push(meanPoint);
  }

  const finalSValues = finalStates.map(s => s.S).sort((a, b) => a - b);
  let cvarS: number | undefined = undefined;
  if (finalSValues.length > 0) {
    const tailSize = Math.ceil(0.1 * finalSValues.length);
    if (tailSize > 0) {
        const tail = finalSValues.slice(0, tailSize);
        cvarS = tail.reduce((sum, val) => sum + val, 0) / tail.length;
    }
  }

  const analytics = {
      timeInCrisis: T > 0 ? (totalDaysInCrisis / (ensembleSize * T)) * 100 : 0,
      cvarS,
  };

  return { mean, runs, initialState: base, finalStates, analytics };
}
