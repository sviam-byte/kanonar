// lib/world-orchestrator/contracts.ts
// Minimal orchestrator contracts for world snapshots and per-agent tick records.

import type { ContextAtom } from '../context/v2/types';
import type { WorldEvent } from '../events/types';

export type AgentId = string;
export type LocationId = string;

export type WorldSnapshot = {
  id: string;
  tickIndex: number;
  time: string;
  rngSeed: number;

  characters: Array<{
    id: AgentId;
    locId: LocationId;
    stats?: Record<string, number>;
    resources?: Record<string, number>;
    tags?: string[];
    publicState?: Record<string, any>;

    // Персистентное состояние агента (для explainability и ToM/emo).
    memory?: {
      beliefAtoms?: ContextAtom[];
      tomAtoms?: ContextAtom[];
      emotionAtoms?: ContextAtom[];
    };
  }>;

  locations: Array<{
    id: LocationId;
    neighbors?: LocationId[];
    hazards?: any[];
    norms?: string[];
    tags?: string[];
  }>;

  // События последнего тика — отдельным списком (для атомизации прошлого).
  lastTickEvents: WorldEvent[];

  facts?: Record<string, any>;
};

export type PerAgentView = {
  selfId: AgentId;

  visibleCharacters: Array<{ id: AgentId; locId: LocationId; publicState?: any }>;
  visibleLocations: Array<{ id: LocationId; norms?: string[]; hazards?: any[]; tags?: string[] }>;

  atomsWorld: ContextAtom[];
  atomsSocial: ContextAtom[];
  atomsMemory: ContextAtom[];

  // Входное персистентное состояние (ToM/эмоции) на начало тика.
  tomStateAtoms: ContextAtom[];
  emotionStateAtoms: ContextAtom[];

  // Удобный агрегат для scoring/possibilities.
  atomsBefore: ContextAtom[];
};

export type Goal = {
  goalId: string;
  domain: string;
  targetId?: AgentId | LocationId | string;
  priority: number;
  urgency: number;
  constraints?: string[];
};

export type GoalLabResult = {
  goals: Goal[];
  goalAtoms: ContextAtom[];
  debug: any;
};

export type ActionOffer = {
  offerId: string;

  actionType: string;
  actorId: AgentId;
  targetId?: AgentId | LocationId | string;
  args?: Record<string, any>;

  score: number;
  reasons: Array<{ kind: string; weight: number; note?: string; usedAtomIds?: string[] }>;

  requiredAtoms: string[];
  blockedBy: string[];
};

export type ChosenAction = {
  offerId: string;
  actionType: string;
  actorId: AgentId;
  targetId?: string;
  args?: Record<string, any>;

  stochastic: {
    T: number;
    rngSeed: number;
    roll: number;
    topK?: Array<{ offerId: string; p: number; score: number }>;
  };

  justification: any;
};

export type ValidationResult = {
  allowed: boolean;
  singleTick: boolean;
  reasons: string[];
  fallbackOfferId?: string;
  asIntent?: boolean;
};

export type Applied = {
  eventsApplied: WorldEvent[];
  worldDelta?: any;
};

export type PostPerAgent = {
  atomsAboutOthersActions: ContextAtom[];
  tomDeltaAtoms: ContextAtom[];
  emotionDeltaAtoms: ContextAtom[];

  // Новое персистентное состояние после тика.
  nextTomStateAtoms: ContextAtom[];
  nextEmotionStateAtoms: ContextAtom[];
  nextBeliefAtoms?: ContextAtom[];
};

export type TickRecord = {
  worldBefore: WorldSnapshot;

  perAgent: Record<AgentId, {
    view: PerAgentView;
    goals: GoalLabResult;
    offersTopK: ActionOffer[];
    chosen: ChosenAction;
    validation: ValidationResult;
    applied: Applied;
    post: PostPerAgent;
    debugStages?: Record<string, any>;
  }>;

  worldAfter: WorldSnapshot;
};
