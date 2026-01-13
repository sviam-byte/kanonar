/**
 * Return indices with the biggest absolute deltas between two vectors.
 */
export function topDeltas(a: number[], b: number[], k = 6) {
  const n = Math.min(a.length, b.length);
  const xs: { i: number; d: number }[] = [];
  for (let i = 0; i < n; i++) xs.push({ i, d: Math.abs((a[i] ?? 0) - (b[i] ?? 0)) });
  xs.sort((p, q) => q.d - p.d);
  return xs.slice(0, k);
}
