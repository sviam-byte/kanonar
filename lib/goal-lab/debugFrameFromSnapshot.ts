import type { GoalLabSnapshotV1 } from './snapshotTypes';
import { normalizeAtom } from '../context/v2/infer';
import { describeQuark } from '../context/codex/quarkRegistry';

type AtomOrigin = 'world' | 'obs' | 'override' | 'derived';

export function buildDebugFrameFromSnapshot(snapshot: GoalLabSnapshotV1) {
  const atoms = (snapshot.atoms || []).map(a => {
    const raw: any = {
      id: String((a as any).id),
      magnitude: Number((a as any).magnitude ?? 0),
      confidence: Number((a as any).confidence ?? 1),
      origin: ((a as any).origin ?? 'derived') as AtomOrigin,
      kind: (a as any).kind ?? null,
      ns: (a as any).ns ?? null,
      source: (a as any).source ?? null,
      label: (a as any).label ?? null,
      code: (a as any).code ?? null,
      specId: (a as any).specId ?? null,
      params: (a as any).params ?? null,
      trace: (a as any).trace ?? (a as any).meta ?? null,
    };
    const norm = normalizeAtom(raw);
    return {
      id: String(norm.id),
      m: Number((norm as any).magnitude ?? 0),
      c: Number((norm as any).confidence ?? 1),
      o: ((norm as any).origin ?? 'derived') as AtomOrigin,
      code: (norm as any).code ?? null,
      specId: (norm as any).specId ?? null,
      params: (norm as any).params ?? null,
      label: (norm as any).label ?? null,
      kind: (norm as any).kind ?? null,
      ns: (norm as any).ns ?? null,
      source: (norm as any).source ?? null,
      meta: (norm as any).trace ?? null,
    };
  });

  const index: Record<string, any> = {};
  for (const a of atoms) index[a.id] = a;

  const selfId = snapshot.selfId;

  // mind panel
  let mind = null as any;
  const cm = (snapshot as any).contextMind || (snapshot as any).snapshot?.contextMind;
  if (cm?.metrics?.length) {
    const byKey: Record<string, number> = {};
    for (const m of cm.metrics) byKey[m.key] = m.value;
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

  const diag = {
    totalAtoms: atoms.length,
    missingSpec: atoms.filter(a => !a.specId).length,
    missingCode: atoms.filter(a => !a.code).length,
    unknownQuark: atoms.filter(a => describeQuark(a.code).family === 'missing').length
  };

  return {
    atoms,
    index,
    panels: { mind, threat, ctx: null },
    diagnostics: diag,
  };
}
