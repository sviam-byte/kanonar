import React, { useMemo } from 'react';
import type { GoalLabSnapshotV1 } from '../../lib/goal-lab/snapshotTypes';
import type { ContextAtom } from '../../lib/context/v2/types';

import { Tabs } from '../Tabs';
import { FrontOverviewPanel } from './FrontOverviewPanel';
import { FriendlyDyadToMPanel } from './FriendlyDyadToMPanel';
import { DecisionPanel } from '../goal-lab/DecisionPanel';
import { ThreatPanel } from '../goal-lab/ThreatPanel';

function asArray<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

export const FrontShell: React.FC<{
  snapshotV1: GoalLabSnapshotV1;
  selfId: string;
  actorLabels?: Record<string, string>;
}> = ({ snapshotV1, selfId, actorLabels }) => {
  const atoms: ContextAtom[] = useMemo(() => asArray<ContextAtom>((snapshotV1 as any)?.atoms), [snapshotV1]);

  const header = useMemo(() => {
    const tick = Number((snapshotV1 as any)?.tick ?? 0);
    const locId =
      atoms.find(a => String((a as any)?.id).startsWith('world:location:'))?.label ||
      atoms.find(a => String((a as any)?.id).startsWith('world:location:'))?.id ||
      atoms.find(a => String((a as any)?.id).startsWith('world:loc:ref:'))?.label ||
      null;
    return {
      tick,
      selfLabel: actorLabels?.[selfId] || selfId,
      loc: locId,
      atomCount: atoms.length,
    };
  }, [atoms, snapshotV1, selfId, actorLabels]);

  const tabs = useMemo(() => {
    return [
      {
        label: 'What’s going on',
        content: <FrontOverviewPanel snapshotV1={snapshotV1} selfId={selfId} actorLabels={actorLabels} />,
      },
      { label: 'What I’ll do', content: <DecisionPanel decision={(snapshotV1 as any)?.decision} /> },
      {
        label: 'How I see others',
        content: <FriendlyDyadToMPanel snapshotV1={snapshotV1} selfId={selfId} actorLabels={actorLabels} />,
      },
      { label: 'Why it feels risky', content: <ThreatPanel atoms={atoms} /> },
      {
        label: 'Debug JSON',
        content: (
          <div className="h-full min-h-0 overflow-auto custom-scrollbar p-3 bg-canon-bg text-canon-text">
            <div className="text-xs font-semibold opacity-80 mb-2">snapshotV1</div>
            <pre className="text-[10px] font-mono whitespace-pre-wrap break-words opacity-90">
              {JSON.stringify(snapshotV1, null, 2)}
            </pre>
          </div>
        ),
      },
    ];
  }, [snapshotV1, selfId, atoms, actorLabels]);

  return (
    <div className="h-full min-h-0 flex flex-col border border-canon-border rounded bg-canon-bg overflow-hidden">
      <div className="px-3 py-2 border-b border-canon-border flex items-center gap-3 bg-canon-bg-light/20">
        <div className="text-sm font-semibold">Front</div>
        <div className="text-xs text-canon-text-light">
          tick: <span className="font-mono">{header.tick}</span>
        </div>
        <div className="text-xs text-canon-text-light">
          self: <span className="font-mono">{header.selfLabel}</span>
        </div>
        {header.loc ? (
          <div className="text-xs text-canon-text-light">
            loc: <span className="font-mono">{header.loc}</span>
          </div>
        ) : null}
        <div className="flex-1" />
        <div className="text-[11px] text-canon-text-light">
          atoms: <span className="font-mono">{header.atomCount}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <Tabs tabs={tabs} syncKey="frontTab" />
      </div>
    </div>
  );
};
