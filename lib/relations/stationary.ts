// lib/relations/stationary.ts

import { CharacterEntity, StationaryRelation, FullCharacterMetrics, Branch, StationaryRelationProbabilities, SocialEventEntity } from '../../types';
import { calculateAllCharacterMetrics } from '../metrics';
import { calculateGoalAlignment } from '../goal-alignment';
import { createPerceivedCharacter } from '../negotiation/simulateHeadToHead';
import { getNestedValue } from '../param-utils';

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const getParam = (p: Record<string, number>, key: string, defaultValue: number = 0.5): number => p[key] ?? defaultValue;

function calculateDonorshipProp(metrics: FullCharacterMetrics): number {
    const p = metrics.eventAdjustedFlatParams;
    const logit = 0.22 * getParam(p, 'vector_base.A_Power_Sovereignty')
                + 0.18 * (getParam(p, 'authority.signature_weight.civic', 0) * 2) 
                + 0.16 * (getParam(p, 'social.audience_reputation.0.score', 50) / 100)
                + 0.12 * (metrics.latents.CL ?? 0.5)
                + 0.10 * getParam(p, 'vector_base.A_Knowledge_Truth')
                + 0.06 * getParam(p, 'vector_base.E_Skill_diplomacy_negotiation')
                - 0.14 * (getParam(p, 'state.dark_exposure', 0) / 100)
                - 0.10 * getParam(p, 'vector_base.G_Identity_rigidity');
    return sigmoid(logit);
}

function calculateFollowershipProp(metrics: FullCharacterMetrics): number {
    const p = metrics.eventAdjustedFlatParams;
    const v42 = metrics.v42metrics!;
    const logit = 0.24 * getParam(p, 'vector_base.C_coalition_loyalty')
                + 0.18 * getParam(p, 'vector_base.C_reputation_sensitivity')
                + 0.12 * getParam(p, 'vector_base.A_Tradition_Continuity')
                + 0.08 * getParam(p, 'vector_base.B_cooldown_discipline')
                - 0.22 * v42.Agency_t
                - 0.10 * v42.WMcap_t
                - 0.08 * getParam(p, 'vector_base.G_Self_concept_strength');
    return sigmoid(logit);
}

function calculateTaskAcceptance(metrics: FullCharacterMetrics): number {
    const p = metrics.eventAdjustedFlatParams;
    const v42 = metrics.v42metrics!;
    const logit = 0.25 * v42.Agency_t 
                + 0.15 * (metrics.latents.SD ?? 0.5)
                + 0.15 * (getParam(p, 'state.will', 50) / 100)
                - 0.20 * (getParam(p, 'state.backlog_load', 0) / 100)
                - 0.15 * v42.ExhaustRisk_t
                - 0.10 * getParam(p, 'vector_base.B_decision_temperature');
    return sigmoid(logit);
}


