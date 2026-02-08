import React, { useMemo } from 'react';
import { GOAL_DEFS } from '../../lib/goals/space';
import type { ContextAtom, ContextualGoalScore } from '../../lib/context/v2/types';

type AnyDecision = any;

// Defensive helper so optional arrays never explode UI loops.
function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function goalLabel(goalId: string): string {
  const def = (GOAL_DEFS as any)?.[goalId];
  return (def?.label_ru || def?.label || goalId) as string;
}

function fmtPct(p: number | undefined, digits = 0): string {
  if (typeof p !== 'number' || !Number.isFinite(p)) return '—';
  return `${(p * 100).toFixed(digits)}%`;
}

function fmt(n: number | undefined, digits = 2): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function actionLabel(a: any): string {
  return String(a?.label || a?.kind || a?.id || '—');
}

function actionScore(a: any): number | undefined {
  if (typeof a?.q === 'number') return a.q;
  if (typeof a?.score === 'number') return a.score;
  if (typeof a?.utility === 'number') return a.utility;
  return undefined;
}

function getRanked(decision: AnyDecision): any[] {
  // Supports shapes:
  // decision.ranked = [{ action, q }, ...]
  // decision.ranked = [{ ...action, q }, ...]
  // decision.candidates = [...]
  const d = decision || {};
  const ranked = arr<any>(d.ranked);
  if (ranked.length) return ranked;
  const candidates = arr<any>(d.candidates);
  if (candidates.length) return candidates;
  return [];
}

export type FlowTabProps = {
  atoms: ContextAtom[];
  goals: ContextualGoalScore[];
  decision?: AnyDecision;
  context?: {
    location?: string;
    events?: string[];
    nearbyActors?: string[];
  };
};

