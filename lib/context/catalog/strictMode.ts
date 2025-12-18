
// lib/context/catalog/strictMode.ts
export type AtomStrictMode = 'off' | 'warn' | 'error';

// dev default is warn
export function getAtomStrictMode(): AtomStrictMode {
  // 1) Global variable check
  const g = (globalThis as any).__ATOM_STRICT_MODE__;
  if (g === 'off' || g === 'warn' || g === 'error') return g;

  // 2) Env check (generic)
  const env =
    (typeof process !== 'undefined' && (process as any).env && (process as any).env.ATOM_STRICT_MODE) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_ATOM_STRICT_MODE);

  if (env === 'off' || env === 'warn' || env === 'error') return env;

  // 3) Fallback
  return 'warn';
}
