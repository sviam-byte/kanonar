
import { GoalLabSnapshotV1 } from './snapshotTypes';
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

function safeTick(x: any) {
  const t = Number(x);
  return Number.isFinite(t) ? t : 0;
}

function arr<T = any>(x: any): T[] {
  return Array.isArray(x) ? x : [];
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

  return {
    schemaVersion: 1,
    tick,
    selfId: args.selfId,
    atoms: normalizedAtoms,

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
}
