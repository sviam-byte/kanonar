import { describe, it, expect } from 'vitest';
import { atomizeDilemma, buildDilemmaPossibilities, extractDilemmaActionId } from '../../lib/dilemma/bridge';
import { createGame, advanceGame } from '../../lib/dilemma/engine';
import { PRISONERS_DILEMMA, STAG_HUNT, CHICKEN } from '../../lib/dilemma/catalog';
import type { ContextAtom } from '../../lib/goal-lab/types';

function makeTrait(selfId: string, trait: string, value: number): ContextAtom {
  return {
    id: `feat:char:${selfId}:trait.${trait}`,
    kind: 'fact',
    source: 'character_lens',
    magnitude: value,
    ns: 'feat',
    confidence: 1.0,
  };
}

function makeAgentAtoms(selfId: string, traits: Record<string, number>): ContextAtom[] {
  return Object.entries(traits).map(([k, v]) => makeTrait(selfId, k, v));
}

describe('bridge: atomizeDilemma', () => {
  it('produces atoms without game history', () => {
    const game = createGame(PRISONERS_DILEMMA, ['a', 'b'], 5);
    const agentAtoms = makeAgentAtoms('a', { safety: 0.5, care: 0.5 });
    const atoms = atomizeDilemma({
      spec: PRISONERS_DILEMMA,
      game,
      selfId: 'a',
      otherId: 'b',
      agentAtoms,
      tick: 0,
    });

    expect(atoms.some((a) => a.id === 'feat:char:a:trait.safety')).toBe(true);
    expect(atoms.some((a) => a.id === 'feat:char:a:trait.care')).toBe(true);

    const threat = atoms.find((a) => a.id === 'threat:final:a');
    expect(threat).toBeDefined();
    expect(threat?.magnitude).toBeLessThan(0.3);

    expect(atoms.some((a) => a.id === 'dilemma:active:a')).toBe(true);

    const trust = atoms.find((a) => a.id === 'rel:state:a:b:trust');
    expect(trust).toBeUndefined();
  });

  it('includes trust and history atoms after rounds', () => {
    let game = createGame(PRISONERS_DILEMMA, ['a', 'b'], 5);
    game = advanceGame(PRISONERS_DILEMMA, game, { a: 'cooperate', b: 'defect' });
    game = advanceGame(PRISONERS_DILEMMA, game, { a: 'cooperate', b: 'cooperate' });

    const atoms = atomizeDilemma({
      spec: PRISONERS_DILEMMA,
      game,
      selfId: 'a',
      otherId: 'b',
      agentAtoms: [],
      tick: 2,
    });

    const trust = atoms.find((a) => a.id === 'rel:state:a:b:trust');
    expect(trust).toBeDefined();
    expect(trust?.magnitude).toBeCloseTo(0.5);

    const help = atoms.find((a) => a.id === 'soc:recentHelpBy:b:a');
    expect(help).toBeDefined();
    expect(help?.magnitude).toBeGreaterThan(0.5);

    const harm = atoms.find((a) => a.id === 'soc:recentHarmBy:b:a');
    expect(harm).toBeDefined();
    expect(harm?.magnitude).toBeCloseTo(0.0);
  });

  it('includes uncertainty atoms for iterated games', () => {
    const game = createGame(PRISONERS_DILEMMA, ['a', 'b'], 10);
    const atoms = atomizeDilemma({
      spec: PRISONERS_DILEMMA,
      game,
      selfId: 'a',
      otherId: 'b',
      agentAtoms: [],
      tick: 0,
    });
    const uncertainty = atoms.find((a) => a.id === 'ctx:uncertainty:a');
    expect(uncertainty).toBeDefined();
  });

  it('deduplicates by id (dilemma atoms override agent atoms)', () => {
    let game = createGame(PRISONERS_DILEMMA, ['a', 'b'], 5);
    game = advanceGame(PRISONERS_DILEMMA, game, { a: 'cooperate', b: 'defect' });

    const agentAtoms: ContextAtom[] = [{
      id: 'rel:state:a:b:trust',
      kind: 'fact',
      source: 'tom',
      magnitude: 0.9,
      ns: 'tom',
      confidence: 1.0,
    }];

    const atoms = atomizeDilemma({
      spec: PRISONERS_DILEMMA,
      game,
      selfId: 'a',
      otherId: 'b',
      agentAtoms,
      tick: 1,
    });

    const trust = atoms.find((a) => a.id === 'rel:state:a:b:trust');
    expect(trust?.magnitude).toBeCloseTo(0.0);
  });
});

