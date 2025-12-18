







// lib/biography.ts

import {
  BiographicalEvent,
  Biography,
  BiographyState,
  StoryTime,
  CharacterEntity,
  VectorBase,
  VectorAxisId,
  PersonalEvent
} from '../types'; 

// --- CONFIGURATION ---
export const BIO_FEATURES = [
  'TRAUMA',  
  'TRUST',   
  'POWER',   
  'AGENCY',  
  'ORDER',   
  'CHAOS',   
] as const;

export type BioFeatureId = typeof BIO_FEATURES[number];

export const EVENT_FEATURE_MAP: Record<string, Partial<Record<BioFeatureId, number>>> = {
  'childhood_trauma': { TRAUMA: 1.0, ORDER: 0.2 },
  'torture': { TRAUMA: 1.0, AGENCY: -0.5 },
  'captivity': { TRAUMA: 0.8, AGENCY: -0.8 },
  'injury': { TRAUMA: 0.6 },
  'near_death': { TRAUMA: 0.9, CHAOS: 0.3 },
  'relationship_start': { TRUST: 1.0, CHAOS: 0.2 },
  'saved_by_other': { TRUST: 1.0, TRAUMA: -0.2 },
  'betrayal_experienced': { TRUST: -1.0, TRAUMA: 0.5 },
  'betrayal_committed': { TRUST: -0.5, POWER: 0.3 },
  'command_success': { POWER: 1.0, ORDER: 0.5 },
  'command_failure': { POWER: -0.5, TRAUMA: 0.3 },
  'battle_experience': { TRAUMA: 0.4, ORDER: 0.3, AGENCY: 0.5 },
  'achievement': { AGENCY: 0.7, POWER: 0.3 },
  'sacrifice_self': { AGENCY: 1.0, TRUST: 0.5 },
  'long_term_service': { ORDER: 1.0, CHAOS: -0.5 },
  'ideological_conversion': { CHAOS: 1.0, ORDER: -0.5 },
  'breakthrough': { AGENCY: 0.8, ORDER: -0.2 },
  'failure': { AGENCY: -0.3, TRAUMA: 0.2 },
  'oath_take': { ORDER: 0.8, AGENCY: 0.3 },
  'dark_exposure': { CHAOS: 0.8, TRAUMA: 0.4 },
  'trauma': { TRAUMA: 0.8 },
  'power_grab': { POWER: 0.8, CHAOS: 0.4 }
};

export interface BiographyAggregationParams {
  timeDecayLambda: number; 
  globalScale: number;     
}

export const DEFAULT_BIOGRAPHY_PARAMS: BiographyAggregationParams = {
  timeDecayLambda: 0.0005, 
  globalScale: 0.15, 
};

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function timeDecay(age: number, lambda: number): number {
  if (age <= 0) return 1;
  return Math.exp(-lambda * age);
}

// Helper to convert PersonalEvent (UI) to BiographicalEvent (Math)
export function mapPersonalToBio(pe: PersonalEvent): BiographicalEvent {
    const participants: string[] = [];
    if (pe.payload) {
        if (pe.payload.otherId) participants.push(pe.payload.otherId);
        if (pe.payload.targetId) participants.push(pe.payload.targetId);
    }
    
    return {
        id: pe.id,
        time: pe.t,
        kind: (pe.domain as any) || 'other', 
        valence: pe.valence === 0 ? 0 : (pe.valence > 0 ? 1 : -1),
        intensity: pe.intensity,
        axisWeights: {}, 
        tags: pe.tags,
        lifeGoalWeights: pe.lifeGoalWeights, // CRITICAL: Pass this through
        participants: participants.length > 0 ? Array.from(new Set(participants)) : undefined,
        trauma: pe.trauma
    };
}

// --- CORE ENGINE ---

export function computeBiographyLatent(
  biography: Biography,
  now: StoryTime,
  params: BiographyAggregationParams = DEFAULT_BIOGRAPHY_PARAMS
): number[] {
  const latent: Record<BioFeatureId, number> = {
      TRAUMA: 0, TRUST: 0, POWER: 0, AGENCY: 0, ORDER: 0, CHAOS: 0
  };

  for (const ev of biography.events) {
      const age = Math.max(0, now - ev.time);
      const ageDays = age / (1000 * 60 * 60 * 24); 
      const decay = timeDecay(ageDays, params.timeDecayLambda);
      
      const w = ev.intensity * decay * (ev.valence !== 0 ? ev.valence : 1); 

      let map = EVENT_FEATURE_MAP[ev.kind];
      
      if (ev.kind === 'trauma' && ev.trauma) {
          if (ev.trauma.kind === 'betrayal_by_leader') map = EVENT_FEATURE_MAP['betrayal_experienced'];
          else if (ev.trauma.kind === 'torture') map = EVENT_FEATURE_MAP['torture'];
          else if ((ev.trauma.kind as string) === 'captivity') map = EVENT_FEATURE_MAP['captivity'];
          else if (ev.trauma.kind === 'moral_compromise') map = { TRAUMA: 0.5, ORDER: -0.3 };
      }
      
      if (!map && ev.tags) {
          if (ev.tags.includes('trauma') || ev.tags.includes('injury')) map = { TRAUMA: 0.8 };
          else if (ev.tags.includes('achievement')) map = { AGENCY: 0.6, POWER: 0.2 };
          else if (ev.tags.includes('failure')) map = { AGENCY: -0.4, TRAUMA: 0.2 };
          else if (ev.tags.includes('oath')) map = { ORDER: 0.7 };
      }

      if (map) {
          for (const [feat, weight] of Object.entries(map)) {
              latent[feat as BioFeatureId] += w * weight;
          }
      }
  }

  const result: number[] = BIO_FEATURES.map(f => Math.tanh(latent[f]));
  return result;
}

