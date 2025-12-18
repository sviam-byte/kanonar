
import React from 'react';
import { useSandbox } from '../contexts/SandboxContext';
import { DyadInspector } from '../components/tom/DyadInspector';
import { UniversalLoader } from '../components/UniversalLoader';

export const CharacterLabPage: React.FC = () => {
  const { characters, removeCharacter, reset } = useSandbox();

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
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
