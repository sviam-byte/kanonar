// lib/context/v2/atomAccessors.ts
// Safe typed accessors for context atoms to eliminate (a as any).id patterns.

import type { ContextAtom } from './types';

/**
 * Safe accessor for atom-like objects from loosely-typed arrays.
 * Returns a normalized ContextAtom view, or null if the input is not atom-shaped.
 */
export function asAtom(a: unknown): ContextAtom | null {
  if (!a || typeof a !== 'object') return null;
  const obj = a as Record<string, unknown>;
  if (typeof obj.id !== 'string') return null;
  return a as ContextAtom;
}

/** Extract atom id safely. Returns '' for non-atom inputs. */
export function atomId(a: unknown): string {
  if (!a || typeof a !== 'object') return '';
  return String((a as Record<string, unknown>).id ?? '');
}

/** Extract atom kind safely. Returns '' for non-atom inputs. */
export function atomKind(a: unknown): string {
  if (!a || typeof a !== 'object') return '';
  return String((a as Record<string, unknown>).kind ?? '');
}

/** Extract atom magnitude safely. Returns 0 for non-atom inputs. */
export function atomMagnitude(a: unknown): number {
  if (!a || typeof a !== 'object') return 0;
  return Number((a as Record<string, unknown>).magnitude ?? 0);
}

/** Filter an array to only valid atoms. */
export function filterAtoms(arr: unknown[]): ContextAtom[] {
  return arr.filter((a): a is ContextAtom =>
    a != null && typeof a === 'object' && typeof (a as Record<string, unknown>).id === 'string'
  );
}
