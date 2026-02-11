import React from 'react';
import type { GoalSandboxVM } from '../../GoalSandbox/GoalSandbox';
import { FriendlyDyadToMPanel } from '../../GoalSandbox/FriendlyDyadToMPanel';

/** ToM mode keeps legacy dyad panel available inside the new console shell. */
export const ToMDyadMode: React.FC<{ vm: GoalSandboxVM }> = ({ vm }) => {
  return (
    <div className="h-full w-full overflow-hidden">
      <div className="h-full overflow-y-auto custom-scrollbar p-4 space-y-3">
        <div className="text-[12px] font-bold text-slate-200">ToM (Dyad)</div>
        <div className="text-[11px] text-slate-400">
          MVP. Дальше: A→B, truth vs belief, impact на decision.
        </div>

        <div className="rounded border border-slate-800 bg-slate-950/40 p-3">
          <FriendlyDyadToMPanel
            world={vm.worldState as any}
            perspectiveId={vm.perspectiveId}
            castRows={vm.castRows as any}
          />
        </div>
      </div>
    </div>
  );
};
