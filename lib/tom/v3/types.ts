
export type AgentId = string;
export type AtomSource = "tom";
export type DomainKey =
  | "danger"
  | "intimacy"
  | "hierarchy"
  | "obligation"
  | "surveillance"
  | "normPressure"
  | "publicness";

export type TomStateKey =
  | "trust"
  | "threat"
  | "support"
  | "attachment"
  | "respect"
  | "dominance"
  | "predictability"
  | "alignment";

export type TomAffectKey =
  | "feltSafety"
  | "feltFear"
  | "feltShame"
  | "feltAnger"
  | "feltTenderness";

export type TomActionCat =
  | "support"
  | "threaten"
  | "withdraw"
  | "command"
  | "negotiate"
  | "attack"
  | "comfort"
  | "test_boundary"
  | "lie"
  | "observe";

export type TomContributorKind = "prior" | "context" | "affect" | "evidence";

export interface TomContributor {
  kind: TomContributorKind;
  key: string;           // e.g. "loc_tag:private", "env_hazard", "fear", "oath_kept"
  weight: number;        // signed contribution in [-1..1]
  note?: string;
}

export interface TomDecomposition {
  prior: number;          // baseline before scene
  contextBias: number;    // shift from domains/location norms
  affectBias: number;     // shift from i's affect
  evidenceUpdate: number; // from observed atoms/signals
  final: number;          // clamp01(sum)
  contributors: TomContributor[];
}

export interface TomBeliefState {
  // all in [0..1]
  trust: number;
  threat: number;
  support: number;
  attachment: number;
  respect: number;
  dominance: number;
  predictability: number;
  alignment: number;
}

export interface TomConfidence {
  // all in [0..1]
  trust: number;
  threat: number;
  support: number;
  attachment: number;
  respect: number;
  dominance: number;
  predictability: number;
  alignment: number;
  overall: number;
  dataAdequacy?: number; // optional, [0..1]
}

export interface TomDyadicAffect {
  feltSafety: number;
  feltFear: number;
  feltShame: number;
  feltAnger: number;
  feltTenderness: number;
}

export interface TomNormativeContext {
  // minimal pair: what the situation "does" to interpretation/behavior
  publicExposure: number; // [0..1]
  normPressure: number;   // [0..1]
  surveillance: number;   // [0..1]
  privacy: number;        // [0..1] (1 = private)
}

export interface TomPrediction {
  // top-k action categories with probabilities
  top: Array<{ action: TomActionCat; p: number }>;
}

export interface TomInterpretationAtom {
  id: string;
  kind:
    | "tom_perceived_intent_help"
    | "tom_perceived_intent_harm"
    | "tom_perceived_threat"
    | "tom_expected_support"
    | "tom_perceived_control"
    | "tom_public_mask"
    | "tom_social_risk"
    | "tom_safe_to_be_vulnerable"
    | "tom_need_deescalation"
    | "tom_confidence";
  source: AtomSource;
  magnitude: number;      // [0..1]
  confidence: number;     // [0..1]
  label?: string;
  relatedAgentId: AgentId;
  timestamp: number;
  explain?: string;
}

export interface TomDyadReport {
  selfId: AgentId;
  otherId: AgentId;
  timestamp: number;

  // Context snapshot used to interpret
  domains?: Partial<Record<DomainKey, number>>; // optional but recommended
  norms: TomNormativeContext;

  // Main outputs
  state: TomBeliefState;
  confidence: TomConfidence;

  // Decomposition per key (for debugging + explainability)
  decomposition: Record<TomStateKey, TomDecomposition>;

  // Predicted near-term behavior
  prediction: TomPrediction;

  // Dyad-conditioned affect outputs
  dyadicAffect: TomDyadicAffect;

  // Final atoms for GoalLab (can be derived; stored here for convenience)
  atoms: TomInterpretationAtom[];
}

// Utility
export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
