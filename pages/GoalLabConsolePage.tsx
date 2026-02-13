import React from 'react';
import { GoalSandbox } from '../components/GoalSandbox/GoalSandbox';

/**
 * Standalone Goal Lab console route.
 * Reuses GoalSandbox in a compact console-oriented UI mode.
 */
export const GoalLabConsolePage: React.FC = () => {
  return (
    <div className="h-full w-full overflow-hidden">
      <div className="h-full overflow-y-auto custom-scrollbar bg-canon-bg">
        <GoalSandbox uiMode="console" />
      </div>
    </div>
  );
};
