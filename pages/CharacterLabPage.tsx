
import React, { useEffect, useRef, useState } from 'react';
import { useSandbox } from '../contexts/SandboxContext';
import { DyadInspector } from '../components/tom/DyadInspector';
import { UniversalLoader } from '../components/UniversalLoader';
import { SeededRandom } from '../src/utils/SeededRandom';
import { GOAL_DEFS } from '../lib/goals/space';
import { calculateGraphInfluence } from '../lib/goals/goalEcology';

type GoalPreview = {
  id: string;
  name: string;
  debug: {
    base: number;
    graphBonus: number;
    noise: number;
  };
  finalScore: number;
};

export const CharacterLabPage: React.FC = () => {
  const { characters, removeCharacter, reset } = useSandbox();
  // 1. STATE ДЛЯ БОГА (управление хаосом)
  const [seedInput, setSeedInput] = useState<string>('test-seed-123');
  const [temperature, setTemperature] = useState<number>(1.0);
  const [manualCycle, setManualCycle] = useState(0); // Триггер ререндера

  // 2. Состояние агента (симуляция выбора целей)
  const [goals, setGoals] = useState<GoalPreview[]>([]);
  const activeGoalIdsRef = useRef<string[]>([]);

  useEffect(() => {
    // Создаем свежий RNG на каждый чих, чтобы видеть детерминизм.
    const rng = new SeededRandom(`${seedInput}-${manualCycle}`);
    const activeGoalIds = activeGoalIdsRef.current;

    const simulatedGoals = Object.values(GOAL_DEFS)
      .map((def) => {
        const base = Number(def.leaderBias ?? 0);
        const noise = rng.nextGumbel(temperature);
        const graphBonus = calculateGraphInfluence(def.id, activeGoalIds);

        return {
          id: def.id,
          name: def.label_ru ?? def.id,
          debug: { base, noise, graphBonus },
          finalScore: base + noise + graphBonus,
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore);

    // Запоминаем топ целей как контекст для следующего тика.
    activeGoalIdsRef.current = simulatedGoals.slice(0, 3).map((goal) => goal.id);
    setGoals(simulatedGoals);
  }, [seedInput, temperature, manualCycle]);

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      <section className="bg-canon-bg-light border border-canon-border rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap gap-4 items-end justify-between">
          <div>
            <h2 className="text-lg font-bold text-canon-text">Goal Lab / Character Lab</h2>
            <p className="text-xs text-canon-text-light">
              Пульт управления реальностью: сид, температура хаоса и пересчет скоринга.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 items-end">
            {/* КОНТРОЛЛЕР СИДА */}
            <label className="text-xs text-canon-text-light">
              <span className="block mb-1">Simulation Seed</span>
              <input
                className="bg-canon-bg border border-canon-border px-2 py-1 rounded font-mono text-canon-accent w-48"
                value={seedInput}
                onChange={(event) => setSeedInput(event.target.value)}
              />
            </label>

            {/* КОНТРОЛЛЕР ТЕМПЕРАТУРЫ */}
            <label className="text-xs text-canon-text-light">
              <span className="block mb-1">Chaos (Temp): {temperature.toFixed(1)}</span>
              <input
                type="range"
                min="0.1"
                max="5.0"
                step="0.1"
                value={temperature}
                onChange={(event) => setTemperature(parseFloat(event.target.value))}
                className="w-32"
              />
            </label>

            <button
              onClick={() => setManualCycle((cycle) => cycle + 1)}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-2 rounded"
            >
              🎲 Reroll (Next Tick)
            </button>
          </div>
        </div>

        {/* Визуализация "почему он это выбрал" */}
        <div className="grid gap-2">
          {goals.map((goal, index) => (
            <div
              key={goal.id}
              className={`flex flex-wrap items-center gap-2 p-2 rounded border ${
                index === 0
                  ? 'bg-green-900/40 border-green-500'
                  : 'bg-canon-bg border-canon-border'
              }`}
            >
              <div className="w-10 font-mono text-canon-text-light">#{index + 1}</div>
              <div className="min-w-[140px] font-bold text-canon-text">{goal.name}</div>
              <div className="flex flex-wrap gap-1 text-[11px] font-mono">
                <span className="text-blue-400" title="Base Utility">
                  Base: {goal.debug.base.toFixed(2)}
                </span>
                <span className="text-canon-text-light">+</span>
                <span className="text-purple-400" title="Graph Synergy/Inhibition">
                  Graph: {goal.debug.graphBonus.toFixed(2)}
                </span>
                <span className="text-canon-text-light">+</span>
                <span
                  className={goal.debug.noise >= 0 ? 'text-green-400' : 'text-red-400'}
                  title="Random Noise"
                >
                  RNG: {goal.debug.noise.toFixed(2)}
                </span>
                <span className="text-canon-text-light">=</span>
                <span className="text-yellow-400 text-sm font-bold ml-1">
                  {goal.finalScore.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <header className="space-y-2">
        <div className="flex justify-between items-start">
            <div>
                <h1 className="text-2xl font-bold text-canon-text">
                Лаборатория / Инспектор Отношений
                </h1>
                <p className="text-sm text-canon-text-light">
                Песочница для настройки Теории Разума (ToM). Персонажи и сцены, добавленные здесь, сохраняются в сессии браузера.
                </p>
            </div>
            <button 
                onClick={reset}
                className="text-xs text-red-400 hover:text-red-300 border border-red-900 px-2 py-1 rounded transition-colors"
            >
                Очистить сессию
            </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Cast Management */}
          <div className="lg:col-span-1 space-y-4">
              
              {/* Universal Loader */}
              <UniversalLoader />

              {/* List */}
              <div className="bg-canon-bg-light border border-canon-border rounded-lg p-4">
                  <h3 className="text-sm font-bold text-canon-text mb-3">Каст сессии ({characters.length})</h3>
                  {characters.length === 0 ? (
                      <p className="text-xs text-canon-text-light italic">Список пуст. Добавьте персонажей или сцены через импорт.</p>
                  ) : (
                      <ul className="space-y-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                          {characters.map(ch => (
                              <li key={ch.entityId} className="flex justify-between items-center bg-canon-bg p-2 rounded border border-canon-border/50 group">
                                  <div className="overflow-hidden">
                                      <div className="text-xs font-bold text-canon-text truncate">{ch.title}</div>
                                      <div className="text-[10px] text-canon-text-light truncate opacity-70 group-hover:opacity-100">{ch.entityId}</div>
                                  </div>
                                  <button
                                    onClick={() => removeCharacter(ch.entityId)}
                                    className="text-canon-text-light hover:text-red-400 px-2 text-lg leading-none"
                                    title="Удалить"
                                  >
                                      ×
                                  </button>
                              </li>
                          ))}
                      </ul>
                  )}
              </div>
          </div>

          {/* Right Column: Inspector */}
          <div className="lg:col-span-2">
            {characters.length < 2 ? (
                <div className="h-full flex items-center justify-center bg-canon-bg-light border border-canon-border rounded-lg p-8 text-canon-text-light text-sm text-center flex-col gap-4">
                    <div className="text-4xl opacity-30">🎭</div>
                    <p>Добавьте как минимум двух персонажей в сессию, чтобы начать анализ отношений.</p>
                </div>
            ) : (
                <DyadInspector characters={characters} />
            )}
          </div>
      </div>
    </div>
  );
};
