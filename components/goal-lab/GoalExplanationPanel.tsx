import React from 'react';
import type { ContextualGoalContribution, ContextualGoalScore } from '../../lib/context/v2/types';
import { describeGoal } from '../../lib/goals/goalCatalog';

/**
 * Parse a numeric value safely for contribution math.
 */
function num(x: unknown, d = 0) {
  const v = Number(x);
  return Number.isFinite(v) ? v : d;
}

/**
 * Display a compact signed number without trailing zeros.
 */
function fmt(x: number) {
  if (!Number.isFinite(x)) return '0.00';
  const s = x.toFixed(3);
  return s.replace(/\.?0+$/, '');
}

/**
 * Basic heuristics for grouping contributions by source type.
 */
function classify(label: string) {
  const t = String(label || '').toLowerCase();
  if (t.includes('trait') || t.includes('lens') || t.includes('paranoia') || t.includes('sensitivity')) return 'lens';
  if (t.startsWith('ctx:final') || t.includes('ctx:final')) return 'ctx-final';
  if (t.startsWith('ctx:') || t.includes('ctx:')) return 'ctx-base';
  if (t.startsWith('drv:') || t.includes('driver')) return 'drivers';
  return 'other';
}

/**
 * Render a right-side panel with goal metadata and top contributions.
 */
export function GoalExplanationPanel({ score }: { score: ContextualGoalScore }) {
  const goalId = String(score.goalId);
  const meta = describeGoal(goalId);

  const contributions = (Array.isArray((score as any).contributions) ? (score as any).contributions : []) as ContextualGoalContribution[];
  const items = [...contributions]
    .map((c: any) => ({
      atomId: String(c.atomId || ''),
      atomLabel: String(c.atomLabel || c.explanation || c.atomId || ''),
      value: num(c.value, 0),
      kind: classify(String(c.atomLabel || c.explanation || '')),
    }))
    .filter((x) => Number.isFinite(x.value) && (x.atomLabel || x.atomId))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 24);

  return (
    <div className="text-slate-100">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[12px] font-semibold tracking-wide">{goalId}</div>
          <div className="text-[10px] text-slate-300/80">
            totalLogit={fmt(num((score as any).totalLogit, 0))} · base={fmt(num((score as any).baseWeight, 0))} · final={fmt(num((score as any).finalWeight, 0))}
          </div>
        </div>
      </div>

      {meta ? (
        <div className="mt-3 space-y-2">
          {meta.label ? (
            <div className="text-[11px] text-slate-200">
              <span className="text-slate-400/80">Label:</span> {meta.label}
            </div>
          ) : null}
          {meta.description ? (
            <div className="text-[11px] text-slate-200 leading-snug whitespace-pre-wrap">
              {meta.description}
            </div>
          ) : null}
          {meta.help ? (
            <div className="text-[10px] text-slate-300/80 leading-snug whitespace-pre-wrap border border-slate-800 rounded-lg p-2 bg-black/20">
              {meta.help}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 text-[10px] text-slate-300/70">
          Нет описания в goalCatalog для <span className="font-mono">{goalId}</span>.
        </div>
      )}

      <div className="mt-4">
        <div className="text-[11px] font-semibold">Top contributions</div>
        <div className="mt-2 space-y-2">
          {items.length ? (
            items.map((it) => (
              <div key={`${it.atomId}|${it.atomLabel}`} className="border border-slate-800 rounded-lg p-2 bg-black/20">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-[10px] text-slate-100/90 truncate">{it.atomLabel}</div>
                  <div className={`text-[10px] font-mono ${it.value >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {it.value >= 0 ? '+' : ''}{fmt(it.value)}
                  </div>
                </div>
                <div className="mt-1 text-[9px] text-slate-300/70 flex items-center justify-between gap-3">
                  <div className="truncate font-mono">{it.atomId || '—'}</div>
                  <div className="shrink-0 opacity-70">{it.kind}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-[10px] text-slate-300/70">Нет contributions в score (или они пустые).</div>
          )}
        </div>
      </div>
    </div>
  );
}
