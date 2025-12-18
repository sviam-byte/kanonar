
import { V42Metrics, ToMV2DashboardMetrics, AgentState } from '../types';
import { getNestedValue } from './param-utils';

// Helper functions
const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const tanh = (x: number): number => Math.tanh(x);
const relu = (x: number): number => Math.max(0, x);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const h_mean = (x: number, y: number, epsilon = 1e-6): number => (2 * x * y) / (x + y + epsilon);
const g_mean = (x: number, y: number): number => Math.sqrt(x * y);
const yerkes_arousal = (A: number): number => {
    const mu = 0.55;
    const sigma_A = 0.18;
    return Math.exp(-Math.pow(A - mu, 2) / (2 * Math.pow(sigma_A, 2)));
};
// Inverted-U curve for stress
const yerkes_stress = (S: number): number => {
    const mu = 0.3; // Optimal stress around 30%
    const sigma_S = 0.25;
    const amplitude = 1.2; // Can slightly boost performance
    const baseline = 0.8; // At zero stress, performance is 80% of max potential
    return baseline + (amplitude - baseline) * Math.exp(-Math.pow(S - mu, 2) / (2 * Math.pow(sigma_S, 2)));
};
const deficit = (value: number, target: number, band: number): number => {
    const diff = Math.abs(value - target);
    if (diff <= band) return 0;
    return (diff - band) / (1 - target - band);
};

// FIX: Export this helper function to be used by other modules.
export const normalizeParamsForV42 = (flatParams: Record<string, number>) => {
    const norm = (key: string, max: number, min: number = 0) => {
        const val = flatParams[key];
        if (val === undefined) return 0;
        const range = max - min;
        return range > 0 ? (val - min) / range : 0;
    };
    const dose = (flatParams['memory.attention.E'] ?? 0) / (flatParams['memory.attention.A_star'] || 1);

    return {
        AM: flatParams['vector_base.A_Aesthetic_Meaning'] ?? 0,
        exploration_rate: flatParams['vector_base.B_exploration_rate'] ?? 0,
        Epi_recency: flatParams['vector_base.E_Epi_recency'] ?? 0,
        sleep_resilience: flatParams['vector_base.D_sleep_resilience'] ?? 0,
        Stress: norm('body.acute.stress', 100),
        Fatigue: norm('body.acute.fatigue', 100),
        SleepDebt: norm('body.reserves.sleep_debt_h', 72),
        Pain: norm('body.acute.pain_now', 100),
        MI_load: norm('body.acute.moral_injury', 100),
        Arousal: flatParams['body.regulation.arousal'] ?? 0.5,
        HPA: flatParams['vector_base.D_HPA_reactivity'] ?? 0.5,
        ComputeBudget: norm('compute.compute_budget', 100),
        goal_coherence: flatParams['vector_base.B_goal_coherence'] ?? 0.5,
        Metacog_accuracy: flatParams['vector_base.G_Metacog_accuracy'] ?? 0.5,
        KB_stem: flatParams['vector_base.E_KB_stem'] ?? 0.5,
        decision_temperature: flatParams['vector_base.B_decision_temperature'] ?? 0.5,
        Epi_schema_strength: flatParams['vector_base.E_Epi_schema_strength'] ?? 0.5,
        Cal: flatParams['vector_base.E_Model_calibration'] ?? 0.5,
        cooldown_discipline: flatParams['vector_base.B_cooldown_discipline'] ?? 0.5,
        Narrative_agency: flatParams['vector_base.G_Narrative_agency'] ?? 0.5,
        Self_concept_strength: flatParams['vector_base.G_Self_concept_strength'] ?? 0.5,
        Drift: norm('state.drift_state', 100),
        Overshoot: Math.max(0, dose - 1),
        ObsNoise: flatParams['observation.noise'] ?? 0.2,
        ReportNoise: flatParams['observation.report_noise'] ?? 0.2,
        MFid: flatParams['vector_base.A_Memory_Fidelity'] ?? 0.5,
        OPSEC: flatParams['vector_base.E_Skill_opsec_hacking'] ?? 0.5,
        RV: flatParams['vector_base.A_Reversibility'] ?? 0.5,
        EnergyReserve: norm('body.reserves.energy_store_kJ', 2000),
        Hydration: flatParams['body.reserves.hydration'] ?? 0.8,
        Glycemia: norm('body.reserves.glycemia_mmol', 12, 2.5),
        O2Reserve: flatParams['body.reserves.O2_margin'] ?? 0.8,
        HomeostatS: flatParams['body.reserves.sleep_homeostat_S'] ?? 0.5,
        stamina_reserve: flatParams['vector_base.D_stamina_reserve'] ?? 0.5,
        Extinction_rate: flatParams['vector_base.F_Extinction_rate'] ?? 0.5,
        KB_civic: flatParams['vector_base.E_KB_civic'] ?? 0.5,
        ChronV: flatParams['vector_base.E_Skill_chronicle_verify'] ?? 0.5,
        TS_dark_exposure: norm('state.dark_exposure', 100),
        CVaR_personal: flatParams['resources.risk_budget_cvar'] ?? 0.3,
    };
};

