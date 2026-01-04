import type { GoalLabSnapshotV1 } from '../snapshotTypes';
import type { ContextAtom } from '../../context/v2/types';

function arr<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

export type CanonicalAtomsResult = {
  stageId: string;
  atoms: ContextAtom[];
  source: 'pipelineV1' | 'snapshotFallback';
  warnings: string[];
};

/**
 * Единственный разрешённый способ получить атомы для UI/экспорта.
 * Истина = pipelineV1.stages[*].atoms
 * fallback = snapshot.atoms (только чтобы UI не падал)
 */
export function getCanonicalAtomsFromSnapshot(
  snapshot: GoalLabSnapshotV1,
  stageId?: string
): CanonicalAtomsResult {
  const warnings: string[] = [];

  const p: any = (snapshot as any)?.pipelineV1;
  const stages = arr<any>(p?.stages);

  if (stages.length) {
    // если stageId не задан — берём последний (обычно S8)
    const wanted = stageId
      ? stages.find(s => String(s?.id || '') === stageId)
      : stages[stages.length - 1];

    const id = String(wanted?.id || (stageId || 'S?'));
    const atoms = arr<ContextAtom>(wanted?.atoms);

    if (!atoms.length) warnings.push(`pipelineV1 stage "${id}" has 0 atoms`);

    return { stageId: id, atoms, source: 'pipelineV1', warnings };
  }

  // fallback (не истина) — чтобы UI/инструменты не умирали
  const fallbackAtoms = arr<ContextAtom>((snapshot as any)?.atoms);
  warnings.push('pipelineV1 missing; using snapshot.atoms fallback');

  return { stageId: stageId || 'fallback', atoms: fallbackAtoms, source: 'snapshotFallback', warnings };
}
