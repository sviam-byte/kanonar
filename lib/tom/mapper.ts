
import { CharacterEntity, AgentState, SocialEventEntity, AgentPsychState } from '../../types';
import { CharacterDossier, Observation, computeEgoismAltruism } from './noncontextTom';
import { V4_GOAL_DEFINITIONS } from '../life-goals/v4-params';
import { METRIC_NAMES as ARCH_METRIC_NAMES } from '../archetypes/metrics';
import { normalizeL1Safe, logitsFromProbs, clamp01 } from './math';
import { priorFromHistory } from '../bio/ingest';
import { LifeGoalId } from '../life-goals/types-life';
import { LIFE_TO_PREGOAL } from '../life-goals/life-to-pregoal';
import { computeProfileSummary } from './profileSummary';
import { getNestedValue } from '../param-utils';
import { inferLifeGoalsFromTraits } from '../life-goals'; // Correct import for infer function
import { computeTraits } from '../traits'; // Correct import for computeTraits
import { arr } from '../utils/arr';

// Use the 9 Archetype Metrics as the "Type Space" for ToM
export const GENERIC_TYPE_SPACE = Object.keys(ARCH_METRIC_NAMES);

// Canonical preGoal space
export const PREGOAL_SPACE: string[] = Array.from(new Set(
  V4_GOAL_DEFINITIONS.flatMap(d => Object.keys(d.preGoalWeights ?? {}))
)).sort();

// Project v42 metrics to archetype
function projectMetricsToTypeVec(v42: Record<string, number>): number[] {
  // Heuristic mapping - adjust based on actual v42 metric names
  const AGENCY  = clamp01((v42['Agency_t'] ?? 0.5));
  const ACCEPT  = clamp01(v42['ImpulseCtl_t'] ?? 0.5); // Proxy for compliance
  const ACTION  = clamp01(v42['A_t'] ?? 0.5);
  const RADICAL = clamp01(v42['TailRisk_t'] ?? 0.5); // Proxy for risky change
  const SCOPE   = clamp01(v42['WMcap_t'] ?? 0.5);
  const TRUTH   = clamp01(v42['DQ_t'] ?? 0.5);
  const CARE    = clamp01(v42['InfoHyg_t'] ?? 0.5); // Weak proxy
  const MANIP   = 0.2; 
  const FORMAL  = clamp01(v42['PlanRobust_t'] ?? 0.5);

  const vec = [AGENCY, ACCEPT, ACTION, RADICAL, SCOPE, TRUTH, CARE, MANIP, FORMAL];
  return normalizeL1Safe(vec);
}


