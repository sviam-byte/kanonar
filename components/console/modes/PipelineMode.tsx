import React from 'react';
import type { GoalSandboxVM } from '../../GoalSandbox/GoalSandbox';
import { JsonBlock } from '../JsonBlock';

/** Pipeline mode exposes raw pipeline payload for stage-by-stage debugging. */
export const PipelineMode: React.FC<{ vm: GoalSandboxVM }> = ({ vm }) => {
  return (
    <div className="h-full w-full overflow-hidden">
      <div className="h-full overflow-y-auto custom-scrollbar p-4 space-y-3">
        <div className="text-[12px] font-bold text-slate-200">Pipeline</div>
        <div className="text-[11px] text-slate-400">
          MVP. Дальше: граф стадий, просмотр артефактов, трасса атомов (provenance).
        </div>

        <JsonBlock
          title="pipelineV1 (raw)"
          value={vm.pipelineV1}
          hint="Открывай только при необходимости — это может быть большой объект."
          maxChars={200_000}
        />
      </div>
    </div>
  );
};
