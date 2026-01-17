
import React from 'react';
import { GoalSandbox } from '../components/GoalSandbox/GoalSandbox';

export const GoalLabPage: React.FC = () => {
  return (
    <div className="h-full w-full overflow-hidden">
      <div className="h-full overflow-y-auto custom-scrollbar bg-canon-bg">
        <GoalSandbox />
      </div>
    </div>
  );
};
