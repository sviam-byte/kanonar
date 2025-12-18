
import { CharacterEntity, AgentPsychState, Episode, ArchetypePhase, TraumaLoad, DistortionProfile, NarrativeIdentity, AttachmentProfile, MoralDissonance, ResilienceProfile, CopingProfile, ExposureTraces, Worldview } from '../../types';
import { computeBiographyLatent, BiographyLatent } from '../biography/lifeGoalsEngine';
import { computeExposureTraces, computeWorldview } from '../biography/exposure';
import { getNestedValue } from '../param-utils';
import { computeSelfArchetypeVector } from '../archetypes/system';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const get = (c: CharacterEntity, key: string, def: number = 0.5) => getNestedValue(c.vector_base, key) ?? def;

export function computeDistortionProfile(c: CharacterEntity, w: Worldview, b: BiographyLatent): DistortionProfile {
    // Traits
    const traitParanoia = get(c, 'C_betrayal_cost');
    const traitReactivity = get(c, 'D_HPA_reactivity');
    const traitRigidity = get(c, 'G_Identity_rigidity');
    const traitPower = get(c, 'A_Power_Sovereignty');
    const traitSensitivity = get(c, 'C_reputation_sensitivity');
    const traitAmbiguityTol = get(c, 'B_tolerance_ambiguity');

    // 1. Trust Bias: Paranoia trait + Betrayal history + Low World Trust
    const trustBias = clamp01(
        0.3 * b.betrayalPeer + 
        0.3 * b.betrayalLeader + 
        0.2 * (1 - w.people_trust) + 
        0.3 * traitParanoia
    );

    // 2. Threat Bias: Reactivity trait + Trauma + Low Benevolence
    const threatBias = clamp01(
        0.3 * b.traumaWorld + 
        0.2 * b.traumaSystem + 
        0.2 * (1 - w.world_benevolence) + 
        0.3 * traitReactivity
    );

    // 3. Self-Blame: Rescue failure + Low power/agency (implicit)
    const selfBlameBias = clamp01(0.5 * b.traumaSelf + 0.3 * b.rescueFailure - 0.2 * b.rescueSuccess);
    
    // 4. Control Illusion: Power trait + Leadership history + Low perceived control
    const controlIllusion = clamp01(
        0.4 * traitPower * (1 - w.controllability) + 
        0.3 * b.leadershipEpisodes + 
        0.2 * (1 - traitAmbiguityTol)
    );
    
    // 5. Black & White: Rigidity trait + System Trauma
    const blackWhiteThinking = clamp01(
        0.4 * traitRigidity + 
        0.3 * (1 - traitAmbiguityTol) + 
        0.3 * b.traumaSystem
    );
    
    // 6. Catastrophizing: Sensitivity + Threat Bias
    const catastrophizing = clamp01(
        0.4 * traitSensitivity + 
        0.3 * threatBias + 
        0.2 * traitReactivity
    );
    
    // 7. Discounting Positive: Loss history + Pessimism (Low benev)
    const discountingPositive = clamp01(0.4 * b.socialLossNegative - 0.2 * b.socialBondPositive + 0.3 * selfBlameBias);
    
    // 8. Personalization: Sensitivity + Self Blame
    const personalization = clamp01(0.4 * selfBlameBias + 0.4 * traitSensitivity);
    
    // 9. Mind Reading: Paranoia + Sensitivity
    const mindReading = clamp01(0.4 * trustBias + 0.3 * traitSensitivity + 0.2 * traitParanoia);

    return { trustBias, threatBias, selfBlameBias, controlIllusion, blackWhiteThinking, catastrophizing, discountingPositive, personalization, mindReading };
}

function computeCopingProfile(c: CharacterEntity, d: DistortionProfile, b: BiographyLatent): CopingProfile {
    const avoid = clamp01(0.5 * d.threatBias + 0.3 * d.catastrophizing + 0.2 * (1 - get(c, 'D_stamina_reserve')));
    const hyperControl = clamp01(0.6 * d.controlIllusion + 0.3 * get(c, 'A_Legitimacy_Procedure'));
    const aggression = clamp01(0.4 * d.threatBias + 0.4 * get(c, 'D_HPA_reactivity') + 0.2 * d.blackWhiteThinking);
    const selfHarm = clamp01(0.6 * d.selfBlameBias + 0.3 * b.traumaSelf);
    const helper = clamp01(0.5 * get(c, 'A_Safety_Care') + 0.3 * b.rescueSuccess - 0.2 * d.trustBias);
    
    return { avoid, hyperControl, aggression, selfHarm, helper };
}

function computeAttachmentProfile(c: CharacterEntity, b: BiographyLatent): AttachmentProfile {
    const secure = clamp01(0.4 * b.socialBondPositive + 0.4 * get(c, 'C_reciprocity_index') - 0.2 * b.betrayalPeer);
    const anxious = clamp01(0.4 * b.socialLossNegative + 0.4 * get(c, 'C_reputation_sensitivity'));
    const avoidant = clamp01(0.4 * b.betrayalPeer + 0.4 * get(c, 'A_Liberty_Autonomy') - 0.2 * b.socialBondPositive);
    const disorganized = clamp01(0.5 * b.traumaOthers + 0.3 * b.traumaSelf);
    
    // Normalize
    const sum = secure + anxious + avoidant + disorganized;
    if (sum > 0) {
        return { secure: secure/sum, anxious: anxious/sum, avoidant: avoidant/sum, disorganized: disorganized/sum };
    }
    return { secure: 0.5, anxious: 0.2, avoidant: 0.2, disorganized: 0.1 };
}

