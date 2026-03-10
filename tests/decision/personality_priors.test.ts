import { describe, it, expect } from 'vitest';
import { deriveActionPriors } from '../../lib/decision/actionPriors';
import { normalizeAtom } from '../../lib/context/v2/infer';

function mkAtom(id: string, magnitude: number) {
  return normalizeAtom({ id, magnitude, confidence: 1, origin: 'test' } as any);
}

function findPrior(atoms: any[], selfId: string, otherId: string, act: string) {
  return atoms.find(a => a.id === `act:prior:${selfId}:${otherId}:${act}`);
}

describe('personality-driven action priors', () => {
  const selfId = 'agent1';
  const otherId = 'agent2';

  it('high care trait increases comfort/treat priors', () => {
    const atoms = [
      mkAtom(`feat:char:${selfId}:trait.care`, 0.9),
      mkAtom(`feat:char:${selfId}:trait.powerDrive`, 0.1),
      mkAtom(`rel:state:${selfId}:${otherId}:trust`, 0.7),
      mkAtom(`obs:nearby:${selfId}:${otherId}`, 0.8),
    ];
    const result = deriveActionPriors({ selfId, otherIds: [otherId], atoms });
    const comfort = findPrior(result, selfId, otherId, 'comfort');
    const command = findPrior(result, selfId, otherId, 'command');
    expect(comfort).toBeDefined();
    expect(command).toBeDefined();
    expect(comfort.magnitude).toBeGreaterThan(command.magnitude);
  });

  it('high powerDrive increases command/threaten priors', () => {
    const atoms = [
      mkAtom(`feat:char:${selfId}:trait.care`, 0.1),
      mkAtom(`feat:char:${selfId}:trait.powerDrive`, 0.9),
      mkAtom(`rel:state:${selfId}:${otherId}:trust`, 0.3),
      mkAtom(`obs:nearby:${selfId}:${otherId}`, 0.8),
    ];
    const result = deriveActionPriors({ selfId, otherIds: [otherId], atoms });
    const command = findPrior(result, selfId, otherId, 'command');
    const comfort = findPrior(result, selfId, otherId, 'comfort');
    expect(command).toBeDefined();
    expect(command.magnitude).toBeGreaterThan(comfort.magnitude);
  });
});
