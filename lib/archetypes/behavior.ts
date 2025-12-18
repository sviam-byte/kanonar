
import { AgentState, CharacterGoalId, SocialActionId, ArchetypeMode, ArchetypePhase } from '../../types';
import { allArchetypes } from '../../data/archetypes';

export type NormKind = 'harm' | 'procedure' | 'betrayal';

export interface ArchetypeBehaviorProfile {
  // Multipliers for goal importance (1 = default)
  goalWeights: Partial<Record<CharacterGoalId, number>>;

  // Multipliers for penalties (<1 = softer prohibitions, >1 = stricter)
  normPenaltyScale: Partial<Record<NormKind, number>>;

  // Preference multipliers for social actions (>1 = preferred, <1 = avoided)
  socialActionPreference: Partial<Record<SocialActionId, number>>;
  
  // Risk Attitude: -1 (Averse) to +1 (Seeking)
  riskAttitude: number;
  
  // Planning Horizon bias (1 = short, 3 = long)
  planningHorizon: number;
}

export interface EffectiveBehaviorProfile {
  goalWeights: Partial<Record<CharacterGoalId, number>>;
  normPenaltyScale: Record<NormKind, number>;
  socialActionPreference: Partial<Record<SocialActionId, number>>;
  riskAttitude: number;
  planningHorizon: number;
}

// Default baselines
const DEFAULT_GOAL_WEIGHT = 1.0;
const DEFAULT_NORM_SCALE = 1.0;
const DEFAULT_SOCIAL_PREF = 1.0;
const DEFAULT_RISK_ATTITUDE = 0;
const DEFAULT_PLANNING_HORIZON = 2;

function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}

/**
 * Generates a behavioral profile based on the archetype's structural properties (Lambda, Mu)
 * and current contextual state (Mode, Phase).
 */
