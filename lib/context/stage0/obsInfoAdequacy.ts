import { Atom } from '../../atoms/types';
import { clamp01 } from '../../math/normalize';

export function atomizeInfoAdequacy(
  agentId: string,
  env: { visibility: number; noise: number; crowd: number },
  socialSamples: { los: number; aud: number }[],
): Atom {
  const v = clamp01(env.visibility);
  const n = clamp01(env.noise);
  const q = clamp01(env.crowd);
  const envQ = clamp01(0.55 * v + 0.25 * (1 - n) + 0.20 * (1 - q));
  const socQ = socialSamples.length
    ? clamp01(
        socialSamples.reduce((s, x) => s + (0.6 * x.los + 0.4 * x.aud), 0) /
        socialSamples.length,
      )
    : envQ;
  const infoAdeq = clamp01(0.7 * envQ + 0.3 * socQ);

  return {
    id: `obs:infoAdequacy:${agentId}`,
    m: infoAdeq,
    c: 1,
    o: 'obs',
    meta: {
      trace: {
        usedAtomIds: [],
        parts: [
          { name: 'envQ', value: envQ, weight: 0.7 },
          { name: 'socQ', value: socQ, weight: 0.3 },
        ],
        formulaId: 'obs:infoAdequacy@v1',
      },
    },
  };
}
