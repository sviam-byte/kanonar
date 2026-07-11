// lib/utils/compare.ts
//
// Deterministic string comparison for semantic/trace paths.
//
// String.prototype.localeCompare is ICU-collation dependent: its order changes
// across Node builds, ICU versions and machine locales. That broke the MVP-0
// golden hash into two per-environment lineages (73eaf2ce…/4352ad74… vs
// 124e3434…/451edc9d…, see tests/simkit/mvp0_golden.test.ts). Anything that
// feeds a golden hash, a decision tie-break or a persisted trace must sort with
// this comparator instead. localeCompare stays legal only for UI display order.

/**
 * UTF-16 code-unit order — the same order as the default Array.prototype.sort
 * and the key sort in lib/simkit/mvp0/hash.ts. Platform-independent.
 */
export function codeUnitCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
