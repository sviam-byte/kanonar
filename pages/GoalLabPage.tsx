
import React from 'react';
import { GoalSandbox } from '../components/GoalSandbox/GoalSandbox';

export const GoalLabPage: React.FC = () => {
  return (
    <div className="h-screen w-screen overflow-hidden bg-canon-bg">
      <GoalSandbox />
    </div>
  );
};
