
import React, { useState, FormEvent } from 'react';
import { resolveAccessModuleByCode } from '../data/access-modules';
import { useAccess } from '../contexts/AccessContext';
import { useNavigate } from 'react-router-dom';

export const AccessModulePage: React.FC = () => {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { activeModule, setActiveModule, clearanceLevel, setClearanceLevel } = useAccess();
  const navigate = useNavigate();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();

    // 1. Check for Chronicle Level Codes
    if (cleanCode.startsWith('CHRONICLE-')) {
        const levelStr = cleanCode.replace('CHRONICLE-', '');
        const level = parseInt(levelStr, 10);
        if (!isNaN(level) && level >= 0 && level <= 5) {
            setClearanceLevel(level);
            setError(null);
            alert(`Уровень допуска обновлен: ${level}`);
            navigate('/');
            return;
        }
    }

    // 2. Check for Module Keys
    const mod = resolveAccessModuleByCode(cleanCode);
    if (!mod) {
      setError('Код доступа не распознан. Проверь, что он введён без ошибок.');
    } else {
      setActiveModule(mod);
      setError(null);
      alert(`Модуль "${mod.label}" активирован.`);
      navigate(`/character?module=${mod.id}`);
    }
  };

  const handleExit = () => {
      setActiveModule(null);
      setClearanceLevel(0); // Optional: reset level on full exit? Or keep it independent.
      setCode('');
      alert('Режим сброшен. Доступен полный Канонар (Уровень 0).');
  };

  return (
    <div className="p-8 max-w-xl mx-auto mt-20">
      <div className="bg-canon-bg-light border border-canon-border rounded-lg p-8 shadow-2xl">
        <h2 className="text-3xl font-bold mb-4 text-canon-text text-center">Вход в систему</h2>
        
        <div className="mb-6 text-center">
             <span className="text-xs font-mono bg-black/30 px-2 py-1 rounded text-canon-text-light">
                 CURRENT CLEARANCE: LEVEL {clearanceLevel}
             </span>
             {activeModule && (
                 <div className="mt-2 text-xs text-green-400 font-bold">
                     KEY ACTIVE: {activeModule.label}
                 </div>
             )}
        </div>

        {activeModule ? (
             <div className="text-center space-y-6">
                 <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
                     <h3 className="text-xl font-bold text-green-400 mb-2">Активен: {activeModule.label}</h3>
                     <p className="text-canon-text-light text-sm">{activeModule.description}</p>
                 </div>

                 <button 
                    onClick={handleExit}
                    className="w-full py-3 bg-canon-bg border border-canon-border hover:bg-red-900/30 hover:border-red-500 hover:text-red-400 transition-colors rounded font-bold"
                 >
                     СБРОСИТЬ ДОСТУП
                 </button>
             </div>
        ) : (
            <>
                <p className="text-canon-text-light text-sm mb-6 text-center">
                Введите код доступа. Это может быть ключ модуля (для фильтрации контента) или код уровня (CHRONICLE-N) для снятия редактуры.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="КОД ДОСТУПА"
                    className="w-full px-4 py-3 bg-canon-bg border border-canon-border rounded text-center font-mono text-lg focus:outline-none focus:border-canon-accent focus:ring-1 focus:ring-canon-accent uppercase"
                />
                {error && (
                    <div className="text-sm text-red-400 text-center">
                    {error}
                    </div>
                )}
                <button
                    type="submit"
                    className="w-full py-3 rounded bg-canon-accent text-canon-bg font-bold hover:opacity-90 transition shadow-lg"
                >
                    ПРИМЕНИТЬ
                </button>
                </form>
                
                <div className="mt-8 pt-6 border-t border-canon-border/30 text-center">
                     <p className="text-xs text-canon-text-light mb-2">Доступные коды (Dev):</p>
                     <div className="flex flex-wrap justify-center gap-2 font-mono text-xs text-canon-accent">
                        <span className="cursor-pointer hover:underline" onClick={() => setCode("TEGAN-KRYSTAR")}>TEGAN-KRYSTAR</span>
                        <span className="cursor-pointer hover:underline" onClick={() => setCode("CHRONICLE-1")}>CHRONICLE-1</span>
                        <span className="cursor-pointer hover:underline" onClick={() => setCode("CHRONICLE-5")}>CHRONICLE-5</span>
                     </div>
                </div>
            </>
        )}
      </div>
    </div>
  );
};