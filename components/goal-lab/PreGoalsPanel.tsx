import React from 'react';
import { Slider } from '../Slider';

export type PreGoals = Record<string, number>;

const KEYS = [
  { key: 'safety', label: 'Safety' },
  { key: 'social', label: 'Social' },
  { key: 'resource', label: 'Resource' },
  { key: 'explore', label: 'Explore' },
  { key: 'bonding', label: 'Bonding' },
  { key: 'dominance', label: 'Dominance' },
];

export const PreGoalsPanel: React.FC<{
  value: PreGoals;
  onChange: (next: PreGoals) => void;
}> = ({ value, onChange }) => {
  const set = (k: string, v: number) => onChange({ ...value, [k]: v });

  return (
    <div className="p-3 bg-canon-bg border border-canon-border rounded-lg">
      <div className="text-xs uppercase tracking-wider text-canon-text-light mb-2">Pre-goals</div>
      <div className="space-y-3">
        {KEYS.map(({ key, label }) => (
          <div key={key}>
            <div className="flex items-center justify-between text-xs">
              <span>{label}</span>
              <span className="text-canon-text-light">{Math.round((value?.[key] ?? 0) * 100)}%</span>
            </div>
            <Slider
              value={value?.[key] ?? 0}
              min={0}
              max={1}
              step={0.01}
              onChange={(v: number) => set(key, v)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