const W_B: Record<VectorAxisId, Partial<Record<BioFeatureId, number>>> = {
  'A_Safety_Care': { TRAUMA: 0.5, TRUST: 0.6, POWER: -0.3 },
  'A_Power_Sovereignty': { POWER: 0.8, AGENCY: 0.4, TRUST: -0.2 },
  'A_Legitimacy_Procedure': { ORDER: 0.7, CHAOS: -0.8 },
  'A_Liberty_Autonomy': { AGENCY: 0.6, ORDER: -0.4, CHAOS: 0.3 },
  'C_reciprocity_index': { TRUST: 0.7, TRAUMA: -0.4 },
  'C_coalition_loyalty': { TRUST: 0.5, ORDER: 0.4, CHAOS: -0.3 },
  'G_Narrative_agency': { AGENCY: 0.8, TRAUMA: -0.5 },
  'G_Self_concept_strength': { POWER: 0.4, TRAUMA: -0.6 },
  'B_decision_temperature': { CHAOS: 0.5, ORDER: -0.4 },
  'D_HPA_reactivity': { TRAUMA: 0.7, ORDER: -0.2 },
  'E_Model_calibration': { ORDER: 0.3, CHAOS: -0.3 },
  'state.dark_exposure': { TRAUMA: 0.6, CHAOS: 0.4 }
};

export function computeEffectiveVector(
  base: VectorBase,
  bioLatent: number[], 
  params: BiographyAggregationParams = DEFAULT_BIOGRAPHY_PARAMS
): VectorBase {
  const v_eff: VectorBase = { ...base };
  const scale = params.globalScale;

  for (const [axisId, weights] of Object.entries(W_B)) {
      let delta = 0;
      BIO_FEATURES.forEach((feat, idx) => {
          const w = weights[feat];
          if (w) {
              delta += w * bioLatent[idx];
          }
      });
      
      const current = v_eff[axisId] ?? 0.5;
      v_eff[axisId] = clamp01(current + scale * delta);
  }

  return v_eff;
}

export function getEffectiveCharacterBasis(
  character: CharacterEntity
): { vectorBase: VectorBase; bioState: BiographyState | null } {
  let bio: Biography;

  if (character.biography && character.biography.events.length > 0) {
      bio = character.biography;
  } else if (character.historicalEvents && character.historicalEvents.length > 0) {
      bio = {
          characterId: character.entityId,
          events: character.historicalEvents.map(mapPersonalToBio)
      };
  } else {
      return { vectorBase: character.vector_base || {}, bioState: null };
  }

  const now = character.storyTime ?? Date.now();
  const bioLatent = computeBiographyLatent(bio, now);
  const effectiveVector = computeEffectiveVector(character.vector_base || {}, bioLatent);

  const axisDeltas: Record<string, number> = {};
  for(const key in effectiveVector) {
      const delta = effectiveVector[key] - (character.vector_base?.[key] ?? 0.5);
      if (Math.abs(delta) > 0.001) {
          axisDeltas[key] = delta;
      }
  }

  const latentMap: any = {};
  BIO_FEATURES.forEach((f, i) => latentMap[f] = bioLatent[i]);

  const bioState: BiographyState = {
      axisDeltas: axisDeltas,
      latent: {
          vector: bioLatent,
          traumaLevel: (latentMap['TRAUMA'] + 1) / 2,
          trustLevel: (latentMap['TRUST'] + 1) / 2,
          submissionLevel: 0.5, 
          agencyLevel: (latentMap['AGENCY'] + 1) / 2,
          
          // Initializing missing properties with defaults (zeros)
          // The full detailed calculation resides in lib/biography/lifeGoalsEngine.ts
          traumaSelf: 0,
          traumaOthers: 0,
          traumaWorld: 0,
          traumaSystem: 0,
          socialBondPositive: 0,
          socialLossNegative: 0,
          betrayalLeader: 0,
          betrayalPeer: 0,
          leadershipEpisodes: 0,
          subordinationEpisodes: 0,
          rescueSuccess: 0,
          rescueFailure: 0
      } as any,
      lastUpdateTime: now,
      events: bio.events // Add events property
  };

  return { vectorBase: effectiveVector, bioState };
}