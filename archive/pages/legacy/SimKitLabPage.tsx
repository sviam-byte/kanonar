import React from 'react';

import { SimulatorLab } from '../lib/goal-lab/labs/SimulatorLab';
import { defaultProducers } from '../lib/orchestrator/defaultProducers';

export const SimKitLabPage: React.FC = () => {
  return (
    <div className="h-[calc(100vh-64px)] w-full overflow-hidden">
      <div className="h-full overflow-auto">
        <SimulatorLab orchestratorRegistry={defaultProducers} />
      </div>
    </div>
  );
};
