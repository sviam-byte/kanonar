// components/goal-lab/RelationsPanel.tsx
import React, { useMemo, useState } from 'react';
import { arr } from '../../lib/utils/arr';

type RelEdge = {
  a: string;
  b: string;
  tags: string[];
  strength: number;
  trustPrior?: number;
  threatPrior?: number;
  updatedAtTick?: number;
  sources?: Array<{ kind: string; ref?: string; weight?: number }>;

  bioAspects?: Record<string, number>;
  bioVector?: Record<string, number>;
};

type RelGraph = {
  schemaVersion: number;
  edges: RelEdge[];
};

type Props = {
  selfId: string;
  graph?: RelGraph | null;
  className?: string;
  onSelectTargetId?: (id: string) => void;
};

function pct(x?: number) {
  const v = typeof x === 'number' && Number.isFinite(x) ? x : 0;
  return `${Math.round(v * 100)}%`;
}

export const RelationsPanel: React.FC<Props> = ({ selfId, graph, className, onSelectTargetId }) => {
  const [q, setQ] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('all');

  const edges = useMemo(() => {
    const all = arr(graph?.edges);
    const out = all.filter(e => e.a === selfId);
    const s = q.trim().toLowerCase();

    const filtered = out
      .filter(e => (!s ? true : (`${e.b} ${arr(e.tags).join(' ')}`).toLowerCase().includes(s)))
      .filter(e => (tagFilter === 'all' ? true : arr(e.tags).includes(tagFilter)))
      .sort((x, y) => (y.strength ?? 0) - (x.strength ?? 0));

    const allTags = Array.from(new Set(out.flatMap(e => arr(e.tags)))).sort();

    return {
      filtered: Array.isArray(filtered) ? filtered : [],
      allTags: Array.isArray(allTags) ? allTags : [],
    };
  }, [graph, selfId, q, tagFilter]);

  return (
    <div className={className ?? 'h-full min-h-0 flex flex-col bg-canon-bg text-canon-text'}>
      <div className="p-3 border-b border-canon-border bg-canon-bg-light/30">
        <div className="text-sm font-semibold">Relations (Graph)</div>
        <div className="text-xs text-canon-text-light mt-1">
          Slow memory layer (friend/lover/enemy/etc) + Social biography. Drives ToM priors.
        </div>

        <div className="flex gap-2 mt-3">
          <select
            value={tagFilter}
            onChange={e => setTagFilter(e.target.value)}
            className="px-2 py-2 rounded bg-canon-bg border border-canon-border text-xs focus:outline-none focus:border-canon-accent"
          >
            <option value="all">all tags</option>
            {arr(edges?.allTags).map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            className="flex-1 px-2 py-2 rounded bg-canon-bg border border-canon-border text-xs font-mono focus:outline-none focus:border-canon-accent"
            placeholder="search target/tags"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
        {arr(edges.filtered).map((e, idx) => (
          <div key={idx} className="p-3 border-b border-canon-border/50 hover:bg-canon-bg-light/20 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => onSelectTargetId?.(e.b)}
                className="text-xs font-bold font-mono px-2 py-1 rounded bg-canon-bg border border-canon-border hover:bg-canon-accent hover:text-canon-bg transition-colors"
              >
                {e.b}
              </button>
              <span className="text-[10px] text-canon-text-light font-mono ml-auto">
                str:{pct(e.strength)} · trust:{pct(e.trustPrior)} · threat:{pct(e.threatPrior)}
              </span>
            </div>

            <div className="flex flex-wrap gap-1 mb-2">
              {arr(e.tags).map(t => (
                <span
                  key={t}
                  className="px-1.5 py-0.5 text-[10px] rounded border border-canon-border/40 bg-canon-bg-light/30 text-canon-text-light"
                >
                  {t}
                </span>
              ))}
            </div>

            {e.bioAspects && Object.keys(e.bioAspects).length > 0 && (
              <div className="text-[10px] text-canon-text-light/90 bg-black/20 p-2 rounded mb-2">
                <div className="font-semibold text-[10px] mb-1">Social biography</div>
                <div className="flex flex-wrap gap-2 font-mono">
                  {Object.entries(e.bioAspects)
                    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
                    .slice(0, 8)
                    .map(([k, v]) => (
                      <span key={k} className="px-1.5 py-0.5 rounded border border-canon-border/40 bg-canon-bg-light/20">
                        {k}:{pct(v)}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {e.bioVector && Object.keys(e.bioVector).length > 0 && (
              <div className="text-[10px] text-canon-text-light/90 bg-black/20 p-2 rounded mb-2">
                <div className="font-semibold text-[10px] mb-1">Vector impact</div>
                <div className="flex flex-wrap gap-2 font-mono">
                  {Object.entries(e.bioVector)
                    .sort((a, b) => Math.abs(b[1] ?? 0) - Math.abs(a[1] ?? 0))
                    .slice(0, 8)
                    .map(([k, v]) => (
                      <span key={k} className="px-1.5 py-0.5 rounded border border-canon-border/40 bg-canon-bg-light/20">
                        {k}:{Number.isFinite(v) ? v.toFixed(2) : '0.00'}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {arr(e.sources).length > 0 && (
              <div className="text-[9px] text-canon-text-light/70 bg-black/20 p-1.5 rounded">
                sources:
                {arr(e.sources)
                  .slice(0, 6)
                  .map((s, i) => (
                    <span key={i} className="ml-1">
                      {s.kind}
                      {s.ref ? `:${s.ref}` : ''}
                      {typeof s.weight === 'number' ? `(${Math.round(s.weight * 100)}%)` : ''}
                    </span>
                  ))}
              </div>
            )}
          </div>
        ))}

        {edges.filtered.length === 0 && (
          <div className="p-4 text-xs text-canon-text-light italic text-center">No relations found.</div>
        )}
      </div>
    </div>
  );
};
