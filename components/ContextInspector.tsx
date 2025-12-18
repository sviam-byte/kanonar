
import React from 'react';
import { ContextSnapshot, ContextualGoalScore } from '../lib/context/v2/types';
import { AtomList } from './goal-lab/AtomList';

interface Props {
  snapshot: ContextSnapshot;
  goals: ContextualGoalScore[];
  title?: string;
}

export const ContextInspector: React.FC<Props> = ({ snapshot, title }) => {
  // We removed aggregates and goals display from here as they are duplicated in the HUD and Left Column of GoalLabResults.
  // This component now serves as a deep debug view for Context Atoms only.

  return (
    <div className="flex flex-col gap-3 p-3 rounded-xl border border-canon-border/50 bg-black/40 text-sm">
      {title && <div className="font-bold text-canon-accent text-sm mb-1 uppercase tracking-wider">{title}</div>}

      <div className="mt-2">
        <div className="cursor-default text-[10px] text-canon-text-light font-bold uppercase tracking-wider mb-2">
          Active Atoms ({snapshot.atoms.length})
        </div>
        <div className="max-h-60 overflow-auto custom-scrollbar p-1 pb-4">
             <AtomList atoms={snapshot.atoms} />
        </div>
      </div>
      
      {/* Additional meta debug info if available */}
      {snapshot.meta && (
          <div className="mt-2 pt-2 border-t border-canon-border/20 text-[10px] text-canon-text-light font-mono">
              <div>Manual Atoms: {snapshot.meta.manualAtomIds?.length ?? 0}</div>
              <div>Active Events: {snapshot.meta.activeEventIds?.length ?? 0}</div>
          </div>
      )}
    </div>
  );
};
