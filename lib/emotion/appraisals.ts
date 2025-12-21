import type { ContextAtom } from '../context/v2/types';
import { normalizeAtom } from '../context/v2/infer';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function mag(atoms: ContextAtom[], id: string, fb = 0) {
  const a = atoms.find(x => x.id === id);
  const v = a?.magnitude;
  return typeof v === 'number' && Number.isFinite(v) ? v : fb;
}

function maxByPrefix(atoms: ContextAtom[], prefix: string, fb = 0) {
  let m = -1;
  for (const a of atoms) {
    const id = String(a?.id ?? '');
    if (!id.startsWith(prefix)) continue;
    const v = a?.magnitude;
    if (typeof v === 'number' && Number.isFinite(v)) m = Math.max(m, v);
  }
  return m >= 0 ? m : fb;
}

function mk(selfId: string, key: string, magnitude: number, usedAtomIds: string[], parts: any): ContextAtom {
  return normalizeAtom({
    id: `app:${key}:${selfId}`,
    ns: 'mind',
    kind: 'appraisal',
    origin: 'derived',
    source: 'emotionAppraisals',
    magnitude: clamp01(magnitude),
    confidence: 1,
    subject: selfId,
    tags: ['mind', 'emotion', 'appraisal'],
    trace: { usedAtomIds: Array.from(new Set(usedAtomIds)), notes: [], parts },
    meta: parts,
    label: `app:${key}`,
  });
}

export function deriveAppraisalAtoms(selfId: string, atoms: ContextAtom[]): ContextAtom[] {
  const used: string[] = [];

  const threatFinalId = `threat:final:${selfId}`;
  const threat = mag(atoms, threatFinalId, 0);
  used.push(threatFinalId);

  const ctxDangerId = `ctx:danger:${selfId}`;
  const ctxUncId = `ctx:uncertainty:${selfId}`;
  const ctxNormId = `ctx:normPressure:${selfId}`;
  const ctxPublicId = `ctx:publicness:${selfId}`;

  const danger = mag(atoms, ctxDangerId, 0); used.push(ctxDangerId);
  const uncertainty = mag(atoms, ctxUncId, 0); used.push(ctxUncId);
  const normPressure = mag(atoms, ctxNormId, 0); used.push(ctxNormId);
  const publicness = mag(atoms, ctxPublicId, 0); used.push(ctxPublicId);

  // Control proxy: if escape/cover is good, control is high
  const escape = mag(atoms, `world:map:escape:${selfId}`, 0);
  const cover = mag(atoms, `world:map:cover:${selfId}`, 0);
  const control = clamp01(0.6 * escape + 0.4 * cover);

  // Attachment proxy: ally proximity + trust dyads
  const allyProx = maxByPrefix(atoms, `prox:friend:${selfId}:`, 0);
  const allySupport = maxByPrefix(atoms, `soc:support_near:${selfId}:`, 0);
  const attachment = clamp01(0.7 * allyProx + 0.3 * allySupport);

  // Goal block: use existing mind/goal blockers if present; fallback from scarcity + norm
  const scarcity = mag(atoms, `ctx:scarcity:${selfId}`, 0);
  const goalBlock = clamp01(0.6 * scarcity + 0.4 * normPressure);

  // Loss proxy (later: from events/body pain)
  const loss = mag(atoms, `ctx:loss:${selfId}`, 0) || mag(atoms, `ctx:pain:${selfId}`, 0) || 0;

  const out: ContextAtom[] = [];
  out.push(mk(selfId, 'threat', clamp01(Math.max(threat, danger)), [threatFinalId, ctxDangerId], { threat, danger }));
  out.push(mk(selfId, 'uncertainty', uncertainty, [ctxUncId], { uncertainty }));
  out.push(mk(selfId, 'normPressure', normPressure, [ctxNormId], { normPressure }));
  out.push(mk(selfId, 'publicness', publicness, [ctxPublicId], { publicness }));
  out.push(mk(selfId, 'control', control, [`world:map:escape:${selfId}`, `world:map:cover:${selfId}`], { escape, cover, control }));
  out.push(mk(selfId, 'attachment', attachment, [`prox:friend:${selfId}:*`, `soc:support_near:${selfId}:*`], { allyProx, allySupport, attachment }));
  out.push(mk(selfId, 'goalBlock', goalBlock, [`ctx:scarcity:${selfId}`, ctxNormId], { scarcity, normPressure, goalBlock }));
  out.push(mk(selfId, 'loss', loss, ['ctx:loss:*', 'ctx:pain:*'], { loss }));

  return out;
}
