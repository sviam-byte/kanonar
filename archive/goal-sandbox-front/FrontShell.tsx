import React from 'react';
import type { GoalLabSnapshotV1 } from '../../lib/goal-lab/snapshotTypes';
import { Tabs } from '../Tabs';
import { FrontOverviewPanel } from './FrontOverviewPanel';
import { FriendlyDyadToMPanel } from './FriendlyDyadToMPanel';
import { DecisionPanel } from '../goal-lab/DecisionPanel';
import { ThreatPanel } from '../goal-lab/ThreatPanel';

export const FrontShell: React.FC<{
  snapshotV1: GoalLabSnapshotV1 | null;
  selfId: string;
  actorLabels?: Record<string, string>;
  setManualAtom?: (id: string, magnitude: number) => void;
}> = ({ snapshotV1, selfId, actorLabels, setManualAtom }) => {
  const atoms = (snapshotV1?.atoms || []) as any;
  const decision = (snapshotV1 as any)?.decision;

  const tabs = [
    {
      label: "What's going on",
      content: <FrontOverviewPanel atoms={atoms} selfId={selfId} actorLabels={actorLabels} />,
    },
    { label: "What I'll do", content: <DecisionPanel decision={decision} /> },
    {
      label: 'How I see others',
      content: <FriendlyDyadToMPanel snapshotV1={snapshotV1 as any} selfId={selfId} actorLabels={actorLabels} />,
    },
    { label: 'Why it feels risky', content: <ThreatPanel atoms={atoms} setManualAtom={setManualAtom as any} /> },
  ];

  return <Tabs tabs={tabs} syncKey="frontTab" />;
};
