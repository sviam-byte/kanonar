
import React from 'react';

interface MetricBarProps {
  label: string;
  value: number;     // 0..1 or -1..1
  range?: '01' | 'signed';
}

export const MetricBar: React.FC<MetricBarProps> = ({ label, value, range = '01' }) => {
  let displayValue: number;
  let percent: number;
  let formatted: string;

  if (range === '01') {
    displayValue = Math.max(0, Math.min(1, value));
    percent = displayValue * 100;
    formatted = displayValue.toFixed(2);
  } else {
    // -1..1
    const v = Math.max(-1, Math.min(1, value));
    displayValue = v;
    percent = (v + 1) * 50; // -1 -> 0%, 0 -> 50%, 1 -> 100%
    formatted = v.toFixed(2);
  }

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium text-canon-text">{label}</span>
        <span className="tabular-nums font-mono text-canon-accent">{formatted}</span>
      </div>
      <div className="h-2 w-full rounded bg-canon-bg-light border border-canon-border/50 overflow-hidden">
        <div
          className="h-full bg-canon-blue transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};
