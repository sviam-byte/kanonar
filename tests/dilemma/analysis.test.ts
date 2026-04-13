import { describe, it, expect } from 'vitest';
import { analyzeGame, bestStrategy } from '../../lib/dilemma/analysis';
import { createGame, advanceGame } from '../../lib/dilemma/engine';
import { PRISONERS_DILEMMA } from '../../lib/dilemma/catalog';

function playSequence(
  choices: [string, string][],
): ReturnType<typeof createGame> {
  let game = createGame(PRISONERS_DILEMMA, ['a', 'b'], choices.length);
  for (const [a, b] of choices) {
    game = advanceGame(PRISONERS_DILEMMA, game, { a, b });
  }
  return game;
}

describe('analysis: analyzeGame', () => {
  it('computes cooperation curve', () => {
    const game = playSequence([
      ['cooperate', 'cooperate'],
      ['cooperate', 'defect'],
      ['defect', 'defect'],
    ]);
    const analysis = analyzeGame(PRISONERS_DILEMMA, game);
    expect(analysis.cooperationCurve).toEqual([1.0, 0.5, 0.0]);
  });

  it('computes mutual cooperation / defection rates', () => {
    const game = playSequence([
      ['cooperate', 'cooperate'],
      ['defect', 'defect'],
      ['cooperate', 'defect'],
      ['defect', 'defect'],
    ]);
    const analysis = analyzeGame(PRISONERS_DILEMMA, game);
    expect(analysis.mutualCooperationRate).toBe(0.25);
    expect(analysis.mutualDefectionRate).toBe(0.5);
  });

  it('computes Nash alignment for PD', () => {
    const game = playSequence([
      ['cooperate', 'cooperate'],
      ['defect', 'defect'],
      ['cooperate', 'defect'],
    ]);
    const analysis = analyzeGame(PRISONERS_DILEMMA, game);
    expect(analysis.nashAlignment.a).toBeCloseTo(1 / 3);
  });
});

describe('analysis: strategy matching', () => {
  it('detects always-cooperate', () => {
    const game = playSequence([
      ['cooperate', 'defect'],
      ['cooperate', 'cooperate'],
      ['cooperate', 'defect'],
      ['cooperate', 'cooperate'],
    ]);
    const analysis = analyzeGame(PRISONERS_DILEMMA, game);
    expect(analysis.strategyMatch.a.alwaysCooperate).toBe(1.0);
    expect(analysis.strategyMatch.a.alwaysDefect).toBe(0.0);
  });

  it('detects always-defect', () => {
    const game = playSequence([
      ['defect', 'cooperate'],
      ['defect', 'defect'],
      ['defect', 'cooperate'],
    ]);
    const analysis = analyzeGame(PRISONERS_DILEMMA, game);
    expect(analysis.strategyMatch.a.alwaysDefect).toBe(1.0);
    expect(analysis.strategyMatch.a.alwaysCooperate).toBe(0.0);
  });

  it('detects tit-for-tat', () => {
    const game = playSequence([
      ['cooperate', 'cooperate'],
      ['cooperate', 'defect'],
      ['defect', 'cooperate'],
      ['cooperate', 'defect'],
    ]);
    const analysis = analyzeGame(PRISONERS_DILEMMA, game);
    expect(analysis.strategyMatch.a.titForTat).toBe(1.0);
  });

  it('bestStrategy picks highest match', () => {
    const scores = {
      titForTat: 0.8,
      alwaysCooperate: 0.6,
      alwaysDefect: 0.2,
      pavlov: 0.7,
      grimTrigger: 0.5,
    };
    const best = bestStrategy(scores);
    expect(best.name).toBe('Tit for Tat');
    expect(best.score).toBe(0.8);
  });
});
