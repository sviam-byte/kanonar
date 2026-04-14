// lib/tom/compat.ts
// Compat-only ToM view contracts used by legacy API adapters.
// New domain modeling should prefer canonical ToM entities in `types.ts`.

export interface TomEmotionVector {
  valence: number;   // [-1,1]
  arousal: number;   // [0,1]
  fear: number;      // [0,1]
  anger: number;     // [0,1]
  shame: number;     // [0,1]
  trust: number;     // [0,1]
}

export interface TomRoleDistribution {
  commander?: number;
  protector?: number;
  medic?: number;
  civilian?: number;
  traitor?: number;
}

export interface TomGoalBeliefs {
  [goalId: string]: number;
}

export interface TomView {
  observerId: string;
  targetId: string;
  emotions: TomEmotionVector;
  roles: TomRoleDistribution;
  goals: TomGoalBeliefs;
  trust: number;
  respect: number;
  alignment: number;
  bond: number;
  dominance: number;
}

export interface TomState {
  views: {
    [observerId: string]: {
      [targetId: string]: TomView;
    };
  };
}
