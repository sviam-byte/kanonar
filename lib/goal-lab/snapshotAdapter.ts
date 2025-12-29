
import { GoalLabSnapshotV1 } from './snapshotTypes';
import { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

function safeTick(x: any) {
  const t = Number(x);
  return Number.isFinite(t) ? t : 0;
}

export function adaptToSnapshotV1(raw: any, args: { selfId: string }): GoalLabSnapshotV1 {
  // raw can be GoalLabContextResult or similar structure
  // IMPORTANT:
  // GoalLabContextResult содержит ДВЕ параллельные ветки атомов:
  // - snapshot.atoms (каноническая v2/папка pipeline, включает appraisal/emotion)
  // - v4Atoms (legacy/debug, часто без appraisal/emotion и с другими id-шниками)
  // Для инспекторов/панелей GoalLab нам нужен именно snapshot.atoms.
  const atoms: ContextAtom[] =
    (raw?.snapshot?.atoms as ContextAtom[]) ||
    (raw?.atoms as ContextAtom[]) ||
    (raw?.frame?.atoms as ContextAtom[]) ||
    (raw?.v4Atoms as ContextAtom[]) ||
    [];
  const normalizedAtoms = atoms.map(a => normalizeAtom(a as any));

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