export function calculateStationaryRelation(
    observer: CharacterEntity, // i
    target: CharacterEntity,   // j
    allCharacters: CharacterEntity[],
    socialEvents: SocialEventEntity[] = []
): StationaryRelation {
    // 1. Calculate full metrics for observer (i), perceived target (j), and true target (j)
    const i_metrics = calculateAllCharacterMetrics(observer, observer.versionTags[0] as Branch, socialEvents);
    const j_perceived = createPerceivedCharacter(observer, i_metrics, target);
    const j_metrics = calculateAllCharacterMetrics(j_perceived, j_perceived.versionTags[0] as Branch, socialEvents);
    const j_true_metrics = calculateAllCharacterMetrics(target, target.versionTags[0] as Branch, socialEvents);
    
    // Reciprocal perspective for j->i calculations
    const i_perceived_by_j = createPerceivedCharacter(target, j_true_metrics, observer);
    const i_perceived_by_j_metrics = calculateAllCharacterMetrics(i_perceived_by_j, i_perceived_by_j.versionTags[0] as Branch, socialEvents);


    // --- Intermediate values & Base Metrics ---
    const compatibility = calculateGoalAlignment(i_metrics.goalEcology, j_metrics.goalEcology);
    
    const trust_base = sigmoid(2.0 * (
        // FIX: Add type casts because getNestedValue now returns 'any'.
        0.35 * ((getNestedValue(i_metrics.modifiableCharacter, 'vector_base.C_reciprocity_index') as number | undefined) ?? 0.5) +
        0.25 * ((getNestedValue(i_metrics.modifiableCharacter, 'vector_base.C_coalition_loyalty') as number | undefined) ?? 0.5) +
        0.2 * (j_metrics.latents.EW ?? 0.5) +
        0.1 * (j_metrics.v42metrics?.InfoHyg_t ?? 0.5) -
        0.2 * (((getNestedValue(j_metrics.modifiableCharacter, 'state.dark_exposure') as number | undefined) ?? 0) / 100)
    ) - 1.0);

     const trust_ji = sigmoid(2.0 * (
        0.35 * ((getNestedValue(j_true_metrics.modifiableCharacter, 'vector_base.C_reciprocity_index') as number | undefined) ?? 0.5) +
        0.25 * ((getNestedValue(j_true_metrics.modifiableCharacter, 'vector_base.C_coalition_loyalty') as number | undefined) ?? 0.5) +
        0.2 * (i_perceived_by_j_metrics.latents.EW ?? 0.5) +
        0.1 * (i_perceived_by_j_metrics.v42metrics?.InfoHyg_t ?? 0.5) -
        0.2 * (((getNestedValue(i_perceived_by_j_metrics.modifiableCharacter, 'state.dark_exposure') as number | undefined) ?? 0) / 100)
    ) - 1.0);

    const credcommit_base = j_metrics.tomV2Metrics?.cred_commit ?? 0.5;
    const norm_conflict = i_metrics.tomV2Metrics?.norm_conflict ?? 0.5;
    const uncertainty = i_metrics.tomMetrics?.toM_Unc ?? 0.5;
    const tx_cost = sigmoid(2.5 * (0.4 * compatibility.compromiseCost + 0.3 * norm_conflict + 0.2 * 0.1 - 0.3 * trust_base) - 1.0);

    const EDU_gain_ij = i_metrics.tomV2Metrics?.tom_info_gain_rate ?? 0.5;

    // --- LOGIT CALCULATIONS for all 16 probabilities ---
    const probabilities: StationaryRelationProbabilities = {
        p_follow: sigmoid(1.5 * compatibility.cosine + 2.0 * trust_base + 1.5 * credcommit_base + 0.5 * EDU_gain_ij - 2.0 * compatibility.compromiseCost - 2.5 * norm_conflict - 1.0 * ((i_metrics.eventAdjustedFlatParams['vector_base.B_decision_temperature'] as number | undefined) ?? 0.5) - 1.0),
        p_donate_goals: sigmoid(2.0 * calculateDonorshipProp(j_true_metrics) + 1.5 * (((i_perceived_by_j_metrics.eventAdjustedFlatParams['social.audience_reputation.0.score'] as number | undefined) ?? 50) / 100) + 1.0 * ((j_true_metrics.eventAdjustedFlatParams['authority.signature_weight.civic'] as number | undefined) ?? 0.5) + 2.5 * trust_ji - 2.0 * (j_true_metrics.derivedMetrics?.reputationFragility ?? 0.5) - 1.5 * 0.1 - 1.5),
        p_task_assign: sigmoid(2.5 * (i_metrics.tomMetrics?.delegability ?? 0.5) + 2.0 * calculateTaskAcceptance(j_metrics) + 2.0 * trust_base + 1.0 * 0.7 - 2.5 * (((j_metrics.eventAdjustedFlatParams['state.backlog_load'] as number | undefined) ?? 50) / 100) - 1.5),
        p_task_accept: sigmoid(2.5 * calculateTaskAcceptance(j_true_metrics) + 2.0 * trust_ji + 1.0 * ((j_true_metrics.eventAdjustedFlatParams['vector_base.A_Safety_Care'] as number | undefined) ?? 0.5) - 2.5 * (((j_true_metrics.eventAdjustedFlatParams['state.backlog_load'] as number | undefined) ?? 50) / 100) - 3.0 * (j_true_metrics.v42metrics?.ExhaustRisk_t ?? 0.5) - 1.0),
        p_tie_survival: sigmoid(3.0 * trust_base + 2.0 * credcommit_base - 3.0 * norm_conflict - 1.5 * (((i_metrics.v42metrics?.TailRisk_t ?? 0.5) + (j_metrics.v42metrics?.TailRisk_t ?? 0.5)) / 2) - 1.0 * 0.1),
        p_coalition_form: sigmoid(2.5 * compatibility.cosine + 2.0 * trust_base + 1.5 * credcommit_base - 2.0 * compatibility.compromiseCost - 2.5 * norm_conflict),
        p_mandate_grant: sigmoid(2.0 * ((j_true_metrics.eventAdjustedFlatParams['authority.signature_weight.civic'] as number | undefined) ?? 0.5) + 1.5 * (((i_perceived_by_j_metrics.eventAdjustedFlatParams['social.audience_reputation.0.score'] as number | undefined) ?? 50) / 100) + 2.0 * trust_ji - 2.5 * (j_true_metrics.derivedMetrics?.reputationFragility ?? 0.5) - 1.5 * (1 - (i_perceived_by_j_metrics.tomV2Metrics?.cred_commit ?? 0.5)) - 1.0),
        p_mandate_revoke: sigmoid(2.0 * 0.1 + 2.5 * (j_true_metrics.tomV2Metrics?.norm_conflict ?? 0.5) + 1.5 * (j_true_metrics.derivedMetrics?.reputationFragility ?? 0.5) - 3.0 * (i_perceived_by_j_metrics.tomV2Metrics?.cred_commit ?? 0.5) - 3.5 * trust_ji),
        p_public_endorse: sigmoid(2.5 * trust_base + 2.0 * credcommit_base + 1.0 * 0.5 - 2.5 * (i_metrics.derivedMetrics?.reputationFragility ?? 0.5) - 2.0 * (((j_metrics.eventAdjustedFlatParams['state.dark_exposure'] as number | undefined) ?? 0) / 100) - 0.5),
        p_public_distance: sigmoid(2.5 * (i_metrics.derivedMetrics?.reputationFragility ?? 0.5) + 2.0 * norm_conflict + 1.5 * 0.1 - 3.0 * trust_base - 1.0),
        p_deception_by_j: sigmoid(3.0 * (j_metrics.tomV2Metrics?.decep_incentive ?? 0.5) - 2.0 * ((j_metrics.eventAdjustedFlatParams['vector_base.A_Legitimacy_Procedure'] as number | undefined) ?? 0.5) - 2.5 * credcommit_base - 1.5 * (i_metrics.tomV2Metrics?.detect_power ?? 0.5) - 1.0),
        p_detection_by_i: sigmoid(2.5 * (i_metrics.v42metrics?.InfoHyg_t ?? 0.5) + 2.0 * (i_metrics.latents.CH ?? 0.5) - 2.5 * ((j_metrics.eventAdjustedFlatParams['vector_base.E_Skill_opsec_hacking'] as number | undefined) ?? 0.5) - 1.0 * 0.1),
        p_share_sensitive: sigmoid(3.5 * trust_base + 1.5 * ((j_metrics.eventAdjustedFlatParams['vector_base.E_Skill_opsec_hacking'] as number | undefined) ?? 0.5) - 2.0 * tx_cost - 2.0 * (((j_metrics.eventAdjustedFlatParams['state.dark_exposure'] as number | undefined) ?? 0) / 100) - 1.5),
        p_compromise: sigmoid(2.0 * (1 - compatibility.compromiseCost) - 1.5 * compatibility.compromiseCost - 1.5 * compatibility.blockedMass),
        p_conflict_escalation: sigmoid(3.0 * norm_conflict + 2.0 * (i_metrics.v42metrics?.TailRisk_t ?? 0.5) + 1.5 * tx_cost - 3.0 * trust_base - 2.0 * compatibility.cosine - 1.0 * (i_metrics.v42metrics?.Rmargin_t ?? 0.5) - 1.0),
        p_posterior_shift: sigmoid(2.0 * (i_metrics.tomV2Metrics?.tom_info_gain_rate ?? 0.5) + 2.0 * (j_metrics.tomV2Metrics?.identifiability ?? 0.5) - 1.5 * ((i_metrics.eventAdjustedFlatParams['vector_base.G_Self_consistency_drive'] as number | undefined) ?? 0.5) - 2.0 * ((i_metrics.eventAdjustedFlatParams['vector_base.G_Identity_rigidity'] as number | undefined) ?? 0.5)),
    };

    // Recalculate reciprocity for scores100
    const P_donate_base_i_to_j = sigmoid(2.0 * calculateDonorshipProp(i_metrics) + 1.5 * (((j_metrics.eventAdjustedFlatParams['social.audience_reputation.0.score'] as number | undefined) ?? 50) / 100) + 1.0 * ((i_metrics.eventAdjustedFlatParams['authority.signature_weight.civic'] as number | undefined) ?? 0.5) + 2.5 * trust_base - 2.0 * (i_metrics.derivedMetrics?.reputationFragility ?? 0.5) - 1.5 * 0.1 - 1.5);

    const edge_weight = trust_base * compatibility.cosine * (1 - compatibility.compromiseCost) * (1 - uncertainty);
    
    return {
        perception: { axes_post: {}, uncertainty },
        compatibility,
        rapport: { trust_base, credcommit_base, norm_conflict, volatility: 0.1 * (1 - trust_base), tie_survival: probabilities.p_tie_survival },
        influence: { edge_weight, bandwidth_eff: 0.8 * (1 - 0.2) * (1-uncertainty), tx_cost },
        probabilities,
        scores100: {
            relation_strength: edge_weight * 100,
            alignment_quality: ((compatibility.cosine + compatibility.rankCorrelation)/2) * 100,
            relation_stability: probabilities.p_tie_survival * 100,
            reciprocity_balance: 50 * (P_donate_base_i_to_j - probabilities.p_donate_goals) + 50,
            adopt_tendency: probabilities.p_follow * 100,
            donate_tendency: probabilities.p_donate_goals * 100,
            task_assign_tendency: probabilities.p_task_assign * 100,
            task_accept_tendency: probabilities.p_task_accept * 100,
            tx_cost: tx_cost * 100,
            uncertainty: uncertainty * 100,
        },
    };
}
