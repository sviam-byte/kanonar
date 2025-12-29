
// lib/context/v2/types.ts

import { CharacterGoalId, ContextAxesVector, ContextTuning } from '../../types';

export { ContextAxesVector, ContextTuning };

export type KnownContextSource =
  | 'life'
  | 'location_base'
  | 'location_scenario'
  | 'event'
  | 'tom'
  | 'manual'
  | 'social_proximity'
  | 'location_threat'
  | 'target'
  | 'timeline'
  | 'timeline_process'
  | 'self_role'
  | 'derived'
  | 'threat'
  | 'social'
  | 'body'
  | 'location'
  | 'proximity'
  | 'history'
  | 'map'
  | 'where'
  | 'who'
  | 'what'
  | 'how'
  | 'why'
  | 'relationship'
  | 'relations'
  | 'possibilities'
  // observed in repo (сейчас часто идут через any-cast)
  | 'world'
  | 'scene'
  | 'observationExtractor'
  | 'locationExtractor'
  | 'perception'
  | 'rumor'
  | 'summaries'
  | 'alias'
  | 'emotionLayer'
  | 'emotion_appraisal'
  | 'emotion_dyadic'
  | 'emotion_core'
  | 'emotion_axes'
  | 'features'
  | 'rel_base'
  | 'rel_state'
  | 'character_lens'
  | 'deriveAxes'
  | 'deriveContextVectors'
  | 'hazardGeometry'
  | 'socialProximity'
  | 'capabilities'
  | 'affect'
  | 'access'
  | 'action'
  | 'system'
  | 'agent_state';

// allow new producers without постоянно расширять union, но оставить автокомплит
export type ContextSource = KnownContextSource | (string & {});

// Context atom kinds/ids we will read as signal sources (for GoalLab + debug)
export type ContextSignalId =
  | 'soc_publicness'
  | 'soc_surveillance'
  | 'soc_norm_pressure'
  | 'ctx_danger'
  | 'ctx_intimacy'
  | 'ctx_hierarchy'
  | 'ctx_scarcity'
  | 'ctx_time_pressure'
  | 'ctx_uncertainty'
  | 'ctx_legitimacy'
  | 'ctx_secrecy'
  | 'ctx_grief'
  | 'ctx_pain';

export type ContextAtomLike = {
  id?: string;
  kind?: string;
  magnitude?: number;   // expected 0..1
  confidence?: number;  // 0..1
  targetId?: string;    // for per-target atoms
  source?: string;
};

// --- Atom v2+ ---

export type AtomNamespace =
  | 'world'   // Objective facts (time, location id)
  | 'scene'   // Scene metrics (threat, chaos)
  | 'map'     // Grid, cells, navigation
  | 'norm'    // Norms, mandates
  | 'obs'     // Perception, nearby agents
  | 'soc'     // Social layer (proximity + social situation flags)
  | 'self'    // Body, resources
  | 'profile' // Character traits, bio
  | 'ctx'     // High-level context axes (danger, intimacy)
  | 'aff'     // Affordances
  | 'con'     // Constraints
  | 'off'     // Offers
  | 'cap'     // Capabilities
  | 'access'  // Access decisions
  | 'cost'    // Costs / tradeoffs
  | 'tom'     // Theory of Mind (beliefs, relations)
  | 'emo'     // Affect / Emotions
  | 'goal'    // Active goals
  | 'threat'  // Threat / Risk analysis
  | 'rel'     // Relationships (static/memory)
  | 'event'   // Events / Timeline
  | 'misc'    // Fallback
  | 'feat';   // Features

export type AtomOrigin =
  | 'world'    // Hard fact from world state
  | 'scene'    // From scenario engine
  | 'obs'      // From perception system
  | 'self'     // Interoception
  | 'profile'  // Long-term memory/traits
  | 'derived'  // Computed by context engine
  | 'override' // Manual/Debug
  | 'belief'   // Agent belief / rumor
  | 'memory';  // Explicit memory recall