export function calculateV42Metrics(
    params: Record<string, number>, // Pre-normalized params
    latents: Record<string, number>,
    Pv_norm: number,
    tomV2Metrics?: ToMV2DashboardMetrics | null
): V42Metrics {

    // --- 1. V — Валентность ---
    const raw_V = +0.22 * params.AM + 0.16 * latents.SO + 0.12 * params.exploration_rate + 0.12 * params.Epi_recency
                + 0.10 * params.sleep_resilience - 0.14 * params.Stress - 0.10 * params.Fatigue
                - 0.08 * params.SleepDebt - 0.08 * params.Pain - 0.08 * params.MI_load;
    const V_star = sigmoid(2.2 * (raw_V - 0.5));
    const V_t = V_star; // Instantaneous

    // --- 2. A — Активация ---
    const raw_A = 0.62 * params.Arousal + 0.20 * params.HPA - 0.10 * params.SleepDebt - 0.08 * params.Fatigue;
    const A_star = sigmoid(3.0 * (raw_A - 0.5));
    const A_t = A_star; // Instantaneous

    // --- 3. WMcap — Рабочая память/внимание ---
    const core_WMcap = +0.30 * params.ComputeBudget + 0.22 * params.sleep_resilience + 0.18 * params.goal_coherence
                       - 0.16 * params.Stress - 0.07 * params.Fatigue - 0.07 * params.SleepDebt;
    const WMcap_star = sigmoid(3.0 * (core_WMcap - 0.5)) * yerkes_arousal(A_t) * yerkes_stress(params.Stress);
    const WMcap_t = WMcap_star; // Instantaneous

    // --- 4. DQ — Качество решений ---
    const lin_DQ = +0.30 * latents.CH + 0.22 * params.Metacog_accuracy + 0.18 * latents.SD + 0.10 * params.KB_stem
                   - 0.10 * params.decision_temperature - 0.05 * params.Stress - 0.05 * params.SleepDebt;
    const DQ_star = sigmoid(3.0 * (lin_DQ - 0.5)) * (0.6 + 0.4 * WMcap_t) * yerkes_stress(params.Stress);
    const DQ_t = DQ_star;

    // --- 5. Habit — Доля привычечного контроля ---
    const drive_Habit = +0.28 * params.decision_temperature + 0.22 * params.SleepDebt + 0.18 * params.Stress
                      + 0.16 * params.Epi_schema_strength - 0.10 * params.Cal - 0.10 * params.cooldown_discipline;
    const Habit_star = sigmoid(2.8 * (drive_Habit - 0.5));
    const Habit_t = Habit_star;

    // --- 6. Agency — Агентность ---
    const base_Agency = +0.34 * params.Narrative_agency + 0.22 * params.Self_concept_strength
                        + 0.18 * params.goal_coherence + 0.10 * latents.SD - 0.08 * params.Drift - 0.06 * params.Overshoot;
    const Agency_star = sigmoid(3.0 * (base_Agency - 0.5)) * (1 - 0.45 * Habit_t);
    const Agency_t = Agency_star;

    // --- 7. TailRisk — Хвостовой риск ---
    const MetaU = sigmoid(2.8 * (+0.30 * params.ObsNoise + 0.22 * params.ReportNoise
                                  + 0.22 * (1 - params.Cal) + 0.16 * (1 - params.MFid) - 0.20 * latents.CH - 0.5));
    const risklin = +0.30 * latents.RP + 0.20 * A_t + 0.15 * params.decision_temperature + 0.15 * params.HPA
                    + 0.10 * MetaU - 0.20 * latents.SD - 0.10 * params.OPSEC;
    const TailRisk_star = sigmoid(3.0 * (risklin - 0.5));
    const TailRisk_t = TailRisk_star;

    // --- 8. Rmargin — Запас обратимости ---
    const Rmargin_star = clamp01(sigmoid(3.0 * ( h_mean(params.RV, latents.SD) - 0.25 * latents.RP - 0.15 * params.decision_temperature - 0.5 ) ) + 0.5);
    const Rmargin_t = Rmargin_star;

    // --- 9. PlanRobust — Робастность планов ---
    const DoseFrag = sigmoid(3.0 * (+0.45 * params.Overshoot + 0.25 * params.HPA - 0.30 * latents.SD));
    const pr_lin = +0.28 * latents.SD + 0.22 * latents.CH + 0.22 * WMcap_t - 0.18 * TailRisk_t - 0.10 * DoseFrag;
    const PlanRobust_star = sigmoid(3.0 * (pr_lin - 0.5));
    const PlanRobust_t = PlanRobust_star;

    // --- 10. DriveU — Гомеостатическая потребность ---
    const DefE = 1 - params.EnergyReserve;
    const DefH = 1 - params.Hydration;
    const DefG = deficit(params.Glycemia, 0.5, 0.15);
    const DefO = 1 - params.O2Reserve;
    const SleepP = 0.5 * params.HomeostatS + 0.5 * params.SleepDebt;
    const Load = 0.28 * DefE + 0.18 * DefH + 0.16 * DefG + 0.16 * DefO + 0.12 * params.Pain + 0.10 * SleepP;
    const DriveU_star = 1 - Math.exp(-2.2 * Load);
    const DriveU_t = DriveU_star;

    // --- 11. ExhaustRisk — Риск истощения ---
    const synergy = relu(params.SleepDebt - 0.5) * relu(params.Stress - 0.5);
    const ex_lin = +0.30 * params.SleepDebt + 0.25 * params.Fatigue + 0.18 * params.HPA - 0.18 * params.stamina_reserve - 0.09 * params.sleep_resilience;
    const ExhaustRisk_star = sigmoid(3.2 * (ex_lin - 0.5) + 1.2 * synergy);
    const ExhaustRisk_t = ExhaustRisk_star;

    // --- 12. Recovery — Скорость восстановления ---
    const rec_lin = +0.34 * params.sleep_resilience + 0.24 * params.stamina_reserve + 0.16 * params.Extinction_rate
                    - 0.18 * params.SleepDebt - 0.10 * params.Stress;
    const Recovery_star = sigmoid(3.0 * (rec_lin - 0.5)) * (1 - 0.5 * ExhaustRisk_t);
    const Recovery_t = Recovery_star;

    // --- 13. ImpulseCtl — Контроль импульсов ---
    const lin_Impulse = +0.30 * latents.SD + 0.26 * params.cooldown_discipline + 0.10 * params.KB_civic
                       - 0.18 * params.decision_temperature - 0.12 * params.HPA;
    const ImpulseCtl_star = sigmoid(3.0 * (lin_Impulse - 0.5)) * (0.7 + 0.3 * WMcap_t);
    const ImpulseCtl_t = ImpulseCtl_star;

    // --- 14. InfoHyg — Информационная гигиена ---
    const core_InfoHyg = g_mean(latents.CH, 0.6 + 0.4 * params.OPSEC);
    const ih_lin = +0.50 * core_InfoHyg + 0.18 * params.ChronV + 0.12 * params.MFid
                   - 0.12 * params.TS_dark_exposure - 0.10 * params.ObsNoise - 0.08 * params.ReportNoise;
    const InfoHyg_star = sigmoid(3.0 * (ih_lin - 0.5));
    const InfoHyg_t = InfoHyg_star;

    // --- 15. RAP — Risk-Adjusted Performance ---
    const Perf = sigmoid(2.5 * (+0.40 * Pv_norm + 0.35 * DQ_t + 0.25 * Agency_t - 0.5));
    const RiskPenalty = Math.pow(1 - TailRisk_t, 1.0) / (1 + 1.0 * params.CVaR_personal);
    const PlanBoost = 0.7 + 0.3 * PlanRobust_t;
    
    let finalPerf = Perf;
    let finalRiskPenalty = RiskPenalty;

    if (tomV2Metrics) {
        const xi = 0.3; // Weight for norm conflict penalty
        finalPerf = Perf * (0.8 + 0.2 * tomV2Metrics.cred_commit);
        finalRiskPenalty = RiskPenalty * (1 - xi * tomV2Metrics.norm_conflict);
    }

    const RAP_star = clamp01(finalPerf * finalRiskPenalty * PlanBoost);
    const RAP_t = RAP_star;


    return {
        V_t, A_t, WMcap_t, DQ_t, Habit_t, Agency_t, TailRisk_t,
        Rmargin_t, PlanRobust_t, DriveU_t, ExhaustRisk_t, Recovery_t,
        ImpulseCtl_t, InfoHyg_t, RAP_t
    };
}
