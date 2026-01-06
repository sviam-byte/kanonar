// lib/orchestrator/types.ts
// Orchestrator public types: atoms, patches, traces, and producer contract.

export type AtomOrigin = 'world' | 'obs' | 'override' | 'derived';

export type AtomV1 = {
  id: string;
  magnitude: number;     // usually 0..1, but keep generic
  confidence?: number;   // 0..1
  origin?: AtomOrigin;
  kind?: string | null;
  ns?: string | null;
  source?: string | null;
  label?: string | null;
  code?: string | null;
  meta?: Record<string, any> | null;
};

export type AtomChange = {
  id: string;
  before?: AtomV1 | null;
  after?: AtomV1 | null;
  op: 'add' | 'update' | 'remove';
};

export type WhyRef = {
  because: string;              // ref to a fact: event:<id> | hazard:<id> | rule:<id> | atom:<id>
  rule?: string | null;         // stable code/key of the rule
  note?: string | null;         // short human note
  math?: string | null;         // e.g. "sum->clamp01->sigmoid"
  weight?: number | null;       // optional numeric contribution
};

export type ProducerTrace = {
  name: string;
  version?: string;
  inputRefs: string[];          // ids or keys of things read
  outputs: {
    atomsAdded: AtomV1[];
    atomsUpdated: { before: AtomV1; after: AtomV1 }[];
    atomsRemoved: AtomV1[];
  };
  why: WhyRef[];                // global why list for this producer
  notes?: string[];
  tookMs?: number;
};

export type StageTrace = {
  id: string;                   // e.g. "stage:world", "stage:tom"
  notes?: string[];
  tookMs?: number;
  producers: ProducerTrace[];
};

export type OrchestratorInputsDigest = {
  chars?: number;
  locations?: number;
  events?: number;
  atomsIn?: number;
  seed?: number | null;
  snapshotId?: string | null;
};

export type OrchestratorTraceV1 = {
  schema: 'GoalLabOrchestratorTraceV1';
  tickId: string;               // stable within session (e.g. "t00012")
  time: string;                 // ISO
  seed?: number | null;
  inputs: OrchestratorInputsDigest;

  stages: StageTrace[];

  atomChanges: AtomChange[];    // merged final change-set across all producers
  atomsOutCount: number;

  humanLog: string[];           // lines, ready for UI
};

export type AtomPatch = {
  add: AtomV1[];
  update: { before: AtomV1; after: AtomV1 }[];
  remove: AtomV1[];
};

export type ProducerResult = {
  patch: AtomPatch;
  trace: Omit<ProducerTrace, 'tookMs'>;
};

export type OrchestratorContext = {
  tickIndex: number;
  tickId: string;
  timeIso: string;

  // "inputs"
  snapshot: any;                 // GoalLabSnapshotV1 (keep any to avoid repo coupling)
  prevSnapshot?: any | null;
  overrides?: Record<string, any> | null;

  // working set
  atomsIn: AtomV1[];
};

export type Producer = (ctx: OrchestratorContext) => ProducerResult;

export type ProducerSpec = {
  stageId: string;
  name: string;
  version?: string;
  run: Producer;
  priority?: number;             // ordering within stage
};