export function convertAgentToDossier(agent: CharacterEntity | AgentState): CharacterDossier {
  const agState = agent as AgentState;
  
  // Map psych structure with type casting
  const psych = agState.psych || {} as AgentPsychState;
  
  // Ensure we clone the internal objects to avoid ref issues in math engine
  const distortion = psych.distortion ? { ...psych.distortion } : {};
  const attachment = psych.attachment ? { ...psych.attachment } : {};
  const trauma = psych.trauma ? { ...psych.trauma } : {};
  const coping = psych.coping ? { ...psych.coping } : {};

  // --- 1. "True" Pre-Goals (Intentions/Drives) ---
  let goalTruthVec: Record<string, number> | undefined;
  let goalTruthLogits: Record<string, number> | undefined;
  
  // Возможно, агент уже пришёл с "истинным" анализом (FULL_DOSSIER)
  const asAny = agent as any;
  const preExistingTruth = asAny.analysis?.goal_truth_vec as Record<string, number> | undefined;
  const preExistingLife = asAny.analysis?.life_goals_probs as Record<string, number> | undefined;

  // lifeGoals: сначала берём готовый probs-вектор, потом — сырые lifeGoals из AgentState
  const lifeGoals = (preExistingLife as Partial<Record<string, number>> | undefined) 
    ?? (agState.lifeGoals as Partial<Record<string, number>> | undefined);
  
  // Helper to build truth from a source map of LifeGoals
  function makePreFrom(source: Record<string, number>) {
     const preAgg: Record<string, number> = {};
     let hasInput = false;

     for (const [lgId, wRaw] of Object.entries(source)) {
       const w = Math.max(0, wRaw ?? 0);
       if (w <= 0.001) continue;
       hasInput = true;

       const pg = LIFE_TO_PREGOAL[lgId];
       if (!pg) {
           // console.warn('[ToM] LIFE_TO_PREGOAL missing mapping for lifeGoalId=', lgId);
           continue;
       }
       for (const [k, v] of Object.entries(pg)) {
         if (!v) continue;
         preAgg[k] = (preAgg[k] ?? 0) + w * v;
       }
     }
    
    if (!hasInput) return;

    const raw = PREGOAL_SPACE.map(k => Math.max(0, preAgg[k] ?? 0));
    const sum = raw.reduce((a, b) => a + b, 0);
    
    if (sum > 1e-9) {
        const probs = raw.map(x => x / sum);
        const logits = logitsFromProbs(probs);
        goalTruthVec = {}; goalTruthLogits = {};
        PREGOAL_SPACE.forEach((k, i) => { goalTruthVec![k] = probs[i]; goalTruthLogits![k] = logits[i]; });
    }
  }

  // 0) Если уже есть готовый truth-вектор из FULL_DOSSIER — используем его напрямую
  if (preExistingTruth && Object.keys(preExistingTruth).length) {
    const raw = PREGOAL_SPACE.map(id => Math.max(0, preExistingTruth[id] ?? 0));
    const sum = raw.reduce((a, b) => a + b, 0);
    if (sum > 1e-12) {
        const probs = raw.map(x => x / sum);
        const logits = logitsFromProbs(probs);
        goalTruthVec = {}; goalTruthLogits = {};
        PREGOAL_SPACE.forEach((k, i) => {
            goalTruthVec![k] = probs[i];
            goalTruthLogits![k] = logits[i];
        });
    }
  }

  // 1) Если truth ещё нет — строим из lifeGoals / goalEcology / истории / traits
  if (!goalTruthVec) {
      // Try Life Goals first
      if (lifeGoals && Object.keys(lifeGoals).length > 0) {
          makePreFrom(lifeGoals as Record<string, number>);
      } 
      
      // Try Goal Ecology (Active goals)
      if (!goalTruthVec && agState.goalEcology && Array.isArray(agState.goalEcology.execute) && agState.goalEcology.execute.length > 0) {
          const lifeWeights: Record<string, number> = {};
          for (const g of agState.goalEcology.execute) {
              lifeWeights[g.id] = (lifeWeights[g.id] ?? 0) + g.priority;
          }
          makePreFrom(lifeWeights);
      }
      
      // Try Traits (Vector Base) - THIS IS THE ROBUST FALLBACK
      if (!goalTruthVec && agState.vector_base) {
          // Import computeTraits to convert vector_base -> abstract traits
          const traits = computeTraits(agState.vector_base);
          // Import inferLifeGoalsFromTraits to convert traits -> life goals
          const lifeFromTraits = inferLifeGoalsFromTraits(traits);
          makePreFrom(lifeFromTraits);
      }
      
      // Last resort: History
      if (!goalTruthVec && Array.isArray(agState.historicalEvents) && agState.historicalEvents.length > 0) {
          const prior = priorFromHistory(agState.historicalEvents);
          if (Object.keys(prior).length) makePreFrom(prior);
      }
  }

  // --- 2. "True" Archetype Metrics ---
  let typeTruthVec: Record<string, number> | undefined;
  let typeTruthLogits: Record<string, number> | undefined;

  const archTrueArr = (agState as any).identity?.arch_true as number[] | undefined;

  if (archTrueArr && archTrueArr.length === GENERIC_TYPE_SPACE.length) {
      const probs = normalizeL1Safe(archTrueArr.map(x => Math.max(0, x)));
      const logits = logitsFromProbs(probs);
      
      typeTruthVec = {};
      typeTruthLogits = {};
      GENERIC_TYPE_SPACE.forEach((label, idx) => {
          typeTruthVec![label] = probs[idx];
          typeTruthLogits![label] = logits[idx];
      });
  } else {
      const v42 = agState.v42metrics ?? {};
      if (v42 && Object.keys(v42).length > 0) {
          const probs = projectMetricsToTypeVec(v42 as any);
          const logits = logitsFromProbs(probs);
          typeTruthVec = {};
          typeTruthLogits = {};
          GENERIC_TYPE_SPACE.forEach((label, idx) => {
              typeTruthVec![label] = probs[idx];
              typeTruthLogits![label] = logits[idx];
          });
      }
  }
  
  // --- 3. Life Goals Truth (Probs/Logits) ---
  let lifeGoalsProbs: Record<string, number> | undefined;
  let lifeGoalsLogits: Record<string, number> | undefined;
  
  // Use what we used for preGoals calculation if available
  if (!lifeGoalsProbs) {
     const lifeForProbs = preExistingLife || (lifeGoals as Record<string, number> | undefined);
     if (lifeForProbs && Object.keys(lifeForProbs).length > 0) {
          const labelsForProbs = Object.keys(lifeForProbs);
          const rawForProbs = labelsForProbs.map(k => Math.max(0, lifeForProbs[k as LifeGoalId] ?? 0));
          const probs = normalizeL1Safe(rawForProbs);
          const logits = logitsFromProbs(probs);
          
          lifeGoalsProbs = {};
          lifeGoalsLogits = {};
          labelsForProbs.forEach((id, i) => {
              lifeGoalsProbs![id] = probs[i];
              lifeGoalsLogits![id] = logits[i];
          });
     }
  }

  // --- 4. Social Orientation (Egoism/Altruism) ---
  const socialOrientation = computeEgoismAltruism(agent.vector_base);
  
  // Populate missing latents (AGENCY/SCOPE/MANIP) from vector_base if possible
  const get = (key: string) => getNestedValue(agent.vector_base, key) ?? 0.5;
  const enrichedLatents = {
      ...agState.latents,
      AGENCY: agState.latents?.AGENCY ?? get('ARCH_AGENCY'),
      SCOPE: agState.latents?.SCOPE ?? get('ARCH_SCOPE'),
      MANIP: agState.latents?.MANIP ?? get('ARCH_MANIP'),
      ACCEPT: agState.latents?.SD ?? get('ARCH_ACCEPT'), 
      ACTION: agState.latents?.ACTION ?? get('ARCH_ACTION'),
      RADICAL: agState.latents?.RP ?? get('ARCH_RADICAL'),
      TRUTH: agState.latents?.CH ?? get('ARCH_TRUTH'),
      CARE: agState.latents?.EW ?? get('ARCH_CARE'),
      FORMAL: agState.latents?.FORMAL ?? get('ARCH_FORMAL'),
      
      // Ensure mapped keys exist too for fallback
      CH: agState.latents?.CH ?? get('ARCH_TRUTH'),
      SD: agState.latents?.SD ?? get('ARCH_ACCEPT'),
      RP: agState.latents?.RP ?? get('ARCH_RADICAL'),
      SO: agState.latents?.SO ?? get('ARCH_SCOPE'),
      EW: agState.latents?.EW ?? get('ARCH_CARE'),
      CL: agState.latents?.CL ?? get('ARCH_AGENCY')
  };

  const analysis = {
      v42_metrics: agState.v42metrics ? { ...agState.v42metrics } as unknown as Record<string, number> : undefined,
      derived_metrics: agState.derivedMetrics ? { ...agState.derivedMetrics } as unknown as Record<string, number> : undefined,
      quick_states: agState.quickStates,
      latents: enrichedLatents,
      field_metrics: agState.fieldMetrics,
      psych_profile: {
        distortion,
        attachment,
        trauma,
        coping,
        social_orientation: socialOrientation,
        shadowActivation: (agent as any).archetype?.shadowActivation
      },
      archetype_state: (agent as any).archetype ? {
        actualId: (agent as any).archetype.actualId,
        shadowId: (agent as any).archetype.shadowId,
        selfId: (agent as any).archetype.self?.selfId
      } : undefined,
      goal_truth_vec: goalTruthVec,
      goal_truth_logits: goalTruthLogits,
      type_truth_vec: typeTruthVec,
      type_truth_logits: typeTruthLogits,
      life_goals_probs: lifeGoalsProbs,
      life_goals_logits: lifeGoalsLogits,
  } as any;

  const dossier: CharacterDossier = {
    metadata: {
      id: agent.entityId,
      name: agent.title,
      version: 'v1'
    },
    raw_data: {
      vector_base: agent.vector_base || {},
      roles: agent.roles?.global,
      identity: {
        sacred_set: agent.identity.sacred_set,
        self_concept: agent.identity.self_concept,
        arch_true_dominant_id: agent.identity.arch_true_dominant_id,
        arch_self: agent.identity.arch_self
      },
      tags: agent.tags,
      history: arr(agent.historicalEvents).map(e => ({
        id: e.id,
        name: e.name,
        years_ago: e.years_ago ?? 0,
        domain: e.domain,
        tags: e.tags,
        valence: e.valence,
        intensity: e.intensity,
        duration_days: e.duration_days,
        controllability: e.controllability,
        responsibility_self: e.responsibility_self,
        participants: e.participants,
        lifeGoalWeights: e.lifeGoalWeights ? { ...e.lifeGoalWeights } as Record<string, number> : undefined,
        traumaTags: e.trauma ? [e.trauma.kind] : undefined
      }))
    },
    analysis: analysis,
    explainability: {
      goal_definitions: V4_GOAL_DEFINITIONS.map(g => ({
        id: g.id,
        preGoalWeights: g.preGoalWeights as Record<string, number>
      })),
      type_space: GENERIC_TYPE_SPACE
    }
  };
  
  // Add summary if analysis exists
  if(dossier.analysis) {
      dossier.analysis.profile_summary = computeProfileSummary(dossier);
  }

  return dossier;
}

