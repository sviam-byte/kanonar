import React, { useMemo, useState } from 'react';
import { useSandbox } from '../contexts/SandboxContext';

type EdgeRow = {
  a: string;
  b: string;
  tags: string[];
  closeness?: number;
  loyalty?: number;
  hostility?: number;
  dependency?: number;
  authority?: number;
};

function norm01(x: any, fb = 0) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fb;
  return Math.max(0, Math.min(1, n));
}

export const RelationsLabPage: React.FC = () => {
  const { characters } = useSandbox();
  const [focusA, setFocusA] = useState<string>('');
  const [focusB, setFocusB] = useState<string>('');

  const ids = useMemo(() => characters.map(c => c.entityId), [characters]);

  const globalEdges: EdgeRow[] = useMemo(() => {
    // "общая связь" здесь — агрегат из биографических relationships персонажей в sandbox
    // (позже можно заменить на world.socialGraph)
    const rows: EdgeRow[] = [];
    for (const c of characters) {
      const a = c.entityId;
      const rels: any = (c as any).relationships || (c as any).relations || (c as any).social || {};
      const explicit = (rels.edges || rels.links || rels.byId) ? (rels.edges || rels.links || rels.byId) : rels;
      if (!explicit || typeof explicit !== 'object') continue;

      for (const b of Object.keys(explicit)) {
        if (!b || b === a) continue;
        const src = explicit[b] || {};
        rows.push({
          a,
          b,
          tags: Array.isArray(src.tags) ? src.tags.map(String) : [],
          closeness: (src.closeness ?? src.bond) != null ? norm01(src.closeness ?? src.bond, 0) : undefined,
          loyalty: (src.loyalty ?? src.trust) != null ? norm01(src.loyalty ?? (src.trust * 0.8), 0) : undefined,
          hostility: (src.hostility ?? src.conflict) != null ? norm01(src.hostility ?? src.conflict, 0) : undefined,
          dependency: src.dependency != null ? norm01(src.dependency, 0) : undefined,
          authority: (src.authority ?? src.respect) != null ? norm01(src.authority ?? (src.respect * 0.6), 0.5) : undefined,
        });
      }
    }
    // de-dupe exact (a,b)
    const seen = new Set<string>();
    return rows.filter(r => {
      const k = `${r.a}→${r.b}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [characters]);

  const filtered = useMemo(() => {
    return globalEdges.filter(e => {
      if (focusA && e.a !== focusA) return false;
      if (focusB && e.b !== focusB) return false;
      return true;
    });
  }, [globalEdges, focusA, focusB]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold text-canon-text">Relations Lab (Global)</h1>

      <div className="flex gap-3 flex-wrap items-end">
        <div className="flex flex-col">
          <label className="text-xs text-canon-text-light">A (source)</label>
          <select
            className="bg-canon-bg border border-canon-border rounded px-2 py-1 text-sm"
            value={focusA}
            onChange={e => setFocusA(e.target.value)}
          >
            <option value="">(all)</option>
            {ids.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-canon-text-light">B (target)</label>
          <select
            className="bg-canon-bg border border-canon-border rounded px-2 py-1 text-sm"
            value={focusB}
            onChange={e => setFocusB(e.target.value)}
          >
            <option value="">(all)</option>
            {ids.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>

        <div className="text-xs text-canon-text-light">
          Rows: <span className="text-canon-text font-bold">{filtered.length}</span>
        </div>
      </div>

      <div className="border border-canon-border rounded-lg overflow-hidden">
        <div className="grid grid-cols-12 bg-canon-bg-light/40 text-xs text-canon-text-light px-3 py-2">
          <div className="col-span-2">A</div>
          <div className="col-span-2">B</div>
          <div className="col-span-3">tags</div>
          <div className="col-span-5">metrics (c/l/h/d/a)</div>
        </div>

        {filtered.map((e, i) => (
          <div key={`${e.a}-${e.b}-${i}`} className="grid grid-cols-12 px-3 py-2 text-sm border-t border-canon-border/40">
            <div className="col-span-2 font-mono text-canon-text">{e.a}</div>
            <div className="col-span-2 font-mono text-canon-text">{e.b}</div>
            <div className="col-span-3 text-canon-text-light">{(e.tags || []).join(', ') || '—'}</div>
            <div className="col-span-5 font-mono text-canon-text-light">
              {`${(e.closeness ?? 0).toFixed(2)}/${(e.loyalty ?? 0).toFixed(2)}/${(e.hostility ?? 0).toFixed(2)}/${(e.dependency ?? 0).toFixed(2)}/${(e.authority ?? 0.5).toFixed(2)}`}
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="p-4 text-sm text-canon-text-light">No edges.</div>
        )}
      </div>

      <div className="text-xs text-canon-text-light">
        Примечание: это “глобальная связь” по sandbox-биографиям. Дальше можно переключить источник на world.socialGraph и сделать редактор.
      </div>
    </div>
  );
};
