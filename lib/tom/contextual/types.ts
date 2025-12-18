
// lib/tom/contextual/types.ts

import type { AffectState, ContextAxisId, ContextTuning, ContextAxesVector } from '../../../types';
import type { AgentContextFrame } from '../../context/frame/types';
import type { EmotionAppraisal, AppraisalTrace } from '../../emotions/types';
import type { TomStateKey, TomBeliefState } from '../v3/types';
import type { ContextSignalId, ContextAtomLike } from '../../context/v2/types';

// Re-export or import types from core
export type { ContextAxisId, ContextAxesVector, ContextTuning, ContextSignalId, ContextAtomLike };

// --- Core beta cell ---
export type BetaCell = { alpha: number; beta: number; lastTick: number };

// --- Memory per dyad ---
export type DyadBeliefMemory = {
  targetId: string;
  trust: BetaCell;
  threat: BetaCell;
  respect: BetaCell;
  closeness: BetaCell; // maps to attachment
  dominance: BetaCell;
  support: BetaCell;
  lastValue: Record<TomStateKey, number>;
};

// --- Per-agent contextual mind persistent state ---
export type ContextualMindHistoryPoint = {
  tick: number;
  self?: {
    fear: number;
    anger: number;
    shame: number;
    hope: number;
    guilt: number;
    stress: number;
    fatigue: number;
    valence: number;
    arousal: number;
    control: number;
  };
  dyads?: Record<
    string,
    {
      trust: number;
      threat: number;
      support: number;
      attachment: number;
      dominance: number;
      respect: number;
    }
  >;
};

export interface ContextualMindState {
  selfId: string;
  
  // Self-Affect History
  affect: AffectState;
  
  // Dyadic Memory
  dyads: Record<string, DyadBeliefMemory>;

  // Bounded history for GoalLab tick-to-tick debugging
  history?: ContextualMindHistoryPoint[];
}

// --- Debug/trace structures ---
export type ContextSignals = {
  // environment
  sceneThreat01?: number; // 0..1
  mapHazard01?: number; // 0..1
  safeHub?: boolean;
  privateSpace?: boolean;

  // norms / publicness
  publicExposure01?: number;
  privacy01?: number;
  publicness01?: number;
  normPressure01?: number;
  surveillance01?: number;

  // goals
  topGoalPriority?: number;
  goalDomainMix?: Record<string, number>;

  // selection
  targetSource?: {
    fromRelations: boolean;
    fromNearby: boolean;
    fromWorldTomKeys: boolean;
  };

  // NEW: context axes (raw + tuned) for GoalLab debug
  axes?: {
    raw: ContextAxesVector;
    tuned: ContextAxesVector;
    tuningApplied?: ContextTuning;
  };

  // NEW: which signal ids were read (atom-derived)
  signalAtomsUsed?: Partial<Record<ContextSignalId, { value: number; confidence?: number; from: string }>>;
};

export type AxisDecomposition = Record<string, number>; // flexible: prior/contextBias/affectBias/normBias/...

export interface ContextualDyadReport {
  targetId: string;
  targetName?: string;

  // base (V3 frame report) — should be the reference
  base?: {
    state: TomBeliefState;
    confidenceOverall: number;
    confidenceByAxis?: Partial<Record<TomStateKey, number>>;
    domains?: Record<string, number>;
    norms?: Record<string, number>;
    decomposition?: Partial<Record<TomStateKey, AxisDecomposition>>;
    dataAdequacy?: number;
  };

  // contextual (history-smoothed + context-biased)
  contextual: {
    state: Record<TomStateKey, number>;
    confidence: number;
    deltaFromBase?: Partial<Record<TomStateKey, number>>;
    // a small “why” trace: which context axes shifted what
    ctxAxes?: {
      danger: number;
      intimacy: number;
      hierarchy: number;
      publicness: number;
      normPressure: number;
    };
    ctxAxesFull?: ContextAxesVector;
  };

  // target-specific affect (relative to self affect)
  dyadAffect: {
    fear: number;
    anger: number;
    shame: number;
    hope: number;
    exhaustion: number;
    fatigue?: number; // Alias
  };

  role?: { label?: string; confidence?: number };
}

export interface ContextualMindInputs {
  world: any;
  agent: any;
  frame: AgentContextFrame | null;
  atoms?: ContextAtomLike[] | null;
  tuning?: ContextTuning | null;
  // Optional hint from Goal Engine about what goals are currently active
  goalPreview?: Array<{ id: string; label: string; priority: number }> | null;
  // Optional domain weights from SituationContext (danger, intimacy, etc.)
  domainMix?: Record<string, number> | null;
}

export interface ContextualMindReport {
  tick: number;
  observerId: string;
  
  // Explicit Scope Metadata
  scope: "scene" | "targeted";
  primaryTargetId: string | null;
  targetsUsed: string[];
  
  affect: AffectState;
  affectSources?: {
      agentAffectPath: string;
      frameAffectPath: string;
      contextualAffectPath: string;
  };
  
  // Context breakdown
  appraisal: EmotionAppraisal;
  appraisalWhy: string[];
  appraisalTrace?: AppraisalTrace; // New: Detailed breakdown of appraisal logic

  // extra trace collected in contextual module (so GoalLab can debug “what fed into appraisal”)
  signals?: ContextSignals;
  
  // Dyad views (computed on the fly + memory)
  dyads: ContextualDyadReport[];
  
  // Current active goal context (summary)
  topGoals?: Array<{ id: string; label: string; priority: number }>;
  
  // Debug
  domainMix?: Record<string, number>;

  // selection debug: why no dyads / where targets came from
  targetsDebug?: {
    candidates: string[];
    used: string[];
    sources: {
      relationsCount: number;
      nearbyCount: number;
      worldTomKeyCount: number;
    };
  };
  
  // bounded history for UI tick-to-tick rendering
  history?: ContextualMindHistoryPoint[];
}

export interface ContextualMindResult {
  nextState: ContextualMindState;
  report: ContextualMindReport;
}
