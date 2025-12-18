
import React from 'react';
import { GoalSandbox } from '../components/GoalSandbox/GoalSandbox';

export const GoalLabPage: React.FC = () => {
    return (
        <div className="h-[calc(100vh-64px)] w-full overflow-hidden">
            <GoalSandbox />
        </div>
    );
};
