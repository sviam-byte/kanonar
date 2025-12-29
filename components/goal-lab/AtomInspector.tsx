import React from 'react';
import type { ContextAtom } from '../../lib/context/v2/types';
import { describeAtom } from '../../lib/context/v2/describeAtom';
import { resolveAtomSpec } from '../../lib/context/catalog/atomSpecs';

type Props = {
  atom: ContextAtom | null;
  allAtoms: ContextAtom[];
  onJumpToAtomId?: (id: string) => void;
};

function pct(v: any): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '0%';
  return `${Math.round(n * 100)}%`;
}

function asPartsList(parts: any): Array<{ name: string; value: number; weight?: number }> {
  if (!parts) return [];
  if (Array.isArray(parts)) {
    return parts.map((p: any) => ({
      name: String(p?.name ?? p?.key ?? 'part'),
      value: Number(p?.value ?? p?.val ?? 0),
      weight: p?.weight !== undefined ? Number(p.weight) : (p?.w !== undefined ? Number(p.w) : undefined),
    }));
  }
  if (typeof parts === 'object') {
    return Object.entries(parts).map(([name, v]: any) => ({
      name,
      value: Number(v?.value ?? v?.val ?? v ?? 0),
      weight: v?.weight !== undefined ? Number(v.weight) : (v?.w !== undefined ? Number(v.w) : undefined),
    }));
  }
  return [];
}

function Badge({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'gray'|'blue'|'green'|'red'|'purple'|'amber' }) {
  const cls =
    tone === 'blue' ? 'bg-blue-900/30 text-blue-200 border-blue-500/30' :
    tone === 'green' ? 'bg-green-900/30 text-green-200 border-green-500/30' :
    tone === 'red' ? 'bg-red-900/30 text-red-200 border-red-500/30' :
    tone === 'purple' ? 'bg-purple-900/30 text-purple-200 border-purple-500/30' :
    tone === 'amber' ? 'bg-amber-900/30 text-amber-200 border-amber-500/30' :
    'bg-gray-700/40 text-gray-200 border-gray-500/30';
  return <span className={`px-2 py-1 rounded border text-[10px] font-mono ${cls}`}>{children}</span>;
}