describe('bridge: buildDilemmaPossibilities', () => {
  it('creates one possibility per action', () => {
    const poss = buildDilemmaPossibilities({
      spec: PRISONERS_DILEMMA,
      selfId: 'a',
      otherId: 'b',
      atoms: [],
    });
    expect(poss).toHaveLength(2);
  });

  it('uses correct id prefixes for PD', () => {
    const poss = buildDilemmaPossibilities({
      spec: PRISONERS_DILEMMA,
      selfId: 'a',
      otherId: 'b',
      atoms: [],
    });
    const cooperate = poss.find((p) => (p.meta as { dilemmaActionId?: string } | undefined)?.dilemmaActionId === 'cooperate');
    const defect = poss.find((p) => (p.meta as { dilemmaActionId?: string } | undefined)?.dilemmaActionId === 'defect');

    expect(cooperate).toBeDefined();
    expect(defect).toBeDefined();

    expect(cooperate?.id).toMatch(/^off:help/);
    expect(cooperate?.kind).toBe('off');

    expect(defect?.id).toMatch(/^aff:confront/);
    expect(defect?.kind).toBe('aff');
  });

  it('uses correct id prefixes for Stag Hunt', () => {
    const poss = buildDilemmaPossibilities({
      spec: STAG_HUNT,
      selfId: 'a',
      otherId: 'b',
      atoms: [],
    });
    const stag = poss.find((p) => (p.meta as { dilemmaActionId?: string } | undefined)?.dilemmaActionId === 'stag');
    const hare = poss.find((p) => (p.meta as { dilemmaActionId?: string } | undefined)?.dilemmaActionId === 'hare');

    expect(stag?.id).toMatch(/^off:help/);
    expect(hare?.id).toMatch(/^cog:wait/);
  });

  it('uses correct id prefixes for Chicken', () => {
    const poss = buildDilemmaPossibilities({
      spec: CHICKEN,
      selfId: 'a',
      otherId: 'b',
      atoms: [],
    });
    const hawk = poss.find((p) => (p.meta as { dilemmaActionId?: string } | undefined)?.dilemmaActionId === 'hawk');
    const dove = poss.find((p) => (p.meta as { dilemmaActionId?: string } | undefined)?.dilemmaActionId === 'dove');

    expect(hawk?.id).toMatch(/^aff:attack/);
    expect(dove?.id).toMatch(/^aff:hide/);
  });

  it('sets targetId to opponent', () => {
    const poss = buildDilemmaPossibilities({
      spec: PRISONERS_DILEMMA,
      selfId: 'a',
      otherId: 'b',
      atoms: [],
    });
    for (const p of poss) {
      expect(p.targetId).toBe('b');
    }
  });
});

describe('bridge: extractDilemmaActionId', () => {
  it('extracts action id from chosen possibility', () => {
    const poss = buildDilemmaPossibilities({
      spec: PRISONERS_DILEMMA,
      selfId: 'a',
      otherId: 'b',
      atoms: [],
    });
    const coopPoss = poss.find((p) => (p.meta as { dilemmaActionId?: string } | undefined)?.dilemmaActionId === 'cooperate');
    expect(extractDilemmaActionId(coopPoss?.id ?? '', poss)).toBe('cooperate');
  });

  it('returns null for unknown id', () => {
    const poss = buildDilemmaPossibilities({
      spec: PRISONERS_DILEMMA,
      selfId: 'a',
      otherId: 'b',
      atoms: [],
    });
    expect(extractDilemmaActionId('nonexistent', poss)).toBeNull();
  });
});
