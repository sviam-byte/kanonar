import React, { useMemo } from 'react';
import type { GoalSandboxVM } from '../../GoalSandbox/GoalSandbox';
import { JsonBlock } from '../JsonBlock';

/**
 * World truth mode surfaces raw scene state and derived metrics for quick inspection.
 * This is intentionally read-only to keep it deterministic and explainable.
 */
export const WorldTruthMode: React.FC<{ vm: GoalSandboxVM }> = ({ vm }) => {
  // MVP: пока просто показываем truth-дамп и метрики.
  const metrics = (vm.sceneDump as any)?.world?.scene?.metrics ?? null;

  const metricsText = useMemo(() => {
    try {
      const s = JSON.stringify(metrics, null, 2);
      return s.length > 40_000 ? s.slice(0, 40_000) + '\n\n<<truncated>>' : s;
    } catch (e) {
      return `<<JSON.stringify failed: ${String(e)}>>`;
    }
  }, [metrics]);

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
            {metricsText}
          </pre>
        </div>

        <JsonBlock
          title="sceneDump (raw)"
          value={vm.sceneDump}
          hint="Очень большой дамп. Если тормозит — не открывай или увеличь maxChars точечно."
          maxChars={200_000}
        />
      </div>
    </div>
  );
};
