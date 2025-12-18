
import { AgentState } from '../../types';

export function applyPhysioNoise(agent: AgentState) {
  const b = agent.body;
  const sleep_debt_h = b.reserves.sleep_debt_h ?? 0;
  const HPA_axis = b.regulation.HPA_axis ?? 0.5;
  const stress = b.acute.stress ?? 0;
  
  let h = 1
    + 0.5 * Math.tanh(sleep_debt_h / 12)
    + 0.3 * Math.tanh(Math.max(0, HPA_axis - 1))
    + 0.2 * (stress / 100);
    
  const sigma0 = agent.behavioralParams.sigma0 ?? 0.05;
  agent.processNoiseSigma = sigma0 * Math.min(h, 3.0);
}
