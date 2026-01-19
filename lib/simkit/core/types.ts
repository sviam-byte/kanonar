// lib/simkit/core/types.ts
// Core types for the SimKit world, actions, snapshots, and exports.

export type Id = string;

export type SimCharacter = {
  id: Id;
  name: string;
  title?: string;

  locId: Id;
  // позиция на карте локации (внутренний граф)
  pos?: {
    nodeId: string | null;
    x?: number;
    y?: number;
  };

  // базовые численные статы (пример — расширишь под свой мир)
  stress: number;     // 0..1
  health: number;     // 0..1
  energy: number;     // 0..1

  tags?: string[];
  // исходная сущность Kanonar (CharacterEntity / AgentState-like)
  entity?: any;
};

export type SimLocation = {
  id: Id;
  name: string;
  title?: string;

  neighbors: Id[];              // граф перемещения
  hazards?: Record<string, number>;  // hazardKey -> 0..1
  norms?: Record<string, number>;    // normKey -> 0..1
  tags?: string[];
  // карта/план локации из Kanonar (LocationEntity.map)
  map?: { image?: string; width?: number; height?: number; origin?: { x: number; y: number } } | null;
  // карта/навигация внутри локации (как в GoalLab)
  nav?: {
    nodes: Array<{ id: string; x: number; y: number; tags?: string[] }>;
    edges: Array<{ a: string; b: string; w?: number; tags?: string[] }>;
  };
  features?: Array<{ id: string; kind: string; nodeId?: string; tags?: string[]; strength?: number }>;
  // исходная сущность Kanonar (LocationEntity)
  entity?: any;
};

export type SimWorldFacts = Record<string, any> & {
  spatial?: any;
  inboxAtoms?: Record<string, any[]>;
  [k: `agentAtoms:${string}`]: any[];
  [k: `quarantineAtoms:${string}`]: any[];
  [k: `intent:${string}`]: any;
  [k: `observeBoost:${string}`]: number;
  relations?: any;
};

export type SimWorld = {
  tickIndex: number;
  seed: number;

  characters: Record<Id, SimCharacter>;
  locations: Record<Id, SimLocation>;

  // глобальные факты/ресурсы
  facts: SimWorldFacts;

  // очередь событий “на этот тик” (и/или на будущее)
  events: SimEvent[];
};

export type ActionKind =
  | 'move'
  | 'move_xy'
  | 'wait'
  | 'rest'
  | 'talk'
  | 'attack'
  | 'observe'
  | 'question_about'
  | 'negotiate'
  | 'inspect_feature'
  | 'repair_feature'
  | 'scavenge_feature'
  | 'start_intent'
  | 'continue_intent'
  | 'abort_intent';

// Intent scripts (fractal actions): staged transactions with per-tick and enter/exit effects.
export type IntentStageKind = 'approach' | 'attach' | 'execute' | 'detach';

export type IntentAtomicDelta = {
  target: 'agent' | 'world' | 'target'; // which entity to mutate
  key: string; // e.g. "energy", "pos", "is_open"
  op: 'add' | 'set' | 'toward' | 'decay' | 'set_path_to_node' | 'follow_path_step';
  value: number | string | boolean | Record<string, any>;
  // Used by toward/decay. Rate is a 0..1 convergence factor.
  rate?: number;
};

export type IntentStage = {
  kind: IntentStageKind;
  ticksRequired: number | 'until_condition';
  completionCondition?: ((agent: any, ctx: any) => boolean) | {
    mode?: 'all' | 'any';
    checks: Array<{
      target: 'agent' | 'world' | 'target';
      key: string;
      op: '>=' | '<=' | '>' | '<' | '==';
      value: number;
    }>;
  };
  perTick?: IntentAtomicDelta[];
  onEnter?: IntentAtomicDelta[];
  onExit?: IntentAtomicDelta[];
};

export type IntentScript = {
  id: string;
  stages: IntentStage[];
  explain?: string[];
};

export type SimAction = {
  id: Id;                 // unique action instance id
  kind: ActionKind;
  actorId: Id;
  targetId?: Id | null;   // персонаж или локация (по смыслу)
  // навигация внутри локации
  targetNodeId?: string | null;
  // move_xy: map-space move inside current location (or payload.locationId)
  path?: string[] | null;
  meta?: any;
  payload?: any;
};

export type SimEvent = {
  id: Id;
  type: string;           // "hazardPulse", "normSpike", "randomEncounter", ...
  payload?: any;
};

export type SpeechEventV1 = {
  schema: 'SpeechEventV1';
  actorId: string;
  targetId: string;
  act: 'inform' | 'ask' | 'threaten' | 'promise' | 'negotiate';
  // loudness affects who can hear (spatial rules)
  volume?: 'whisper' | 'normal' | 'shout';
  // атомы, которые говорящий “передаёт” (прототип: просто список id/mag)
  atoms: Array<{ id: string; magnitude?: number; confidence?: number; meta?: any }>;
  // опционально: “тема” и краткая строка (для UI)
  topic?: string;
  text?: string;
};

export type ActionOffer = {
  kind: ActionKind;
  actorId: Id;
  targetId?: Id | null;
  // навигация внутри локации
  targetNodeId?: string | null;
  meta?: any;
  score: number;          // эвристика/полезность (не ToM!)
  blocked?: boolean;
  reason?: string | null;
};

export type SimSnapshot = {
  schema: 'SimKitSnapshotV1';
  id: Id;
  time: string;
  tickIndex: number;

  characters: SimCharacter[];
  locations: SimLocation[];

  // события, которые были применены/учтены при этом тике
  events: SimEvent[];

  // “подача” под дальнейшие системы (в т.ч. GoalLab/оркестратор)
  // можно хранить atoms/debug отдельно, но симулятор от них не зависит
  debug?: Record<string, any>;
};

export type TickTrace = {
  tickIndex: number;
  time: string;

  actionsProposed: ActionOffer[];
  actionsApplied: SimAction[];

  eventsApplied: SimEvent[];

  deltas: {
    chars: Array<{ id: Id; before: Partial<SimCharacter>; after: Partial<SimCharacter> }>;
    facts: Record<string, { before: any; after: any }>;
  };

  // Validation / atomicity trace (V1/V2/V3) for actions actually attempted this tick.
  actionValidations?: Array<{
    actionId: string;
    actorId: string;
    kind: ActionKind;
    targetId?: string | null;
    allowed: boolean;
    singleTick: boolean;
    reasons: string[];
    normalizedTo?: { id: string; kind: ActionKind; targetId?: string | null } | null;
  }>;

  notes: string[];
};

export type SimTickRecord = {
  snapshot: SimSnapshot;
  trace: TickTrace;

  // plugin outputs (например, оркестратор)
  plugins?: Record<string, any>;
};

export type SimExport = {
  schema: 'SimKitExportV1';
  createdAt: string;
  seed: number;

  scenarioId: string;

  records: SimTickRecord[];
};
