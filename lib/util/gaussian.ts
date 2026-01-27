
import { RNG, getGlobalRunSeed, hashString32 } from '../core/noise';

const _defaultRng = new RNG((getGlobalRunSeed() ^ hashString32('gaussian')) >>> 0);

export function gaussian(rng?: RNG): number {
  // Box–Muller transform, без Math.random
  const r = rng ?? _defaultRng;
  let u = 0, v = 0;
  while (u === 0) u = r.nextFloat();
  while (v === 0) v = r.nextFloat();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function gaussianN(n: number, rng?: RNG): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(gaussian(rng));
  return out;
}