export const FlowTab: React.FC<FlowTabProps> = ({ atoms, goals, decision, context }) => {
  const atomsByKind = useMemo(() => {
    const acc: Record<string, ContextAtom[]> = {};
    for (const a of atoms || []) {
      const k = String((a as any)?.kind || 'other');
      (acc[k] ||= []).push(a);
    }
    return acc;
  }, [atoms]);

  const topKinds = useMemo(() => {
    const items = Object.entries(atomsByKind).map(([kind, xs]) => {
      const mags = xs.map((x) => Number((x as any)?.magnitude ?? 0)).filter((n) => Number.isFinite(n));
      const avg = mags.length ? mags.reduce((s, n) => s + n, 0) / mags.length : 0;
      return { kind, count: xs.length, avg };
    });
    items.sort((a, b) => b.avg - a.avg);
    return items.slice(0, 8);
  }, [atomsByKind]);

  const sortedGoals = useMemo(() => {
    const gs = [...(goals || [])];
    gs.sort((a: any, b: any) => (b?.probability ?? 0) - (a?.probability ?? 0));
    return gs;
  }, [goals]);

  const topGoals = sortedGoals.slice(0, 3);
  const ranked = getRanked(decision);
  const topActions = ranked.slice(0, 3);

  return (
    <div className="p-5 space-y-5">
      <div>
        <div className="text-lg font-bold text-white">🔄 Flow — как система пришла к выбору</div>
        <div className="text-xs text-canon-text-light/70 mt-1">
          Контекст → факторы (atoms) → цели → кандидаты действий
        </div>
      </div>

      {/* Step 1 */}
      <div className="rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">Шаг 1: Контекст</div>
        <div className="mt-2 text-sm text-white/90 space-y-1">
          <div>📍 Локация: <span className="font-semibold">{context?.location || '—'}</span></div>
          {context?.events?.length ? <div>⚡ События: {context.events.join(', ')}</div> : null}
          {context?.nearbyActors?.length ? <div>👥 Рядом: {context.nearbyActors.join(', ')}</div> : null}
        </div>
      </div>

      <div className="flex items-center justify-center text-2xl text-cyan-400">↓</div>

      {/* Step 2 */}
      <div className="rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="text-xs font-semibold text-purple-300 uppercase tracking-wider">Шаг 2: Факторы (atoms)</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {topKinds.map(({ kind, count, avg }) => {
            const pct = Math.max(0, Math.min(100, avg * 100));
            return (
              <div key={kind} className="rounded bg-black/30 border border-white/10 p-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-white/80">{kind.replace(/_/g, ' ')}</div>
                  <div className="text-[10px] text-white/50">{count} шт.</div>
                </div>
                <div className="mt-2 h-2 bg-black/50 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-400" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-white/60">средн. интенсивность: {pct.toFixed(0)}%</div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-[10px] text-white/50">Всего активных факторов: {atoms?.length ?? 0}</div>
      </div>

      <div className="flex items-center justify-center text-2xl text-cyan-400">↓</div>

      {/* Step 3 */}
      <div className="rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="text-xs font-semibold text-green-300 uppercase tracking-wider">Шаг 3: Цели</div>
        <div className="mt-3 space-y-2">
          {topGoals.map((g, idx) => {
            const p = (g as any)?.probability as number | undefined;
            const prob = typeof p === 'number' ? Math.max(0, Math.min(1, p)) : undefined;
            const pct = typeof prob === 'number' ? prob * 100 : 0;
            const label = goalLabel((g as any)?.goalId || (g as any)?.id || '—');
            return (
              <div key={(g as any)?.goalId || idx} className="rounded bg-black/30 border border-white/10 p-2 flex items-center gap-3">
                <div className="text-lg">{idx === 0 ? '🎯' : idx === 1 ? '🔷' : '◽'}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{label}</div>
                  <div className="text-xs text-white/60">вероятность: {fmtPct(prob)}</div>
                </div>
                <div className="w-24">
                  <div className="h-2 bg-black/50 rounded-full overflow-hidden">
                    <div className="h-full bg-green-400" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-[10px] text-white/50">Всего целей: {goals?.length ?? 0}</div>
      </div>

      <div className="flex items-center justify-center text-2xl text-cyan-400">↓</div>

      {/* Step 4 */}
      <div className="rounded-lg border border-white/10 bg-black/20 p-4">
        <div className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Шаг 4: Действия</div>
        <div className="mt-3 space-y-2">
          {topActions.map((x, idx) => {
            const action = (x as any)?.action ?? x;
            const q = actionScore(x) ?? actionScore(action);
            return (
              <div key={String(action?.id || action?.kind || idx)} className="rounded bg-black/30 border border-white/10 p-3 flex items-center gap-3">
                <div className="text-xl">{idx === 0 ? '⚡' : '➤'}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">
                    {actionLabel(action)}
                    {idx === 0 ? (
                      <span className="ml-2 px-2 py-0.5 rounded bg-amber-500/30 text-amber-200 text-[10px]">ВЫБРАНО</span>
                    ) : null}
                  </div>
                  {(action as any)?.supportingGoals?.length ? (
                    <div className="text-xs text-white/60 mt-1 truncate">
                      удовлетворяет: {(action as any).supportingGoals.join(', ')}
                    </div>
                  ) : null}
                </div>
                <div className="text-sm font-mono text-amber-300">Q={fmt(q)}</div>
              </div>
            );
          })}
          {!topActions.length ? <div className="text-xs text-white/60">Нет ранжированных действий</div> : null}
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-cyan-500/20 bg-cyan-900/10 p-4">
        <div className="text-xs font-semibold text-cyan-300 uppercase tracking-wider">💡 Резюме</div>
        <div className="mt-2 text-sm text-white/90 space-y-1">
          <div>Учтено факторов: <strong>{atoms?.length ?? 0}</strong></div>
          <div>Активировано целей: <strong>{goals?.length ?? 0}</strong></div>
          <div>
            Топ-цель: <strong>{topGoals[0] ? goalLabel((topGoals[0] as any).goalId) : '—'}</strong>
          </div>
          <div>
            Выбрано действие: <strong>{topActions[0] ? actionLabel(((topActions[0] as any).action ?? topActions[0])) : '—'}</strong>
          </div>
        </div>
      </div>
    </div>
  );
};
