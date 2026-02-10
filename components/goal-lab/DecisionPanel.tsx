// components/goal-lab/DecisionPanel.tsx
import React, { useMemo, useState } from 'react';
import type { ContextAtom } from '../../lib/context/v2/types';
import { arr } from '../../lib/utils/arr';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function pct(x: number) {
  return Math.round(clamp01(x) * 100);
}

function buildGoalEnergyMap(atoms: ContextAtom[], selfId: string): Record<string, number> {
  const out: Record<string, number> = {};
  const activePrefix = `util:activeGoal:${selfId}:`;
  for (const a of arr<ContextAtom>(atoms)) {
    const id = String((a as any)?.id || '');
    if (!id.startsWith(activePrefix)) continue;
    const goalId = id.slice(activePrefix.length);
    out[goalId] = clamp01(Number((a as any)?.magnitude ?? 0));
  }
  if (Object.keys(out).length) return out;
  // Fallback: goal domains (if util:* is not present)
  for (const a of arr<ContextAtom>(atoms)) {
    const id = String((a as any)?.id || '');
    if (!id.startsWith('goal:domain:')) continue;
    const parts = id.split(':');
    const domain = parts[2];
    const owner = parts[3];
    if (!domain || owner !== selfId) continue;
    out[domain] = clamp01(Number((a as any)?.magnitude ?? 0));
  }
  return out;
}

type Props = {
  decision: any;
  selfId?: string;
  castDecisions?: any[];
  atoms?: ContextAtom[];
};

