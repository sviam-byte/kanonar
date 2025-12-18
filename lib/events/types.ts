
// lib/events/types.ts

// Legacy kinds + System kinds
export type EventKind =
  | 'helped'
  | 'saved'
  | 'hurt'
  | 'attacked'
  | 'betrayed'
  | 'lied'
  | 'kept_oath'
  | 'broke_oath'
  | 'obeyed_order'
  | 'disobeyed_order'
  | 'shared_secret'
  | 'public_shame'
  // System kinds
  | 'action'
  | 'interaction'
  | 'perception'
  | 'scene_transition'
  | 'system';

export type EventChannel = 'world' | 'debug' | 'system' | string;

export interface EventEffects {
  worldDelta: Record<string, any>;
  stateDelta: Record<string, any>;
  goalDelta: Record<string, any>;
  tensionDelta: number;
}

export interface EventEpistemics {
  witnesses: string[];
  visibility: number;
  beliefByAgent?: Record<string, {
    seen: boolean;
    confidence: number;
    interpretationTag?: string;
  }>;
}

export interface EventCheck {
  type: string;
  difficulty?: number;
  roll?: number;
  success: boolean;
  details?: any;
}

// Canonical Event Structure
export interface Event {
  id: string;
  kind: EventKind;
  channel: EventChannel;
  schemaVersion: number;
  timestamp: number;

  locationId: string | null;
  zoneId?: string;
  position?: { x: number; y: number; z?: number };

  actors: string[];
  targets: string[];
  objects?: string[];

  affordanceId?: string;
  normsViolated?: string[];
  normsSatisfied?: string[];

  tags: string[];
  facts: string[];
  goalTags: string[];

  effects: EventEffects;
  epistemics: EventEpistemics;

  sceneId?: string;
  aggregateId?: string;
  triggeredBy?: string;
  transition?: { from?: string; to?: string };

  check?: EventCheck;

  causedBy: string[];
  causes: string[];
  importance: number;

  lifecycleStage: 'planned' | 'scheduled' | 'executing' | 'completed' | 'failed';
  status: 'hypothetical' | 'committed' | 'cancelled';
  
  validationStatus: 'unchecked' | 'valid' | 'invalid';
  validationErrors: string[];

  priority: number;
  orderKey: string;

  randomSeed?: number;
  randomInputs?: Record<string, number>;

  isAtomic: boolean;

  payload: Record<string, any>;
}

export interface ActionEvent extends Event {
  kind: 'action';
  affordanceId: string;
  locationId: string;
  actors: [string, ...string[]];
}

export interface InteractionEvent extends Event {
  kind: 'interaction';
  actors: [string, ...string[]];
  targets: [string, ...string[]];
}

export interface PerceptionEvent extends Event {
  kind: 'perception';
  actors: [string];
  payload: {
    observedEventId: string;
  };
}

export interface SceneTransitionEvent extends Event {
  kind: 'scene_transition';
  sceneId: string;
  transition: { from?: string; to?: string };
}

export interface EventPattern {
  kinds?: EventKind[];
  locationId?: string;
  sceneId?: string;
  tagsAny?: string[];
  tagsAll?: string[];
  actorIdsAny?: string[];
  targetIdsAny?: string[];
  minImportance?: number;
}

export type WorldEvent = {
  id: string;
  tick: number;
  kind: string; // broadened from EventKind to string to avoid circular or strict issues with legacy code
  actorId: string;
  targetId?: string;
  magnitude?: number;    // 0..1 severity / impact
  context?: {
    locationId?: string;
    sceneId?: string;
    protocolId?: string;
  };
  meta?: Record<string, any>;
};

export type EventLog = {
  schemaVersion: number;
  events: WorldEvent[];
};
