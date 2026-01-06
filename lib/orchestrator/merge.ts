// lib/orchestrator/merge.ts
// Deterministic merge helpers for atom patches.

import type { AtomV1, AtomOrigin, AtomChange, AtomPatch } from './types';

const clampNum = (x: any, fb = 0) => (Number.isFinite(Number(x)) ? Number(x) : fb);

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function normalizeAtom(a: AtomV1): AtomV1 {
  return {
    ...a,
    id: String(a?.id ?? ''),
    magnitude: clampNum((a as any)?.magnitude, 0),
    confidence: clampNum((a as any)?.confidence, 1),
    origin: (a?.origin ?? 'derived') as AtomOrigin,
    kind: (a?.kind ?? null),
    ns: (a?.ns ?? null),
    source: (a?.source ?? null),
    label: (a?.label ?? null),
    code: (a?.code ?? null),
    meta: (a?.meta ?? null),
  };
}

// Higher = wins
const originRank: Record<AtomOrigin, number> = {
  override: 40,
  obs: 30,
  world: 20,
  derived: 10,
};

function atomWins(a: AtomV1, b: AtomV1): boolean {
  const ra = originRank[a.origin ?? 'derived'] ?? 0;
  const rb = originRank[b.origin ?? 'derived'] ?? 0;
  if (ra !== rb) return ra > rb;

  const ca = a.confidence ?? 1;
  const cb = b.confidence ?? 1;
  if (ca !== cb) return ca > cb;

  // deterministic fallback: stable tie-break by id+code+source
  const ka = `${a.id}|${a.code ?? ''}|${a.source ?? ''}`;
  const kb = `${b.id}|${b.code ?? ''}|${b.source ?? ''}`;
  return ka >= kb;
}

export function applyPatch(baseAtoms: AtomV1[], patch: AtomPatch): { atoms: AtomV1[]; changes: AtomChange[] } {
  const map = new Map<string, AtomV1>();
  for (const a of baseAtoms) {
    const na = normalizeAtom(a);
    if (!na.id) continue;
    map.set(na.id, na);
  }

  const changes: AtomChange[] = [];

  // removals
  for (const r of patch.remove || []) {
    const id = String(r?.id ?? '');
    if (!id) continue;
    const before = map.get(id);
    if (before) {
      map.delete(id);
      changes.push({ id, before, after: null, op: 'remove' });
    }
  }

  // updates
  for (const u of patch.update || []) {
    const id = String(u?.after?.id ?? u?.before?.id ?? '');
    if (!id) continue;
    const before = map.get(id) ?? normalizeAtom(u.before);
    const after = normalizeAtom(u.after);
    map.set(id, after);
    changes.push({ id, before, after, op: 'update' });
  }

  // adds (but resolve conflicts)
  for (const a of patch.add || []) {
    const na = normalizeAtom(a);
    if (!na.id) continue;
    const cur = map.get(na.id);
    if (!cur) {
      map.set(na.id, na);
      changes.push({ id: na.id, before: null, after: na, op: 'add' });
    } else {
      // treat as conflict update if new wins
      if (atomWins(na, cur)) {
        map.set(na.id, na);
        changes.push({ id: na.id, before: cur, after: na, op: 'update' });
      }
    }
  }

  const atoms = Array.from(map.values()).sort((x, y) => x.id.localeCompare(y.id));
  return { atoms, changes };
}

export function mergePatches(patches: AtomPatch[]): AtomPatch {
  const add: AtomV1[] = [];
  const update: { before: AtomV1; after: AtomV1 }[] = [];
  const remove: AtomV1[] = [];
  for (const p of patches) {
    if (!p) continue;
    add.push(...(p.add || []));
    update.push(...(p.update || []));
    remove.push(...(p.remove || []));
  }
  // deterministic order
  add.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  remove.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  update.sort((a, b) => String(a.after?.id ?? '').localeCompare(String(b.after?.id ?? '')));
  return { add, update, remove };
}
