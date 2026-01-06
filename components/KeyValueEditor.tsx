// components/KeyValueEditor.tsx
// Lightweight editor for numeric key/value maps (hazards, norms, etc.).

import React from 'react';

type Props = {
  title: string;
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  suggestions?: string[];
};

export function KeyValueEditor({ title, value, onChange, suggestions }: Props) {
  const entries = Object.entries(value || {});
  function setKey(oldKey: string, nextKey: string) {
    const next: Record<string, number> = {};
    for (const [k, v] of entries) {
      if (k === oldKey) next[nextKey] = v;
      else next[k] = v;
    }
    onChange(next);
  }
  function setVal(key: string, nextVal: number) {
    onChange({ ...value, [key]: nextVal });
  }
  function remove(key: string) {
    const next = { ...value };
    delete next[key];
    onChange(next);
  }
  function add(key: string) {
    if (!key.trim()) return;
    if (value?.[key] != null) return;
    onChange({ ...(value || {}), [key]: 0 });
  }

  return (
    <div className="rounded-2xl border border-canon-border bg-canon-card p-3">
      <div className="font-semibold mb-2">{title}</div>

      <div className="flex flex-col gap-2">
        {entries.length === 0 && <div className="text-sm opacity-60">Пока пусто.</div>}

        {entries.map(([k, v]) => (
          <div key={k} className="grid grid-cols-12 gap-2 items-center">
            <input
              className="col-span-6 px-3 py-2 rounded-xl border border-canon-border bg-black/20"
              value={k}
              onChange={(e) => setKey(k, e.target.value)}
            />
            <input
              className="col-span-4 px-3 py-2 rounded-xl border border-canon-border bg-black/20"
              type="number"
              step="0.05"
              value={Number.isFinite(v) ? v : 0}
              onChange={(e) => setVal(k, Number(e.target.value))}
            />
            <button
              className="col-span-2 px-3 py-2 rounded-xl border border-canon-border hover:bg-white/5"
              onClick={() => remove(k)}
            >
              ×
            </button>
          </div>
        ))}

        <div className="grid grid-cols-12 gap-2 items-center pt-1">
          <select
            className="col-span-10 px-3 py-2 rounded-xl border border-canon-border bg-black/20"
            defaultValue=""
            onChange={(e) => {
              const key = e.target.value;
              if (key) add(key);
              e.currentTarget.value = '';
            }}
          >
            <option value="">+ Add…</option>
            {(suggestions || []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="col-span-2 text-xs opacity-60">0..1</div>
        </div>
      </div>
    </div>
  );
}
