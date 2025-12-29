import React, { useMemo, useState } from 'react';

type AtomOrigin = 'world' | 'obs' | 'override' | 'derived';
type Atom = {
  id: string;
  m: number;
  c: number;
  o: AtomOrigin;
  meta?: any;
  code?: string | null;
  specId?: string | null;
  params?: Record<string, any> | null;
  label?: string | null;
  kind?: string | null;
  ns?: string | null;
  source?: string | null;
};

export function AtomExplorer({
  atoms,
  onSelect,
}: {
  atoms: Atom[];
  onSelect: (atom: Atom | null) => void;
}) {
  const [q, setQ] = useState('');
  const [origin, setOrigin] = useState<AtomOrigin | 'all'>('all');
  const [ns, setNs] = useState<string>('');
  const [minC, setMinC] = useState(0);

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const nss = ns.trim().toLowerCase();
    return atoms
      .filter(a => (origin === 'all' ? true : a.o === origin))
      .filter(a => (nss ? a.id.toLowerCase().startsWith(nss) : true))
      .filter(a => a.c >= minC)
      .filter(a => {
        if (!qq) return true;
        const paramsStr =
          a.params && typeof a.params === 'object'
            ? JSON.stringify(a.params)
            : '';
        const hay = [
          a.id,
          a.code ?? '',
          a.specId ?? '',
          a.label ?? '',
          paramsStr,
          a.kind ?? '',
          a.ns ?? '',
          a.source ?? ''
        ].join(' ').toLowerCase();
        return hay.includes(qq);
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [atoms, q, origin, ns, minC]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap bg-canon-bg p-2 rounded border border-canon-border">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="search id…"
          className="flex-1 min-w-[200px] bg-black border border-canon-border rounded px-2 py-1 text-xs"
        />
        <input
          value={ns}
          onChange={e => setNs(e.target.value)}
          placeholder="prefix (e.g. ctx:)"
          className="w-32 bg-black border border-canon-border rounded px-2 py-1 text-xs"
        />
        <select 
          value={origin} 
          onChange={e => setOrigin(e.target.value as any)}
          className="bg-black border border-canon-border rounded px-2 py-1 text-xs"
        >
          <option value="all">all</option>
          <option value="world">world</option>
          <option value="obs">obs</option>
          <option value="override">override</option>
          <option value="derived">derived</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-canon-text-light">
          min conf
          <input
            type="number"
            value={minC}
            min={0}
            max={1}
            step={0.05}
            onChange={e => setMinC(Number(e.target.value))}
            className="w-16 bg-black border border-canon-border rounded px-1"
          />
        </label>
      </div>

      <div className="border border-canon-border rounded-lg overflow-y-auto max-h-[400px] bg-black/40">
        <table className="w-full text-xs text-left">
          <thead className="bg-canon-bg text-canon-text-light sticky top-0 uppercase text-[9px] tracking-wider font-bold">
            <tr>
              <th className="p-2">ID</th>
              <th className="p-2 w-16 text-center">Mag</th>
              <th className="p-2 w-16 text-center">Conf</th>
              <th className="p-2 w-20">Origin</th>
            </tr>
          </thead>
          <tbody>
            {list.map(a => (
              <tr 
                key={a.id} 
                onClick={() => onSelect(a)}
                className="border-b border-canon-border/30 hover:bg-canon-accent/10 cursor-pointer transition-colors"
              >
                <td className="p-2">
                  <div className="font-mono truncate max-w-[240px]" title={a.id}>{a.id}</div>
                  {a.code ? (
                    <div className="mt-0.5 text-[9px] font-mono text-canon-text-light/70 truncate max-w-[240px]" title={a.code}>
                      {a.code}
                    </div>
                  ) : null}
                </td>
                <td className="p-2 text-center font-mono font-bold text-canon-accent">{a.m.toFixed(2)}</td>
                <td className="p-2 text-center font-mono">{a.c.toFixed(2)}</td>
                <td className="p-2 font-mono text-[10px] text-canon-text-light">{a.o}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="p-8 text-center text-canon-text-light italic">No atoms matching filter.</div>}
      </div>
    </div>
  );
}
