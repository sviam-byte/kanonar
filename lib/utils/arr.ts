// Safe array helper: returns [] for null/undefined/non-array values.
// Also records a lightweight diagnostic when a truthy non-array is passed.

declare global {
  // Store small diagnostics in a global ring buffer (browser or Node).
  // eslint-disable-next-line no-var
  var __KANONAR_DIAG__: any[] | undefined;
}

function diagPush(payload: any) {
  try {
    const g: any = globalThis as any;
    const buf = g.__KANONAR_DIAG__;
    const b = Array.isArray(buf) ? buf : (g.__KANONAR_DIAG__ = []);
    b.push(payload);
    if (b.length > 200) b.splice(0, b.length - 200);
  } catch {}
}

export function arr<T = any>(x: any): T[] {
  if (Array.isArray(x)) return x as T[];
  if (x) {
    diagPush({
      t: Date.now(),
      kind: 'arr.nonArray',
      type: typeof x,
      ctor: (x as any)?.constructor?.name,
      keys: typeof x === 'object' ? Object.keys(x).slice(0, 24) : null,
    });
  }
  return [];
}
