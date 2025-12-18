// lib/solver/mapper.ts

import { Agent } from './types';
import { CharacterEntity } from '../../types';
import { mapCharacterToBehaviorParams } from '../core/character_mapper';
import { hash32 } from '../math/core';

export function characterEntityToAgent(char: CharacterEntity): Agent {
    const p = mapCharacterToBehaviorParams(char);

    const agent: Agent = {
        id: hash32(char.entityId),
        theta: { ...char.vector_base },
        body: {
            VO2max: char.body.capacity.VO2max,
            sleep_debt_h: char.body.reserves.sleep_debt_h,
            HPA_axis: char.body.regulation.HPA_axis,
            stress: (char.body.acute.stress ?? 0) / 100,
            injuries_severity: (char.body.acute.injuries_severity ?? 0) / 100,
            fatigue: (char.body.acute.fatigue ?? 0) / 100,
        },
        legacy: {
            risk_budget_cvar: char.resources.risk_budget_cvar,
            topo_affinity: char.competencies.topo_affinity,
            loyalty: char.state.loyalty,
            time_t: 0,
        },
        sigils: Object.keys(char.identity.sigils || {}).filter(k => (char.identity.sigils as any)[k]),
        oaths: (char.identity.oaths || []).reduce((acc: Record<string, boolean>, oath: any) => {
            if (oath.key) {
                acc[oath.key] = true;
            }
            return acc;
        }, {}),
        temp: { T_L: p.T0 * 0.9, T_S: p.T0, sigma_proc: p.sigma0 },
        persona: {
            betaL: p.gumbel_beta,
            betaS: p.gumbel_beta,
            kappa_T: p.kappa_T_sensitivity,
            T0: p.T0,
            phi_max: p.phi_max,
            lambda_CVaR: p.cvar_lambda,
            loss_aversion: p.prospect.lambda_loss,
            goal_stochasticity: 0,
        },
        W_L: [], W_S: [],
        W_L_lag: [], W_S_lag: [],
    };

    return agent;
}