export const DecisionPanel: React.FC<Props> = ({ decision, selfId, castDecisions, atoms }) => {
  const ranked = useMemo(() => arr(decision?.ranked), [decision]);
  const isNew = Boolean(ranked[0]?.action);
  const bestId = isNew ? (decision?.best?.id || null) : (decision?.best?.p?.id || decision?.best?.id || null);
  const [showDetails, setShowDetails] = useState(false);
  const [sel, setSel] = useState(0);

  const current = ranked[sel] || null;
  const goalEnergy = useMemo(() => {
    const sid = String(selfId || '');
    if (!sid) return {};
    if (decision?.goalEnergy && typeof decision.goalEnergy === 'object') return decision.goalEnergy as Record<string, number>;
    return buildGoalEnergyMap(arr(atoms), sid);
  }, [decision, atoms, selfId]);

  const labelWithTarget = (a: any) => {
    const node = isNew ? (a?.action || a) : a;
    const targetId = node?.p?.targetId || node?.targetId || null;
    return `${node?.label || node?.p?.id || node?.id || 'Untitled action'}${targetId ? ` → ${targetId}` : ''}`;
  };

  const breakdown = useMemo(() => {
    if (!current) return null;
    const node = isNew ? (current?.action || current) : current;
    const deltaGoals: Record<string, number> = isNew
      ? (node?.deltaGoals || {})
      : (node?.why?.parts?.deltaGoals || node?.deltaGoals || {});
    const cost = Number((node?.cost) ?? 0);
    const confidence = clamp01(Number((node?.confidence) ?? 1));
    const rows = Object.entries(deltaGoals)
      .map(([goalId, delta]) => {
        const E = Number((goalEnergy as any)?.[goalId] ?? 0);
        const d = Number(delta ?? 0);
        return { goalId, E, delta: d, contrib: E * d };
      })
      .sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib));
    const sum = rows.reduce((s, r) => s + r.contrib, 0);
    const preConf = sum - cost;
    const q = preConf * confidence;
    return { rows, sum, cost, confidence, preConf, q };
  }, [current, isNew, goalEnergy]);

  // Diagnostics: detect "everything is the same" failure mode.
  // 1) If no trait atoms participate in the top actions, personalization is likely broken.
  const traitUsedInTop = useMemo(() => {
    const top = ranked.slice(0, 5);
    for (const a of top) {
      const used = arr(isNew ? a?.action?.supportAtoms?.map((x: any) => x?.id).filter(Boolean) : a?.why?.usedAtomIds);
      if (used.some((id: any) => String(id).includes('feat:char:') && String(id).includes('trait.'))) return true;
    }
    return false;
  }, [ranked, isNew]);

  // 2) If many agents have the exact same best action id, target inference or emotions/traits are likely flat.
  // (This panel can still be used standalone; only warns when castDecisions is provided.)
  const castSameBestWarning = useMemo(() => {
    const list = arr(castDecisions);
    if (list.length < 3) return null;
    const bestIds = list
      .map((d: any) => d?.best?.action?.id || d?.best?.p?.id || d?.best?.id || null)
      .filter(Boolean);
    if (bestIds.length < 3) return null;
    const freq = new Map<string, number>();
    for (const id of bestIds) freq.set(String(id), (freq.get(String(id)) || 0) + 1);
    let top: { id: string; n: number } | null = null;
    for (const [id, n] of freq.entries()) {
      if (!top || n > top.n) top = { id, n };
    }
    if (!top) return null;
    const ratio = top.n / bestIds.length;
    if (ratio >= 0.7) return { id: top.id, n: top.n, total: bestIds.length, ratio };
    return null;
  }, [castDecisions]);

  return (
    <div className="h-full min-h-0 flex bg-canon-bg text-canon-text">
      <div className="w-80 border-r border-canon-border overflow-auto custom-scrollbar flex-shrink-0">
        <div className="p-3 border-b border-canon-border bg-canon-bg-light/30">
          <div className="text-sm font-semibold">What I’ll do</div>
          <div className="text-xs text-canon-text-light mt-1">Ranked actions</div>
        </div>
        {(!traitUsedInTop || castSameBestWarning) && (
          <div className="p-3 border-b border-canon-border/60 bg-amber-900/10">
            <div className="text-[10px] uppercase tracking-wider font-bold text-amber-200">Diagnostics</div>
            {!traitUsedInTop && (
              <div className="mt-1 text-[11px] text-amber-100/90">
                Personalization may be flat: no <span className="font-mono">feat:char:*:trait.*</span> atoms in top-5 usedAt.
              </div>
            )}
            {castSameBestWarning && (
              <div className="mt-1 text-[11px] text-amber-100/90">
                Same best action for many agents: <span className="font-mono">{castSameBestWarning.id}</span> ({castSameBestWarning.n}/{castSameBestWarning.total}).
              </div>
            )}
          </div>
        )}
        {ranked.map((a: any, i: number) => {
          const isBest = (isNew ? (a?.action?.id || a?.id) : (a?.p?.id || a?.id)) === bestId;
          const allowed = isNew ? true : Boolean(a?.allowed);
          return (
            <button
              key={(isNew ? a?.action?.id : a?.id) || i}
              className={`w-full text-left p-3 border-b border-canon-border/50 hover:bg-canon-bg-light/20 transition-colors ${
                i === sel ? 'bg-canon-accent/10 border-l-2 border-l-canon-accent' : ''
              }`}
              onClick={() => setSel(i)}
            >
              <div className="flex items-center justify-between">
                <div className={`text-sm font-bold ${allowed ? 'text-canon-text' : 'text-canon-text-light/50'}`}>
                  {labelWithTarget(a)}
                </div>
                {isBest ? (
                  <span className="text-[10px] uppercase tracking-wide text-canon-accent">best</span>
                ) : null}
              </div>
              <div className="text-[10px] font-mono mt-1 text-canon-text-light">
                score={isNew ? Number(a?.q ?? 0).toFixed(3) : pct(a.score || 0)} cost={pct((isNew ? a?.action?.cost : a?.cost) || 0)} {allowed ? '' : 'BLOCKED'}
              </div>
            </button>
          );
        })}
        {ranked.length === 0 && (
          <div className="p-4 text-xs text-canon-text-light italic text-center">No actions ranked.</div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 custom-scrollbar">
        {!current ? (
          <div className="text-sm text-canon-text-light italic text-center p-8">No action selected</div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-canon-text mb-1">{labelWithTarget(current)}</h3>
                <div className="text-xs font-mono text-canon-text-light">id: {isNew ? (current?.action?.id || current?.id) : current.id}</div>
              </div>
              <label className="flex items-center gap-2 text-xs text-canon-text-light">
                <input
                  type="checkbox"
                  checked={showDetails}
                  onChange={e => setShowDetails(e.target.checked)}
                />
                Show details
              </label>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 bg-canon-bg border border-canon-border rounded">
                <span className="text-canon-text-light block">Score</span>
                <span className="font-bold font-mono text-canon-accent">{isNew ? Number(current?.q || 0).toFixed(3) : Number(current.score || 0).toFixed(3)}</span>
              </div>
              <div className="p-2 bg-canon-bg border border-canon-border rounded">
                <span className="text-canon-text-light block">Cost</span>
                <span className="font-bold font-mono text-orange-400">{Number((isNew ? current?.action?.cost : current?.cost) || 0).toFixed(3)}</span>
              </div>
              <div className="p-2 bg-canon-bg border border-canon-border rounded">
                <span className="text-canon-text-light block">Allowed</span>
                <span className={`font-bold font-mono ${(isNew ? true : current.allowed) ? 'text-green-400' : 'text-red-400'}`}>
                  {String(isNew ? true : current.allowed).toUpperCase()}
                </span>
              </div>
            </div>

            {breakdown && (
              <div className="p-3 rounded bg-black/20 border border-canon-border/30 text-xs">
                <div className="font-bold text-canon-text-light mb-2 uppercase tracking-wider">Q-value breakdown</div>
                <div className="border border-white/10 rounded overflow-hidden">
                  <div className="grid grid-cols-12 bg-black/40 text-[9px] uppercase text-canon-text-light font-bold">
                    <div className="col-span-5 p-2">goal</div>
                    <div className="col-span-2 p-2 text-right">E</div>
                    <div className="col-span-2 p-2 text-right">Δ</div>
                    <div className="col-span-3 p-2 text-right">E×Δ</div>
                  </div>
                  {breakdown.rows.slice(0, 24).map((r) => (
                    <div key={r.goalId} className="grid grid-cols-12 border-t border-white/5 bg-black/20 text-[10px] font-mono">
                      <div className="col-span-5 p-2 truncate" title={r.goalId}>{r.goalId}</div>
                      <div className="col-span-2 p-2 text-right text-canon-accent">{Number(r.E).toFixed(2)}</div>
                      <div className={`col-span-2 p-2 text-right ${r.delta >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>{r.delta >= 0 ? '+' : ''}{Number(r.delta).toFixed(2)}</div>
                      <div className={`col-span-3 p-2 text-right ${r.contrib >= 0 ? 'text-emerald-200' : 'text-amber-200'}`}>{r.contrib >= 0 ? '+' : ''}{Number(r.contrib).toFixed(3)}</div>
                    </div>
                  ))}
                  <div className="grid grid-cols-12 border-t border-white/10 bg-black/30 text-[10px] font-mono">
                    <div className="col-span-9 p-2 text-right text-canon-text-light">Σ(E×Δ)</div>
                    <div className="col-span-3 p-2 text-right text-canon-accent">{Number(breakdown.sum).toFixed(3)}</div>
                  </div>
                  <div className="grid grid-cols-12 border-t border-white/10 bg-black/30 text-[10px] font-mono">
                    <div className="col-span-9 p-2 text-right text-canon-text-light">− cost</div>
                    <div className="col-span-3 p-2 text-right text-orange-300">-{Number(breakdown.cost).toFixed(3)}</div>
                  </div>
                  <div className="grid grid-cols-12 border-t border-white/10 bg-black/30 text-[10px] font-mono">
                    <div className="col-span-9 p-2 text-right text-canon-text-light">× confidence</div>
                    <div className="col-span-3 p-2 text-right text-canon-text">×{Number(breakdown.confidence).toFixed(2)}</div>
                  </div>
                  <div className="grid grid-cols-12 border-t border-white/10 bg-black/40 text-[10px] font-mono font-bold">
                    <div className="col-span-9 p-2 text-right text-canon-text">Q(a)</div>
                    <div className="col-span-3 p-2 text-right text-canon-accent">{Number(breakdown.q).toFixed(3)}</div>
                  </div>
                </div>
              </div>
            )}

            {!isNew && current.why?.blockedBy?.length > 0 && (
              <div className="p-3 rounded bg-red-900/10 border border-red-500/30 text-xs">
                <div className="font-bold text-red-300 mb-2 uppercase tracking-wider">Blocked by</div>
                <div className="font-mono text-red-200">{current.why.blockedBy.join('  ')}</div>
              </div>
            )}

            {showDetails ? (
              <>
                <div className="p-3 rounded bg-black/20 border border-canon-border/30 text-xs">
                  <div className="font-bold text-canon-text-light mb-2 uppercase tracking-wider">Why (parts)</div>
                  <pre className="font-mono text-[10px] text-green-400 overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(isNew ? (current?.action?.deltaGoals || {}) : (current.why?.parts || {}), null, 2)}
                  </pre>
                </div>

                <div className="p-3 rounded bg-black/20 border border-canon-border/30 text-xs">
                  <div className="font-bold text-canon-text-light mb-2 uppercase tracking-wider">Used Atoms</div>
                  <div className="font-mono text-[10px] text-canon-text-light break-all leading-relaxed">
                    {arr(isNew ? current?.action?.supportAtoms?.map((a: any) => a?.id).filter(Boolean) : current.why?.usedAtomIds).slice(0, 80).join('  ')}
                    {arr(isNew ? current?.action?.supportAtoms?.map((a: any) => a?.id).filter(Boolean) : current.why?.usedAtomIds).length > 80 && ' ...'}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};
