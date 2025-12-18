
import { ContextAtom } from '../context/v2/types';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

// generic EMA integrator: x <- x + alpha*(target-x)
function ema(x: number, target: number, alpha: number) {
  return x + alpha * (target - x);
}

function getMag(atoms: ContextAtom[], id: string, fallback = 0) {
  const a = atoms.find((x) => x.id === id);
  const m = a?.magnitude;
  return typeof m === 'number' && Number.isFinite(m) ? m : fallback;
}

export type IntegratorTuning = {
  affectAlpha: number; // 0..1
  stressAlpha: number;
  primingAlpha: number;
  trustDecayAlpha: number;
};

export const DEFAULT_INTEGRATORS: IntegratorTuning = {
  affectAlpha: 0.25,
  stressAlpha: 0.20,
  primingAlpha: 0.15,
  trustDecayAlpha: 0.05,
};

// This is the ONLY place allowed to mutate agent state for these slow variables.
export function integrateAgentState(args: {
  agent: any;
  atomsAfterAffect: ContextAtom[]; // includes emo:* and threat:* etc
  tuning?: Partial<IntegratorTuning>;
}) {
  const { agent, atomsAfterAffect } = args;
  const t: IntegratorTuning = { ...DEFAULT_INTEGRATORS, ...(args.tuning || {}) };

  // Ensure state structure exists
  agent.state = agent.state || {};
  agent.state.affect = agent.state.affect || {};
  agent.state.traces = agent.state.traces || {};

  // 1. Affect Integrators (Targets from atoms where emo:* are computed inputs)
  const fear = getMag(atomsAfterAffect, `emotion:${agent.entityId}:fear`, agent.state.affect.fear ?? 0);
  const anger = getMag(atomsAfterAffect, `emotion:${agent.entityId}:anger`, agent.state.affect.anger ?? 0);
  const shame = getMag(atomsAfterAffect, `emotion:${agent.entityId}:shame`, agent.state.affect.shame ?? 0);
  // Trust/Hope often come from different atom IDs or are derived. 
  // Using explicit fallbacks if atoms missing.
  
  agent.state.affect.fear = clamp01(ema(agent.state.affect.fear ?? 0, fear, t.affectAlpha));
  agent.state.affect.anger = clamp01(ema(agent.state.affect.anger ?? 0, anger, t.affectAlpha));
  agent.state.affect.shame = clamp01(ema(agent.state.affect.shame ?? 0, shame, t.affectAlpha));

  // 2. Stress Integrator
  // Psychological stress load. Input: threat:final + lack of control
  const threatFinal = getMag(atomsAfterAffect, 'threat:final', 0);
  // controllability usually stored in affect calculation or appraisal atoms
  // We approximate lack of control via uncertainty if specific atom missing
  const uncertainty = getMag(atomsAfterAffect, 'ctx:uncertainty', 0.5);
  
  const stressTarget = clamp01(0.65 * threatFinal + 0.35 * uncertainty);
  agent.state.traces.stressLoad = clamp01(
    ema(agent.state.traces.stressLoad ?? 0, stressTarget, t.stressAlpha)
  );

  // 3. Trauma Priming
  // Grows with high fear/threat, decays slowly. Makes agent more sensitive to threats.
  const primingUp = clamp01(0.7 * threatFinal + 0.3 * (agent.state.affect.fear ?? 0));
  // If input is high, rise fast. If low, decay slow.
  const effPrimingAlpha = primingUp > (agent.state.traces.traumaPriming ?? 0) ? t.primingAlpha : t.primingAlpha * 0.5;
  
  agent.state.traces.traumaPriming = clamp01(
    ema(agent.state.traces.traumaPriming ?? 0, primingUp, effPrimingAlpha)
  );

  // 4. Trust Climate / Decay
  // Under high surveillance/publicness, general trust decays. In safe hubs, it recovers.
  const surveillance = getMag(atomsAfterAffect, 'norm:surveillance', 0);
  const publicness = getMag(atomsAfterAffect, 'ctx:publicness', 0);
  // scene flags
  const isSafeHub = atomsAfterAffect.some(a => a.id === 'scene:mode:safeHub') ? 1 : 0;
  
  const currentTrustClimate = agent.state.traces.trustClimate ?? 0.5;
  // Target: Low if surveillance/public, High if safe
  const trustGlobalTarget = clamp01(1.0 - 0.5 * (surveillance + publicness) + 0.2 * isSafeHub);
  
  agent.state.traces.trustClimate = clamp01(
    ema(currentTrustClimate, trustGlobalTarget, t.trustDecayAlpha)
  );
}