function computeResilienceProfile(c: CharacterEntity): ResilienceProfile {
    const tolerancePowerlessness = get(c, 'B_tolerance_ambiguity');
    const futureHorizon = get(c, 'G_Narrative_agency');
    return { tolerancePowerlessness, futureHorizon };
}

function updateMoralDissonance(current: MoralDissonance | undefined, episodes: Episode[], c: CharacterEntity, b: BiographyLatent): MoralDissonance {
    const guilt = clamp01(0.4 * b.rescueFailure + 0.3 * get(c, 'C_dominance_empathy'));
    const shame = clamp01(0.4 * b.subordinationEpisodes + 0.4 * get(c, 'C_reputation_sensitivity'));
    
    return { 
        windowSize: 20, 
        valueBehaviorGapTotal: (guilt + shame) / 2, 
        valueBehaviorGapSelf: shame, 
        valueBehaviorGapOthers: guilt, 
        valueBehaviorGapSystem: 0.2, 
        valueBehaviorGap: (guilt + shame) / 2,
        guilt, 
        shame, 
        perAxis: [] 
    };
}

function calculateIdentityTension(c: CharacterEntity): number {
    const trueVec = c.identity.arch_true;
    const selfVec = c.identity.arch_self;
    
    if (!trueVec || !selfVec || trueVec.length === 0 || trueVec.length !== selfVec.length) {
        return 0;
    }

    let sumDiff = 0;
    for(let i = 0; i < trueVec.length; i++) {
        sumDiff += Math.abs(trueVec[i] - selfVec[i]);
    }
    
    return sumDiff / trueVec.length;
}

function updateNarrativeIdentity(current: NarrativeIdentity | null, episodes: Episode[], ctx: any): NarrativeIdentity {
    const { archetypePhase, tension } = ctx;
    let role: NarrativeIdentity['role'] = 'observer';
    let plot: NarrativeIdentity['plot'] = 'survival';
    
    if (ctx.moral?.guilt > 0.6) role = 'martyr';
    else if (ctx.trauma?.others > 0.6) role = 'monster';
    else if (ctx.trauma?.system > 0.6) role = 'tool';
    else if ((ctx.field?.SELF_SUBJECT ?? 0) > 0.7) role = 'hero';
    else if ((ctx.field?.OTHERS_CARE ?? 0) > 0.7) role = 'savior';
    
    if (archetypePhase === 'break') plot = 'decay';
    else if (archetypePhase === 'radical') plot = 'revenge';
    else if (archetypePhase === 'post') plot = 'redemption';
    else if (ctx.moral?.valueBehaviorGapTotal < 0.2) plot = 'duty';
    
    return { role, plot, tensionWithObserved: tension ?? 0 };
}

export function recomputeAgentPsychState(agent: AgentPsychState | undefined, character: CharacterEntity, fieldMetrics: any, archetypeObserved: string | null, archetypePhase: ArchetypePhase, recentEpisodes: Episode[]): AgentPsychState {
  const bioEvents = character.historicalEvents || [];
  const bioLatent = computeBiographyLatent(bioEvents);
  const exposures = computeExposureTraces(bioEvents);
  const worldview = computeWorldview(exposures);

  const distortion = computeDistortionProfile(character, worldview, bioLatent);
  const coping = computeCopingProfile(character, distortion, bioLatent);
  const attachment = computeAttachmentProfile(character, bioLatent);
  const resilience = computeResilienceProfile(character);
  const currentMoral = agent?.moral;
  const moral = updateMoralDissonance(currentMoral, recentEpisodes, character, bioLatent);
  
  const trauma: TraumaLoad = (character as any).trauma || { self: 0, others: 0, world: 0, system: 0 };
  if (trauma.self === 0 && trauma.others === 0 && trauma.world === 0 && trauma.system === 0) {
      trauma.self = exposures.E_helpless * 0.8;
      trauma.others = (exposures.E_betrayal_peer + exposures.E_betrayal_leader) / 2;
      trauma.world = exposures.E_chaos * 0.8;
      trauma.system = exposures.E_system_arbitrariness * 0.8;
  }
  
  if (!character.identity.arch_self) {
       character.identity.arch_self = computeSelfArchetypeVector(character.identity.arch_true || [], distortion, trauma, moral, bioLatent);
  }

  // New: Calculate Identity Tension
  const tension = calculateIdentityTension(character);

  const narrative = updateNarrativeIdentity(
      agent?.narrative || null, 
      recentEpisodes, 
      { field: fieldMetrics, archetypeObserved, archetypePhase, trauma, moral, tension }
  );
  
  const stress = (getNestedValue(character, "body.acute.stress") ?? 0) / 100;
  const sysMode = stress > 0.6 || coping.avoid > 0.7 ? 'SYS-1' : 'SYS-2';
  
  const shadowActivation = (character as any).archetype?.shadowActivation ?? 0;

  return { coping, distortion, narrative, attachment, moral, resilience, worldview, exposures, selfGap: moral.valueBehaviorGapTotal, shame: moral.shame, guilt: moral.guilt, shadowActivation, sysMode, trauma };
}