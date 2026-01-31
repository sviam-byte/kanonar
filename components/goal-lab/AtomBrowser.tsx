
// components/goal-lab/AtomBrowser.tsx
import React, { useMemo, useState } from 'react';
import { ContextAtom, AtomNamespace, AtomOrigin } from '../../lib/context/v2/types';
import { inferAtomNamespace, inferAtomOrigin, normalizeAtom } from '../../lib/context/v2/infer';
import { arr } from '../../lib/utils/arr';
import { atomLabelRu, atomNamespaceRu } from '../../lib/i18n/atom_ru';

type Props = {
  atoms: ContextAtom[];
  className?: string;
  selectedAtomId?: string | null;
  onSelectedAtomIdChange?: (id: string | null) => void;
  renderDetails?: (atom: ContextAtom | null, atoms: ContextAtom[]) => React.ReactNode;
};

const NS_ORDER: AtomNamespace[] = [
  'obs',
  'soc',
  'tom',
  'rel',
  'ctx',
  'threat',
  'emo',
  'goal',
  'aff',
  'con',
  'off',
  'access',
  'cap',
  'cost',
  'map',
  'scene',
  'norm',
  'self',
  'feat',
  'world',
  'misc',
];
const ORIGIN_ORDER: AtomOrigin[] = ['world','scene','obs','self','profile','override','derived','belief','memory'];

function short(n: any): string {
  if (n === null || n === undefined) return '';
  if (typeof n === 'string') return n;
  return String(n);
}

