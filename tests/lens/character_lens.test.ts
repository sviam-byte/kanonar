import { describe, expect, it } from 'vitest';
import { applyCharacterLens } from '@/lib/context/lens/characterLens';
import type { ContextAtom } from '@/lib/context/v2/types';

function mkAtom(id: string, magnitude: number): ContextAtom {
  const ns = id.split(':')[0] as any;
  return {
    id,
    ns,
    kind: 'scalar' as any,
    source: { origin: 'world' } as any,
    magnitude,
    confidence: 1,
  } as any;
}

describe('CharacterLens: personality modulation', () => {
  it('high paranoia increases perceived danger (even when danger is low)', () => {
    const atoms: ContextAtom[] = [
      mkAtom('ctx:danger:A', 0.3),
      mkAtom('feat:char:A:trait.paranoia', 0.9),
      mkAtom('feat:char:A:trait.sensitivity', 0.5),
      mkAtom('feat:char:A:trait.experience', 0.5),
      mkAtom('feat:char:A:trait.ambiguityTolerance', 0.5),
      mkAtom('feat:char:A:trait.hpaReactivity', 0.5),
      mkAtom('feat:char:A:trait.normSensitivity', 0.5),
      mkAtom('feat:char:A:body.stress', 0.3),
      mkAtom('feat:char:A:body.fatigue', 0.3),
    ];

    const result = applyCharacterLens({ selfId: 'A', atoms });
    const finalDanger = result.atoms.find(a => (a as any).id === 'ctx:final:danger:A') as any;

    expect(finalDanger).toBeDefined();
    expect(finalDanger.magnitude).toBeGreaterThan(0.3);
  });

  it('low paranoia decreases perceived danger (when danger is high)', () => {
    const atoms: ContextAtom[] = [
      mkAtom('ctx:danger:A', 0.7),
      mkAtom('feat:char:A:trait.paranoia', 0.1),
      mkAtom('feat:char:A:trait.sensitivity', 0.5),
      mkAtom('feat:char:A:trait.experience', 0.5),
      mkAtom('feat:char:A:trait.ambiguityTolerance', 0.5),
      mkAtom('feat:char:A:trait.hpaReactivity', 0.5),
      mkAtom('feat:char:A:trait.normSensitivity', 0.5),
      mkAtom('feat:char:A:body.stress', 0.3),
      mkAtom('feat:char:A:body.fatigue', 0.3),
    ];

    const result = applyCharacterLens({ selfId: 'A', atoms });
    const finalDanger = result.atoms.find(a => (a as any).id === 'ctx:final:danger:A') as any;

    expect(finalDanger).toBeDefined();
    expect(finalDanger.magnitude).toBeLessThan(0.7);
  });

  it('paranoia should shift perception even at danger=0', () => {
    const atoms: ContextAtom[] = [
      mkAtom('ctx:danger:A', 0.0),
      mkAtom('feat:char:A:trait.paranoia', 0.9),
      mkAtom('feat:char:A:trait.sensitivity', 0.5),
      mkAtom('feat:char:A:trait.experience', 0.5),
      mkAtom('feat:char:A:trait.ambiguityTolerance', 0.5),
      mkAtom('feat:char:A:trait.hpaReactivity', 0.5),
      mkAtom('feat:char:A:trait.normSensitivity', 0.5),
      mkAtom('feat:char:A:body.stress', 0.3),
      mkAtom('feat:char:A:body.fatigue', 0.3),
    ];

    const result = applyCharacterLens({ selfId: 'A', atoms });
    const finalDanger = result.atoms.find(a => (a as any).id === 'ctx:final:danger:A') as any;

    expect(finalDanger).toBeDefined();
    expect(finalDanger.magnitude).toBeGreaterThan(0.1);
  });

  it('neutral traits (all=0.5) should not change perception', () => {
    const atoms: ContextAtom[] = [
      mkAtom('ctx:danger:A', 0.6),
      mkAtom('feat:char:A:trait.paranoia', 0.5),
      mkAtom('feat:char:A:trait.sensitivity', 0.5),
      mkAtom('feat:char:A:trait.experience', 0.5),
      mkAtom('feat:char:A:trait.ambiguityTolerance', 0.5),
      mkAtom('feat:char:A:trait.hpaReactivity', 0.5),
      mkAtom('feat:char:A:trait.normSensitivity', 0.5),
      mkAtom('feat:char:A:body.stress', 0.5),
      mkAtom('feat:char:A:body.fatigue', 0.5),
    ];

    const result = applyCharacterLens({ selfId: 'A', atoms });
    const finalDanger = result.atoms.find(a => (a as any).id === 'ctx:final:danger:A') as any;

    expect(finalDanger).toBeDefined();
    expect(finalDanger.magnitude).toBeCloseTo(0.6, 1);
  });

  it('different agents see different danger', () => {
    const baseDanger = 0.5;

    const atomsA: ContextAtom[] = [
      mkAtom('ctx:danger:A', baseDanger),
      mkAtom('feat:char:A:trait.paranoia', 0.9),
      mkAtom('feat:char:A:trait.sensitivity', 0.5),
      mkAtom('feat:char:A:trait.experience', 0.2),
      mkAtom('feat:char:A:trait.ambiguityTolerance', 0.5),
      mkAtom('feat:char:A:trait.hpaReactivity', 0.5),
      mkAtom('feat:char:A:trait.normSensitivity', 0.5),
      mkAtom('feat:char:A:body.stress', 0.6),
      mkAtom('feat:char:A:body.fatigue', 0.3),
    ];

    const atomsB: ContextAtom[] = [
      mkAtom('ctx:danger:B', baseDanger),
      mkAtom('feat:char:B:trait.paranoia', 0.1),
      mkAtom('feat:char:B:trait.sensitivity', 0.5),
      mkAtom('feat:char:B:trait.experience', 0.8),
      mkAtom('feat:char:B:trait.ambiguityTolerance', 0.5),
      mkAtom('feat:char:B:trait.hpaReactivity', 0.5),
      mkAtom('feat:char:B:trait.normSensitivity', 0.5),
      mkAtom('feat:char:B:body.stress', 0.2),
      mkAtom('feat:char:B:body.fatigue', 0.1),
    ];

    const resultA = applyCharacterLens({ selfId: 'A', atoms: atomsA });
    const resultB = applyCharacterLens({ selfId: 'B', atoms: atomsB });

    const dangerA = (resultA.atoms.find(a => (a as any).id === 'ctx:final:danger:A') as any)?.magnitude;
    const dangerB = (resultB.atoms.find(a => (a as any).id === 'ctx:final:danger:B') as any)?.magnitude;

    expect(dangerA).toBeGreaterThan(dangerB);
    expect(Math.abs(dangerA - dangerB)).toBeGreaterThan(0.2);
  });
});
