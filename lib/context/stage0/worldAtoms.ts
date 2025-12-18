import { Atom } from '../../atoms/types';
import { clamp01 } from '../../math/normalize';

export function atomizeWorldLocation(
  agentId: string,
  loc: any,
  mapMetrics: { cover: number; danger: number; escape: number },
): Atom[] {
  return [
    {
      id: `world:loc:privacy:${agentId}`,
      m: clamp01(loc.privacy ?? 0),
      c: 1,
      o: 'world',
    },
    {
      id: `world:loc:control:${agentId}`,
      m: clamp01(loc.control ?? 0),
      c: 1,
      o: 'world',
    },
    {
      id: `world:loc:crowd:${agentId}`,
      m: clamp01(loc.crowd ?? 0),
      c: 1,
      o: 'world',
    },
    {
      id: `world:map:cover:${agentId}`,
      m: clamp01(mapMetrics.cover),
      c: 1,
      o: 'world',
    },
    {
      id: `world:map:danger:${agentId}`,
      m: clamp01(mapMetrics.danger),
      c: 1,
      o: 'world',
    },
    {
      id: `world:map:escape:${agentId}`,
      m: clamp01(mapMetrics.escape),
      c: 1,
      o: 'world',
    },
  ];
}