export function AtomInspector({ atom, allAtoms, onJumpToAtomId }: Props) {
  if (!atom) return null;

  const d = describeAtom(atom);
  const resolved = resolveAtomSpec(atom.id);
  const specId = (atom as any).specId ?? resolved?.spec.specId;
  const code = (atom as any).code;
  const params = (atom as any).params ?? resolved?.params ?? null;

  const used: string[] = (atom as any).trace?.usedAtomIds || [];
  const partsRaw = (atom as any).trace?.parts || null;
  const partsList = asPartsList(partsRaw);
  const isDerived = (atom as any).origin === 'derived';
  const kind = String((atom as any).kind ?? '');
  const ns = String((atom as any).ns ?? '');
  const origin = String((atom as any).origin ?? '');
  const source = String((atom as any).source ?? '');

  const index = new Map<string, ContextAtom>();
  for (const a of allAtoms) index.set(a.id, a);

  const isQuark = !isDerived && used.length === 0;
  const typeLabel = isDerived ? 'MOLECULE (derived)' : (isQuark ? 'QUARK (primitive)' : 'ATOM');

  const tokens = String(atom.id || '').split(':').filter(Boolean);
  const mag = Number((atom as any).magnitude ?? 0);
  const conf = (atom as any).confidence;

  return (
    <div className="p-4 rounded-xl border border-canon-border bg-canon-bg">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-canon-text">{d.title}</div>
          <div className="text-[10px] font-mono text-canon-text-light/70 break-all mt-1 select-all">{atom.id}</div>
        </div>
        <Badge tone={isDerived ? 'purple' : 'blue'}>{typeLabel}</Badge>
      </div>

      {/* Meaning */}
      <div className="mt-3 text-xs text-canon-text-light leading-relaxed">
        {d.meaning}
      </div>

      {/* Quick meta */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge tone="gray">ns: {ns || '—'}</Badge>
        <Badge tone="gray">kind: {kind || '—'}</Badge>
        <Badge tone="green">origin: {origin || '—'}</Badge>
        <Badge tone="gray">source: {source || '—'}</Badge>
        {typeof conf === 'number' && <Badge tone="amber">conf: {pct(conf)}</Badge>}
        {specId && <Badge tone="purple">spec: {String(specId)}</Badge>}
        {code && <Badge tone="blue">code: {String(code)}</Badge>}
      </div>

      {/* Value */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3 rounded-lg border border-canon-border bg-black/20">
          <div className="text-[10px] uppercase tracking-wider text-canon-text-light font-bold">Value</div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <div className="font-mono text-xl font-bold text-canon-accent">{Number.isFinite(mag) ? mag.toFixed(3) : '0.000'}</div>
            <div className="text-[11px] font-mono text-canon-text-light">{pct(mag)}</div>
          </div>
          <div className="h-2 mt-2 w-full bg-canon-bg-light rounded-full overflow-hidden">
            <div className="h-full bg-canon-accent" style={{ width: `${Math.min(100, Math.max(0, mag * 100))}%` }} />
          </div>
          {d.scale && (
            <div className="mt-2 text-[10px] text-canon-text-light/80">
              <div>scale: [{d.scale.min}..{d.scale.max}] {d.scale.unit || ''}</div>
              <div>low: {d.scale.lowMeans}</div>
              <div>high: {d.scale.highMeans}</div>
              {d.scale.typical && <div>typical: {d.scale.typical}</div>}
            </div>
          )}
          {d.formula && (
            <div className="mt-2 text-[10px] text-canon-text-light/80">
              <span className="font-bold">formula:</span> {d.formula}
            </div>
          )}
        </div>

        {/* Params / family */}
        <div className="p-3 rounded-lg border border-canon-border bg-black/20">
          <div className="text-[10px] uppercase tracking-wider text-canon-text-light font-bold">Family decode</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {tokens.slice(0, 10).map((t, i) => (
              <span key={i} className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-canon-text-light">
                {t}
              </span>
            ))}
            {tokens.length > 10 && <span className="text-[10px] text-canon-text-light/60 font-mono">…</span>}
          </div>

          {params ? (
            <div className="mt-2">
              <div className="text-[10px] text-canon-text-light/70 mb-1">params:</div>
              <pre className="text-[10px] font-mono text-canon-text-light whitespace-pre-wrap bg-black/30 border border-white/10 rounded p-2 select-all">
{JSON.stringify(params, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="mt-2 text-[10px] text-red-200/80">
              Нет params/spec для этого id → добавь AtomSpec в <span className="font-mono">lib/context/catalog/atomSpecs.ts</span>.
            </div>
          )}
        </div>
      </div>

      {/* Pipeline hooks */}
      {(d.producedBy?.length || d.consumedBy?.length) ? (
        <div className="mt-4 p-3 rounded-lg border border-canon-border bg-black/20">
          <div className="text-[10px] uppercase tracking-wider text-canon-text-light font-bold">Pipeline</div>
          {d.producedBy?.length ? (
            <div className="mt-2 text-[11px] text-canon-text-light">
              <span className="font-bold">produced by:</span> {d.producedBy.join(', ')}
            </div>
          ) : null}
          {d.consumedBy?.length ? (
            <div className="mt-1 text-[11px] text-canon-text-light">
              <span className="font-bold">consumed by:</span> {d.consumedBy.join(', ')}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Trace */}
      <div className="mt-4 p-3 rounded-lg border border-canon-border bg-black/20">
        <div className="text-[10px] uppercase tracking-wider text-canon-text-light font-bold">Trace</div>

        {used.length === 0 ? (
          <div className="mt-2 text-[11px] text-canon-text-light/70">
            {isDerived ? 'Нет usedAtomIds (для derived это плохо — трасса должна быть).' : 'usedAtomIds: —'}
          </div>
        ) : (
          <div className="mt-2 space-y-1">
            {used.slice(0, 80).map(id => {
              const a = index.get(id);
              const m = a ? Number((a as any).magnitude ?? 0) : null;
              return (
                <div key={id} className="flex items-center gap-2 border border-white/10 rounded bg-black/30 px-2 py-1">
                  {onJumpToAtomId ? (
                    <button
                      onClick={() => onJumpToAtomId(id)}
                      className="px-2 py-0.5 rounded bg-canon-accent text-black text-[9px] font-bold uppercase hover:bg-opacity-80"
                    >
                      jump
                    </button>
                  ) : null}
                  <div className="flex-1 min-w-0 font-mono text-[10px] text-canon-text truncate" title={id}>{id}</div>
                  {a ? (
                    <div className="font-mono text-[10px] text-canon-accent">{Number.isFinite(m as any) ? (m as number).toFixed(2) : '—'}</div>
                  ) : (
                    <div className="font-mono text-[10px] text-red-300/70 italic">missing</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-3">
          <div className="text-[10px] text-canon-text-light/70 mb-1">parts:</div>
          {partsList.length ? (
            <div className="border border-white/10 rounded overflow-hidden">
              <div className="grid grid-cols-12 bg-black/40 text-[9px] uppercase text-canon-text-light font-bold">
                <div className="col-span-7 p-2">name</div>
                <div className="col-span-3 p-2 text-right">value</div>
                <div className="col-span-2 p-2 text-right">w</div>
              </div>
              {partsList.slice(0, 60).map((p, i) => (
                <div key={i} className="grid grid-cols-12 border-t border-white/5 bg-black/20 text-[10px] font-mono">
                  <div className="col-span-7 p-2 truncate" title={p.name}>{p.name}</div>
                  <div className="col-span-3 p-2 text-right text-canon-accent">{Number(p.value ?? 0).toFixed(2)}</div>
                  <div className="col-span-2 p-2 text-right text-canon-text-light">{p.weight !== undefined ? Number(p.weight).toFixed(2) : '—'}</div>
                </div>
              ))}
            </div>
          ) : (
            <pre className="text-[10px] font-mono text-canon-text-light whitespace-pre-wrap bg-black/30 border border-white/10 rounded p-2 select-all">
{JSON.stringify(partsRaw, null, 2)}
            </pre>
          )}
        </div>
      </div>

      {/* Raw */}
      <div className="mt-4 p-3 rounded-lg border border-canon-border bg-black/20">
        <div className="text-[10px] uppercase tracking-wider text-canon-text-light font-bold">Raw JSON</div>
        <pre className="mt-2 text-[10px] font-mono text-canon-text-light whitespace-pre-wrap select-all">
{JSON.stringify(atom, null, 2)}
        </pre>
      </div>
    </div>
  );
}
