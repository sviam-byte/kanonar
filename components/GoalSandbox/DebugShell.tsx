import React, { useMemo } from 'react';
import type { ContextAtom } from '../../lib/context/v2/types';
import { Tabs } from '../Tabs';
import { CastPerspectivePanel } from '../goal-lab/CastPerspectivePanel';
import { CastComparePanel } from '../goal-lab/CastComparePanel';
import { AgentPassportPanel } from '../goal-lab/AgentPassportPanel';
import { GoalLabResults } from '../goal-lab/GoalLabResults';
import { EmotionInspector } from '../GoalLab/EmotionInspector';
import { FrameDebugPanel } from '../GoalLab/FrameDebugPanel';

function asArray<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

export const DebugShell: React.FC<{
  castRows: any[];
  perspectiveId: string | null;
  onFocusPerspective: (id: string | null) => void;
  passportAtoms: ContextAtom[];
  snapshot: any;
  snapshotV1: any;
  pipelineV1: any;
  pipelineStageId: string;
  onChangePipelineStageId: (id: string) => void;
  onExportPipelineStage: (stageId: string) => void;
  onExportPipelineAll: () => void;
  sceneDump: any;
  onDownloadScene: () => void;
  onImportScene: () => void;
  manualAtoms: ContextAtom[];
  onChangeManualAtoms: (atoms: ContextAtom[]) => void;
  actorLabels: Record<string, string>;
  tomRows: any;
  goals: any;
  situation: any;
  goalPreview: any;
  contextualMind: any;
  locationScores: any;
  tomScores: any;
  worldTom: any;
  atomDiff: any;
  pipelineFrame: any;
  actionsLocLint: any;
  setManualAtom: (id: string, magnitude: number) => void;
}> = ({
  castRows,
  perspectiveId,
  onFocusPerspective,
  passportAtoms,
  snapshot,
  snapshotV1,
  pipelineV1,
  pipelineStageId,
  onChangePipelineStageId,
  onExportPipelineStage,
  onExportPipelineAll,
  sceneDump,
  onDownloadScene,
  onImportScene,
  manualAtoms,
  onChangeManualAtoms,
  actorLabels,
  tomRows,
  goals,
  situation,
  goalPreview,
  contextualMind,
  locationScores,
  tomScores,
  worldTom,
  atomDiff,
  pipelineFrame,
  actionsLocLint,
  setManualAtom,
}) => {
  const tabs = useMemo(() => {
    return [
      {
        label: 'Cast',
        content: (
          <CastPerspectivePanel rows={castRows} focusId={perspectiveId} onFocus={onFocusPerspective} />
        ),
      },
      {
        label: 'Compare',
        content: <CastComparePanel rows={castRows} focusId={perspectiveId} />,
      },
      {
        label: 'Passport',
        content: (
          <AgentPassportPanel
            atoms={passportAtoms}
            selfId={perspectiveId || ''}
            title="How the agent sees the situation"
          />
        ),
      },
      {
        label: 'Deep debug',
        content: snapshot ? (
          <GoalLabResults
            context={snapshot as any}
            actorLabels={actorLabels}
            perspectiveAgentId={perspectiveId}
            tomRows={tomRows}
            goalScores={goals as any}
            situation={situation as any}
            goalPreview={goalPreview as any}
            contextualMind={contextualMind as any}
            locationScores={locationScores as any}
            tomScores={tomScores as any}
            tom={worldTom}
            atomDiff={atomDiff as any}
            snapshotV1={snapshotV1 as any}
            pipelineV1={pipelineV1 as any}
            pipelineStageId={pipelineStageId}
            onChangePipelineStageId={onChangePipelineStageId}
            onExportPipelineStage={onExportPipelineStage}
            onExportPipelineAll={onExportPipelineAll}
            sceneDump={sceneDump as any}
            onDownloadScene={onDownloadScene}
            onImportScene={onImportScene}
            manualAtoms={manualAtoms}
            onChangeManualAtoms={onChangeManualAtoms}
          />
        ) : (
          <div className="p-4 text-sm text-canon-text-light italic">No snapshot available.</div>
        ),
      },
      {
        label: 'Emotions',
        content: snapshotV1 ? (
          <div className="p-4">
            <EmotionInspector
              selfId={perspectiveId}
              atoms={asArray<any>(snapshotV1.atoms as any)}
              setManualAtom={setManualAtom}
            />
          </div>
        ) : (
          <div className="p-4 text-sm text-canon-text-light italic">No snapshotV1 data.</div>
        ),
      },
      {
        label: 'Frame',
        content: pipelineFrame ? (
          <div className="p-4">
            <FrameDebugPanel frame={pipelineFrame as any} />
          </div>
        ) : (
          <div className="p-4 text-sm text-canon-text-light italic">No pipeline frame.</div>
        ),
      },
      {
        label: 'Lint',
        content: actionsLocLint ? (
          <div className="p-4">
            <h3 className="text-lg font-bold text-canon-accent uppercase tracking-widest mb-4 border-b border-canon-border/40 pb-2">
              Actions × Locations Lint
            </h3>

            <div className="text-sm opacity-80 mb-2">
              Locations: {actionsLocLint.stats.locations} • with affordances:{' '}
              {actionsLocLint.stats.locationsWithAffordances} • known actionIds:{' '}
              {actionsLocLint.stats.knownActionIds} • unknown actionIds:{' '}
              {actionsLocLint.stats.unknownActionIds}
            </div>

            <div className="text-xs text-canon-text-light mb-4">
              Missing (action → locations):
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {actionsLocLint.results.map((r: any, i: number) => (
                <div key={i} className="p-3 rounded border border-canon-border bg-canon-bg-light/20">
                  <div className="text-sm font-bold text-canon-text mb-1">{r.actionId}</div>
                  <div className="text-[11px] text-canon-text-light">{r.message}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 text-sm text-canon-text-light italic">No lint data.</div>
        ),
      },
      {
        label: 'Raw JSON',
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
  }, [
    castRows,
    perspectiveId,
    passportAtoms,
    snapshot,
    snapshotV1,
    pipelineV1,
    pipelineStageId,
    onChangePipelineStageId,
    onExportPipelineStage,
    onExportPipelineAll,
    sceneDump,
    onDownloadScene,
    onImportScene,
    manualAtoms,
    onChangeManualAtoms,
    actorLabels,
    tomRows,
    goals,
    situation,
    goalPreview,
    contextualMind,
    locationScores,
    tomScores,
    worldTom,
    atomDiff,
    pipelineFrame,
    actionsLocLint,
    setManualAtom,
  ]);

  return <Tabs tabs={tabs} syncKey="debugTab" />;
};
