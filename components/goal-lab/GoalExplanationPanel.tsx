import React, { useMemo, useState } from 'react';

import type { ContextualGoalContribution, ContextualGoalScore } from '../../lib/context/v2/types';
import { describeGoal } from '../../lib/goals/goalCatalog';
import { arr } from '../../lib/utils/arr';

type Props = {
  goalScores: ContextualGoalScore[];
  selectedGoalId?: string | null;
};

/**
 * Format a number for compact UI metrics.
 */
function fmt(x: number, digits = 2) {
  if (!Number.isFinite(x)) return '0';
  return x.toFixed(digits);
}

/**
 * Pick a readable label for a goal contribution.
 */
function contributionLabel(c: ContextualGoalContribution) {
  const axis = (c as any)?.axis;
  const note = (c as any)?.note;
  const atomLabel = (c as any)?.atomLabel;
  const atomId = (c as any)?.atomId;
  const explanation = (c as any)?.explanation;
  return String(axis || note || atomLabel || atomId || explanation || 'factor');
}

/**
 * Resolve a stable numeric weight from a contribution record.
 */
function contributionWeight(c: ContextualGoalContribution) {
  const w =
    Number((c as any)?.weight) ||
    Number((c as any)?.rawWeight) ||
    Number((c as any)?.delta) ||
    0;
  return Number.isFinite(w) ? w : 0;
}

export const GoalExplanationPanel: React.FC<Props> = ({ goalScores, selectedGoalId }) => {
  const scores = useMemo(() => arr(goalScores).slice(), [goalScores]);
  const [picked, setPicked] = useState<string>(() => String(selectedGoalId || scores[0]?.goalId || ''));

  const selectedId = String(selectedGoalId || picked || '');
  const selected = scores.find((s) => String(s.goalId) === selectedId) || scores[0];

  const sortedContribs = useMemo(() => {
    const cs = arr((selected as any)?.contributions);
    cs.sort((a, b) => Math.abs(contributionWeight(b)) - Math.abs(contributionWeight(a)));
    return cs;
  }, [selected]);

  const def = selected ? describeGoal(String(selected.goalId)) : null;

  return (
    <div className="w-full h-full flex">
      <div className="w-[320px] border-r border-slate-800/70 bg-black/25 p-3 overflow-auto">
        <div className="text-[11px] font-semibold text-slate-200 mb-2">Goals</div>
        <div className="space-y-2">
          {scores.map((s) => {
            const id = String(s.goalId);
            const isActive = id === selectedId;
            return (
              <button
                key={id}
                onClick={() => setPicked(id)}
                className={[
                  'w-full text-left rounded-lg border px-2 py-2',
                  isActive ? 'border-sky-500/50 bg-sky-500/10' : 'border-slate-800/60 bg-black/20 hover:bg-black/30',
                ].join(' ')}
              >
                <div className="text-[11px] font-semibold text-slate-100 flex items-center justify-between">
                  <span className="truncate">{id}</span>
                  <span className="text-[10px] text-slate-300/80">
                    p={fmt(Number((s as any)?.probability ?? 0), 2)}
                  </span>
                </div>
                <div className="text-[10px] text-slate-300/80">
                  logit={fmt(Number((s as any)?.totalLogit ?? (s as any)?.logit ?? 0), 2)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        {!selected ? (
          <div className="text-slate-300/80 text-sm">No goals.</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-800/70 bg-black/25 p-4">
              <div className="text-sm font-semibold text-slate-100">{String(selected.goalId)}</div>
              {def?.title ? (
                <div className="text-[12px] text-slate-200/90 mt-1">{def.title}</div>
              ) : null}
              {def?.description ? (
                <div className="text-[12px] text-slate-300/80 mt-2 leading-relaxed">{def.description}</div>
              ) : (
                <div className="text-[12px] text-slate-300/70 mt-2 leading-relaxed">
                  No human-readable description in goalCatalog.
                </div>
              )}
              <div className="mt-3 grid grid-cols-3 gap-3 text-[11px]">
                <div className="rounded-lg border border-slate-800/60 bg-black/20 p-2">
                  <div className="text-slate-300/70">probability</div>
                  <div className="text-slate-100 font-semibold">{fmt(Number((selected as any)?.probability ?? 0), 3)}</div>
                </div>
                <div className="rounded-lg border border-slate-800/60 bg-black/20 p-2">
                  <div className="text-slate-300/70">total logit</div>
                  <div className="text-slate-100 font-semibold">{fmt(Number((selected as any)?.totalLogit ?? 0), 3)}</div>
                </div>
                <div className="rounded-lg border border-slate-800/60 bg-black/20 p-2">
                  <div className="text-slate-300/70">domain</div>
                  <div className="text-slate-100 font-semibold">{String((def as any)?.domain ?? '—')}</div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800/70 bg-black/25 p-4">
              <div className="text-[11px] font-semibold text-slate-200 mb-2">Top contributions (why)</div>
              {sortedContribs.length === 0 ? (
                <div className="text-[12px] text-slate-300/70">No contribution breakdown available.</div>
              ) : (
                <div className="space-y-2">
                  {sortedContribs.slice(0, 30).map((c, idx) => {
                    const w = contributionWeight(c);
                    const label = contributionLabel(c);
                    const meta = (c as any)?.atomId || (c as any)?.source || (c as any)?.formula ? (
                      <div className="text-[10px] text-slate-400/70 mt-1">
                        {(c as any)?.atomId ? <span className="mr-2">atom: {(c as any)?.atomId}</span> : null}
                        {(c as any)?.source ? <span className="mr-2">src: {(c as any)?.source}</span> : null}
                        {(c as any)?.formula ? <span className="mr-2">f: {(c as any)?.formula}</span> : null}
                      </div>
                    ) : null;
                    return (
                      <div key={idx} className="rounded-lg border border-slate-800/60 bg-black/20 p-2">
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="text-[11px] text-slate-100 font-semibold truncate">{label}</div>
                          <div
                            className={[
                              'text-[11px] font-semibold',
                              w >= 0 ? 'text-emerald-300' : 'text-amber-300',
                            ].join(' ')}
                          >
                            {w >= 0 ? '+' : ''}{fmt(w, 3)}
                          </div>
                        </div>
                        {meta}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
