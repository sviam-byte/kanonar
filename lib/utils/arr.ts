// Safe array helper: returns [] for null/undefined/non-array values.
// Also records a lightweight diagnostic when a truthy non-array is passed.

declare global {
  interface Window {
    __KANONAR_DIAG__?: any[];
  }
}

export function arr<T = any>(x: any): T[] {
  if (Array.isArray(x)) return x as T[];
  if (x) {
    try {
      const buf = window.__KANONAR_DIAG__;
      const b = Array.isArray(buf) ? buf : (window.__KANONAR_DIAG__ = []);
      b.push({
        t: Date.now(),
        kind: 'arr.nonArray',
        type: typeof x,
        ctor: (x as any)?.constructor?.name,
        keys: typeof x === 'object' ? Object.keys(x).slice(0, 12) : null,
      });
      if (b.length > 200) b.splice(0, b.length - 200);
    } catch {}
  }
  return [];
}
