import React from 'react';

import { SimulatorLab } from '../components/SimulatorLab';
import { makeBasicWorld } from '../lib/simkit/scenarios/basicScenario';

export const SimKitLabPage: React.FC = () => {
  return (
    <div className="h-[calc(100vh-64px)] w-full overflow-hidden">
      <div className="h-full overflow-auto">
        <SimulatorLab initialWorld={makeBasicWorld()} />
      </div>
    </div>
  );
};
