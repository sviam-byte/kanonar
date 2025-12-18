
// /lib/tom/state.ts

import { SocialActionId } from '../../types';

export interface TomBeliefGoals {
  goalIds: string[];     // список GoalId в фиксированном порядке
  weights: number[];     // belief W_{i→j}(g), Σ_g = 1
}

/**
 * Априорная политика цели (как observer думает, какие действия вообще в репертуаре target).
 */
export interface TomPolicyPrior {
  actionMask?: Record<string, number>;
  tagMask?: Record<string, number>;
}

export interface TomBeliefTraits {
  trust: number;         // [0,1] — доверие "j не предаст / не сбежит"
  align: number;         // [0,1] — идеологическое совпадение
  bond: number;          // [0,1] — эмоциональная связь
  competence: number;    // [0,1] — "j умеет добиваться целей"
  dominance: number;     // [0,1] — "j способен управлять другими"
  reliability: number;   // [0,1] — "j выполняет обещания/приказы"
  obedience: number;      // New field
  uncertainty: number;    // New field
  vulnerability?: number;
  conflict: number;
  respect: number;       // Added
  fear: number;          // Added
}

// --- NEW INTERFACES START ---

export interface EpistemicBelief {
    alpha: number;
    beta: number;
    lastUpdate: number;
}

export interface EpistemicEvidence {
    factId: string;
    actorId: string;     // кто демонстрирует знание/незнание
    observerId: string;  // кто оценивает
    kind: 'knows' | 'not_knows';
    weight?: number;
    tick: number;
}

export interface RoleProfile {
    roles: Record<string, number>; // нормированный вектор R_j
    confidence: number;            // уверенность наблюдателя
}

export interface NormativeProfile {
    values: Record<string, number>; // N_j
    thresholds: Record<string, number>; // τ_j
    effective: Record<string, number>; // N_eff
}

export interface EmotionalState {
    fear: number;
    anger: number;
    shame: number;
    guilt?: number;
    hope: number;
    exhaustion: number;
}

export interface TomErrorProfile {
    paranoia: number;
    naivete: number;
    cynicism: number;
    self_blame: number;
}

// --- NEW INTERFACES END ---

export interface TomEntry {
  goals: TomBeliefGoals;
  traits: TomBeliefTraits;
  lastUpdatedTick: number;
  lastInteractionTick: number;
  policyPrior?: TomPolicyPrior;
  repertoireMask?: Partial<Record<SocialActionId, boolean>>;
  arch_true_est?: number[];
  arch_stereotype?: number;
  lastActionPolarity?: number;
  uncertainty: number;
  
  believedLifeGoals?: Partial<Record<string, number>>;
  secondOrderSelf?: {
      perceivedTrustFromTarget: number;
      perceivedAlignFromTarget: number;
      perceivedDominanceInTargetsView: number;
      perceivedUncertaintyOfTarget: number;
  };

  // New fields
  epistemic?: Record<string, EpistemicBelief>;
  roleProfile?: RoleProfile;
  norms?: NormativeProfile;
  affect?: EmotionalState;
  errorProfile?: TomErrorProfile;

  // Auxiliary fields for update logic
  stress?: { load: number };
  selfLatents?: Record<string, number>;
  biases?: any;
}

export type TomState = Record<string, Record<string, TomEntry>>;