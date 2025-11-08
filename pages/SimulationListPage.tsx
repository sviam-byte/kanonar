import React from 'react';
import { Link } from 'react-router-dom';
import { allSimulations } from '../data/simulations';

export const SimulationListPage: React.FC = () => {
  return (
    <div className="p-8">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-bold mb-2">Ядро Симуляций</h2>
        <p className="text-lg text-canon-text-light max-w-3xl mx-auto">
          Взаимодействуйте со сложными предиктивными моделями. Каждая симуляция представляет собой песочницу для тестирования сценариев, от онтологических утечек до логистических конвейеров, основанных на фундаментальной математике Kanonar.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
        {allSimulations.map(sim => (
             <Link 
                key={sim.key} 
                to={`/simulations/${sim.key}`} 
                className="block p-6 bg-canon-bg-light border border-canon-border rounded-lg hover:border-canon-accent hover:shadow-lg hover:shadow-canon-accent/10 transition-all transform hover:-translate-y-1"
            >
                <h3 className="text-2xl font-bold text-canon-accent mb-2">{sim.title}</h3>
                <p className="text-canon-text-light">{sim.description}</p>
                 <span className="inline-block mt-4 text-xs bg-canon-border px-2 py-1 rounded font-mono">mode: {sim.mode}</span>
            </Link>
        ))}
      </div>
    </div>
  );
};