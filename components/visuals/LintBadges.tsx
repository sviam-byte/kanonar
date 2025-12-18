
import React from 'react';
import { LintIssue } from '../../types';

interface LintBadgesProps {
    issues: LintIssue[];
}

const BadgeIcon: React.FC<{ color: string, count: number, severity: string }> = ({ color, count, severity }) => (
    <div className={`relative flex items-center justify-center w-8 h-8 rounded-full border-2 ${color}`} title={`${count} ${severity} issue(s)`}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <span className="absolute -top-1 -right-1 bg-canon-bg text-xs rounded-full px-1.5 py-0.5 text-white font-mono">{count}</span>
    </div>
);

export const LintBadges: React.FC<LintBadgesProps> = ({ issues }) => {
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warnCount = issues.filter(i => i.severity === 'warn').length;
    
    if (issues.length === 0) return null;

    return (
        <div className="flex items-center gap-2">
            {errorCount > 0 && <BadgeIcon color="border-canon-red text-canon-red" count={errorCount} severity="error"/>}
            {warnCount > 0 && <BadgeIcon color="border-yellow-500 text-yellow-500" count={warnCount} severity="warning"/>}
        </div>
    );
};