export function getArchetypeBehaviorProfile(
    archId: string, 
    mode: ArchetypeMode = 'default'
): ArchetypeBehaviorProfile {
    const arch = allArchetypes.find(a => a.id === archId);
    if (!arch) return { goalWeights: {}, normPenaltyScale: {}, socialActionPreference: {}, riskAttitude: 0, planningHorizon: 2 };

    const { lambda, mu } = arch;

    const profile: ArchetypeBehaviorProfile = {
        goalWeights: {},
        normPenaltyScale: {},
        socialActionPreference: {},
        riskAttitude: 0,
        planningHorizon: 2,
    };

    // Helper to safely set weights
    const setGoal = (id: CharacterGoalId, w: number) => profile.goalWeights[id] = w;
    const setNorm = (id: NormKind, w: number) => profile.normPenaltyScale[id] = w;
    const setAct = (id: SocialActionId, w: number) => profile.socialActionPreference[id] = w;

    // --- BASE LOGIC (MU) ---
    switch (mu) {
        case 'SN': // Stabilizing Norm
            setGoal('maintain_legitimacy', 1.5);
            setGoal('maintain_cohesion', 1.4);
            setGoal('follow_order', 1.2);
            setGoal('assert_autonomy', 0.5);
            setNorm('procedure', 2.0); 
            setNorm('betrayal', 1.5);
            setAct('issue_order', 1.3);
            setAct('support_leader', 1.3);
            setAct('acknowledge_order', 1.2);
            setAct('challenge_leader', 0.2);
            profile.riskAttitude = -0.6;
            profile.planningHorizon = 3;
            break;
        case 'SR': // Self Radical
            setGoal('assert_autonomy', 1.6);
            setGoal('go_to_surface', 1.4);
            setGoal('protect_other', 1.3);
            setGoal('follow_order', 0.3);
            setNorm('procedure', 0.4);
            setNorm('harm', 1.5);
            setAct('challenge_leader', 1.5);
            setAct('persuade', 1.2);
            setAct('form_subgroup', 1.3);
            setAct('wait', 0.5);
            profile.riskAttitude = 0.5;
            profile.planningHorizon = 2;
            break;
        case 'ON': // Objective Norm
            setGoal('follow_order', 2.0);
            setGoal('immediate_compliance', 1.8);
            setGoal('seek_information', 1.2);
            setGoal('assert_autonomy', 0.1);
            setNorm('procedure', 1.5);
            setNorm('betrayal', 2.0);
            setAct('acknowledge_order', 1.5);
            setAct('share_information', 1.2);
            setAct('refuse_order', 0.1);
            profile.riskAttitude = -0.3;
            profile.planningHorizon = 1;
            break;
        case 'OR': // Objective Radical
            setGoal('protect_self', 1.8);
            setGoal('avoid_blame', 1.6);
            setGoal('relief_from_stress', 1.4);
            setGoal('maintain_cohesion', 0.4);
            setNorm('procedure', 0.8);
            setNorm('betrayal', 0.5);
            setAct('retreat', 1.5);
            setAct('deceive', 1.4);
            setAct('blame_other', 1.4);
            setAct('support_leader', 0.6);
            profile.riskAttitude = 0.8;
            profile.planningHorizon = 1;
            break;
    }

    // --- LAMBDA MODIFIERS ---
    if (lambda === 'D') {
        profile.goalWeights['maintain_legitimacy'] = (profile.goalWeights['maintain_legitimacy'] || 1) * 1.2;
        profile.goalWeights['protect_self'] = (profile.goalWeights['protect_self'] || 1) * 0.7;
        profile.normPenaltyScale['harm'] = (profile.normPenaltyScale['harm'] || 1) * 0.8;
        profile.planningHorizon += 1;
    } else if (lambda === 'O') {
        profile.goalWeights['maintain_cohesion'] = (profile.goalWeights['maintain_cohesion'] || 1) * 0.6;
        profile.socialActionPreference['deceive'] = (profile.socialActionPreference['deceive'] || 1) * 1.3;
        profile.riskAttitude += 0.2;
    }

    // --- MODE MODIFIERS ---
    if (mode === 'war') {
        profile.riskAttitude += 0.3;
        profile.goalWeights['protect_self'] = (profile.goalWeights['protect_self'] || 1) * 1.2;
        profile.normPenaltyScale['harm'] = (profile.normPenaltyScale['harm'] || 1) * 0.6;
        profile.normPenaltyScale['procedure'] = (profile.normPenaltyScale['procedure'] || 1) * 0.8;
    } else if (mode === 'social') {
        profile.socialActionPreference['persuade'] = (profile.socialActionPreference['persuade'] || 1) * 1.3;
        profile.socialActionPreference['deceive'] = (profile.socialActionPreference['deceive'] || 1) * 1.2;
        profile.normPenaltyScale['procedure'] = (profile.normPenaltyScale['procedure'] || 1) * 1.5;
    } else if (mode === 'management') {
        profile.goalWeights['maintain_legitimacy'] = (profile.goalWeights['maintain_legitimacy'] || 1) * 1.2;
        profile.normPenaltyScale['procedure'] = (profile.normPenaltyScale['procedure'] || 1) * 2.0;
        profile.planningHorizon += 1;
    }

    return profile;
}

export function applyPhaseModifiers(
  base: ArchetypeBehaviorProfile,
  phase: ArchetypePhase
): ArchetypeBehaviorProfile {
  const p = { ...base, 
      goalWeights: {...base.goalWeights}, 
      normPenaltyScale: {...base.normPenaltyScale},
      socialActionPreference: {...base.socialActionPreference} 
  };

  switch (phase) {
    case 'strain':
      p.riskAttitude *= 1.2;
      p.normPenaltyScale['procedure'] = (p.normPenaltyScale['procedure'] ?? 1.0) * 0.7;
      p.planningHorizon = Math.max(1, p.planningHorizon * 0.8);
      break;
    case 'break':
      p.riskAttitude *= 1.5;
      p.normPenaltyScale['procedure'] = (p.normPenaltyScale['procedure'] ?? 1.0) * 0.4;
      p.normPenaltyScale['harm'] = (p.normPenaltyScale['harm'] ?? 1.0) * 0.5;
      p.planningHorizon = Math.max(1, p.planningHorizon * 0.5);
      // Stronger impulse for disruptive actions
      p.socialActionPreference['refuse_order'] = (p.socialActionPreference['refuse_order'] ?? 1.0) + 0.5;
      p.socialActionPreference['challenge_leader'] = (p.socialActionPreference['challenge_leader'] ?? 1.0) + 0.4;
      break;
    case 'radical':
      p.riskAttitude += 0.8; 
      p.normPenaltyScale['harm'] = (p.normPenaltyScale['harm'] || 1) * 0.2;
      p.normPenaltyScale['betrayal'] = (p.normPenaltyScale['betrayal'] || 1) * 0.5;
      break;
    case 'post':
      p.riskAttitude *= 0.8;
      p.normPenaltyScale['procedure'] = (p.normPenaltyScale['procedure'] ?? 1.0) * 1.3;
      p.planningHorizon *= 1.1;
      break;
  }

  return p;
}

