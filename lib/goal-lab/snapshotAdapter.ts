
import { GoalLabSnapshotV1 } from './snapshotTypes';
import { ContextAtom } from '../context/v2/types';

function safeTick(x: any) {
  const t = Number(x);
  return Number.isFinite(t) ? t : 0;
}

export function adaptToSnapshotV1(raw: any, args: { selfId: string }): GoalLabSnapshotV1 {
  // raw can be GoalLabContextResult or similar structure
  const atoms: ContextAtom[] =
    (raw?.v4Atoms as ContextAtom[]) || 
    (raw?.atoms as ContextAtom[]) ||
    (raw?.frame?.atoms as ContextAtom[]) ||
    (raw?.snapshot?.atoms as ContextAtom[]) ||
    [];

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
    atoms,

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
