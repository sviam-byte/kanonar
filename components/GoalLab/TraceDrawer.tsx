import React, { useMemo } from 'react';
import { arr } from '../../lib/utils/arr';
import { describeAtom } from '../../lib/context/v2/describeAtom';
import { resolveAtomSpec } from '../../lib/context/catalog/atomSpecs';
import { describeQuark } from '../../lib/context/codex/quarkRegistry';

type Atom = {
  id: string;
  m: number;
  c: number;
  o: 'world' | 'obs' | 'override' | 'derived';
  // optional codex fields (kept by debugFrameFromSnapshot)
  code?: string | null;
  specId?: string | null;
  params?: Record<string, any> | null;
  label?: string | null;
  kind?: string | null;
  ns?: string | null;
  source?: string | null;

  // trace/meta (repo uses trace object directly, but old UI expected meta.trace)
  meta?: any;
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function extractTrace(meta: any) {
  if (!meta) return null;
  // newer wrapper
  if (meta.trace && typeof meta.trace === 'object') return meta.trace;
  // common shape in this repo: meta IS trace
  if (meta.usedAtomIds || meta.parts || meta.notes || meta.formulaId) return meta;
  return null;
}

function normalizeNotes(notes: any): string[] {
  if (!notes) return [];
  if (Array.isArray(notes)) return notes.map(x => String(x));
  return [String(notes)];
}

function quarkCodeFromSpec(specId?: string | null, params?: Record<string, any> | null): string | null {
  if (!specId) return null;
  const p: any = params || {};
  switch (specId) {
    case 'world.tick': return 'world.tick';
    case 'world.location.ref': return 'world.location';
    case 'ctx.axis': return `ctx.axis.${p.axis}`;
    case 'ctx.source': return `ctx.src.${p.name}`;
    case 'ctx.source.scoped': return `ctx.src.${p.group}.${p.name}`;
    case 'world.loc.metric': return `world.loc.${p.metric}`;
    case 'world.map.metric': return `world.map.${p.metric}`;
    case 'world.env.hazard': return 'world.env.hazard';
    case 'tom.dyad.metric': return `tom.dyad.${p.metric}`;
    case 'tom.effective.dyad.metric': return `tom.effective.dyad.${p.metric}`;
    case 'rel.base.metric': return `rel.base.${p.metric}`;
    case 'rel.state.metric': return `rel.state.${p.metric}`;
    case 'rel.prior.metric': return `rel.prior.${p.metric}`;
    case 'feat.metric': return `feat.${p.scope}.${p.key}`;
    case 'cap.metric': return `cap.${p.key}`;
    case 'obs.nearby': return 'obs.nearby';
    case 'obs.generic': return `obs.${p.channel}`;
    case 'appraisal.metric': return `app.${p.key}`;
    case 'emotion.core': return `emo.${p.key}`;
    case 'emotion.axis': return `emo.${p.key}`;
    case 'emotion.axis.valence': return `emo.valence`;
    case 'emotion.dyad': return `emo.dyad.${p.key}`;
    case 'mind.metric': return `mind.metric.${p.key}`;
    case 'lens.suspicion': return `lens.suspicion`;
    case 'trace.metric': return `trace.${p.key}`;
    default: return specId;
  }
}

export function TraceDrawer({
  atom,
  index,
  onJump,
}: {
  atom: Atom | null;
  index?: Record<string, Atom>;
  onJump?: (id: string) => void;
}) {
  if (!atom) {
    return <div className="p-8 text-center text-canon-text-light italic text-xs">Выберите атом для просмотра трассировки.</div>;
  }
  const tr = extractTrace(atom.meta);

  // spec/title/meaning
  const resolved = useMemo(() => resolveAtomSpec(atom.id), [atom.id]);
  const specId = atom.specId ?? resolved?.spec.specId ?? null;
  const params = atom.params ?? (resolved?.params as any) ?? null;
  const code = atom.code ?? quarkCodeFromSpec(specId, params);
  const desc = useMemo(() => describeAtom({ id: atom.id, label: atom.label ?? atom.id, code } as any), [atom.id, atom.label, code]);
  const quark = useMemo(() => describeQuark(code), [code]);

  const notes = normalizeNotes(tr?.notes);

  // parts normalization
  const partsRaw = tr?.parts;
  const partsList = useMemo(() => {
    if (Array.isArray(partsRaw)) return partsRaw as any[];
    if (partsRaw && typeof partsRaw === 'object') {
      return Object.entries(partsRaw).map(([name, value]) => {
        const v = (value as any) || {};
        return {
          name,
          value: typeof v === 'number' ? v : v.val ?? v.value ?? 0,
          weight: v.w ?? v.weight ?? 1,
        };
      });
    }
    return [];
  }, [partsRaw]);

  // causal summary (top contributors)
  const topParts = useMemo(() => {
    const scored = partsList.map(p => {
      const v = Number((p as any).value ?? 0);
      const w = Number((p as any).weight ?? 1);
      const score = Math.abs(v * w);
      return { ...p, v, w, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 6);
  }, [partsList]);

  // Reconstruction check: sum(val * w) vs atom.m
  const recon = useMemo(() => {
    let sum = 0;
    for (const p of partsList as any[]) {
      const v = Number(p?.value ?? p?.v ?? 0);
      const w = Number(p?.weight ?? p?.w ?? 1);
      if (!Number.isFinite(v) || !Number.isFinite(w)) continue;
      sum += v * w;
    }
    const m = Number(atom.m ?? 0);
    const diff = sum - m;
    const sumClamped = clamp01(sum);
    const diffClamped = sumClamped - m;
    return { sum, m, diff, absDiff: Math.abs(diff), sumClamped, diffClamped };
  }, [partsList, atom.m]);

  const recon2 = useMemo(() => {
    // Optional hint: if formula uses clamp01 after sum, show it too
    let sum = 0;
    for (const p of partsList as any[]) {
      const v = Number(p?.value ?? p?.v ?? 0);
      const w = Number(p?.weight ?? p?.w ?? 1);
      if (!Number.isFinite(v) || !Number.isFinite(w)) continue;
      sum += v * w;
    }
    const sumClamped = clamp01(sum);
    const m = Number(atom.m ?? 0);
    const diff = sumClamped - m;
    return { sumClamped, diff, absDiff: Math.abs(diff) };
  }, [partsList, atom.m]);

  const usedIds: string[] = arr(tr?.usedAtomIds).map(String);

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="bg-canon-bg p-4 rounded border border-canon-border">
        <div className="text-[10px] font-bold text-canon-accent uppercase mb-2">Selected Atom</div>
        <div className="font-mono text-sm font-bold text-white break-all mb-4">{atom.id}</div>
        {/* WHAT IS THIS ATOM */}
        <div className="mt-2 p-3 bg-black/30 border border-white/10 rounded">
          <div className="text-[10px] uppercase tracking-wider font-bold text-canon-text-light mb-1">What it is</div>
          <div className="text-xs font-bold text-white">{desc.title}</div>
          <div className="mt-1 text-[11px] text-canon-text-light leading-relaxed">{desc.meaning}</div>
          <div className="mt-3 p-2 rounded border border-white/10 bg-black/40">
            <div className="text-[10px] uppercase tracking-wider font-bold text-canon-text-light mb-1">Quark</div>
            <div className="text-[11px] text-white font-bold">{quark.title}</div>
            <div className="text-[11px] text-canon-text-light leading-relaxed">{quark.meaning}</div>
            <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-mono text-canon-text-light/80">
              <span className="px-2 py-1 rounded border border-white/10 bg-white/5">code: {String(quark.code)}</span>
              <span className="px-2 py-1 rounded border border-white/10 bg-white/5">family: {String(quark.family)}</span>
              {Array.isArray(quark.tags) ? (
                <span className="px-2 py-1 rounded border border-white/10 bg-white/5">tags: {quark.tags.join(', ')}</span>
              ) : null}
            </div>
            {quark.scale ? (
              <div className="mt-1 text-[10px] text-canon-text-light/80">
                scale: [{quark.scale.min}..{quark.scale.max}] {quark.scale.unit || ''} · low: {quark.scale.lowMeans} · high: {quark.scale.highMeans}
                {quark.scale.typical ? ` · typical: ${quark.scale.typical}` : ''}
              </div>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-mono">
            {specId ? <span className="px-2 py-1 rounded border border-white/10 bg-white/5">spec: {String(specId)}</span> : null}
            {code ? <span className="px-2 py-1 rounded border border-white/10 bg-white/5">quark: {String(code)}</span> : null}
            {atom.ns ? <span className="px-2 py-1 rounded border border-white/10 bg-white/5">ns: {String(atom.ns)}</span> : null}
            {atom.kind ? <span className="px-2 py-1 rounded border border-white/10 bg-white/5">kind: {String(atom.kind)}</span> : null}
            {atom.source ? <span className="px-2 py-1 rounded border border-white/10 bg-white/5">source: {String(atom.source)}</span> : null}
          </div>
          {params ? (
            <div className="mt-2">
              <div className="text-[10px] text-canon-text-light/70 mb-1">params</div>
              <pre className="text-[10px] font-mono whitespace-pre-wrap break-words bg-black/40 border border-white/10 rounded p-2">
{JSON.stringify(params, null, 2)}
              </pre>
            </div>
          ) : null}
          {desc.scale ? (
            <div className="mt-2 text-[10px] text-canon-text-light/80">
              scale: [{desc.scale.min}..{desc.scale.max}] {desc.scale.unit || ''} · low: {desc.scale.lowMeans} · high: {desc.scale.highMeans}
              {desc.scale.typical ? ` · typical: ${desc.scale.typical}` : ''}
            </div>
          ) : null}
          {desc.formula ? (
            <div className="mt-1 text-[10px] text-canon-text-light/80">
              formula: <span className="text-green-400">{desc.formula}</span>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs font-mono">
          <div className="p-2 bg-black/40 rounded border border-white/5">
             <div className="text-[9px] text-canon-text-light uppercase mb-1">Magnitude</div>
             <div className="text-canon-accent text-lg font-bold">{atom.m.toFixed(3)}</div>
          </div>
          <div className="p-2 bg-black/40 rounded border border-white/5">
             <div className="text-[9px] text-canon-text-light uppercase mb-1">Confidence</div>
             <div className="text-white text-lg font-bold">{atom.c.toFixed(3)}</div>
          </div>
          <div className="p-2 bg-black/40 rounded border border-white/5">
             <div className="text-[9px] text-canon-text-light uppercase mb-1">Origin</div>
             <div className="text-canon-text text-lg font-bold uppercase">{atom.o}</div>
          </div>
        </div>
        {tr?.formulaId && <div className="mt-3 text-[10px] font-mono text-canon-text-light">FormulaId: <span className="text-green-400">{tr.formulaId}</span></div>}
        {notes.length ? (
          <div className="mt-2 p-2 bg-blue-900/10 border border-blue-500/20 rounded text-[11px] text-blue-200">
            <div className="font-bold text-[10px] uppercase tracking-wider mb-1">Notes</div>
            <ul className="list-disc pl-5 space-y-0.5">
              {arr(notes).slice(0, 8).map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        ) : null}
      </div>

      {/* CAUSAL SUMMARY (WHY) */}
      <div className="bg-canon-bg p-4 rounded border border-canon-border">
        <div className="text-[10px] font-bold text-canon-accent uppercase mb-2">Why this value</div>
        <div className="mb-3 p-2 bg-black/30 border border-white/10 rounded">
          <div className="text-[10px] uppercase tracking-wider font-bold text-canon-text-light mb-1">Reconstruction</div>
          <div className="text-[11px] font-mono text-canon-text-light">
            Σ(val·w) = <span className="text-white font-bold">{recon.sum.toFixed(4)}</span>
            {'  '}· atom.m = <span className="text-white font-bold">{recon.m.toFixed(4)}</span>
            {'  '}· diff ={' '}
            <span className={recon.absDiff > 0.02 ? "text-red-400 font-bold" : "text-green-400 font-bold"}>
              {recon.diff.toFixed(4)}
            </span>
          </div>
          <div className="text-[10px] font-mono text-canon-text-light/80 mt-1">
            clamp01(Σ) = <span className="text-white font-bold">{recon2.sumClamped.toFixed(4)}</span>
            {'  '}· diffClamp ={' '}
            <span className={recon2.absDiff > 0.02 ? "text-amber-400 font-bold" : "text-green-400 font-bold"}>
              {recon2.diff.toFixed(4)}
            </span>
          </div>
          <div className="text-[10px] text-canon-text-light/70 mt-1">
            Если diff большой — parts/веса не соответствуют реальной формуле ИЛИ есть clamp/нелинейность после суммирования (последнее тогда стоит явно фиксировать в trace.notes).
          </div>
        </div>
        {topParts.length ? (
          <>
            <div className="text-[11px] text-canon-text-light mb-2">
              Main drivers: {topParts.map(p => String((p as any).name)).slice(0, 3).join(', ')}.
            </div>
            <div className="border border-canon-border rounded-lg overflow-hidden bg-black/30">
              <table className="w-full text-xs text-left">
                <thead className="bg-black/40 font-bold text-[9px] uppercase text-canon-text-light">
                  <tr>
                    <th className="p-2">Contributor</th>
                    <th className="p-2 w-16 text-right">Val</th>
                    <th className="p-2 w-16 text-right">W</th>
                    <th className="p-2 w-20 text-right">|Val·W|</th>
                  </tr>
                </thead>
                <tbody>
                  {topParts.map((p: any, i: number) => {
                    const name = String(p.name);
                    const canJump = !!index?.[name];
                    return (
                      <tr key={i} className="border-t border-canon-border/30 hover:bg-white/5">
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            {canJump ? (
                              <button
                                onClick={() => onJump?.(name)}
                                className="px-1.5 py-0.5 rounded bg-canon-accent text-black font-bold text-[9px] uppercase hover:bg-opacity-80"
                              >
                                Jump
                              </button>
                            ) : null}
                            <span className="font-mono text-[10px] truncate max-w-[260px]" title={name}>{name}</span>
                          </div>
                        </td>
                        <td className="p-2 text-right font-mono text-canon-accent">{Number(p.v ?? 0).toFixed(2)}</td>
                        <td className="p-2 text-right font-mono text-canon-text-light">{Number(p.w ?? 1).toFixed(2)}</td>
                        <td className="p-2 text-right font-mono text-white">{Number(p.score ?? 0).toFixed(3)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-xs text-canon-text-light italic">
            No parts trace available (для derived-атомов это стоит добавить).
          </div>
        )}
      </div>

      <div>
        <h4 className="text-[10px] font-bold text-canon-text-light uppercase mb-2 px-1">Derivation Path (Used Atoms)</h4>
        <div className="space-y-1">
          {usedIds.length === 0 && <div className="text-xs text-canon-text-light italic px-2">None</div>}
          {arr(usedIds).map(id => {
            const exists = index?.[id];
            return (
              <div key={id} className="flex gap-2 items-center bg-canon-bg border border-canon-border/30 p-2 rounded hover:bg-canon-bg-light/30 transition-colors">
                <button
                  onClick={() => onJump?.(id)}
                  className="px-1.5 py-0.5 rounded bg-canon-accent text-black font-bold text-[9px] uppercase hover:bg-opacity-80"
                >
                  Jump
                </button>
                <span className="font-mono text-[10px] flex-1 truncate text-canon-text" title={id}>{id}</span>
                {exists ? (
                  <span className="font-mono text-[10px] text-canon-accent font-bold">m={exists.m.toFixed(2)}</span>
                ) : (
                  <span className="font-mono text-[9px] text-red-500 italic">(missing)</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
