import type { GoalLabSnapshotV1 } from './snapshotTypes';
import { normalizeAtom } from '../context/v2/infer';
import { describeQuark } from '../context/codex/quarkRegistry';
import { resolveAtomSpec } from '../context/catalog/atomSpecs';
import { getCanonicalAtomsFromSnapshot } from './atoms/canonical';

type AtomOrigin = 'world' | 'obs' | 'override' | 'derived';

export function buildDebugFrameFromSnapshot(snapshot: GoalLabSnapshotV1, stageId?: string) {
  const resolvedStageId =
    stageId || (snapshot as Record<string, unknown>)?.ui?.selectedStageId || (snapshot as Record<string, unknown>)?.meta?.ui?.selectedStageId;
  const canon = getCanonicalAtomsFromSnapshot(snapshot, resolvedStageId);
  const rawAtoms: any[] = Array.isArray(canon.atoms) ? (canon.atoms as any[]) : [];

  const atoms = rawAtoms.map(a => {
    const raw: any = {
      id: String(a.id),
      magnitude: Number(a.magnitude ?? 0),
      confidence: Number(a.confidence ?? 1),
      origin: (a.origin ?? 'derived') as AtomOrigin,
      kind: a.kind ?? null,
      ns: a.ns ?? null,
      source: a.source ?? null,
      label: a.label ?? null,
      code: a.code ?? null,
      specId: a.specId ?? null,
      params: a.params ?? null,
      trace: a.trace ?? a.meta ?? null,
    };
    const norm = normalizeAtom(raw);
    return {
      id: String(norm.id),
      m: Number(norm.magnitude ?? 0),
      c: Number(norm.confidence ?? 1),
      o: (norm.origin ?? 'derived') as AtomOrigin,
      code: norm.code ?? null,
      specId: norm.specId ?? null,
      params: norm.params ?? null,
      label: norm.label ?? null,
      kind: norm.kind ?? null,
      ns: norm.ns ?? null,
      source: norm.source ?? null,
      meta: norm.trace ?? null,
    };
  });
  const index: Record<string, any> = {};
  for (const a of atoms) index[a.id] = a;

  const selfId = snapshot.selfId;

  // mind panel
  let mind = null as any;
  const cm = (snapshot as any).contextMind || (snapshot as any).snapshot?.contextMind;
  const metrics = Array.isArray(cm?.metrics) ? cm.metrics : [];
  if (metrics.length) {
    const byKey: Record<string, number> = {};
    for (const m of metrics) byKey[m.key] = m.value;
    mind = {
      threat: Number(byKey.threat ?? 0),
      pressure: Number(byKey.pressure ?? 0),
      support: Number(byKey.support ?? 0),
      crowd: Number(byKey.crowd ?? 0),
    };
  } else {
    // fallback: mind:metric:* atoms if contextMind missing
    const pick = (k: string) => index[`mind:metric:${k}:${selfId}`]?.m ?? 0;
    mind = {
      threat: pick('threat'),
      pressure: pick('pressure'),
      support: pick('support'),
      crowd: pick('crowd'),
    };
  }

  // threat panel
  const thr = (k: string) => index[`threat:ch:${k}:${selfId}`]?.m ?? 0;
  const threat = {
    env: thr('env'),
    soc: thr('social'),
    auth: thr('authority'),
    unc: thr('uncertainty'),
    body: thr('body'),
    sc: thr('scenario'),
    final: index[`threat:final:${selfId}`]?.m ?? 0,
  };

  // Coverage diagnostics: which atoms lack AtomSpec / code / known quark definition
  const missingSpecIds: string[] = [];
  const missingCodeIds: string[] = [];
  const unknownQuarkCodes: string[] = [];

  for (const a of atoms) {
    const resolved = resolveAtomSpec(a.id);
    const hasSpec = !!(a.specId || resolved);
    if (!hasSpec) missingSpecIds.push(a.id);
    if (!a.code) missingCodeIds.push(a.id);
    const q = describeQuark(a.code);
    if (q.family === 'missing' && a.code) unknownQuarkCodes.push(String(a.code));
  }

  const uniq = (xs: string[]) => Array.from(new Set(xs));
  const sortAlpha = (xs: string[]) => uniq(xs).sort((a, b) => a.localeCompare(b));

  const diag = {
    totalAtoms: atoms.length,
    missingSpec: missingSpecIds.length,
    missingCode: missingCodeIds.length,
    unknownQuark: unknownQuarkCodes.length,

    // lists for UI (Pipeline Debug Area)
    missingSpecIds: sortAlpha(missingSpecIds).slice(0, 120),
    missingCodeIds: sortAlpha(missingCodeIds).slice(0, 120),
    unknownQuarkCodes: sortAlpha(unknownQuarkCodes).slice(0, 120),
  };

  return {
    atoms,
    index,
    panels: { mind, threat, ctx: null },
    diagnostics: diag,
    __atomsSource: canon.source,
    __atomsStageId: canon.stageId,
    __atomsWarnings: canon.warnings,
  };
}
