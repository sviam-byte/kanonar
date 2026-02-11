import React from 'react';
import type { GoalSandboxVM } from '../../GoalSandbox/GoalSandbox';

/**
 * World truth mode surfaces raw scene state and derived metrics for quick inspection.
 * This is intentionally read-only to keep it deterministic and explainable.
 */
export const WorldTruthMode: React.FC<{ vm: GoalSandboxVM }> = ({ vm }) => {
  // MVP: пока просто показываем truth-дамп и метрики.
  const metrics = (vm.sceneDump as any)?.world?.scene?.metrics ?? null;

  return (
    <div className="h-full w-full overflow-hidden">
      <div className="h-full overflow-y-auto custom-scrollbar p-4 space-y-3">
        <div className="text-[12px] font-bold text-slate-200">World Truth</div>
        <div className="text-[11px] text-slate-400">
          MVP. Дальше сюда переедут: карта локации, акторы, drag&drop, пересчёт V_true.
        </div>

        <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">world.scene.metrics</div>
          <pre className="text-[10px] font-mono whitespace-pre-wrap break-words text-slate-200/90">
            {JSON.stringify(metrics, null, 2)}
          </pre>
        </div>

        <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">sceneDump (raw)</div>
          <details>
            <summary className="text-[11px] text-slate-300 cursor-pointer">open</summary>
            <pre className="mt-2 text-[10px] font-mono whitespace-pre-wrap break-words text-slate-200/90">
              {JSON.stringify(vm.sceneDump, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
};
