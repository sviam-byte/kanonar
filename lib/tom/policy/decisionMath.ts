// lib/tom/policy/decisionMath.ts

export function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function sigmoid(x: number) {
  // stable sigmoid
  if (!Number.isFinite(x)) return 0.5;
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

export function logit(p: number) {
  const q = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return Math.log(q / (1 - q));
}

export function invLogit(l: number) {
  return sigmoid(l);
}

export function entropy01(p: number) {
  const q = Math.min(1 - 1e-12, Math.max(1e-12, p));
  return -(q * Math.log(q) + (1 - q) * Math.log(1 - q)); // nats
}

export function softmax(xs: number[], tau = 1) {
  // tau: temperature; lower => sharper
  const t = Math.max(1e-6, tau);
  const ys = xs.map(x => x / t);
  const m = Math.max(...ys);
  const exps = ys.map(y => Math.exp(y - m));
  const s = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map(e => e / s);
}