export const AtomBrowser: React.FC<Props> = ({ atoms, className, selectedAtomId, onSelectedAtomIdChange, renderDetails }) => {
  const [q, setQ] = useState('');
  const [nsFilter, setNsFilter] = useState<AtomNamespace | 'all'>('all');
  const [originFilter, setOriginFilter] = useState<AtomOrigin | 'all'>('all');
  const [sortBy, setSortBy] = useState<'magnitude' | 'id'>('magnitude');
  
  // Uncontrolled state fallback
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  
  const activeSelectedId = selectedAtomId !== undefined ? selectedAtomId : internalSelectedId;
  
  const setSelectedId = (id: string | null) => {
      if (onSelectedAtomIdChange) {
          onSelectedAtomIdChange(id);
      } else {
          setInternalSelectedId(id);
      }
  };

  const normalized = useMemo(() => {
    const next = arr(atoms).map(a => normalizeAtom(a));
    if (!Array.isArray(next)) {
      console.error('Expected array, got', next);
      return [];
    }
    return next;
  }, [atoms]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let out = normalized;
    if (nsFilter !== 'all') out = out.filter(a => a.ns === nsFilter);
    if (originFilter !== 'all') out = out.filter(a => a.origin === originFilter);
    if (qq) {
      out = out.filter(a => {
        const paramsStr =
          (a as any).params && typeof (a as any).params === 'object'
            ? JSON.stringify((a as any).params)
            : '';
        const hay = [
          a.id, a.kind, a.source, a.label,
          (a as any).code, (a as any).specId,
          paramsStr,
          ...arr(a.tags)
        ].join(' ').toLowerCase();
        return hay.includes(qq);
      });
    }
    if (sortBy === 'magnitude') out = [...out].sort((a, b) => (b.magnitude ?? 0) - (a.magnitude ?? 0));
    else out = [...out].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    if (!Array.isArray(out)) {
      console.error('Expected array, got', out);
      return [];
    }
    return out;
  }, [normalized, q, nsFilter, originFilter, sortBy]);

  const selected = useMemo(
    () => filtered.find(a => a.id === activeSelectedId) || normalized.find(a => a.id === activeSelectedId) || null,
    [filtered, normalized, activeSelectedId]
  );

  const nsCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of normalized) map.set(a.ns || 'misc', (map.get(a.ns || 'misc') || 0) + 1);
    const next = Array.from(map.entries()).map(([key, count]) => ({ key, count }));
    if (!Array.isArray(next)) {
      console.error('Expected array, got', next);
      return [];
    }
    return next;
  }, [normalized]);

  const originCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of normalized) map.set(a.origin || 'world', (map.get(a.origin || 'world') || 0) + 1);
    const next = Array.from(map.entries()).map(([key, count]) => ({ key, count }));
    if (!Array.isArray(next)) {
      console.error('Expected array, got', next);
      return [];
    }
    return next;
  }, [normalized]);

  return (
    <div className={className ?? 'h-full min-h-0 flex flex-col bg-canon-bg text-canon-text'}>
      {/* Toolbar */}
      <div className="p-3 border-b border-canon-border flex flex-wrap gap-2 items-center bg-canon-bg-light/30">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search: id / kind / label"
          className="px-2 py-1.5 rounded bg-canon-bg border border-canon-border text-xs w-[240px] focus:border-canon-accent outline-none"
        />

        <select
          value={nsFilter}
          onChange={e => setNsFilter(e.target.value as any)}
          className="px-2 py-1.5 rounded bg-canon-bg border border-canon-border text-xs focus:border-canon-accent outline-none"
        >
          <option value="all">ns: all ({normalized.length})</option>
          {NS_ORDER.map(ns => {
             const count = nsCounts.find(entry => entry.key === ns)?.count;
             if (!count) return null;
             return (
                <option key={ns} value={ns}>
                  ns: {ns} ({count})
                </option>
             )
          })}
        </select>

        <select
          value={originFilter}
          onChange={e => setOriginFilter(e.target.value as any)}
          className="px-2 py-1.5 rounded bg-canon-bg border border-canon-border text-xs focus:border-canon-accent outline-none"
        >
          <option value="all">origin: all</option>
          {ORIGIN_ORDER.map(o => {
            const count = originCounts.find(entry => entry.key === o)?.count;
            if (!count) return null;
            return (
              <option key={o} value={o}>
                origin: {o} ({count})
                </option>
             )
          })}
        </select>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as any)}
          className="px-2 py-1.5 rounded bg-canon-bg border border-canon-border text-xs focus:border-canon-accent outline-none"
        >
          <option value="magnitude">sort: magnitude</option>
          <option value="id">sort: id</option>
        </select>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2">
        {/* List */}
        <div className="min-h-0 overflow-auto border-r border-canon-border custom-scrollbar">
          {filtered.length === 0 && <div className="p-4 text-xs text-canon-text-light italic">No atoms found.</div>}
          {arr(filtered).map(a => (
            <button
              key={a.id}
              onClick={() => setSelectedId(a.id)}
              className={`w-full text-left px-3 py-2 border-b border-canon-border/50 hover:bg-canon-bg-light transition-colors ${activeSelectedId === a.id ? 'bg-canon-accent/10 border-l-2 border-l-canon-accent' : ''}`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-[10px] text-canon-text-light uppercase tracking-wider flex gap-2">
                    <span className="bg-white/5 px-1 rounded" title={a.ns ?? 'misc'}>
                      {atomNamespaceRu(a.ns ?? 'misc')}
                    </span>
                    <span>{a.origin ?? 'world'}</span>
                </div>
                <div className="text-xs font-mono font-bold text-canon-accent">{Math.round((a.magnitude ?? 0) * 100)}%</div>
              </div>
              <div className="text-xs font-bold truncate text-canon-text">{atomLabelRu(a)}</div>
              {(a as any).code && <div className="text-[9px] font-mono text-canon-text-light/70 truncate">{String((a as any).code)}</div>}
              <div className="text-[9px] font-mono text-canon-text-light/50 truncate" title={a.id}>{a.id}</div>
            </button>
          ))}
        </div>

        {/* Details */}
        <div className="min-h-0 overflow-auto custom-scrollbar bg-canon-bg-light/10">
          {renderDetails ? renderDetails(selected, normalized) : (
            !selected ? (
              <div className="p-8 text-xs text-canon-text-light text-center flex flex-col items-center gap-2 opacity-50">
                  <span className="text-2xl">⚛️</span>
                  Select an atom to inspect details.
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <div className="border-b border-canon-border/50 pb-2">
                    <h3 className="text-sm font-bold text-canon-text mb-1">{atomLabelRu(selected)}</h3>
                    <div className="text-[10px] font-mono text-canon-text-light select-all">{selected.id}</div>
                </div>

                <div className="flex flex-wrap gap-2 text-[10px]">
                  <span className="px-2 py-1 rounded bg-blue-900/30 text-blue-200 border border-blue-500/30">kind: {selected.kind}</span>
                  <span className="px-2 py-1 rounded bg-purple-900/30 text-purple-200 border border-purple-500/30">ns: {selected.ns}</span>
                  <span className="px-2 py-1 rounded bg-green-900/30 text-green-200 border border-green-500/30">origin: {selected.origin}</span>
                  <span className="px-2 py-1 rounded bg-gray-700/50 text-gray-300 border border-gray-500/30">source: {selected.source}</span>
                  {typeof selected.confidence === 'number' && (
                    <span className="px-2 py-1 rounded bg-yellow-900/30 text-yellow-200 border border-yellow-500/30">conf: {Math.round(selected.confidence * 100)}%</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-canon-bg border border-canon-border">
                    <div className="text-canon-text-light mb-1">Magnitude</div>
                    <div className="font-mono text-lg font-bold text-canon-accent">{short(selected.magnitude)}</div>
                  </div>
                  <div className="p-2 rounded bg-canon-bg border border-canon-border">
                    <div className="text-canon-text-light mb-1">Timestamp</div>
                    <div className="font-mono text-canon-text">{short((selected as any).t ?? selected.timestamp ?? '')}</div>
                  </div>
                </div>

                {selected.trace && (
                  <div className="p-2 rounded bg-black/30 border border-canon-border/50">
                    <div className="text-[10px] text-canon-text-light mb-1 uppercase font-bold tracking-wider">Trace (Derivation)</div>
                    <pre className="text-[9px] font-mono text-green-400 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(selected.trace, null, 2)}
                    </pre>
                  </div>
                )}

                <div className="p-2 rounded bg-black/30 border border-canon-border/50">
                  <div className="text-[10px] text-canon-text-light mb-1 uppercase font-bold tracking-wider">Raw JSON</div>
                  <pre className="text-[9px] font-mono text-canon-text-light overflow-x-auto whitespace-pre-wrap select-all">
                      {JSON.stringify(selected, null, 2)}
                  </pre>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
