import { Atom } from '../../atoms/types';
import { clamp01 } from '../../math/normalize';

export function atomizeObservation(
  a: { id: string; pos: { x: number; y: number } },
  b: { id: string; pos: { x: number; y: number } },
  env: { visibility: number; crowd: number; noise: number },
  params = { r0: 5, Rs: 8, Rh: 10 },
): Atom[] {
  const dx = a.pos.x - b.pos.x;
  const dy = a.pos.y - b.pos.y;
  const dist = Math.hypot(dx, dy);

  const close = clamp01(1 - dist / params.r0);

  const distSight = clamp01(1 - dist / params.Rs);
  const los = clamp01(
    0.65 * env.visibility +
    0.35 * distSight -
    0.30 * env.crowd,
  );

  const aud = clamp01(
    0.75 * (1 - dist / params.Rh) +
    0.25 * (1 - env.noise),
  );

  const conf = clamp01(
    Math.max(los, aud) * (0.75 + 0.25 * close),
  );

  return [
    {
      id: `obs:nearby:${a.id}:${b.id}`,
      m: close,
      c: conf,
      o: 'obs',
    },
    {
      id: `obs:los:${a.id}:${b.id}`,
      m: los,
      c: conf,
      o: 'obs',
    },
    {
      id: `obs:audio:${a.id}:${b.id}`,
      m: aud,
      c: conf,
      o: 'obs',
    },
  ];
}
