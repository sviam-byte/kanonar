
// lib/tom/v2-metrics.ts

import { CharacterEntity, ToMV2DashboardMetrics, V42Metrics, ToMDashboardMetrics } from '../../types';
import { calculateLatentsAndQuickStates } from './metrics'; // Needed to get quickStates for phys
import { flattenObject } from './param-utils';

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

const getParam = (obj: any, key: string, defaultValue: number = 0.5): number => {
    if (!key || typeof key !== 'string') return defaultValue;
    const path = key.split('.');
    let current = obj;
    for (const p of path) {
        if (current === undefined || current === null) return defaultValue;
        current = current[p];
    }
    return typeof current === 'number' ? current : defaultValue;
}


export function calculateTomV2Metrics(
    self: CharacterEntity,
    selfLatents: Record<string, number>,
    selfV42: V42Metrics,
    selfTom: ToMDashboardMetrics
): ToMV2DashboardMetrics {
    
    // --- IRL_Fit, KL_act ---
    const irl_fit = selfLatents.CH * 0.5 + selfTom.toM_Quality * 0.5;
    const kl_act = 1 - irl_fit;

    // --- Misattrib ---
    const misattrib = 1 - selfV42.DQ_t;

    // --- CredCommit ---
    const consistency = getParam(self, 'vector_base.G_Self_consistency_drive');
    const cost_sunk = 0.5; // generic proxy
    const sanctionability = getParam(self, 'vector_base.A_Legitimacy_Procedure');
    const reversibility = getParam(self, 'vector_base.A_Reversibility');
    const cred_commit = sigmoid(1.0 * consistency + 0.5 * cost_sunk + 0.8 * sanctionability - 1.2 * reversibility);

    // --- CoalitionCohesion, Pivotality ---
    const coalition_cohesion = 1 - Math.abs(getParam(self, 'vector_base.C_dominance_empathy') - 0.5) * 2;
    const pivotality = selfLatents.CL * getParam(self, 'vector_base.A_Power_Sovereignty');

    // --- RationalityFit, TimeHorizon ---
    const rationality_fit = 1 - Math.abs(getParam(self, 'vector_base.B_decision_temperature') - 0.5);
    const time_horizon = 1 - getParam(self, 'vector_base.B_discount_rate');

    // --- PragmaticLoss, CultureDistance ---
    const self_culture_vec = [getParam(self, 'vector_base.A_Tradition_Continuity'), getParam(self, 'vector_base.A_Transparency_Secrecy')];
    const other_culture_vec = [0.5, 0.5]; // generic opponent
    const culture_distance = Math.sqrt(Math.pow(self_culture_vec[0] - other_culture_vec[0], 2) + Math.pow(self_culture_vec[1] - other_culture_vec[1], 2)) / Math.sqrt(2);
    const pragmatic_loss = culture_distance;

    // --- DecepIncentive, DetectPower ---
    const detect_power = sigmoid(1.5 * selfV42.InfoHyg_t + 1.2 * selfLatents.CH - 0.8 * 0.5 - 0); // opponent OPSEC = 0.5
    const U_gain = 0.5; const Penalty = 1.0;
    const P_det_by_other = sigmoid(1.5 * 0.5 + 1.2 * 0.5 - 0.8 * getParam(self, 'vector_base.E_Skill_opsec_hacking') - 0); // opponent hyg/ch = 0.5
    const decep_incentive = Math.max(0, U_gain - P_det_by_other * Penalty);

    // --- ToM_InfoGainRate ---
    const tom_info_gain_rate = selfTom.toM_Unc * getParam(self, 'vector_base.B_exploration_rate');

    // --- Identifiability ---
    const identifiability = 1 - (getParam(self, 'observation.noise') + getParam(self, 'observation.report_noise')) / 2;

    // --- OrderMismatch ---
    const k_self = 1 + Math.floor(3 * selfTom.toM_DepthEff);
    const k_est_other = 1 + Math.floor(3 * 0.5); // assume avg opponent
    const order_mismatch = Math.abs(k_self - k_est_other) / 4;

    // --- PrototypeReliance, Outlierness ---
    const prototype_reliance = getParam(self, 'vector_base.E_Epi_schema_strength');
    const outlierness = 1 - prototype_reliance;

    // --- NormConflict (for RAP) ---
    const self_norm_vec = [getParam(self, 'vector_base.A_Justice_Fairness'), getParam(self, 'vector_base.A_Legitimacy_Procedure')];
    const other_norm_vec = [0.5, 0.5]; // generic opponent
    const norm_conflict = 0.5 * (Math.abs(self_norm_vec[0] - other_norm_vec[0]) + Math.abs(self_norm_vec[1] - other_norm_vec[1]));
    
    // --- Physical Self-Perception ---
    // We need to recalculate quickStates here because they might not be passed in,
    // or we assume they are consistent with selfLatents.
    // Ideally, we should be passed quickStates, but for now recompute is cheap.
    const flatParams = flattenObject(self);
    const { quickStates } = calculateLatentsAndQuickStates(flatParams);

    const physFitness = quickStates['phys_fitness'] ?? 0.5;
    const physFragility = quickStates['phys_fragility'] ?? 0.5;
    const hormoneTension = quickStates['hormone_tension'] ?? 0.5;
    const visibleInjury = flatParams['body.acute.injury_severity'] ?? 0.0;

    const self_physical_capability = clamp01(
        physFitness * (1 - physFragility),
    );

    const self_perceived_vulnerability = clamp01(
        0.6 * physFragility +
        0.2 * (1 - physFitness) +
        0.2 * hormoneTension,
    );

    const perceived_by_others_vulnerability = clamp01(
        0.5 * self_perceived_vulnerability +
        0.5 * visibleInjury,
    );


    return {
        irl_fit,
        kl_act,
        misattrib,
        cred_commit,
        coalition_cohesion,
        pivotality,
        rationality_fit,
        time_horizon,
        pragmatic_loss,
        decep_incentive,
        detect_power,
        tom_info_gain_rate,
        identifiability,
        order_mismatch,
        prototype_reliance,
        outlierness,
        norm_conflict,
        self_physical_capability,
        self_perceived_vulnerability,
        perceived_by_others_vulnerability,
    };
}