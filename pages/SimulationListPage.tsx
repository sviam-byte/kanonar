
import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { allSimulations } from '../data/simulations';
import { useAccess } from '../contexts/AccessContext';
import { ROUTES } from '../lib/appRoutes';

export const SimulationListPage: React.FC = () => {
  const { activeModule, isRestricted } = useAccess();

  const simulations = useMemo(() => {
      if (isRestricted && activeModule) {
          return allSimulations.filter(s => activeModule.isSimulationAllowed(s.key));
      }
      return allSimulations;
  }, [activeModule, isRestricted]);

  return (
    <div className="p-8">
      <div className="text-center mb-12">
        <div className="flex justify-center items-center gap-4 mb-2">
            <h2 className="text-4xl font-bold">Ядро Симуляций</h2>
            {isRestricted && activeModule && (
                <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-500 rounded border border-yellow-500/40 align-middle">
                        Фильтр: {activeModule.label}
                </span>
            )}
        </div>
        <p className="text-lg text-canon-text-light max-w-3xl mx-auto">
          Взаимодействуйте со сложными предиктивными моделями. Каждая симуляция представляет собой песочницу для тестирования сценариев.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
        
        {/* Featured: Goal Sandbox */}
        {!isRestricted && (
             <Link 
                to={ROUTES.labs.goalLab} 
                className="block p-6 bg-gradient-to-br from-canon-bg-light to-canon-bg border border-canon-accent/50 rounded-lg hover:border-canon-accent hover:shadow-[0_0_20px_rgba(0,170,255,0.15)] transition-all transform hover:-translate-y-1 relative group"
            >
                <div className="absolute top-3 right-3 text-2xl opacity-50 group-hover:opacity-100 transition-opacity">🎯</div>
                <h3 className="text-2xl font-bold text-canon-accent mb-2">Goal Lab</h3>
                <p className="text-canon-text-light">
                    Канонический вход в Goal Lab. Тестируйте, как персонажи реагируют на давление, угрозы и приказы без переходов в legacy-экраны.
                </p>
                 <span className="inline-block mt-4 text-xs bg-canon-accent/10 text-canon-accent px-2 py-1 rounded font-mono border border-canon-accent/30">NEW: Interactive</span>
            </Link>
        )}

        {simulations.map(sim => (
             <Link 
                key={sim.key} 
                to={`${ROUTES.simulation.catalog}/${sim.key}`} 
                className="block p-6 bg-canon-bg-light border border-canon-border rounded-lg hover:border-canon-accent hover:shadow-lg hover:shadow-canon-accent/10 transition-all transform hover:-translate-y-1"
            >
                <h3 className="text-2xl font-bold text-canon-accent mb-2">{sim.title}</h3>
                <p className="text-canon-text-light">{sim.description}</p>
                 <span className="inline-block mt-4 text-xs bg-canon-border px-2 py-1 rounded font-mono">mode: {sim.mode}</span>
            </Link>
        ))}
        
        {simulations.length === 0 && isRestricted && (
            <div className="col-span-full text-center py-12 text-canon-text-light border border-dashed border-canon-border rounded-lg">
                <p>Нет доступных симуляций для текущего модуля доступа.</p>
            </div>
        )}
      </div>
    </div>
  );
};
