
// components/goal-lab/ModsPanel.tsx
import React, { useMemo, useState } from 'react';
import { arr } from '../../lib/utils/arr';

export const ModsPanel: React.FC<{
  world: any;
  kind: 'characters'|'locations'|'scenes';
  id: string;
  onChange: (nextWorld: any) => void;
  className?: string;
}> = ({ world, kind, id, onChange, className }) => {
  const store = world.mods || { schemaVersion: 1, characters: {}, locations: {}, scenes: {} };
  const layer = (store[kind] && store[kind][id]) || { schemaVersion: 1, overrides: {}, deltas: {}, mults: {} };

  const [key, setKey] = useState('trait.paranoia');
  const [val, setVal] = useState('0.5');

  const keys = useMemo(() => Object.keys(layer.overrides || {}).sort(), [layer]);

  const apply = () => {
    // Basic clone for MVP. In prod use structuredClone or immutability helper
    const next = JSON.parse(JSON.stringify(world));
    next.mods = next.mods || { schemaVersion: 1, characters: {}, locations: {}, scenes: {} };
    next.mods[kind] = next.mods[kind] || {};
    next.mods[kind][id] = next.mods[kind][id] || { schemaVersion: 1, overrides: {}, deltas: {}, mults: {} };

    const v = Number(val);
    next.mods[kind][id].overrides[key] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    onChange(next);
  };

  const remove = (k: string) => {
    const next = JSON.parse(JSON.stringify(world));
    if (next.mods?.[kind]?.[id]?.overrides?.[k] != null) delete next.mods[kind][id].overrides[k];
    onChange(next);
  };

  return (
    <div className={className ?? "h-full min-h-0 flex flex-col bg-canon-bg text-canon-text"}>
      <div className="p-3 border-b border-canon-border bg-canon-bg-light/30">
        <div className="text-sm font-semibold">Mods</div>
        <div className="text-xs text-canon-text-light mt-1">{kind}:{id}</div>
      </div>

      <div className="p-3 border-b border-canon-border flex gap-2 bg-canon-bg/50">
        <input className="flex-1 text-xs p-2 rounded bg-canon-bg border border-canon-border text-canon-text"
               value={key} onChange={e => setKey(e.target.value)} placeholder="feature key" />
        <input className="w-24 text-xs p-2 rounded bg-canon-bg border border-canon-border text-canon-text"
               value={val} onChange={e => setVal(e.target.value)} placeholder="0..1" />
        <button className="px-3 py-2 text-xs rounded bg-canon-accent text-black font-bold" onClick={apply}>Set</button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-2">
        {keys.length === 0 && <div className="text-xs text-canon-text-light italic text-center p-4">No active mods.</div>}
        {arr(keys).map(k => (
          <div key={k} className="p-2 border-b border-canon-border/30 flex items-center justify-between hover:bg-canon-bg-light/10">
            <div className="text-xs font-mono text-canon-text-light">{k}</div>
            <div className="flex items-center gap-2">
              <div className="text-xs font-bold text-canon-accent">{String(layer.overrides[k])}</div>
              <button className="text-[10px] text-red-400 hover:underline" onClick={() => remove(k)}>remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
