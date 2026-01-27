
import { CharacterEntity, EssenceEntity, MeetingResult, MeetingOutcome, FullCharacterMetrics, Branch } from '../../types';
import { calculateAllCharacterMetrics } from '../metrics';
import { calculateGoalAlignment } from '../goal-alignment';
import { calculateInteractionMetrics, calculateOutcomeProbabilities } from '../meeting/formulas';
import { getArchetypeMetricValues } from '../archetypes/system';
import { getNestedValue } from '../param-utils';
import { ARCHETYPE_STEREOTYPES } from '../archetypes/stereotypes';
import { getGlobalRunSeed, hashString32 } from "../core/noise";

type Negotiator = CharacterEntity | EssenceEntity;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export function createPerceivedCharacter(observer: CharacterEntity, observerMetrics: FullCharacterMetrics, target: CharacterEntity): CharacterEntity {
    // Start with a base clone
    const perceivedTarget = JSON.parse(JSON.stringify(target));
    
    // Check if we have a ToM entry for this target
    const tomEntry = (observer as any).tom?.[observer.entityId]?.[target.entityId] || 
                     (observer as any).tom?.[target.entityId]; // Handle different tom structures if needed
    
    // If we have an archetype estimate (vector of 9 metrics), reconstruct the vector_base
    if (tomEntry && tomEntry.arch_true_est && tomEntry.arch_true_est.length === 9) {
        // Mapping from index 0..8 to keys like 'AGENCY', 'ACCEPT', etc.
        const keys = ['AGENCY', 'ACCEPT', 'ACTION', 'RADICAL', 'SCOPE', 'TRUTH', 'CARE', 'MANIP', 'FORMAL'];
        
        // If there is a strong stereotype, we might bias the estimate further
        let estimate = [...tomEntry.arch_true_est];
        if (tomEntry.arch_stereotype !== undefined) {
            // Blend estimates towards the stereotype for simplified perception
            // This logic mimics applyStereotypePerception but for reconstruction
             const stereotypeName = ARCHETYPE_STEREOTYPES[tomEntry.arch_stereotype].name;
             // We don't have the full vector for the stereotype here easily without `allArchetypes`, 
             // but usually `arch_true_est` already incorporates the stereotype bias from `applyStereotypePerception`.
        }

        // Map abstract archetype metrics back to concrete vector_base params
        // This is an inverse mapping approximation.
        // For example: AGENCY ~ Narrative_agency, Liberty_Autonomy
        if (perceivedTarget.vector_base) {
             const p = perceivedTarget.vector_base;
             
             // AGENCY (0)
             const agency = estimate[0];
             p.G_Narrative_agency = (p.G_Narrative_agency ?? 0.5) * 0.5 + agency * 0.5;
             p.A_Liberty_Autonomy = (p.A_Liberty_Autonomy ?? 0.5) * 0.5 + agency * 0.5;
             
             // ACCEPT (1)
             const accept = estimate[1];
             p.A_Legitimacy_Procedure = (p.A_Legitimacy_Procedure ?? 0.5) * 0.5 + accept * 0.5;
             
             // ACTION (2)
             const action = estimate[2];
             p.B_decision_temperature = (p.B_decision_temperature ?? 0.5) * 0.5 + action * 0.5;
             
             // RADICAL (3)
             const radical = estimate[3];
             p.B_exploration_rate = (p.B_exploration_rate ?? 0.5) * 0.5 + radical * 0.5;
             
             // SCOPE (4)
             const scope = estimate[4];
             p.A_Power_Sovereignty = (p.A_Power_Sovereignty ?? 0.5) * 0.5 + scope * 0.5;
             
             // TRUTH (5)
             const truth = estimate[5];
             p.A_Knowledge_Truth = (p.A_Knowledge_Truth ?? 0.5) * 0.5 + truth * 0.5;
             
             // CARE (6)
             const care = estimate[6];
             p.A_Safety_Care = (p.A_Safety_Care ?? 0.5) * 0.5 + care * 0.5;
             
             // MANIP (7)
             const manip = estimate[7];
             p.A_Transparency_Secrecy = (p.A_Transparency_Secrecy ?? 0.5) * 0.5 + (1 - manip) * 0.5;
             
             // FORMAL (8)
             const formal = estimate[8];
             p.E_KB_civic = (p.E_KB_civic ?? 0.5) * 0.5 + formal * 0.5;
        }
    }
    
    // Apply uncertainty noise
    // If ToM metrics exist, use uncertainty to fuzz the parameters
    if (observerMetrics.tomMetrics) {
        const { toM_Unc, toM_Quality } = observerMetrics.tomMetrics;
        // Noise is driven by uncertainty, but capped by quality.
        const noiseLevel = toM_Unc * (1 - toM_Quality * 0.5) * 0.3; // Max 30% deviation
    
        if (perceivedTarget.vector_base) {
            for (const key in perceivedTarget.vector_base) {
                const originalValue = perceivedTarget.vector_base[key];
                const u = (hashString32(`${getGlobalRunSeed()}:${p1.entityId}:${p2_perceived.entityId}:${key}`) >>> 0) / 4294967296;
                const noise = (u - 0.5) * noiseLevel;
                perceivedTarget.vector_base[key] = clamp01(originalValue + noise);
            }
        }
    }
    
    return perceivedTarget;
}


