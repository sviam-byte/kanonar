import React from 'react';
import { SimulationMeta } from '../../types';

interface RunnerProps {
  sim: SimulationMeta;
}

export const PortfolioRunner: React.FC<RunnerProps> = ({ sim }) => {
  return (
    <div>
      <h3 className="text-lg font-bold">Portfolio Simulation Runner</h3>
      <p className="text-canon-text-light">This simulation is not yet implemented.</p>
      <pre className="mt-4 bg-canon-bg p-2 rounded text-xs overflow-auto">
        {JSON.stringify(sim.payload, null, 2)}
      </pre>
    </div>
  );
};