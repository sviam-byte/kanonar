
function isObj(x: any) {
  return x && typeof x === 'object' && !Array.isArray(x);
}

function toArray(x: any): any[] {
  return Array.isArray(x) ? x : [];
}

export function shallowAtomDiff(prevAtoms: any[] | any = [], nextAtoms: any[] | any = []) {
  const prev = toArray(prevAtoms);
  const next = toArray(nextAtoms);

  const p = new Map(prev.map((a) => [a?.id, a]).filter(([id]) => id != null));
  const n = new Map(next.map((a) => [a?.id, a]).filter(([id]) => id != null));

  const changed: any[] = [];
  const added: any[] = [];
  const removed: any[] = [];

  for (const [id, a] of n) {
    if (!p.has(id)) {
      added.push(a);
      continue;
    }
    const b = p.get(id);
    const am = a?.magnitude;
    const bm = b?.magnitude;

    if (typeof am === 'number' && typeof bm === 'number' && Math.abs(am - bm) > 1e-6) {
      changed.push({ id, from: bm, to: am, label: a.label || a.kind });
    }
  }

  for (const [id, b] of p) {
    if (!n.has(id)) removed.push(b);
  }

  return { added, removed, changed };
}

export function deepDiff(prev: any, next: any, path: string[] = []): any[] {
  if (prev === next) return [];
  if (!isObj(prev) || !isObj(next)) return [{ path, from: prev, to: next }];

  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const out: any[] = [];

  for (const k of keys) {
    out.push(...deepDiff(prev[k], next[k], [...path, k]));
  }
  return out;
}
