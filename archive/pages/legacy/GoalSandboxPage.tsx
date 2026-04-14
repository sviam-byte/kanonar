
import React from 'react';
import { GoalSandbox } from '../components/GoalSandbox/GoalSandbox';

export const GoalSandboxPage: React.FC = () => {
    return (
        <div className="p-6 max-w-7xl mx-auto h-[calc(100vh-64px)]">
            <GoalSandbox />
        </div>
    );
};
