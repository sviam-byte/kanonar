import React, { useMemo, useState } from 'react';
import { CATALOG, getSpec } from '../lib/dilemma/catalog';
import { advanceGame, createGame, isGameOver } from '../lib/dilemma/engine';
import { analyzeGame, bestStrategy } from '../lib/dilemma/analysis';
import type { DilemmaGameState } from '../lib/dilemma/types';

/**
 * Простая интерактивная UI-песочница для DilemmaLab.
 *
 * Важно: это intentionally light UI, чтобы быстро смотреть поведение
 * и аналитику без подключения полного world/pipeline runner.
 */
export const DilemmaLabPage: React.FC = () => {
  const specIds = useMemo(() => Object.keys(CATALOG), []);
  const [specId, setSpecId] = useState<string>(specIds[0] ?? 'prisoners_dilemma');
  const [totalRounds, setTotalRounds] = useState<number>(5);
  const [p0, setP0] = useState<string>('agent:a');
  const [p1, setP1] = useState<string>('agent:b');
  const [game, setGame] = useState<DilemmaGameState | null>(null);
  const spec = getSpec(specId);

  const startGame = () => {
    try {
      const init = createGame(spec, [p0.trim(), p1.trim()], Math.max(1, Math.floor(totalRounds)));
      setGame(init);
    } catch (e) {
      console.error('[DilemmaLab] createGame failed', e);
    }
  };

  const resetGame = () => setGame(null);

  const playRound = (a0: string, a1: string) => {
    if (!game || isGameOver(game)) return;
    try {
      const next = advanceGame(spec, game, {
        [game.players[0]]: a0,
        [game.players[1]]: a1,
      });
      setGame(next);
    } catch (e) {
      console.error('[DilemmaLab] advanceGame failed', e);
    }
  };

  const analysis = game ? analyzeGame(spec, game) : null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
        <h1 className="text-xl font-bold text-canon-text">Dilemma Lab (MVP UI)</h1>
        <p className="text-xs text-canon-text-light mt-1">
          Мини-интерфейс для формальных дилемм: запускай раунды и смотри аналитику.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <label className="text-xs text-canon-text-light">
            Dilemma
            <select
              value={specId}
              onChange={(e) => setSpecId(e.target.value)}
              className="w-full mt-1 bg-canon-bg border border-canon-border rounded p-2 text-sm"
            >
              {specIds.map((id) => (
                <option key={id} value={id}>{CATALOG[id].name}</option>
              ))}
            </select>
          </label>

          <label className="text-xs text-canon-text-light">
            Player A
            <input
              value={p0}
              onChange={(e) => setP0(e.target.value)}
              className="w-full mt-1 bg-canon-bg border border-canon-border rounded p-2 text-sm"
            />
          </label>

          <label className="text-xs text-canon-text-light">
            Player B
            <input
              value={p1}
              onChange={(e) => setP1(e.target.value)}
              className="w-full mt-1 bg-canon-bg border border-canon-border rounded p-2 text-sm"
            />
          </label>

          <label className="text-xs text-canon-text-light">
            Rounds
            <input
              type="number"
              min={1}
              max={50}
              value={totalRounds}
              onChange={(e) => setTotalRounds(Number(e.target.value))}
              className="w-full mt-1 bg-canon-bg border border-canon-border rounded p-2 text-sm"
            />
          </label>
        </div>

        <div className="flex gap-2 mt-4">
          <button className="px-3 py-2 rounded bg-canon-accent text-canon-bg text-sm font-bold" onClick={startGame}>
            Start
          </button>
          <button className="px-3 py-2 rounded bg-canon-bg border border-canon-border text-sm" onClick={resetGame}>
            Reset
          </button>
        </div>
      </div>

      {game && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 bg-canon-bg-light border border-canon-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-canon-text">Round {game.currentRound + 1} / {game.totalRounds}</h2>
              <div className="text-xs text-canon-text-light">{spec.name}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              {spec.actions.map((a0Act) => (
                spec.actions.map((a1Act) => (
                  <button
                    key={`${a0Act.id}-${a1Act.id}`}
                    className="text-left p-3 rounded border border-canon-border bg-canon-bg hover:border-canon-accent"
                    onClick={() => playRound(a0Act.id, a1Act.id)}
                    disabled={isGameOver(game)}
                  >
                    <div className="text-sm font-semibold text-canon-text">
                      {game.players[0]}: {a0Act.label}
                    </div>
                    <div className="text-sm font-semibold text-canon-text">
                      {game.players[1]}: {a1Act.label}
                    </div>
                    <div className="text-xs text-canon-text-light mt-1">
                      payoff: {spec.payoffs[a0Act.id][a1Act.id][0].toFixed(2)} / {spec.payoffs[a0Act.id][a1Act.id][1].toFixed(2)}
                    </div>
                  </button>
                ))
              ))}
            </div>

            <div className="mt-4">
              <h3 className="font-bold text-sm mb-2">History</h3>
              <div className="max-h-72 overflow-auto space-y-2">
                {game.rounds.map((r) => (
                  <div key={r.index} className="text-xs bg-canon-bg border border-canon-border rounded p-2">
                    <div>R{r.index + 1}: {game.players[0]} → {r.choices[game.players[0]]}, {game.players[1]} → {r.choices[game.players[1]]}</div>
                    <div className="text-canon-text-light">payoff: {r.payoffs[game.players[0]].toFixed(2)} / {r.payoffs[game.players[1]].toFixed(2)}</div>
                  </div>
                ))}
                {game.rounds.length === 0 && <div className="text-xs text-canon-text-light italic">No rounds yet.</div>}
              </div>
            </div>
          </div>

          <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4 space-y-3">
            <h2 className="font-bold text-canon-text">Analysis</h2>
            {analysis && (
              <>
                <div className="text-xs">Cooperation curve: <span className="font-mono">[{analysis.cooperationCurve.map((v) => v.toFixed(2)).join(', ')}]</span></div>
                <div className="text-xs">Mutual coop rate: <span className="font-mono">{analysis.mutualCooperationRate.toFixed(2)}</span></div>
                <div className="text-xs">Mutual defect rate: <span className="font-mono">{analysis.mutualDefectionRate.toFixed(2)}</span></div>
                <div className="text-xs">Nash alignment A/B: <span className="font-mono">{analysis.nashAlignment[game.players[0]]?.toFixed(2)} / {analysis.nashAlignment[game.players[1]]?.toFixed(2)}</span></div>
                <div className="text-xs">Total payoff A/B: <span className="font-mono">{analysis.totalPayoffs[game.players[0]]?.toFixed(2)} / {analysis.totalPayoffs[game.players[1]]?.toFixed(2)}</span></div>

                <div className="pt-2 border-t border-canon-border">
                  <div className="text-xs font-semibold">Best strategy match</div>
                  <div className="text-xs text-canon-text-light">{game.players[0]}: {bestStrategy(analysis.strategyMatch[game.players[0]]).name} ({bestStrategy(analysis.strategyMatch[game.players[0]]).score.toFixed(2)})</div>
                  <div className="text-xs text-canon-text-light">{game.players[1]}: {bestStrategy(analysis.strategyMatch[game.players[1]]).name} ({bestStrategy(analysis.strategyMatch[game.players[1]]).score.toFixed(2)})</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DilemmaLabPage;
