import { Strategy } from '../../types';

export const STRATEGIES: Strategy[] = [
  {
    id: "cautious",
    patch: (ag: any) => {
      if (!ag.behavioralParams) return;
      ag.behavioralParams.cvar_lambda = Math.min(1.0, 0.7 + 0.6 * (ag.resources?.risk_budget_cvar ?? 0.2));
      ag.behavioralParams.T0 *= 0.9;
      ag.behavioralParams.kappa_T_sensitivity *= 0.6;
      ag.behavioralParams.prospect.lambda_loss = Math.min(3.0, 1.8 + 0.8 * (ag.vector_base?.A_Safety_Care ?? 0.6));
    },
    actionBias: (Q: number, a: any) => {
      if (a.tags.includes("recovery") || a.tags.includes("stability")) return Q + 0.1;
      if (a.tags.includes("risk")) return Q - 0.1;
      return Q;
    }
  },
  {
    id: "bold",
    patch: (ag: any) => {
      if (!ag.behavioralParams) return;
      ag.behavioralParams.cvar_lambda *= 0.4;
      ag.behavioralParams.T0 = Math.min(1.3, ag.behavioralParams.T0 * 1.1);
      ag.behavioralParams.kappa_T_sensitivity = Math.min(0.8, ag.behavioralParams.kappa_T_sensitivity * 1.2);
    },
    actionBias: (Q: number, a: any) => a.tags.includes("risk") ? Q + 0.15 : Q
  },
  {
    id: "proceduralist",
    patch: (ag: any) => {
      if (!ag.behavioralParams) return;
      // These are not in CharacterParams, so we can't patch them.
      // ag.behavioralParams.obedience_cost = 0.0;
      // ag.behavioralParams.disobedience_penalty = 0.2;
      ag.behavioralParams.gumbel_beta = Math.max(0.05, ag.behavioralParams.gumbel_beta * 0.8);
    },
    actionBias: (Q: number, a: any) => a.tags.includes("hierarchy") ? Q + 0.12 : Q
  },
  {
    id: "altruist",
    patch: (ag: any) => { 
      // This is not in CharacterParams.
      // ag.behavioralParams.care_weight = 0.2; 
    },
    actionBias: (Q: number, a: any) => a.tags.includes("social") ? Q + 0.1 : Q
  },
  {
    id: "opportunist",
    patch: (ag: any) => {
      if (!ag.behavioralParams) return;
      ag.behavioralParams.T0 *= 1.05;
      ag.behavioralParams.gumbel_beta *= 1.1;
    },
    actionBias: (Q: number, a: any, ag: any) => {
      const r = (ag.world?.resources?.infra_budget || 0);
      return a.tags.includes("progress") && r > 0.2 ? Q + 0.08 : Q;
    }
  }
];