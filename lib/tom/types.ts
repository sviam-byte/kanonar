
// lib/tom/types.ts

// Эмоции в общем виде
export interface TomEmotionVector {
  valence: number;   // [-1,1]
  arousal: number;   // [0,1]
  fear: number;      // [0,1]
  anger: number;     // [0,1]
  shame: number;     // [0,1]
  trust: number;     // [0,1]
}

// Роли (вероятностное распределение)
export interface TomRoleDistribution {
  commander?: number;
  protector?: number;
  medic?: number;
  civilian?: number;
  traitor?: number;
}

// Вера в цели другого (CharacterGoalId)
export interface TomGoalBeliefs {
  [goalId: string]: number;  // [0,1] — насколько я думаю, это тебе важно
}

// Полный ToM-профиль наблюдателя i о цели j
export interface TomView {
  observerId: string;
  targetId: string;

  emotions: TomEmotionVector;
  roles: TomRoleDistribution;
  goals: TomGoalBeliefs;

  trust: number;      // доверие к цели j (0..1)
  respect: number;    // уважение к цели j (0..1)
  alignment: number;  // субъективное «мы на одной стороне» [-1,1]
  bond: number;       // emotional closeness (0..1)
  dominance: number;  // perceived dominance (0..1)
}

// Внутреннее состояние ToM (храним в мире)
export interface TomState {
  // i -> j -> view
  views: {
    [observerId: string]: {
      [targetId: string]: TomView;
    };
  };
}
