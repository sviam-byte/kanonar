import { describe, it, expect } from 'vitest';
import {
  createGame,
  advanceGame,
  isGameOver,
  findPureNash,
  findParetoOptimal,
  findDominatedStrategies,
  cooperationRate,
  playerHistory,
} from '../../lib/dilemma/engine';
import {
  PRISONERS_DILEMMA,
  STAG_HUNT,
  CHICKEN,
  TRUST_GAME,
} from '../../lib/dilemma/catalog';

describe('engine: createGame', () => {
  it('initializes correctly', () => {
    const game = createGame(PRISONERS_DILEMMA, ['a', 'b'], 5);
    expect(game.specId).toBe('prisoners_dilemma');
    expect(game.players).toEqual(['a', 'b']);
    expect(game.totalRounds).toBe(5);
    expect(game.currentRound).toBe(0);
    expect(game.rounds).toHaveLength(0);
    expect(game.cumulativePayoffs).toEqual({ a: 0, b: 0 });
  });

  it('rejects same player twice', () => {
    expect(() => createGame(PRISONERS_DILEMMA, ['a', 'a'], 1)).toThrow();
  });

  it('rejects zero rounds', () => {
    expect(() => createGame(PRISONERS_DILEMMA, ['a', 'b'], 0)).toThrow();
  });
});

describe('engine: advanceGame', () => {
  it('resolves mutual cooperation in PD', () => {
    const game = createGame(PRISONERS_DILEMMA, ['a', 'b'], 1);
    const next = advanceGame(PRISONERS_DILEMMA, game, { a: 'cooperate', b: 'cooperate' });
    expect(next.rounds).toHaveLength(1);
    expect(next.rounds[0].payoffs).toEqual({ a: 0.7, b: 0.7 });
    expect(next.cumulativePayoffs).toEqual({ a: 0.7, b: 0.7 });
    expect(next.currentRound).toBe(1);
    expect(isGameOver(next)).toBe(true);
  });

  it('resolves asymmetric PD correctly', () => {
    const game = createGame(PRISONERS_DILEMMA, ['a', 'b'], 1);
    const next = advanceGame(PRISONERS_DILEMMA, game, { a: 'cooperate', b: 'defect' });
    expect(next.rounds[0].payoffs).toEqual({ a: 0.0, b: 1.0 });
  });

  it('accumulates payoffs across rounds', () => {
    let game = createGame(PRISONERS_DILEMMA, ['a', 'b'], 3);
    game = advanceGame(PRISONERS_DILEMMA, game, { a: 'cooperate', b: 'cooperate' });
    game = advanceGame(PRISONERS_DILEMMA, game, { a: 'defect', b: 'cooperate' });
    game = advanceGame(PRISONERS_DILEMMA, game, { a: 'defect', b: 'defect' });
    expect(game.cumulativePayoffs.a).toBeCloseTo(2.0);
    expect(game.cumulativePayoffs.b).toBeCloseTo(1.0);
    expect(isGameOver(game)).toBe(true);
  });

  it('throws on game over', () => {
    let game = createGame(PRISONERS_DILEMMA, ['a', 'b'], 1);
    game = advanceGame(PRISONERS_DILEMMA, game, { a: 'cooperate', b: 'cooperate' });
    expect(() => advanceGame(PRISONERS_DILEMMA, game, { a: 'cooperate', b: 'cooperate' })).toThrow();
  });

  it('throws on invalid action', () => {
    const game = createGame(PRISONERS_DILEMMA, ['a', 'b'], 1);
    expect(() => advanceGame(PRISONERS_DILEMMA, game, { a: 'invalid', b: 'cooperate' })).toThrow();
  });
});

describe('engine: findPureNash', () => {
  it('PD: defect/defect is unique Nash', () => {
    const nash = findPureNash(PRISONERS_DILEMMA);
    expect(nash).toEqual([['defect', 'defect']]);
  });

  it('Stag Hunt: two Nash equilibria', () => {
    const nash = findPureNash(STAG_HUNT);
    expect(nash).toHaveLength(2);
    expect(nash).toContainEqual(['stag', 'stag']);
    expect(nash).toContainEqual(['hare', 'hare']);
  });

  it('Chicken: two asymmetric Nash', () => {
    const nash = findPureNash(CHICKEN);
    expect(nash).toHaveLength(2);
    expect(nash).toContainEqual(['hawk', 'dove']);
    expect(nash).toContainEqual(['dove', 'hawk']);
  });

  it('Trust Game: exploit/exploit is unique Nash', () => {
    const nash = findPureNash(TRUST_GAME);
    expect(nash).toEqual([['exploit', 'exploit']]);
  });
});

describe('engine: findParetoOptimal', () => {
  it('PD: mutual cooperation is Pareto optimal', () => {
    const pareto = findParetoOptimal(PRISONERS_DILEMMA);
    expect(pareto).toContainEqual(['cooperate', 'cooperate']);
    const ddInPareto = pareto.some(
      ([a, b]) => a === 'defect' && b === 'defect',
    );
    expect(ddInPareto).toBe(false);
  });

  it('Stag Hunt: stag/stag is Pareto optimal', () => {
    const pareto = findParetoOptimal(STAG_HUNT);
    expect(pareto).toContainEqual(['stag', 'stag']);
  });
});

describe('engine: findDominatedStrategies', () => {
  it('PD: cooperate is dominated', () => {
    expect(findDominatedStrategies(PRISONERS_DILEMMA, 0)).toEqual(['cooperate']);
    expect(findDominatedStrategies(PRISONERS_DILEMMA, 1)).toEqual(['cooperate']);
  });

  it('Stag Hunt: no dominated strategies', () => {
    expect(findDominatedStrategies(STAG_HUNT, 0)).toEqual([]);
  });

  it('Chicken: no dominated strategies', () => {
    expect(findDominatedStrategies(CHICKEN, 0)).toEqual([]);
  });
});

describe('engine: history helpers', () => {
  it('tracks player history', () => {
    let game = createGame(PRISONERS_DILEMMA, ['a', 'b'], 3);
    game = advanceGame(PRISONERS_DILEMMA, game, { a: 'cooperate', b: 'defect' });
    game = advanceGame(PRISONERS_DILEMMA, game, { a: 'defect', b: 'defect' });
    game = advanceGame(PRISONERS_DILEMMA, game, { a: 'cooperate', b: 'cooperate' });
    expect(playerHistory(game, 'a')).toEqual(['cooperate', 'defect', 'cooperate']);
    expect(playerHistory(game, 'b')).toEqual(['defect', 'defect', 'cooperate']);
  });

  it('computes cooperation rate', () => {
    let game = createGame(PRISONERS_DILEMMA, ['a', 'b'], 4);
    game = advanceGame(PRISONERS_DILEMMA, game, { a: 'cooperate', b: 'defect' });
    game = advanceGame(PRISONERS_DILEMMA, game, { a: 'cooperate', b: 'defect' });
    game = advanceGame(PRISONERS_DILEMMA, game, { a: 'cooperate', b: 'cooperate' });
    game = advanceGame(PRISONERS_DILEMMA, game, { a: 'defect', b: 'cooperate' });
    expect(cooperationRate(PRISONERS_DILEMMA, game, 'a')).toBe(0.75);
    expect(cooperationRate(PRISONERS_DILEMMA, game, 'b')).toBe(0.5);
  });

  it('returns 0.5 for empty game', () => {
    const game = createGame(PRISONERS_DILEMMA, ['a', 'b'], 1);
    expect(cooperationRate(PRISONERS_DILEMMA, game, 'a')).toBe(0.5);
  });
});
