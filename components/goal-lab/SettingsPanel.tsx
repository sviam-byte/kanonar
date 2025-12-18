
// components/goal-lab/SettingsPanel.tsx
import React, { useEffect, useState } from 'react';

type AtomStrictMode = 'off' | 'warn' | 'error';

function getGlobalMode(): AtomStrictMode {
  const g = (globalThis as any).__ATOM_STRICT_MODE__;
  if (g === 'off' || g === 'warn' || g === 'error') return g;
  return 'warn';
}

export const SettingsPanel: React.FC<{ className?: string }> = ({ className }) => {
  const [mode, setMode] = useState<AtomStrictMode>(() => getGlobalMode());

  useEffect(() => {
    (globalThis as any).__ATOM_STRICT_MODE__ = mode;
  }, [mode]);

  return (
    <div className={className ?? 'h-full min-h-0 flex flex-col bg-canon-bg text-canon-text'}>
      <div className="p-3 border-b border-canon-border bg-canon-bg-light/30">
        <div className="text-sm font-semibold">Settings</div>
        <div className="text-xs text-canon-text-light mt-1">StrictMode controls how Validator treats unknown atoms.</div>
      </div>

      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <div className="text-xs text-canon-text-light font-bold uppercase">Atom strict mode</div>
          <select
            value={mode}
            onChange={e => setMode(e.target.value as AtomStrictMode)}
            className="w-full px-2 py-2 rounded bg-canon-bg border border-canon-border text-sm focus:outline-none focus:border-canon-accent"
          >
            <option value="off">off (allow unknown)</option>
            <option value="warn">warn (default)</option>
            <option value="error">error (break invariants)</option>
          </select>
          <div className="text-[10px] text-canon-text-light italic">
              Controls whether atoms not in the Catalog raise validation errors/warnings.
          </div>
        </div>

        <div className="pt-4 border-t border-canon-border/30">
            <div className="text-xs text-canon-text-light">
            Current global: <span className="font-mono text-canon-accent">{mode}</span>
            </div>
        </div>
      </div>
    </div>
  );
};
