import React from 'react';
import type { GoalSandboxVM } from '../../GoalSandbox/GoalSandbox';

export const PipelineMode: React.FC<{ vm: GoalSandboxVM }> = ({ vm }) => {
  return (
    <div className="h-full w-full overflow-hidden">
      <div className="h-full overflow-y-auto custom-scrollbar p-4 space-y-3">
        <div className="text-[12px] font-bold text-slate-200">Pipeline</div>
        <div className="text-[11px] text-slate-400">
          MVP. Дальше: граф стадий, просмотр артефактов, трасса атомов (provenance).
        </div>

        <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">pipelineV1 (raw)</div>
          <details>
            <summary className="text-[11px] text-slate-300 cursor-pointer">open</summary>
            <pre className="mt-2 text-[10px] font-mono whitespace-pre-wrap break-words text-slate-200/90">
              {JSON.stringify(vm.pipelineV1, null, 2)}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
};
