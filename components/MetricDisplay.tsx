import React from 'react';

interface MetricDisplayProps {
  name: string;
  value: string;
  colorClass?: string;
  tooltip?: string;
}

export const MetricDisplay: React.FC<MetricDisplayProps> = ({ name, value, colorClass = 'text-canon-text', tooltip }) => {
  return (
    <div 
      className="flex items-center justify-center text-center bg-canon-bg-light border border-canon-border rounded-md px-3 py-1.5"
      title={tooltip}
    >
      <span className="text-xs text-canon-text-light mr-2">{name}</span>
      <span className={`font-mono font-bold text-sm ${colorClass}`}>{value}</span>
    </div>
  );
};
