/**
 * DecisionAnatomyPanel — decomposition of the LINEAR action decision.
 *
 * Shows: ranked actions → each action's Q breakdown → contributing atoms.
 * This is NOT POMDP. This is the synchronous decideAction() result.
 */

import React, { useMemo, useState } from 'react';
import type { ContextAtom } from '../../lib/context/v2/types';
import { arr } from '../../lib/utils/arr';

function clamp01(x: number) {
  return Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
}

function pct(x: number) {
  return Math.round(clamp01(x) * 100);
}

type Props = {
  decision: any; // from snapshot.decision
  atoms: ContextAtom[];
  selfId: string;
  actorLabels?: Record<string, string>;
  onJumpToAtomId?: (id: string) => void;
};

export const DecisionAnatomyPanel: React.FC<Props> = ({
  decision,
  atoms,
  selfId,
  actorLabels = {},
  onJumpToAtomId,
}) => {
  // Keep props visible for forward-compatible panel extensions (e.g. self-relative labels).
  void selfId;
  void actorLabels;

  const ranked = useMemo(() => arr(decision?.ranked), [decision]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  if (!ranked.length) {
    return (
      <div className="text-slate-600 text-[10px] italic p-2">
        No decision computed. Make sure at least one character is in the scene and the world is built.
      </div>
    );
  }

  return (
    <div className="space-y-1.5 text-[10px]">
      <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">
        Linear Decision (synchronous)
      </div>

      {ranked.map((entry: any, i: number) => {
        const action = entry?.action || entry;
        const q = Number(entry?.q ?? entry?.score ?? 0);
        const actionId = action?.id || action?.label || `action-${i}`;
        const actionLabel = action?.label || action?.id || `Action ${i}`;
        const isBest = i === 0;
        const isExpanded = expandedIdx === i;

        // Q decomposition from action.trace or action.debug
        const trace = action?.trace || action?.debug || {};
        const usedAtomIds: string[] = arr(trace?.usedAtomIds || trace?.atomIds);
        const goalContributions: Array<{ goalId: string; weight: number }> = arr(
          trace?.goalContributions || trace?.goals
        ).map((g: any) => ({
          goalId: g?.goalId || g?.id || '?',
          weight: Number(g?.weight ?? g?.contribution ?? g?.q ?? 0),
        }));
        const costPenalty = Number(trace?.cost ?? trace?.costPenalty ?? 0);
        const riskPenalty = Number(trace?.risk ?? trace?.riskPenalty ?? 0);
        const priorBonus = Number(trace?.prior ?? trace?.priorBonus ?? 0);

        return (
          <div
            key={actionId}
            className={`border rounded ${
              isBest ? 'border-emerald-700/50 bg-emerald-950/20' : 'border-slate-800/50 bg-slate-950/30'
            }`}
          >
            {/* Header */}
            <button
              onClick={() => setExpandedIdx(isExpanded ? null : i)}
              className="w-full px-2 py-1 flex items-center gap-2 text-left"
            >
              <span className={`w-4 text-center font-bold ${isBest ? 'text-emerald-400' : 'text-slate-600'}`}>
                {i + 1}
              </span>
              <span className={`flex-1 truncate ${isBest ? 'text-emerald-300 font-bold' : 'text-slate-300'}`}>
                {actionLabel}
              </span>
              <span className="font-mono text-[9px] text-amber-400">Q={q.toFixed(3)}</span>
              <span className="text-[8px] text-slate-600">{isExpanded ? '▼' : '▶'}</span>
            </button>

            {/* Expanded anatomy */}
            {isExpanded && (
              <div className="px-2 pb-2 border-t border-slate-800/30 pt-1.5 space-y-1.5">
                {/* Q bar breakdown */}
                <div className="flex items-center gap-1 h-3">
                  {priorBonus > 0 && (
                    <div
                      className="h-full bg-blue-600/50 rounded-sm"
                      style={{ width: `${Math.min(40, priorBonus * 100)}%` }}
                      title={`prior: +${priorBonus.toFixed(3)}`}
                    />
                  )}
                  <div className="flex-1 h-full bg-emerald-600/40 rounded-sm" title={`base Q: ${q.toFixed(3)}`}>
                    <div className="h-full bg-emerald-500/60 rounded-sm" style={{ width: `${pct(q)}%` }} />
                  </div>
                  {costPenalty > 0 && (
                    <div
                      className="h-full bg-red-600/50 rounded-sm"
                      style={{ width: `${Math.min(30, costPenalty * 100)}%` }}
                      title={`cost: -${costPenalty.toFixed(3)}`}
                    />
                  )}
                  {riskPenalty > 0 && (
                    <div
                      className="h-full bg-orange-600/50 rounded-sm"
                      style={{ width: `${Math.min(30, riskPenalty * 100)}%` }}
                      title={`risk: -${riskPenalty.toFixed(3)}`}
                    />
                  )}
                </div>

                {/* Numeric breakdown */}
                <div className="flex gap-3 text-[9px]">
                  <span className="text-emerald-500">Q={q.toFixed(3)}</span>
                  {priorBonus > 0 && <span className="text-blue-400">prior=+{priorBonus.toFixed(3)}</span>}
                  {costPenalty > 0 && <span className="text-red-400">cost=-{costPenalty.toFixed(3)}</span>}
                  {riskPenalty > 0 && <span className="text-orange-400">risk=-{riskPenalty.toFixed(3)}</span>}
                </div>

                {/* Goal contributions */}
                {goalContributions.length > 0 && (
                  <div>
                    <div className="text-[8px] text-slate-600 uppercase tracking-wider mb-0.5">Goal contributions</div>
                    {goalContributions
                      .sort((a, b) => b.weight - a.weight)
                      .slice(0, 6)
                      .map(g => (
                        <div key={g.goalId} className="flex items-center gap-1.5">
                          <span className="flex-1 truncate text-slate-400">{g.goalId}</span>
                          <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500/60 rounded-full" style={{ width: `${pct(g.weight)}%` }} />
                          </div>
                          <span className="text-[8px] text-amber-500 w-8 text-right">{g.weight.toFixed(2)}</span>
                        </div>
                      ))}
                  </div>
                )}

                {/* Contributing atoms */}
                {usedAtomIds.length > 0 && (
                  <div>
                    <div className="text-[8px] text-slate-600 uppercase tracking-wider mb-0.5">
                      Used atoms ({usedAtomIds.length})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {usedAtomIds.slice(0, 12).map(aid => {
                        const atom = atoms.find(a => String((a as any).id) === aid);
                        const m = Number((atom as any)?.magnitude ?? 0);
                        return (
                          <button
                            key={aid}
                            onClick={() => onJumpToAtomId?.(aid)}
                            className="px-1 py-0.5 rounded bg-slate-800/60 border border-slate-700/40 hover:border-cyan-600/50 transition text-[8px] truncate max-w-[140px]"
                            title={`${aid} = ${m.toFixed(3)}`}
                          >
                            <span className="text-cyan-600">{aid.split(':').slice(0, 2).join(':')}</span>
                            <span className="text-slate-500">={m.toFixed(2)}</span>
                          </button>
                        );
                      })}
                      {usedAtomIds.length > 12 && (
                        <span className="text-slate-600 text-[8px]">+{usedAtomIds.length - 12} more</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Raw debug dump */}
                {Object.keys(trace).length > 0 && (
                  <details className="text-[8px]">
                    <summary className="text-slate-600 cursor-pointer hover:text-slate-400">raw trace</summary>
                    <pre className="mt-1 p-1 bg-slate-900 rounded text-slate-500 overflow-x-auto max-h-[100px]">
                      {JSON.stringify(trace, null, 1)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Decision debug */}
      {decision?.debug && (
        <details className="text-[8px] border border-slate-800/30 rounded p-1.5">
          <summary className="text-slate-600 cursor-pointer hover:text-slate-400">Decision debug</summary>
          <pre className="mt-1 text-slate-500 overflow-x-auto max-h-[120px]">
            {JSON.stringify(decision.debug, null, 1)}
          </pre>
        </details>
      )}
    </div>
  );
};
