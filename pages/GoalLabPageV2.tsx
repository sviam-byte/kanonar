import React from 'react';
import { GoalLabProvider } from '../contexts/GoalLabContext';
import { GoalLabShell } from '../components/goal-lab-v2/GoalLabShell';

export const GoalLabPageV2: React.FC = () => (
  <div className="h-full w-full overflow-hidden">
    <div className="h-full overflow-hidden bg-[#020617]">
      <GoalLabProvider>
        <GoalLabShell />
      </GoalLabProvider>
    </div>
  </div>
);
