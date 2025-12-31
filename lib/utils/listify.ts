// lib/utils/listify.ts

/**
 * Coerces unknown input into an array.
 *
 * Why this exists:
 * - GoalLab imports/exports JSON snapshots.
 * - Older dumps (or accidental Set/Map serialization) may turn arrays into objects.
 * - UI/pipeline code frequently calls `.map()`/`.filter()`; a plain object would crash.
 */
export function listify<T = any>(input: any, source?: string): T[] {
  if (Array.isArray(input)) return input as T[];
  if (input == null) return [];

  if (input) {
    try {
      const g: any = globalThis as any;
      const buf = Array.isArray(g.__KANONAR_DIAG__) ? g.__KANONAR_DIAG__ : (g.__KANONAR_DIAG__ = []);
      buf.push({
        t: Date.now(),
        kind: 'listify.nonArray',
        source,
        type: typeof input,
        ctor: (input as any)?.constructor?.name,
        keys: typeof input === 'object' ? Object.keys(input).slice(0, 24) : null,
      });
      if (buf.length > 200) buf.splice(0, buf.length - 200);
    } catch {}
  }

  // Preserve iterables when possible.
  if (typeof input === 'object') {
    if (input instanceof Set) return Array.from(input.values()) as T[];
    if (input instanceof Map) return Array.from(input.values()) as T[];

    const it = (input as any)[Symbol.iterator];
    if (typeof it === 'function') {
      try {
        return Array.from(input as any) as T[];
      } catch {
        // fallthrough to object-values
      }
    }

    // Plain object -> values (common for legacy dumps that store dicts keyed by id)
    try {
      return Object.values(input) as T[];
    } catch {
      return [];
    }
  }

  return [];
}
