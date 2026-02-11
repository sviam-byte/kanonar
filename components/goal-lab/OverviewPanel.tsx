import React, { useMemo } from 'react';
import type { ContextAtom } from '../../lib/context/v2/types';
import { arr } from '../../lib/utils/arr';

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function fmt2(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

function fmt3(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return '0.000';
  return n.toFixed(3);
}

function getMag(atoms: ContextAtom[], id: string, fb = 0): number {
  const a = atoms.find((x) => String((x as any)?.id || '') === id) as any;
  const n = Number(a?.magnitude);
  return Number.isFinite(n) ? clamp01(n) : fb;
}

function buildGoalEnergyMap(atoms: ContextAtom[], selfId: string): Record<string, number> {
  const out: Record<string, number> = {};
  const activePrefix = `util:activeGoal:${selfId}:`;
  for (const a of arr(atoms)) {
    const id = String((a as any)?.id || '');
    if (!id.startsWith(activePrefix)) continue;
    const goalId = id.slice(activePrefix.length);
    out[goalId] = clamp01(Number((a as any)?.magnitude ?? 0));
  }
  if (Object.keys(out).length) return out;

  // Fallback for older/mixed snapshots that still keep goal energy in goal:domain:*.
  for (const a of arr(atoms)) {
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

function findFirstExistingAtomId(atoms: ContextAtom[], candidates: string[]): string | null {
  const ids = new Set(arr(atoms).map((a) => String((a as any)?.id || '')));
  for (const id of candidates) {
    if (ids.has(id)) return id;
  }
  return null;
}

type Props = {
  atoms: ContextAtom[];
  decision: any; // DecisionResult-ish
  selfId: string;
  onJumpToAtomId?: (id: string) => void;
};

export const OverviewPanel: React.FC<Props> = ({ atoms, decision, selfId, onJumpToAtomId }) => {
  const axes = [
    'danger',
    'control',
    'publicness',
    'normPressure',
    'uncertainty',
    'scarcity',
  ];

  const goalEnergy = useMemo(() => {
    if (decision?.goalEnergy && typeof decision.goalEnergy === 'object') return decision.goalEnergy as Record<string, number>;
    return buildGoalEnergyMap(arr(atoms), selfId);
  }, [decision, atoms, selfId]);

  const topGoals = useMemo(() => {
    return Object.entries(goalEnergy)
      .map(([goalId, E]) => ({ goalId, E: clamp01(Number(E)) }))
      .sort((a, b) => b.E - a.E)
      .slice(0, 5);
  }, [goalEnergy]);

  const ranked = useMemo(() => arr(decision?.ranked), [decision]);
  const best = decision?.best || null;

  const bestQ = useMemo(() => {
    if (!best) return null;
    const bestId = String(best?.id || best?.action?.id || '');
    if (!bestId) return null;

    // ranked can be either {action, q} (new) or {p, score} (legacy).
    const hit = ranked.find((r: any) => String(r?.action?.id || r?.p?.id || r?.id || '') === bestId);
    const q = Number(hit?.q ?? hit?.score);
    return Number.isFinite(q) ? q : null;
  }, [best, ranked]);

  const bestBreakdown = useMemo(() => {
    if (!best) return null;
    const deltaGoals: Record<string, number> = best?.deltaGoals || best?.why?.parts?.deltaGoals || {};
    const cost = Number(best?.cost ?? best?.why?.parts?.cost ?? 0);
    const confidence = clamp01(Number(best?.confidence ?? best?.why?.parts?.confidence ?? 1));
    const rows = Object.entries(deltaGoals)
      .map(([goalId, delta]) => {
        const E = Number((goalEnergy as any)?.[goalId] ?? 0);
        const d = Number(delta ?? 0);
        return { goalId, E, delta: d, contrib: E * d };
      })
      .sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib))
      .slice(0, 8);
    const sum = rows.reduce((s, r) => s + r.contrib, 0);
    const preConf = sum - cost;
    const q = preConf * confidence;
    return { rows, sum, cost, confidence, q };
  }, [best, goalEnergy]);

  const alternatives = useMemo(() => {
    const bestId = String(best?.id || best?.action?.id || '');
    return ranked
      .filter((r: any) => {
        const rid = String(r?.action?.id || r?.p?.id || r?.id || '');
        return rid && rid !== bestId;
      })
      .slice(0, 3)
      .map((r: any) => {
        const action = r?.action || r;
        return {
          id: String(action?.id || action?.p?.id || ''),
          kind: String(action?.kind || action?.p?.id || 'action'),
          targetId: action?.targetId ?? action?.p?.targetId ?? null,
          q: Number(r?.q ?? r?.score ?? 0),
          cost: Number(action?.cost ?? 0),
          confidence: clamp01(Number(action?.confidence ?? 1)),
        };
      })
      .filter((a) => Boolean(a.id));
  }, [ranked, best]);

  const jump = (id: string) => {
    if (!id || !onJumpToAtomId) return;
    onJumpToAtomId(id);
  };

  const jumpGoal = (goalId: string) => {
    const candidates = [
      `util:activeGoal:${selfId}:${goalId}`,
      `util:domain:${goalId}:${selfId}`,
      `goal:domain:${goalId}:${selfId}`,
    ];
    // Keep deterministic behavior even if atom is absent in current snapshot.
    const resolved = findFirstExistingAtomId(arr(atoms), candidates) || candidates[0];
    jump(resolved);
  };

  const jumpAxis = (axis: string) => {
    jump(`ctx:final:${axis}:${selfId}`);
  };

  const bestActionAtomId = best ? `action:score:${selfId}:${String(best?.id || best?.action?.id || '')}` : null;

  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar p-4 space-y-4 bg-canon-bg text-canon-text">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-canon-text">Overview</div>
          <div className="text-[11px] text-canon-text-light mt-1">
            Быстрый смысл: что персонаж “видит” → какие цели активны → почему выбрано действие.
          </div>
        </div>
        <div className="text-[10px] font-mono text-canon-text-light/70">selfId: {selfId}</div>
      </div>

      <div className="border border-canon-border/40 rounded bg-black/20 p-3">
        <div className="text-xs font-bold text-canon-text-light uppercase mb-2">Worldview (ctx → ctx:final)</div>
        <div className="grid grid-cols-12 text-[9px] uppercase text-canon-text-light font-bold bg-black/30 rounded">
          <div className="col-span-4 p-2">axis</div>
          <div className="col-span-4 p-2 text-right">ctx</div>
          <div className="col-span-4 p-2 text-right">ctx:final</div>
        </div>
        {axes.map((axis) => {
          const baseId = `ctx:${axis}:${selfId}`;
          const finalId = `ctx:final:${axis}:${selfId}`;
          const b = getMag(atoms, baseId, 0);
          const f = getMag(atoms, finalId, b);
          const diff = f - b;
          const tone = diff > 1e-6 ? 'text-emerald-300' : diff < -1e-6 ? 'text-amber-300' : 'text-canon-text-light';
          return (
            <div key={axis} className="grid grid-cols-12 border-t border-white/5 text-[10px] font-mono">
              <div className="col-span-4 p-2 truncate" title={`${baseId} → ${finalId}`}>
                {onJumpToAtomId ? (
                  <button className="underline decoration-white/20 hover:decoration-white/60" onClick={() => jumpAxis(axis)}>
                    {axis}
                  </button>
                ) : axis}
              </div>
              <div className="col-span-4 p-2 text-right text-canon-accent">{fmt2(b)}</div>
              <div className={`col-span-4 p-2 text-right ${tone}`}>
                {fmt2(f)} {diff >= 0 ? `(+${fmt2(diff)})` : `(${fmt2(diff)})`}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border border-canon-border/40 rounded bg-black/20 p-3">
        <div className="text-xs font-bold text-canon-text-light uppercase mb-2">Top goals (E)</div>
        {topGoals.length ? (
          <div className="flex flex-wrap gap-2">
            {topGoals.map((g) => (
              <button
                key={g.goalId}
                className="px-2 py-1 rounded border border-white/10 bg-black/20 hover:bg-black/30 text-[10px] font-mono"
                onClick={() => jumpGoal(g.goalId)}
                title="Open in Atoms"
              >
                {g.goalId} : <span className="text-canon-accent">{fmt2(g.E)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-[11px] text-canon-text-light/70">Нет util:activeGoal/goal:domain для selfId (или они нулевые).</div>
        )}
      </div>

      <div className="border border-canon-border/40 rounded bg-black/20 p-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-canon-text-light uppercase">Chosen action</div>
            <div className="text-[11px] text-canon-text-light mt-1">
              {best ? (
                <>
                  <span className="font-mono">{String(best?.kind || best?.action?.kind || best?.id || '—')}</span>
                  {(best?.targetId || best?.action?.targetId)
                    ? <span className="ml-2 text-canon-text-light/70">→ {String(best?.targetId || best?.action?.targetId)}</span>
                    : null}
                </>
              ) : '—'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-canon-text-light/70">Q</div>
            <div className="text-sm font-mono text-canon-accent">{bestQ !== null ? fmt3(bestQ) : (bestBreakdown ? fmt3(bestBreakdown.q) : '—')}</div>
          </div>
        </div>

        {bestActionAtomId && onJumpToAtomId ? (
          <button
            className="px-2 py-1 rounded border border-canon-border/50 bg-black/20 hover:bg-black/30 text-[10px] font-mono"
            onClick={() => jump(bestActionAtomId)}
            title="Open decision atom in Atoms"
          >
            open atom: {bestActionAtomId}
          </button>
        ) : null}

        {bestBreakdown ? (
          <div className="border border-white/10 rounded overflow-hidden">
            <div className="grid grid-cols-12 bg-black/40 text-[9px] uppercase text-canon-text-light font-bold">
              <div className="col-span-5 p-2">goal</div>
              <div className="col-span-2 p-2 text-right">E</div>
              <div className="col-span-2 p-2 text-right">Δ</div>
              <div className="col-span-3 p-2 text-right">E×Δ</div>
            </div>
            {bestBreakdown.rows.map((r) => (
              <div key={r.goalId} className="grid grid-cols-12 border-t border-white/5 bg-black/20 text-[10px] font-mono">
                <div className="col-span-5 p-2 truncate" title={r.goalId}>
                  {onJumpToAtomId ? (
                    <button className="underline decoration-white/20 hover:decoration-white/60" onClick={() => jumpGoal(r.goalId)}>
                      {r.goalId}
                    </button>
                  ) : r.goalId}
                </div>
                <div className="col-span-2 p-2 text-right text-canon-accent">{fmt2(r.E)}</div>
                <div className={`col-span-2 p-2 text-right ${r.delta >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {r.delta >= 0 ? '+' : ''}{fmt2(r.delta)}
                </div>
                <div className={`col-span-3 p-2 text-right ${r.contrib >= 0 ? 'text-emerald-200' : 'text-amber-200'}`}>
                  {r.contrib >= 0 ? '+' : ''}{fmt3(r.contrib)}
                </div>
              </div>
            ))}
            <div className="grid grid-cols-12 border-t border-white/10 bg-black/30 text-[10px] font-mono">
              <div className="col-span-9 p-2 text-right text-canon-text-light">− cost</div>
              <div className="col-span-3 p-2 text-right text-orange-300">-{fmt3(bestBreakdown.cost)}</div>
            </div>
            <div className="grid grid-cols-12 border-t border-white/10 bg-black/30 text-[10px] font-mono">
              <div className="col-span-9 p-2 text-right text-canon-text-light">× confidence</div>
              <div className="col-span-3 p-2 text-right text-canon-text">×{fmt2(bestBreakdown.confidence)}</div>
            </div>
            <div className="grid grid-cols-12 border-t border-white/10 bg-black/40 text-[10px] font-mono font-bold">
              <div className="col-span-9 p-2 text-right text-canon-text">Q(a)</div>
              <div className="col-span-3 p-2 text-right text-canon-accent">{fmt3(bestBreakdown.q)}</div>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-canon-text-light/70">Нет breakdown (скорее всего decision.best отсутствует).</div>
        )}

        <div className="pt-2">
          <div className="text-xs font-bold text-canon-text-light uppercase mb-2">Why not (top alternatives)</div>
          {alternatives.length ? (
            <div className="space-y-2">
              {alternatives.map((a) => {
                const id = `action:score:${selfId}:${a.id}`;
                const dq = (bestQ !== null ? (bestQ - a.q) : null);
                return (
                  <div key={a.id} className="flex items-center justify-between gap-3 border border-white/10 rounded bg-black/20 p-2">
                    <div className="min-w-0">
                      <div className="text-[11px] text-canon-text">
                        <span className="font-mono">{a.kind}</span>
                        {a.targetId ? <span className="ml-2 text-canon-text-light/70">→ {String(a.targetId)}</span> : null}
                      </div>
                      <div className="text-[10px] font-mono text-canon-text-light/70">
                        Q={fmt3(a.q)}{dq !== null ? ` (Δ=${dq >= 0 ? '+' : ''}${fmt3(dq)})` : ''} · cost={fmt2(a.cost)} · conf={fmt2(a.confidence)}
                      </div>
                    </div>
                    {onJumpToAtomId ? (
                      <button
                        className="shrink-0 px-2 py-1 rounded border border-white/10 bg-black/30 hover:bg-black/40 text-[10px] font-mono"
                        onClick={() => jump(id)}
                        title="Open decision atom in Atoms"
                      >
                        open atom
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-[11px] text-canon-text-light/70">Нет ranked альтернатив.</div>
          )}
        </div>
      </div>
    </div>
  );
};
