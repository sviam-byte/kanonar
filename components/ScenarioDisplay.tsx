import React from 'react';
import { ScenarioFitnessResult } from '../types';

interface ScenarioDisplayProps {
  results: ScenarioFitnessResult[];
}

const ScenarioBadge: React.FC<{ result: ScenarioFitnessResult }> = ({ result }) => {
    const isOk = result.status === 'ok';
    const bgColor = isOk ? 'bg-green-800/50' : 'bg-red-800/50';
    const borderColor = isOk ? 'border-green-500/60' : 'border-red-500/60';
    const textColor = isOk ? 'text-canon-green' : 'text-canon-red';

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
                {isOk ? 'ok' : 'fail'} {result.score.toFixed(0)}
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