
import { DyadConfigForA } from './dyad-metrics';

export const makeDefaultDyadConfig = (): DyadConfigForA => ({
  like_sim_axes: { 'A_Justice_Fairness': 1.0, 'A_Legitimacy_Procedure': 0.5 },
  like_opposite_axes: {},
  trust_sim_axes: { 'A_Justice_Fairness': 0.8, 'C_coalition_loyalty': 0.5 },
  trust_partner_axes: { 'C_reciprocity_index': 1.0 },
  fear_threat_axes: { 'A_Power_Sovereignty': 0.5, 'B_decision_temperature': 0.5 },
  fear_dom_axes: {},
  respect_partner_axes: { 'G_Narrative_agency': 0.5, 'E_Model_calibration': 0.5 },
  closeness_sim_axes: { 'A_Safety_Care': 0.8 },
  dominance_axes: { 'A_Power_Sovereignty': 1.0 },
  bias_liking: 0,
  bias_trust: 0,
  bias_fear: 0,
  bias_respect: 0,
  bias_closeness: 0,
  bias_dominance: 0,
});
