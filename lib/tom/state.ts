
// /lib/tom/state.ts

import {
  SocialActionId,
  TomBeliefTraits,
  TomPolicyPrior,
  EpistemicBelief,
  TomRoleProfile,
  TomNormativeProfile,
  TomEmotionalState,
  TomErrorProfile,
} from '../../types';

export type {
  TomBeliefTraits,
  TomPolicyPrior,
  EpistemicBelief,
  TomRoleProfile,
  TomNormativeProfile,
  TomEmotionalState,
  TomErrorProfile,
};

export interface TomBeliefGoals {
  goalIds: string[];     // список GoalId в фиксированном порядке
  weights: number[];     // belief W_{i→j}(g), Σ_g = 1
}

export interface EpistemicEvidence {
    factId: string;
    actorId: string;     // кто демонстрирует знание/незнание
    observerId: string;  // кто оценивает
    kind: 'knows' | 'not_knows';
    weight?: number;
    tick: number;
}

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

  epistemic?: Record<string, EpistemicBelief>;
  roleProfile?: TomRoleProfile;
  norms?: TomNormativeProfile;
  affect?: TomEmotionalState;
  errorProfile?: TomErrorProfile;

  // Auxiliary fields for update logic
  stress?: { load: number };
  selfLatents?: Record<string, number>;
  biases?: any;
}

export type TomState = Record<string, Record<string, TomEntry>>;
