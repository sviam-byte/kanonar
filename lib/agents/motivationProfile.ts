
import { AgentState, AgentMotivationProfile } from "../../types";
import { calculateV42Metrics, normalizeParamsForV42 } from "../character-metrics-v4.2";
import { calculateLatentsAndQuickStates } from "../metrics";
import { flattenObject } from "../param-utils";

export function getAgentMotivationProfile(agent: AgentState): AgentMotivationProfile {
  // Ensure we have flat params to calculate metrics if v42metrics is missing
  let v42 = agent.v42metrics;
  
  if (!v42) {
      // Calculate metrics on the fly if missing (e.g. raw agent state)
      // This is a simplified calculation to avoid full dependency cycle or heavy computation
      const flatParams = flattenObject(agent);
      const { latents, quickStates } = calculateLatentsAndQuickStates(flatParams);
      const normParams = normalizeParamsForV42(flatParams);
      // We assume Pv_norm is roughly 0.5 for motivation profile if not fully simulated
      v42 = calculateV42Metrics(normParams, latents, 0.5);
  }

  return {
    arousal: v42.A_t ?? 0.5,
    stress: (agent.body?.acute?.stress ?? 0) / 100,
    fatigue: (agent.body?.acute?.fatigue ?? 0) / 100,
    exploration_rate: agent.vector_base?.B_exploration_rate ?? 0.5,
    social_safety: agent.derivedMetrics?.socialFriction ? 1 - agent.derivedMetrics.socialFriction : 0.5,
  };
}
