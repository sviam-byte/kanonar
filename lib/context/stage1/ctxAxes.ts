import { Atom } from '../../atoms/types';
import { getM, used } from '../../atoms/read';
import { clamp01, linMix } from '../../math/normalize';

export function deriveCtxAxes(agentId: string, resolved: Map<string, Atom>): Atom[] {
  const id_priv = `world:loc:privacy:${agentId}`;
  const id_ctrl = `world:loc:control_level:${agentId}`;
  const id_crowd = `world:loc:crowd:${agentId}`;
  const id_mapDanger = `world:map:danger:${agentId}`;
  const id_envHaz = `world:env:hazard:${agentId}`;
  const id_escape = `world:map:escape:${agentId}`;
  const id_cover = `world:map:cover:${agentId}`;
  const id_infoAdeq = `obs:infoAdequacy:${agentId}`;

  const privacy = clamp01(getM(resolved, id_priv, 0));
  const publicness = clamp01(1 - privacy);
  const control = clamp01(getM(resolved, id_ctrl, 0));
  const crowd = clamp01(getM(resolved, id_crowd, 0));
  const infoAdeq = clamp01(getM(resolved, id_infoAdeq, 0.5));
  const uncertainty = clamp01(1 - infoAdeq);

  const dangerRaw = clamp01(
    Math.max(
      getM(resolved, id_mapDanger, 0),
      getM(resolved, id_envHaz, 0),
    ),
  );
  const escape = clamp01(getM(resolved, id_escape, 0.5));
  const cover = clamp01(getM(resolved, id_cover, 0));

  const survMix = linMix([
    { name: 'control', value: control, weight: 0.75 },
    { name: 'publicness', value: publicness, weight: 0.25 },
  ]);
  const surveillance = survMix.value;

  const dangerMix = linMix([
    { name: 'dangerRaw', value: dangerRaw, weight: 0.65 },
    { name: 'noEscape', value: (1 - escape), weight: 0.20 },
    { name: 'noCover', value: (1 - cover), weight: 0.15 },
  ]);
  const danger = dangerMix.value;

  return [
    {
      id: `ctx:privacy:${agentId}`,
      m: privacy,
      c: 1,
      o: 'derived',
      meta: {
        trace: {
          usedAtomIds: used(id_priv),
          parts: [{ name: 'world:loc:privacy', value: privacy }],
          formulaId: 'ctx:privacy@v1',
        },
      },
    },
    {
      id: `ctx:publicness:${agentId}`,
      m: publicness,
      c: 1,
      o: 'derived',
      meta: {
        trace: {
          usedAtomIds: used(id_priv),
          parts: [{ name: '1-privacy', value: publicness }],
          formulaId: 'ctx:publicness@v1',
        },
      },
    },
    {
      id: `ctx:surveillance:${agentId}`,
      m: surveillance,
      c: 1,
      o: 'derived',
      meta: {
        trace: {
          usedAtomIds: used(id_ctrl, `ctx:publicness:${agentId}`),
          parts: survMix.parts.map(p => ({ name: p.name ?? 'part', value: p.value, weight: p.weight })),
          formulaId: 'ctx:surveillance@v1',
        },
      },
    },
    {
      id: `ctx:crowd:${agentId}`,
      m: crowd,
      c: 1,
      o: 'derived',
      meta: {
        trace: {
          usedAtomIds: used(id_crowd),
          parts: [{ name: 'world:loc:crowd', value: crowd }],
          formulaId: 'ctx:crowd@v1',
        },
      },
    },
    {
      id: `ctx:uncertainty:${agentId}`,
      m: uncertainty,
      c: 1,
      o: 'derived',
      meta: {
        trace: {
          usedAtomIds: used(id_infoAdeq),
          parts: [
            { name: 'infoAdequacy', value: infoAdeq },
            { name: '1-infoAdequacy', value: uncertainty },
          ],
          formulaId: 'ctx:uncertainty@v1',
        },
      },
    },
    {
      id: `ctx:danger:${agentId}`,
      m: danger,
      c: 1,
      o: 'derived',
      meta: {
        trace: {
          usedAtomIds: used(id_mapDanger, id_envHaz, id_escape, id_cover),
          parts: dangerMix.parts.map(p => ({ name: p.name ?? 'part', value: p.value, weight: p.weight })),
          formulaId: 'ctx:danger@v1',
        },
      },
    },
  ];
}