function mixProfiles(
    actual: ArchetypeBehaviorProfile,
    shadow: ArchetypeBehaviorProfile,
    alpha: number // 0 = actual, 1 = shadow
): ArchetypeBehaviorProfile {
    const mix = (a: number | undefined, b: number | undefined, def: number) => {
        return (1 - alpha) * (a ?? def) + alpha * (b ?? def);
    };

    const goalWeights: Partial<Record<CharacterGoalId, number>> = {};
    const allGoals = new Set([...Object.keys(actual.goalWeights), ...Object.keys(shadow.goalWeights)]) as Set<CharacterGoalId>;
    allGoals.forEach(g => {
        goalWeights[g] = mix(actual.goalWeights[g], shadow.goalWeights[g], DEFAULT_GOAL_WEIGHT);
    });

    const normPenaltyScale: Partial<Record<NormKind, number>> = {};
    const allNorms = new Set([...Object.keys(actual.normPenaltyScale), ...Object.keys(shadow.normPenaltyScale)]) as Set<NormKind>;
    allNorms.forEach(n => {
        normPenaltyScale[n] = mix(actual.normPenaltyScale[n], shadow.normPenaltyScale[n], DEFAULT_NORM_SCALE);
    });

    const socialActionPreference: Partial<Record<SocialActionId, number>> = {};
    const allActions = new Set([...Object.keys(actual.socialActionPreference), ...Object.keys(shadow.socialActionPreference)]) as Set<SocialActionId>;
    allActions.forEach(a => {
        socialActionPreference[a] = mix(actual.socialActionPreference[a], shadow.socialActionPreference[a], DEFAULT_SOCIAL_PREF);
    });
    
    return {
        goalWeights,
        normPenaltyScale,
        socialActionPreference,
        riskAttitude: (1 - alpha) * actual.riskAttitude + alpha * shadow.riskAttitude,
        planningHorizon: (1 - alpha) * actual.planningHorizon + alpha * shadow.planningHorizon,
    };
}

/**
 * Computes the effective behavioral profile for an agent based on their current archetype state,
 * including mode and phase dynamics.
 */
export function computeEffectiveBehaviorProfile(agent: AgentState): EffectiveBehaviorProfile {
    const effective: EffectiveBehaviorProfile = {
        goalWeights: {},
        normPenaltyScale: { harm: 1, procedure: 1, betrayal: 1 },
        socialActionPreference: {},
        riskAttitude: DEFAULT_RISK_ATTITUDE,
        planningHorizon: DEFAULT_PLANNING_HORIZON,
    };

    if (!agent.archetype) return effective;

    const { actualId, shadowId, shadowActivation, currentMode, phase } = agent.archetype;
    
    const profileActual = getArchetypeBehaviorProfile(actualId, currentMode as ArchetypeMode); // Base actual
    
    // If shadow is active, mix it in
    const shadowAlpha = clamp(shadowActivation, 0, 1);
    let mixedProfile = profileActual;

    if (shadowId && shadowAlpha > 0.05) {
        const profileShadow = getArchetypeBehaviorProfile(shadowId, currentMode as ArchetypeMode); // Shadow base
        mixedProfile = mixProfiles(profileActual, profileShadow, shadowAlpha);
    }

    // Apply Phase Modifiers to the mixed profile
    const finalProfile = applyPhaseModifiers(mixedProfile, phase);

    // Finalize structure
    effective.goalWeights = finalProfile.goalWeights;
    effective.normPenaltyScale = {
        harm: finalProfile.normPenaltyScale['harm'] ?? DEFAULT_NORM_SCALE,
        procedure: finalProfile.normPenaltyScale['procedure'] ?? DEFAULT_NORM_SCALE,
        betrayal: finalProfile.normPenaltyScale['betrayal'] ?? DEFAULT_NORM_SCALE,
    };
    effective.socialActionPreference = finalProfile.socialActionPreference;
    effective.riskAttitude = finalProfile.riskAttitude;
    effective.planningHorizon = Math.max(1, Math.round(finalProfile.planningHorizon));

    return effective;
}