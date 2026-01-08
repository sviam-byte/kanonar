// lib/orchestrator/runTick.ts
// Single orchestrator tick: run producer stages, merge patches, and emit trace.

import type {
  AtomV1, OrchestratorContext, OrchestratorTraceV1, ProducerSpec,
  ProducerTrace, StageTrace,
} from './types';
import { applyPatch, normalizeAtom } from './merge';

const nowIso = () => new Date().toISOString();

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

function padTick(i: number) {
  const s = String(i);
  return `t${s.padStart(5, '0')}`;
}

function summarizeTopChanges(
  changes: { id: string; op: string; before?: AtomV1 | null; after?: AtomV1 | null }[],
  n = 8,
) {
  const score = (c: any) => {
    const b = c?.before?.magnitude ?? 0;
    const a = c?.after?.magnitude ?? 0;
    return Math.abs(a - b);
  };
  return [...changes]
    .sort((x, y) => score(y) - score(x))
    .slice(0, n);
}

export type RunTickArgs = {
  tickIndex: number;
  snapshot: any;                 // GoalLabSnapshotV1
  prevSnapshot?: any | null;
  overrides?: Record<string, any> | null;
  registry: ProducerSpec[];
  seed?: number | null;
};

export function runTick(args: RunTickArgs): { nextSnapshot: any; trace: OrchestratorTraceV1 } {
  const timeIso = nowIso();
  const tickId = padTick(args.tickIndex);

  const atomsIn: AtomV1[] = (args.snapshot?.atoms || []).map(normalizeAtom);
  const ctx: OrchestratorContext = {
    tickIndex: args.tickIndex,
    tickId,
    timeIso,
    snapshot: args.snapshot,
    prevSnapshot: args.prevSnapshot ?? null,
    overrides: args.overrides ?? null,
    atomsIn,
  };

  // group producers by stage
  const byStage = new Map<string, ProducerSpec[]>();
  for (const spec of args.registry) {
    const arr = byStage.get(spec.stageId) ?? [];
    arr.push(spec);
    byStage.set(spec.stageId, arr);
  }
  const stageIds = Array.from(byStage.keys()).sort((a, b) => a.localeCompare(b));

  const stages: StageTrace[] = [];
  let workingAtoms: AtomV1[] = atomsIn;
  // Track last change per atom id to reflect the sequential application truth.
  const lastChangeById = new Map<string, { id: string; op: string; before?: AtomV1 | null; after?: AtomV1 | null }>();

  for (const stageId of stageIds) {
    const specs = (byStage.get(stageId) || []).slice();
    // stable order inside stage: priority desc, name asc
    specs.sort((a, b) => {
      const pa = (b.priority ?? 0) - (a.priority ?? 0);
      if (pa !== 0) return pa;
      return a.name.localeCompare(b.name);
    });

    const stageTrace: StageTrace = { id: stageId, producers: [] };

    for (const spec of specs) {
      const t0 = nowMs();

      // always operate from the latest atomsIn
      ctx.atomsIn = workingAtoms;

      const res = spec.run(ctx);
      const took = nowMs() - t0;

      const producerTrace: ProducerTrace = {
        ...res.trace,
        name: spec.name,
        version: spec.version,
        tookMs: Math.round(took),
        // enforce deterministic ordering in outputs
        outputs: {
          atomsAdded: [...(res.patch.add || [])].map(normalizeAtom).sort((a, b) => a.id.localeCompare(b.id)),
          atomsUpdated: [...(res.patch.update || [])].map(x => ({
            before: normalizeAtom(x.before),
            after: normalizeAtom(x.after),
          })).sort((a, b) => a.after.id.localeCompare(b.after.id)),
          atomsRemoved: [...(res.patch.remove || [])].map(normalizeAtom).sort((a, b) => a.id.localeCompare(b.id)),
        },
        why: (res.trace.why || []).slice(),
        inputRefs: (res.trace.inputRefs || []).slice().sort(),
      };

      stageTrace.producers.push(producerTrace);
      // apply producer patch immediately to update working set
      const applied = applyPatch(workingAtoms, res.patch);
      workingAtoms = applied.atoms;
      for (const ch of applied.changes) lastChangeById.set(ch.id, ch);
    }

    stages.push(stageTrace);
  }

  // workingAtoms is the source of truth (sequential application).

  // human log
  const atomChanges = Array.from(lastChangeById.values()).sort((a, b) => a.id.localeCompare(b.id));
  const added = atomChanges.filter(c => c.op === 'add').length;
  const upd = atomChanges.filter(c => c.op === 'update').length;
  const rem = atomChanges.filter(c => c.op === 'remove').length;

  const top = summarizeTopChanges(atomChanges, 10);
  const humanLog: string[] = [
    `Tick ${tickId} @ ${timeIso}`,
    `atoms: in=${atomsIn.length} out=${workingAtoms.length}  (+${added} ~${upd} -${rem})`,
    ...top.map(c => {
      const b = c.before?.magnitude ?? 0;
      const a = c.after?.magnitude ?? 0;
      const d = a - b;
      const sign = d >= 0 ? '+' : '';
      return `${c.op.toUpperCase()} ${c.id}  ${b.toFixed(3)} -> ${a.toFixed(3)}  (${sign}${d.toFixed(3)})`;
    }),
  ];

  const trace: OrchestratorTraceV1 = {
    schema: 'GoalLabOrchestratorTraceV1',
    tickId,
    time: timeIso,
    seed: args.seed ?? null,
    inputs: {
      chars: Array.isArray(args.snapshot?.characters) ? args.snapshot.characters.length : undefined,
      locations: Array.isArray(args.snapshot?.locations) ? args.snapshot.locations.length : undefined,
      events: Array.isArray(args.snapshot?.events) ? args.snapshot.events.length : undefined,
      atomsIn: atomsIn.length,
      seed: args.seed ?? null,
      snapshotId: args.snapshot?.id ?? null,
    },
    stages,
    atomChanges: atomChanges as any,
    atomsOutCount: workingAtoms.length,
    humanLog,
  };

  const nextSnapshot = {
    ...args.snapshot,
    atoms: workingAtoms,
    debug: {
      ...(args.snapshot?.debug || {}),
      orchestrator: trace,
    },
  };

  return { nextSnapshot, trace };
}
