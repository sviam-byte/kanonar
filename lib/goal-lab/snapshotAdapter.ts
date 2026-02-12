
import { GoalLabSnapshotV1, GoalLabSnapshotV2 } from './snapshotTypes';
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';
import { arr } from '../utils/arr';

function safeTick(x: any) {
  const t = Number(x);
  return Number.isFinite(t) ? t : 0;
}

export function normalizeArray<T>(x: unknown): T[] {
  if (Array.isArray(x)) return x;
  if (x == null) return [];
  return [];
}

export function normalizeSnapshot(raw: GoalLabSnapshotV1): GoalLabSnapshotV1 {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log({
      atoms: Array.isArray(raw.atoms),
      events: Array.isArray(raw.events),
      actions: Array.isArray(raw.actions),
    });
  }
  return {
    ...raw,
    atoms: normalizeArray(raw.atoms),
    events: normalizeArray(raw.events),
    actions: normalizeArray(raw.actions),
    stages: normalizeArray(raw.stages),
  };
}

export function adaptToSnapshotV1(raw: any, args: { selfId: string }): GoalLabSnapshotV1 {
  // raw can be GoalLabContextResult or similar structure
  // IMPORTANT:
  // GoalLabContextResult содержит ДВЕ параллельные ветки атомов:
  // - snapshot.atoms (каноническая v2/папка pipeline, включает appraisal/emotion)
  // - v4Atoms (legacy/debug, часто без appraisal/emotion и с другими id-шниками)
  // Для инспекторов/панелей GoalLab нам нужен именно snapshot.atoms.
  const atoms: ContextAtom[] =
    arr(raw?.snapshot?.atoms) ||
    arr(raw?.atoms) ||
    arr(raw?.frame?.atoms) ||
    arr(raw?.v4Atoms) ||
    [];
  const normalizedAtoms = arr(atoms).map(a => normalizeAtom(a as any));

  const tick =
    safeTick(raw?.tick) ||
    safeTick(raw?.world?.tick) ||
    safeTick(raw?.frame?.tick) ||
    0;
    
  const snapshot = raw?.snapshot || {};

  const adapted: GoalLabSnapshotV1 = {
    schemaVersion: 1,
    tick,
    selfId: args.selfId,
    atoms: normalizedAtoms,

    events: raw?.events || snapshot?.events,
    actions: raw?.actions || snapshot?.actions,
    stages: raw?.stages || snapshot?.stages,

    warnings: raw?.warnings || snapshot?.warnings,
    atomDiff: raw?.atomDiff || snapshot?.atomDiff,

    contextMind: raw?.contextMind || snapshot?.contextMind,
    possibilities: raw?.possibilities || snapshot?.possibilities,
    decision: raw?.decision || snapshot?.decision,

    threat: raw?.threat || snapshot?.threat,
    tom: raw?.tom || snapshot?.tom,

    coverage: raw?.coverage || snapshot?.coverage, // Pass coverage

    meta: raw?.meta || snapshot?.meta
  };

  return normalizeSnapshot(adapted);
}


export type GoalLabSnapshotAny = GoalLabSnapshotV1 | GoalLabSnapshotV2;

/**
 * Backwards compatible adapter: keeps V1 adaptation for legacy payloads,
 * while allowing already-built V2 snapshots to pass through untouched.
 */
export function adaptToSnapshot(raw: any, args: { selfId: string }): GoalLabSnapshotAny {
  if (raw && typeof raw === 'object' && Number((raw as any).schemaVersion) === 2) {
    return raw as GoalLabSnapshotV2;
  }
  return adaptToSnapshotV1(raw, args);
}