export interface AtomTrace {
  ruleId?: string;
  sourceAtomIds?: string[];
  computation?: string;
  confidenceBase?: number;
  usedAtomIds?: string[];
  notes?: string[];
  parts?: any;
}

export type ContextAtomKind = string; // Broadened for flexibility

export interface ContextAtomBase {
  id: string;
  kind: ContextAtomKind;
  source: ContextSource;
  magnitude: number; // 0..1
  timestamp?: number; 
  label?: string;

  ageSeconds?: number;
  relatedAgentIds?: string[];
  relatedLocationId?: string;

  relatedAgentId?: string;
  relatedThreatId?: string;
  distance?: number;
  strength?: number; 
  
  subject?: string;
  target?: string;
  channel?: string;
  value?: number;
  tags?: string[];
  confidence?: number;
  t?: number;
  
  meta?: any;

  ns?: AtomNamespace;
  origin?: AtomOrigin;
  trace?: AtomTrace;

  /**
   * Quark-codex fields (единый “кодификатор” поверх ID):
   * - specId: какая AtomSpec сработала (если есть)
   * - params: распарсенные группы из idPattern (selfId/otherId/metric/etc)
   * - code: стабильный “кварковый” ключ (не уникальный), по которому будут строиться “молекулы/законы” позже
   */
  specId?: string;
  params?: Record<string, string>;
  code?: string;
  
  // Specific fields
  fromId?: string;
  toId?: string;
  targetId?: string;
}

export type ContextAtom = ContextAtomBase;

export interface ContextAggregates {
  threatLevel: number;
  socialSupport: number;
  primaryTargetProximity: number;
  crowding: number;
}

export interface ContextSummary {
  physicalRisk: number;
  resourceAvailability: number;
  socialVisibility: number;
  normPressure: number;
  authorityPresence: number;
  supportAvailable: number;
  intimacy: number;
  timePressure: number;

  proximityAllies: number;
  proximityEnemies: number;
  crowding: number;

  beliefLeaderSupport: number;
  beliefGroupStability: number;
  beliefHostilityAround: number;
  beliefVulnerabilityAround: number;
  
  primaryTargetProximity: number;
  threatLevel: number;
  socialSupport: number;
}

// --- Validation Types ---
export type ValidationSeverity = 'error' | 'warn' | 'info';

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  message: string;
  atomId?: string;
  details?: any;
}

export interface ValidationReport {
  issues: ValidationIssue[];
  counts: Record<ValidationSeverity, number>;
  fixedAtoms?: ContextAtom[];
}

export interface ContextSnapshot {
  agentId: string;
  locationId?: string;
  atoms: ContextAtom[];
  summary: ContextSummary;
  domains: Record<string, number>;
  aggregates?: ContextAggregates;
  meta?: {
    sourceWorldId?: string;
    activeEventIds?: string[];
    manualAtomIds?: string[];
  };
  focusLocationId?: string;
  validation?: ValidationReport;
  decision?: any;
  contextMind?: any; // New field for scoreboard
  coverage?: any; // Coverage Report
}

export interface ContextualGoalContribution {
  source: ContextSource | 'life';
  value: number;
  explanation?: string;
  atomId?: string;
  atomKind?: string;
  atomLabel?: string;
  formula?: string;
}

export interface ContextualGoalScore {
  goalId: CharacterGoalId;
  totalLogit: number;
  probability: number;
  contributions: ContextualGoalContribution[];
  targetAgentId?: string | null;
  domain?: string;
}

export interface TemporalMicroEvent {
  id: string;
  time: number;
  kind: 'threat' | 'support' | 'panic' | 'order' | 'injury';
  intensity: number;
}

export type TemporalProcessKind = 'exp_decay' | 'linear_growth';

export interface TemporalProcess {
  id: string;
  kind: TemporalProcessKind;
  startTime: number;
  base: number;
  rate: number;
  targetAtomKind: ContextAtomKind;
  label?: string;
}

export interface TemporalContextConfig {
  now: number;
  events: TemporalMicroEvent[];
  processes: TemporalProcess[];
}
