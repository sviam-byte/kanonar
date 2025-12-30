// lib/utils/listify.ts

/**
 * Coerces unknown input into an array.
 *
 * Why this exists:
 * - GoalLab imports/exports JSON snapshots.
 * - Older dumps (or accidental Set/Map serialization) may turn arrays into objects.
 * - UI/pipeline code frequently calls `.map()`/`.filter()`; a plain object would crash.
 */
export function listify<T = any>(input: any): T[] {
  if (Array.isArray(input)) return input as T[];
  if (input == null) return [];

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
