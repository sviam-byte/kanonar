
import React from "react";
import type { ContextualGoalScore } from "../../lib/context/v2/locationGoals";

interface Props {
  title?: string;
  scores: ContextualGoalScore[];
}

export const LocationGoalsDebugPanel: React.FC<Props> = ({
  title = "Влияние локации на цели",
  scores,
}) => {
  if (!scores.length) {
    return (
      <div className="p-2 border border-canon-border/30 rounded text-sm opacity-70 text-canon-text-light">
        {title}: контекстных поправок нет.
      </div>
    );
  }

  const sorted = [...scores].sort(
    (a, b) => Math.abs(b.contextDelta) - Math.abs(a.contextDelta)
  );

  return (
    <div className="p-3 border border-canon-border/30 rounded-md bg-canon-bg/40 text-sm">
      <div className="font-bold text-canon-text mb-2 text-xs uppercase tracking-wider">{title}</div>
      <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-canon-border/30 text-canon-text-light">
            <th className="text-left py-1 pr-2 font-normal">Цель</th>
            <th className="text-right py-1 px-2 font-normal">База</th>
            <th className="text-right py-1 px-2 font-normal">Δ</th>
            <th className="text-right py-1 px-2 font-normal">Итог</th>
            <th className="text-left py-1 pl-2 font-normal">Источники</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const base = s.baseWeight ?? s.finalWeight - s.contextDelta;
            const delta = s.contextDelta;
            const final = s.finalWeight;

            const deltaStr =
              delta > 0
                ? `+${delta.toFixed(3)}`
                : delta < 0
                ? delta.toFixed(3)
                : "0.000";

            return (
              <tr
                key={s.goalId}
                className="border-b border-canon-border/20 last:border-b-0 hover:bg-white/5"
              >
                <td className="py-1 pr-2 font-mono text-canon-text">{s.goalId}</td>
                <td className="py-1 px-2 text-right font-mono text-canon-text-light">
                  {base.toFixed(3)}
                </td>
                <td
                  className={
                    "py-1 px-2 text-right font-mono " +
                    (delta > 0
                      ? "text-green-400"
                      : delta < 0
                      ? "text-red-400"
                      : "text-gray-500")
                  }
                >
                  {deltaStr}
                </td>
                <td className="py-1 px-2 text-right font-mono font-bold text-canon-text">
                  {final.toFixed(3)}
                </td>
                <td className="py-1 pl-2 text-canon-text-light truncate max-w-[150px]" title={s.sources.join(", ")}>
                  {s.sources.join(", ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
};
