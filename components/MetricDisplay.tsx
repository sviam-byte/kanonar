
import React, { useState } from 'react';
import { FORMULA_REGISTRY, resolveFormula } from '../lib/formulas/registry';
import { AgentState } from '../types';

interface MetricDisplayProps {
  name: string;
  value: string | number;
  colorClass?: string;
  tooltip?: string;
  formulaKey?: string;
  context?: AgentState; // Required for formula resolution
}

export const MetricDisplay: React.FC<MetricDisplayProps> = ({ name, value, colorClass = 'text-canon-text', tooltip, formulaKey, context }) => {
  const [showFormula, setShowFormula] = useState(false);

  const formulaTemplate = formulaKey ? FORMULA_REGISTRY[formulaKey] : null;
  const resolvedFormula = (formulaTemplate && context) ? resolveFormula(formulaTemplate, context) : null;

  const formattedValue = typeof value === 'number' ? value.toFixed(3) : value;

  return (
    <div className="relative group flex items-center justify-center text-center bg-canon-bg-light border border-canon-border rounded-md px-3 py-1.5">
      {tooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 bg-canon-bg p-2 rounded text-xs text-left border border-canon-border shadow-lg z-20 hidden group-hover:block whitespace-normal break-words pointer-events-none">
          <span className="font-bold text-canon-accent">{name}:</span> {tooltip}
        </div>
      )}
      
      <span className="text-xs text-canon-text-light mr-2">{name}</span>
      <span className={`font-mono font-bold text-sm ${colorClass} mr-2`}>{formattedValue}</span>
      
      {formulaTemplate && (
          <button 
            onClick={(e) => { e.stopPropagation(); setShowFormula(!showFormula); }}
            className="w-4 h-4 flex items-center justify-center rounded-full bg-canon-border/30 text-[9px] text-canon-text-light hover:bg-canon-accent hover:text-canon-bg transition-colors font-serif italic"
            title="Показать формулу"
          >
              ƒ
          </button>
      )}

      {showFormula && formulaTemplate && (
          <div className="absolute top-full left-0 mt-2 w-80 bg-canon-bg border border-canon-border p-3 rounded shadow-xl z-50 text-left">
               <div className="flex justify-between items-center mb-2 border-b border-canon-border/30 pb-1">
                   <span className="text-xs font-bold text-canon-accent">Формула: {name}</span>
                   <button onClick={() => setShowFormula(false)} className="text-canon-text-light hover:text-white">✕</button>
               </div>
               <div className="text-[10px] font-mono text-canon-text-light mb-2 break-words bg-black/20 p-1 rounded">
                   {formulaTemplate}
               </div>
               {resolvedFormula && (
                   <div className="text-[10px] font-mono text-green-400 break-words bg-black/20 p-1 rounded">
                       = {resolvedFormula}
                   </div>
               )}
          </div>
      )}
    </div>
  );
};
