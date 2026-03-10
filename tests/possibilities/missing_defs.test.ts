import { describe, it, expect } from 'vitest';
import { derivePossibilitiesRegistry } from '@/lib/possibilities/derive';
import { normalizeAtom } from '@/lib/context/v2/infer';

function atom(id: string, magnitude: number) {
  return normalizeAtom({ id, magnitude, confidence: 1, origin: 'test' } as any);
}

describe('missing possibility definitions are available', () => {
  const selfId = 'a1';
  const otherId = 'a2';

  it('produces deceive/submit/betray for dyadic context', () => {
    const atoms = [
      atom(`rel:state:${selfId}:${otherId}:trust`, 0.7),
      atom(`rel:state:${selfId}:${otherId}:respect`, 0.6),
      atom(`rel:state:${selfId}:${otherId}:hostility`, 0.5),
      atom(`ctx:threat:${selfId}`, 0.4),
      atom(`obs:nearby:${selfId}:${otherId}`, 0.9),
    ];

    const out = derivePossibilitiesRegistry({ selfId, atoms });
    expect(out.some(p => p.id.startsWith(`aff:deceive:${selfId}:${otherId}`))).toBe(true);
    expect(out.some(p => p.id.startsWith(`aff:submit:${selfId}:${otherId}`))).toBe(true);
    expect(out.some(p => p.id.startsWith(`aff:betray:${selfId}:${otherId}`))).toBe(true);
  });

  it('produces loot when scarcity is high and surveillance is low', () => {
    const atoms = [
      atom(`ctx:scarcity:${selfId}`, 0.8),
      atom(`ctx:surveillance:${selfId}`, 0.1),
    ];

    const out = derivePossibilitiesRegistry({ selfId, atoms });
    expect(out.some(p => p.id === `aff:loot:${selfId}`)).toBe(true);
  });
});
