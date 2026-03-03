/**
 * lib/util/collections.ts
 *
 * Canonical collection utilities. Import instead of defining locally.
 */

/**
 * Deduplicate strings, preserving insertion order.
 * Filters out empty strings and non-strings.
 */
export function uniq(xs: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    if (typeof x !== 'string' || !x) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

export const uniqStrings = uniq;

/**
 * Generic dedup by key. First occurrence wins.
 */
export function uniqBy<T>(xs: readonly T[], key: (item: T) => string): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of xs) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}