export function convertEventToObservation(event: SocialEventEntity, currentTick: number): Observation {
  let kind: string = 'neutral';
  
  if (event.domain === 'harm' || event.tags.includes('attack') || event.tags.includes('conflict')) kind = 'harm';
  else if (event.domain === 'aid' || event.tags.includes('care') || event.tags.includes('rescue')) kind = 'help';
  else if (event.domain === 'deal' || event.tags.includes('promise')) kind = 'promise';
  else if (event.tags.includes('betrayal') || event.domain === 'defect') kind = 'betray';
  else if (event.tags.includes('deception') || event.domain === 'deceive') kind = 'deceive';
  else if (event.tags.includes('info') || event.domain === 'info') kind = 'share_info';
  else if (event.tags.includes('obedience') || event.domain === 'obey') kind = 'obey';
  else if (event.tags.includes('support') || event.domain === 'support') kind = 'support';
  
  if (event.polarity < -0.5 && kind === 'neutral') kind = 'undermine';
  
  // NEW: простейший контекст по «публичности» и месту
  const ctx: Record<string, number> = {};
  if (event.scope === 'private') {
    ctx.loc_private = 1;
  } else if (event.scope === 'ingroup') {
    ctx.loc_ingroup = 1;
  } else if (event.scope === 'public') {
    ctx.loc_public = 1;
  }

  return {
    t: currentTick,
    actorId: event.actorId,
    receiverId: event.targetId,
    kind: kind as any,
    tags: event.tags,
    intensity: event.intensity,
    salience: event.intensity,
    success: true,
    cost_self: 0.1,
    benefit_other: event.polarity > 0 ? 0.5 : -0.5,
    context: Object.keys(ctx).length ? ctx : undefined,
    locationId: event.locationId,
  };
}

