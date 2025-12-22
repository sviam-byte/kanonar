
// lib/meeting/formulas.ts
import { FullCharacterMetrics, InteractionMetrics, GoalAlignmentMetrics, MeetingOutcome } from '../../types';

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export function calculateInteractionMetrics(
    p1: FullCharacterMetrics, 
    p2_perceived: FullCharacterMetrics,
    goalAlignment: GoalAlignmentMetrics
): InteractionMetrics {

    const p1_tom = p1.tomV2Metrics!;
    const p2_tom = p2_perceived.tomV2Metrics!;
    const p2_char = p2_perceived.modifiableCharacter;
    const p2_v42 = p2_perceived.v42metrics!;
    
    // From spec: Trust_ij = σ(0.35·reciprocity + 0.25·coalition + 0.2·Integrity_j + 0.1·InfoHyg_j − 0.2·TSdark_j)
    const trust_logit = 
        0.35 * (p2_char.vector_base?.C_reciprocity_index ?? 0.5) +
        0.25 * (p2_char.vector_base?.C_coalition_loyalty ?? 0.5) +
        0.20 * (p2_perceived.latents.EW ?? 0.5) + // Integrity proxy
        0.10 * (p2_v42.InfoHyg_t) -
        0.20 * ((p2_char.state?.dark_exposure ?? 0) / 100);

    const trust = sigmoid(trust_logit - 0.2); // Center the sigmoid around a slightly higher threshold

    const deceptionRisk = p2_tom.decep_incentive * (1 - p1_tom.detect_power);

    return {
        trust,
        credibility: p2_tom.cred_commit,
        deceptionRisk,
        normConflict: p2_tom.norm_conflict,
        goalAlignment,
    };
}

export function calculateOutcomeProbabilities(
    p1: FullCharacterMetrics, 
    p2_perceived: FullCharacterMetrics,
    interaction: InteractionMetrics
): { probabilities: { outcome: MeetingOutcome, score: number }[], final: MeetingOutcome } {
    
    const p1_v42 = p1.v42metrics!;
    const p1_tomV2 = p1.tomV2Metrics!;
    const p2_tomV2 = p2_perceived.tomV2Metrics!;
    
    const outcomes: MeetingOutcome[] = ['agreement', 'partial_agreement', 'delay', 'refuse', 'conflict', 'successful_deception', 'failed_deception', 'coalition'];
    const logits: Record<string, number> = {};

    // Base score from spec (S(m) logic, simplified)
    const S_base = 
        0.20 * (1 - interaction.normConflict) + // Align(A_i, A_j) proxy
        0.20 * interaction.trust +
        0.10 * interaction.credibility +
        0.05 * p2_tomV2.irl_fit -
        0.15 * interaction.normConflict -
        0.10 * (p1_v42.TailRisk_t * (1 - p1_v42.Rmargin_t)); // Risk term

    // Calculate logits for each outcome by modulating the base score
    logits.agreement = S_base + 0.2 * interaction.goalAlignment.feasibleOverlap;
    logits.partial_agreement = S_base + 0.1;
    logits.delay = (1 - S_base) * (p1.tomMetrics?.toM_Unc ?? 0.5);
    logits.refuse = (1 - S_base) * 0.5;
    logits.conflict = (1 - S_base) + 0.3 * interaction.normConflict - 0.2 * interaction.trust;
    logits.coalition = S_base * p2_tomV2.coalition_cohesion;
    logits.successful_deception = S_base * interaction.deceptionRisk;
    logits.failed_deception = S_base * interaction.deceptionRisk * p1_tomV2.detect_power;
    
    // Normalize logits to probabilities via softmax
    const temp = 0.5; // Scene temperature
    const exp_logits = Object.fromEntries(outcomes.map(key => [key, Math.exp( (logits[key] || 0) / temp) ]));
    // FIX: Cast Object.values to number[] to resolve reduce error.
    const sum_exp_logits = (Object.values(exp_logits) as number[]).reduce((a, b) => a + b, 0);
    
    const probabilities = outcomes.map((outcome) => ({
        outcome: outcome as MeetingOutcome,
        // FIX: Cast exp_logits[outcome] to number to resolve arithmetic error.
        score: sum_exp_logits > 0 ? (exp_logits[outcome] as number) / sum_exp_logits : 1 / outcomes.length,
    }));

    // Sample final outcome
    let random = Math.random();
    let final: MeetingOutcome = 'delay';
    // Sort probabilities to make sampling deterministic for testing if needed
    const sortedProbs = [...probabilities].sort((a,b) => b.score - a.score);

    for (const prob of sortedProbs) {
        random -= prob.score;
        if (random <= 0) {
            final = prob.outcome;
            break;
        }
    }
    
    return { probabilities, final };
}
