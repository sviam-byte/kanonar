import React from 'react';
import { ScenarioFitnessResult } from '../types';

interface ScenarioDisplayProps {
  results: ScenarioFitnessResult[];
}

// Pure status -> presentation mapping (METRIC-INVENTORY-0: `warn` was
// mislabeled `fail`). Unknown statuses stay loud as `fail`.
export function scenarioStatusPresentation(status: ScenarioFitnessResult['status']): {
    label: 'ok' | 'warn' | 'fail';
    bgColor: string;
    borderColor: string;
    textColor: string;
} {
    if (status === 'ok') {
        return { label: 'ok', bgColor: 'bg-green-800/50', borderColor: 'border-green-500/60', textColor: 'text-canon-green' };
    }
    if (status === 'warn') {
        return { label: 'warn', bgColor: 'bg-yellow-800/50', borderColor: 'border-yellow-500/60', textColor: 'text-yellow-400' };
    }
    return { label: 'fail', bgColor: 'bg-red-800/50', borderColor: 'border-red-500/60', textColor: 'text-canon-red' };
}

const ScenarioBadge: React.FC<{ result: ScenarioFitnessResult }> = ({ result }) => {
    const { label, bgColor, borderColor, textColor } = scenarioStatusPresentation(result.status);

    const TooltipContent = () => (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-canon-bg p-3 rounded text-xs border border-canon-border shadow-lg z-10 hidden group-hover:block whitespace-normal break-words">
            <h5 className="font-bold mb-2 text-center">{result.title}</h5>
            <ul className="space-y-1 text-left">
                {result.checks.map((check, index) => (
                    <li key={index} className="flex items-center">
                        <span className={`mr-2 ${check.passed ? 'text-canon-green' : 'text-canon-red'}`}>
                            {check.passed ? '✓' : '✗'}
                        </span>
                        <span className="text-canon-text-light">{check.description}</span>
                    </li>
                ))}
            </ul>
        </div>
    );

    return (
        <div className={`relative group flex justify-between items-center text-xs border rounded-md px-2 py-1 ${bgColor} ${borderColor}`}>
           <TooltipContent />
           <span className="text-canon-text truncate pr-2" title={result.title}>{result.title}</span>
           <span className={`font-mono font-bold ${textColor}`}>
                {label} {result.score.toFixed(0)}
           </span>
        </div>
    );
};

export const ScenarioDisplay: React.FC<ScenarioDisplayProps> = ({ results }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
      {results.map((result) => (
        <ScenarioBadge key={result.key} result={result} />
      ))}
    </div>
  );
};