export function buildObservationsFromHistory(observer: CharacterDossier, targetId: string): Observation[] {
    const hist = observer.raw_data?.history ?? [];
    const obs: Observation[] = [];
    let t = -hist.length; 

    const sorted = [...hist].sort((a, b) => b.years_ago - a.years_ago);

    for (const e of sorted) {
        if (!e.participants?.includes(targetId)) continue;
        
        const intensity = Math.max(0, Math.min(1, e.intensity ?? 0.5));
        const valence = Math.max(-1, Math.min(1, e.valence ?? 0));
        
        let kind: Observation['kind'] = valence >= 0 ? 'help' : 'harm';
        
        const tags = e.tags || [];
        if (tags.includes('betrayal')) kind = 'betray';
        else if (tags.includes('support') || tags.includes('bond_formed')) kind = 'support';
        else if (tags.includes('oath')) kind = 'promise';
        else if (tags.includes('deception')) kind = 'deceive';
        else if (tags.includes('rescue')) kind = 'help';
        
        obs.push({
            t: t++,
            actorId: targetId,
            receiverId: observer.metadata.id,
            kind,
            tags: tags,
            intensity,
            salience: intensity,
            success: true,
            cost_self: 0.1,
            benefit_other: valence >= 0 ? 0.5 : -0.5,
            preGoalEvidence: e.lifeGoalWeights
        });
    }
    return obs;
}
