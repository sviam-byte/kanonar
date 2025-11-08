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

    return (
        <div className={`flex justify-between items-center text-xs border rounded-md px-2 py-1 ${bgColor} ${borderColor}`}>
           <span className="text-canon-text truncate pr-2" title={result.title}>{result.title}</span>
           <span className={`font-mono font-bold ${textColor}`}>
                {isOk ? 'ok' : 'fail'} {result.score.toFixed(0)}%
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
