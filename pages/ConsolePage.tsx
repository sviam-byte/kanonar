import React from 'react';
import { GoalSandbox } from '../components/GoalSandbox/GoalSandbox';
import { ConsoleShell } from '../components/console/ConsoleShell';

export const ConsolePage: React.FC = () => {
  return (
    <div className="h-full w-full overflow-hidden">
      <div className="h-full overflow-hidden bg-[#020617]">
        <GoalSandbox
          render={(vm) => (
            <ConsoleShell vm={vm} />
          )}
        />
      </div>
    </div>
  );
};