export function runMeetingSimulation(
    p1: Negotiator,
    p2: Negotiator,
    stakes: number,
    deadline: number
): MeetingResult | null {
    if (!p1 || !p2) return null;

    // 1. Calculate full metrics for observer (p1)
    const p1_metrics = calculateAllCharacterMetrics(p1, p1.versionTags[0] as Branch, []);
    if (!p1_metrics.v42metrics || !p1_metrics.tomMetrics || !p1_metrics.tomV2Metrics || !p1_metrics.goalEcology) {
        console.error("P1 metrics calculation failed");
        return null;
    }

    // 2. Create a "perceived" version of the target (p2) from p1's perspective
    // This now uses the archetype estimate from ToM if available
    const p2_perceived = createPerceivedCharacter(p1, p1_metrics, p2);

    // 3. Calculate full metrics for the perceived p2
    const p2_perceived_metrics = calculateAllCharacterMetrics(p2_perceived, p2_perceived.versionTags[0] as Branch, []);
     if (!p2_perceived_metrics.v42metrics || !p2_perceived_metrics.tomMetrics || !p2_perceived_metrics.tomV2Metrics || !p2_perceived_metrics.goalEcology) {
        console.error("P2 perceived metrics calculation failed");
        return null;
    }

    // 4. Calculate interaction metrics
    const goalAlignment = calculateGoalAlignment(p1_metrics.goalEcology, p2_perceived_metrics.goalEcology);
    const interaction = calculateInteractionMetrics(p1_metrics, p2_perceived_metrics, goalAlignment);

    // 5. Calculate outcome probabilities
    const outcomes = calculateOutcomeProbabilities(p1_metrics, p2_perceived_metrics, interaction);

    // 6. Calculate post-meeting deltas (simplified)
    const deltas: MeetingResult['deltas'] = { p1: { stress: 0, reputation: 0 }, p2: { stress: 0, reputation: 0 }};
    if (outcomes.final === 'agreement' || outcomes.final === 'partial_agreement') {
        deltas.p1.stress = -5;
        deltas.p1.reputation = 5;
    } else if (outcomes.final === 'conflict') {
        deltas.p1.stress = 15;
        deltas.p1.reputation = -10;
    } else {
        deltas.p1.stress = 5;
        deltas.p1.reputation = -2;
    }
    // Mirror for p2 for simplicity
    deltas.p2 = { stress: deltas.p1.stress, reputation: -deltas.p1.reputation };

    const metrics_snapshot: MeetingResult['metrics_snapshot'] = {
        perception: {
            irl_fit: p1_metrics.tomV2Metrics.irl_fit,
            identifiability: p2_perceived_metrics.tomV2Metrics.identifiability,
        },
        rapport: {
            trust: interaction.trust,
            credibility: interaction.credibility,
        },
        risk: {
            tail_risk_scene: p1_metrics.v42metrics.TailRisk_t,
            r_margin_scene: p1_metrics.v42metrics.Rmargin_t,
        },
        policy: {
            del_rate: p1_metrics.tomMetrics.delegability,
        },
        outcome: {
            final: outcomes.final,
            expected_utility: 0, // Not calculated in this model version
            actual_utility: 0,   // Not calculated in this model version
        }
    };


    return {
        p1_id: p1.entityId,
        p2_id: p2.entityId,
        p1_metrics,
        p2_perceived_metrics,
        interaction,
        outcomes,
        deltas,
        metrics_snapshot,
    };
}
