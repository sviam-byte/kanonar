
export type EmotionId =
  | 'fear'
  | 'anger'
  | 'sadness'
  | 'joy'
  | 'disgust'
  | 'shame'
  | 'guilt'
  | 'pride'
  | 'trust'
  | 'attachment'
  | 'loneliness'
  | 'curiosity'
  | 'hope';

export interface AffectState {
  // core affect (0..1)
  valence: number;   // -1..+1
  arousal: number;   // 0..1
  control: number;   // 0..1 (sense of agency)

  // discrete intensities 0..1
  e: Record<EmotionId, number>;

  // meta
  stress: number;    // 0..1
  fatigue: number;   // 0..1
  dissociation: number; // 0..1
  stability: number; // 0..1

  // regulation knobs (can be trait-driven)
  regulation: {
    suppression: number;   // 0..1
    reappraisal: number;   // 0..1
    rumination: number;    // 0..1
    threatBias: number;    // 0..1
    moralRumination?: number; // 0..1
  };
  
  // Explicit moral channels for debugging
  moral?: {
      guilt?: number;
      shame?: number;
  };

  updatedAtTick: number;

  // Legacy compatibility fields
  fear: number;
  anger: number;
  shame: number;
  trustBaseline: number;
  hope?: number;
}

export interface EmotionAppraisal {
  threat: number;        // 0..1
  loss: number;          // 0..1
  goalBlock: number;     // 0..1
  goalProgress: number;  // 0..1
  socialSupport: number; // 0..1
  statusDelta: number;   // -1..+1
  normViolation: number; // 0..1
  intimacy: number;      // 0..1
  uncertainty: number;   // 0..1
  
  // Moral / Agency Contour
  responsibility?: number; // 0..1 (Did I cause this?)
  controllability?: number; // 0..1 (Can I fix/change this?)
  publicExposure?: number; // 0..1 (Is this seen by others?)
  reparability?: number; // 0..1 (Can I make amends?)
}

// Flexible decomposition for GoalLab: each appraisal channel can expose contributions
export type AppraisalTrace = Partial<
  Record<
    keyof EmotionAppraisal,
    {
      total: number;
      parts: Record<string, number>;
    }
  >
>;

export interface EmotionAtom {
  kind: 'emotion';
  emotion: EmotionId;
  intensity: number; // 0..1
  valence?: number;  // -1..+1
  arousal?: number;  // 0..1
  why: string[];     // small list of human-readable reasons
}
