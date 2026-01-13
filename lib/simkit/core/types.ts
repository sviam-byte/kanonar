// lib/simkit/core/types.ts
// Core types for the SimKit world, actions, snapshots, and exports.

export type Id = string;

export type SimCharacter = {
  id: Id;
  name: string;

  locId: Id;

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

  neighbors: Id[];              // граф перемещения
  hazards?: Record<string, number>;  // hazardKey -> 0..1
  norms?: Record<string, number>;    // normKey -> 0..1
  tags?: string[];
  // карта/план локации из Kanonar (LocationEntity.map)
  map?: any;
  // исходная сущность Kanonar (LocationEntity)
  entity?: any;
};

export type SimWorld = {
  tickIndex: number;
  seed: number;

  characters: Record<Id, SimCharacter>;
  locations: Record<Id, SimLocation>;

  // глобальные факты/ресурсы
  facts: Record<string, any>;

  // очередь событий “на этот тик” (и/или на будущее)
  events: SimEvent[];
};

export type ActionKind =
  | 'move'
  | 'wait'
  | 'rest'
  | 'work'
  | 'talk'
  | 'observe'
  | 'ask_info'
  | 'negotiate'
  | 'start_intent';

export type SimAction = {
  id: Id;                 // unique action instance id
  kind: ActionKind;
  actorId: Id;
  targetId?: Id | null;   // персонаж или локация (по смыслу)
  payload?: any;
};

export type SimEvent = {
  id: Id;
  type: string;           // "hazardPulse", "normSpike", "randomEncounter", ...
  payload?: any;
};

export type ActionOffer = {
  kind: ActionKind;
  actorId: Id;
  targetId?: Id | null;
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
