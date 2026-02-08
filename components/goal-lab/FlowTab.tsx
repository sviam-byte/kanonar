import React, { useMemo } from 'react';
import { GOAL_DEFS } from '../../lib/goals/space';
import type { ContextAtom, ContextualGoalScore } from '../../lib/context/v2/types';

type AnyDecision = any;

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function goalLabel(goalId: string): string {
  const def = (GOAL_DEFS as Record<string, { label?: string; label_ru?: string }> | undefined)?.[
    goalId
  ];
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

function actionLabel(a: AnyDecision): string {
  return String(a?.label || a?.kind || a?.id || '—');
}

function actionScore(a: AnyDecision): number | undefined {
  if (typeof a?.q === 'number') return a.q;
  if (typeof a?.score === 'number') return a.score;
  if (typeof a?.utility === 'number') return a.utility;
  return undefined;
}

function extractRankedActions(decision: AnyDecision): AnyDecision[] {
  if (!decision) return [];
  // Most common shapes:
  // 1) { ranked: [{...action, q}, ...] }
  // 2) { ranked: [{ action, q }, ...] }
  // 3) { actions: [...] }
  const ranked = arr<AnyDecision>(decision.ranked || decision.actions);
  if (ranked.length === 0) return [];
  if (ranked[0]?.action) return ranked.map(r => ({ ...(r.action || {}), q: r.q }));
  return ranked;
}

function atomIcon(kind: string | undefined): string {
  const k = String(kind || '');
  if (!k) return '⚛️';
  if (k.includes('threat') || k.includes('danger')) return '⚠️';
  if (k.includes('wound') || k.includes('injury')) return '🩸';
  if (k.includes('support') || k.includes('bond') || k.includes('trust')) return '🤝';
  if (k.includes('privacy')) return '🕯️';
  if (k.includes('enemy') || k.includes('hostile')) return '👹';
  if (k.includes('resource')) return '🪙';
  if (k.includes('status')) return '👑';
  if (k.includes('curiosity') || k.includes('truth')) return '🔍';
  return '⚛️';
}

export type FlowTabProps = {
  atoms: ContextAtom[];
  goals: ContextualGoalScore[];
  decision?: AnyDecision;
  context?: {
    locationId?: string;
    locationLabel?: string;
    events?: string[];
    nearbyActors?: string[];
  };
};

export const FlowTab: React.FC<FlowTabProps> = ({ atoms, goals, decision, context }) => {
  const rankedActions = useMemo(() => extractRankedActions(decision), [decision]);

  const atomsByKind = useMemo(() => {
    const map = new Map<string, { kind: string; count: number; sum: number; max: number }>();
    for (const atom of atoms || []) {
      const kind = String((atom as { kind?: string })?.kind || 'other');
      const mag = typeof (atom as { magnitude?: number })?.magnitude === 'number'
        ? (atom as { magnitude?: number }).magnitude
        : 0;
      const curr = map.get(kind) || { kind, count: 0, sum: 0, max: 0 };
      curr.count += 1;
      curr.sum += mag;
      curr.max = Math.max(curr.max, mag);
      map.set(kind, curr);
    }
    const rows = Array.from(map.values());
    rows.sort((a, b) => b.sum / Math.max(1, b.count) - a.sum / Math.max(1, a.count));
    return rows;
  }, [atoms]);

  const topGoals = useMemo(() => {
    const gs = [...(goals || [])];
    gs.sort((a, b) => (b?.probability || 0) - (a?.probability || 0));
    return gs.slice(0, 3);
  }, [goals]);

  const topActions = useMemo(() => rankedActions.slice(0, 3), [rankedActions]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-canon-text">Как система пришла к решению</h2>
        <div className="text-xs text-canon-text-light/70 mt-1">Контекст → Атомы → Цели → Действия</div>
      </div>

      {/* Step 1: Context */}
      <div className="rounded-lg border border-blue-500/20 bg-gradient-to-r from-blue-950/30 to-blue-900/10 p-4">
        <div className="text-[11px] font-bold text-blue-200 uppercase tracking-wider">
          Шаг 1: Контекст
        </div>
        <div className="mt-2 space-y-1 text-sm text-canon-text">
          <div>
            📍 Локация:{' '}
            <span className="font-semibold">{context?.locationLabel || context?.locationId || '—'}</span>
          </div>
          {context?.events && context.events.length > 0 && (
            <div>⚡ События: {context.events.join(', ')}</div>
          )}
          {context?.nearbyActors && context.nearbyActors.length > 0 && (
            <div>👥 Рядом: {context.nearbyActors.join(', ')}</div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center text-cyan-300 text-2xl">↓</div>

      {/* Step 2: Atoms */}
      <div className="rounded-lg border border-purple-500/20 bg-gradient-to-r from-purple-950/30 to-purple-900/10 p-4">
        <div className="text-[11px] font-bold text-purple-200 uppercase tracking-wider">
          Шаг 2: Факторы (атомы)
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {atomsByKind.slice(0, 6).map(row => {
            const avg = row.sum / Math.max(1, row.count);
            const pct = Math.max(0, Math.min(1, avg));
            return (
              <div key={row.kind} className="rounded border border-white/10 bg-black/30 p-2">
                <div className="flex items-center gap-2">
                  <div className="text-lg">{atomIcon(row.kind)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-canon-text-light/80 truncate">
                      {row.kind}
                    </div>
                    <div className="text-sm font-bold text-canon-text">{fmtPct(pct, 0)}</div>
                  </div>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-black/40 overflow-hidden">
                  <div className="h-full bg-purple-400/70" style={{ width: `${pct * 100}%` }} />
                </div>
                <div className="mt-1 text-[10px] text-canon-text-light/60">
                  {row.count} шт • max {fmt(row.max, 2)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 text-xs text-canon-text-light/60">
          Всего активных атомов: {atoms?.length || 0}
        </div>
      </div>

      <div className="flex items-center justify-center text-cyan-300 text-2xl">↓</div>

      {/* Step 3: Goals */}
      <div className="rounded-lg border border-green-500/20 bg-gradient-to-r from-green-950/30 to-green-900/10 p-4">
        <div className="text-[11px] font-bold text-green-200 uppercase tracking-wider">
          Шаг 3: Активация целей
        </div>
        <div className="mt-3 space-y-2">
          {topGoals.map((g, idx) => {
            const p = typeof g?.probability === 'number' ? g.probability : 0;
            return (
              <div
                key={`${g.goalId}:${g.targetAgentId || ''}`}
                className="flex items-center gap-3 rounded bg-black/30 p-2"
              >
                <div className="text-xl">{idx === 0 ? '🎯' : idx === 1 ? '🔷' : '◽'}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-canon-text truncate">{goalLabel(g.goalId)}</div>
                  <div className="text-[11px] text-canon-text-light/70">
                    Вероятность: {fmtPct(p, 0)}
                  </div>
                </div>
                <div className="w-24">
                  <div className="h-2 rounded-full bg-black/40 overflow-hidden">
                    <div
                      className="h-full bg-green-400/70"
                      style={{ width: `${Math.max(0, Math.min(1, p)) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {topGoals.length === 0 && (
            <div className="text-sm text-canon-text-light/70">Цели не рассчитаны.</div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center text-cyan-300 text-2xl">↓</div>

      {/* Step 4: Action */}
      <div className="rounded-lg border border-amber-500/20 bg-gradient-to-r from-amber-950/30 to-amber-900/10 p-4">
        <div className="text-[11px] font-bold text-amber-200 uppercase tracking-wider">
          Шаг 4: Выбор действия
        </div>
        <div className="mt-3 space-y-2">
          {topActions.map((a, idx) => {
            const q = actionScore(a);
            return (
              <div
                key={String(a?.id || a?.kind || idx)}
                className="flex items-center gap-3 rounded bg-black/30 p-3"
              >
                <div className="text-2xl">{idx === 0 ? '⚡' : '➤'}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-canon-text truncate">
                    {actionLabel(a)}
                    {idx === 0 && (
                      <span className="ml-2 inline-flex items-center rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                        ВЫБРАНО
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-canon-text-light/70 truncate">
                    Удовлетворяет: {arr<string>(a?.supportingGoals || a?.goals).join(', ') || '—'}
                  </div>
                </div>
                <div className="text-sm font-mono text-amber-200">Q={fmt(q, 2)}</div>
              </div>
            );
          })}
          {topActions.length === 0 && (
            <div className="text-sm text-canon-text-light/70">Действия не рассчитаны.</div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-cyan-500/20 bg-gradient-to-r from-cyan-950/30 to-cyan-900/10 p-4">
        <div className="text-[11px] font-bold text-cyan-200 uppercase tracking-wider">💡 Резюме</div>
        <div className="mt-2 text-sm text-canon-text space-y-1">
          <div>
            Система учла <strong>{atoms?.length || 0}</strong> факторов.
          </div>
          <div>
            Активировала <strong>{goals?.length || 0}</strong> целей (топ:{' '}
            {topGoals.map(g => goalLabel(g.goalId)).join(', ') || '—'}).
          </div>
          <div>
            И выбрала действие{' '}
            <strong>{topActions[0] ? actionLabel(topActions[0]) : '—'}</strong> как наилучшее по
            текущей оценке.
          </div>
        </div>
      </div>
    </div>
  );
};
